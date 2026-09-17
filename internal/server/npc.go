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

// serverEntitySnapshots lists entities the server drives (NPCs and pets) for
// entity_state deltas.
func (h *Hub) serverEntitySnapshots() []protocol.WorldEntity {
	out := make([]protocol.WorldEntity, 0)
	for _, e := range h.entities {
		if e.Kind == kindPlayer || e.hidden {
			continue
		}
		out = append(out, h.projector.project(e, time.Now()))
	}
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
		if e.Kind == kindNPC {
			delete(h.entities, id)
		}
	}
}

func (h *Hub) seedNPCs(count int) {
	h.removeNPCs()
	if count <= 0 {
		return
	}
	patrols := game.NPCPatrols
	if h.overworld != nil {
		patrols = h.overworld.NPCPatrols
	}
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
		h.entities[n.ID] = n
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
	h.seedNPCs(count)
	h.eachEntity(kindNPC, func(n *entity) {
		old, ok := prev[n.ID]
		if !ok || !engagedNPC(old) {
			return
		}
		ng, og := npcEngageOf(n), npcEngageOf(old)
		ng.engaged = true
		n.targetID = old.targetID
		n.contributors = old.contributors
		n.hp = old.hp
		n.X, n.Y = old.X, old.Y
		ng.leashX, ng.leashY, ng.leashSet = og.leashX, og.leashY, og.leashSet
		n.hidden = old.hidden
		n.alive = old.alive
		if nr, or := respawnOf(n), respawnOf(old); nr != nil && or != nil {
			nr.respawnAt = or.respawnAt
		}
	})
	for id, old := range prev {
		if !engagedNPC(old) && !old.hidden {
			continue
		}
		if _, ok := h.entities[id]; ok {
			continue
		}
		if w := old.components.wander; w != nil {
			w.ow = h.overworld
		}
		h.entities[id] = old
	}
}

// broadcastEntityState streams NPC+pet snapshots in real time to clients that
// have any server entity within nearSyncDist; everyone else is folded into
// the once-a-second far-sync digest instead.
func (h *Hub) broadcastEntityState() {
	msg := protocol.Encode(protocol.TypeEntityState, protocol.EntityStatePayload{
		Entities: h.serverEntitySnapshots(),
	})
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if !c.Joined {
			continue
		}
		p := h.entities[c.ID]
		if p != nil && h.nearServerEntity(p) {
			h.sendRaw(c, msg)
		} else {
			h.farEntityClients[c.ID] = true
		}
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
	worldW, worldH := h.worldSize()
	toX = clamp(toX, game.PlayerCollisionHalfW, worldW-game.PlayerCollisionHalfW)
	toY = clamp(toY, game.PlayerCollisionHalfH, worldH)
	dx, dy := toX-fromX, toY-fromY
	d := math.Hypot(dx, dy)
	if d > maxStep {
		toX = fromX + dx/d*maxStep
		toY = fromY + dy/d*maxStep
	}
	if h.overworld != nil {
		return h.overworld.SlideMovePlayer(fromX, fromY, toX, toY)
	}
	return game.SlideMovePlayer(fromX, fromY, toX, toY)
}
