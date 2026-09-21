package server

import (
	"log"
	"math"
	"math/rand"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// Overworld foes are hub-owned entities (kindNPC) driven by the wander,
// npcEngage, chaseTarget, attackTarget and respawn plugins.
const (
	npcCount    = 12
	npcTickSec  = 0.25
	maxMoveStep = 80.0 // ~180 px/s plus slack; rejects teleports
)

func dist(ax, ay, bx, by float64) float64 {
	return math.Hypot(ax-bx, ay-by)
}

// entitySyncRadius scopes each client's entity_state to server-driven entities
// within this radius. The client's handler rebuilds its NPC/pet set from the
// message, so out-of-range entities evict themselves — the only way a world
// with hundreds of NPCs stays affordable per tick. Sized beyond the farthest
// viewport/minimap view (~1700px at max zoom-out) plus margin.
const entitySyncRadius = 2200.0

// serverEntitySnapshotsNear lists server-driven entities (NPCs and pets)
// within r of (x, y) for a per-client entity_state scope.
func (h *Hub) serverEntitySnapshotsNear(x, y, r float64) []protocol.WorldEntity {
	out := make([]protocol.WorldEntity, 0)
	now := time.Now()
	h.spatialEach(x, y, r, func(e *entity) bool {
		return e.Kind != kindPlayer && !e.hidden
	}, func(e *entity) {
		out = append(out, h.projector.project(e, now))
	})
	return out
}

// npcCombatProfile derives the world NPC's identity from the patrol's
// encounter config. The encounter is the combat definition ("battle npc"
// concept): it decides kind, level, drop pool, and capturability. The
// patrol's own kind/level are only fallbacks for encounters that omit them.
// Rolls are seeded by patrol ID so a spawn is deterministic across reseeds.
func npcCombatProfile(p game.Patrol) (kind string, level, maxHP int, dropPoolID string, capturable bool) {
	enc := game.NormalizeEncounter(p.Encounter, p.Kind, p.Level)
	rng := rand.New(rand.NewSource(game.SeedFromID(p.ID)))
	entry := enc.PickEnemy(rng)
	kind = entry.Kind
	level = entry.RollLevel(rng)
	base := enemyTemplates[kind]
	if base == 0 {
		base = enemyTemplates["goblin"]
	}
	maxHP = int(float64(base) * (1.0 + float64(level-1)*0.15))
	return kind, level, maxHP, entry.DropPoolID, entry.Capturable
}

// removeNPCs drops every NPC entity from the world.
func (h *Hub) removeNPCs() {
	for id, e := range h.entities {
		if e.Kind != kindNPC {
			continue
		}
		if w := h.npcWorkerFor(e); w != nil {
			w.call(npcCommand{Kind: npcCmdRemove, TargetID: id})
		}
		delete(h.entities, id)
		delete(h.npcOwners, id)
	}
}

// npcPatrolCount is the full spawn count for the loaded map: every patrol in
// the config is seeded (large worlds define hundreds; the npcCount constant
// remains only as a floor for legacy callers).
func (h *Hub) npcPatrolCount() int {
	if h.overworld != nil {
		return len(h.overworld.NPCPatrols)
	}
	return len(game.NPCPatrols)
}

func (h *Hub) buildNPCs(count int) []*entity {
	if count <= 0 {
		return nil
	}
	patrols := game.NPCPatrols
	if h.overworld != nil {
		patrols = h.overworld.NPCPatrols
	}
	npcs := make([]*entity, 0, min(count, len(patrols)))
	for i, p := range patrols {
		if i >= count {
			break
		}
		var reg game.Region
		if h.overworld != nil {
			reg, _ = h.overworld.RegionByID(p.Region)
		} else {
			reg, _ = game.RegionByID(p.Region)
		}
		p.Home = h.nudgePatrolHome(p.Home, reg)
		n := newNPCEntity(p, reg, h.overworld)
		h.refreshRegionOwnership(nil, n)
		npcs = append(npcs, n)
	}
	return npcs
}

func (h *Hub) seedNPCs(count int) {
	h.removeNPCs()
	for _, n := range h.buildNPCs(count) {
		h.installNPC(n)
	}
}

// nudgePatrolHome relocates a patrol home that sits on a wall or sanctuary
// tile (hand-authored or older generated maps) to the nearest NPC-walkable
// tile inside its region, so the foe can actually spawn and be engaged.
func (h *Hub) nudgePatrolHome(home game.Tile, reg game.Region) game.Tile {
	ow := h.overworld
	if ow == nil || ow.NPCWalkableTile(home.C, home.R) {
		return home
	}
	for radius := 1; radius <= 24; radius++ {
		for dr := -radius; dr <= radius; dr++ {
			for dc := -radius; dc <= radius; dc++ {
				if max(absInt(dr), absInt(dc)) != radius {
					continue
				}
				c, r := home.C+dc, home.R+dr
				if !ow.NPCWalkableTile(c, r) {
					continue
				}
				if reg.ID != "" && !reg.Contains(c, r) {
					continue
				}
				log.Printf("npc %s patrol home (%d,%d) unwalkable; moved to (%d,%d)", reg.ID, home.C, home.R, c, r)
				return game.Tile{C: c, R: r}
			}
		}
	}
	return home
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

// reseedNPCsPreservingCombat rebuilds overworld foes from the current map
// config while keeping NPCs that are mid-fight (position/hp/aggro preserved).
func (h *Hub) reseedNPCsPreservingCombat(count int) {
	prev := map[string]*entity{}
	h.eachEntity(kindNPC, func(e *entity) { prev[e.ID] = e })
	next := h.buildNPCs(count)
	h.removeNPCs()
	installed := map[string]bool{}
	for _, n := range next {
		if old := prev[n.ID]; old != nil && engagedNPC(old) {
			restoreNPCCombat(n, old)
		}
		h.installNPC(n)
		installed[n.ID] = true
	}
	for id, old := range prev {
		if installed[id] || (!engagedNPC(old) && !old.hidden) {
			continue
		}
		if w := old.components.wander; w != nil {
			w.ow = h.overworld
		}
		h.installNPC(cloneEntity(old, true))
	}
}

func restoreNPCCombat(n, old *entity) {
	ng, og := npcEngageOf(n), npcEngageOf(old)
	if ng == nil || og == nil {
		return
	}
	ng.engaged = true
	n.targetID = old.targetID
	n.contributors = cloneIntMap(old.contributors)
	n.enmity = cloneIntMap(old.enmity)
	n.hp = old.hp
	n.X, n.Y = old.X, old.Y
	ng.leashX, ng.leashY, ng.leashSet = og.leashX, og.leashY, og.leashSet
	n.hidden = old.hidden
	n.alive = old.alive
	if nr, or := respawnOf(n), respawnOf(old); nr != nil && or != nil {
		nr.respawnAt = or.respawnAt
	}
}

// broadcastEntityState streams NPC+pet snapshots scoped to each client's
// surroundings (entitySyncRadius). The client's handler rebuilds non-player
// entities from the message, so entities leaving the radius evict themselves —
// on large maps this keeps per-tick payload to a handful of entities instead
// of the full world population.
func (h *Hub) broadcastEntityState() {
	// Post-tick batch pass: entities moved during the entity tick, so re-index
	// before scoping each client's snapshot.
	h.spatialInvalidate()
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if !c.Joined {
			continue
		}
		p := h.entities[c.ID]
		if p == nil {
			continue
		}
		h.sendRawLocked(c, protocol.Encode(protocol.TypeEntityState, protocol.EntityStatePayload{
			Entities: h.serverEntitySnapshotsNear(p.X, p.Y, entitySyncRadius),
		}))
	}
}

func (h *Hub) worldSize() (w, hgt float64) {
	if h.overworld != nil && h.overworld.WorldW > 0 {
		return float64(h.overworld.WorldW), float64(h.overworld.WorldH)
	}
	return float64(game.OverworldW), float64(game.OverworldH)
}

func (h *Hub) clampMove(fromX, fromY, toX, toY float64) (float64, float64) {
	return h.clampMoveStep(fromX, fromY, toX, toY, maxMoveStep)
}

// clampMoveStep bounds one move report to maxStep pixels; the dodge dash gets
// a larger step right after a dodge so the dash isn't read as a teleport.
func (h *Hub) clampMoveStep(fromX, fromY, toX, toY, maxStep float64) (float64, float64) {
	toX,toY=h.clampMoveIntent3D(fromX,fromY,toX,toY,maxStep)
	b:=game.NewCharacterBody3D(fromX,fromY,h.physicsWorld3D().HeightAt(fromX,fromY));b.Grounded=true
	b=h.physicsWorld3D().Move(b,game.Vec2{X:toX,Y:toY},0)
	return b.Position.X,b.Position.Y
}

func (h *Hub) clampMoveIntent3D(fromX, fromY, toX, toY, maxStep float64) (float64, float64) {
	worldW, worldH := h.worldSize()
	toX = clamp(toX, game.PlayerCollisionRadius, worldW-game.PlayerCollisionRadius)
	toY = clamp(toY, game.PlayerCollisionRadius, worldH-game.PlayerCollisionRadius)
	dx, dy := toX-fromX, toY-fromY
	d := math.Hypot(dx, dy)
	if d > maxStep {
		toX = fromX + dx/d*maxStep
		toY = fromY + dy/d*maxStep
	}
	return toX,toY
}
