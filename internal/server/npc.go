package server

import (
	"log"
	"math"
	"math/rand"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// Overworld foes are owned by the hub: they wander, get engaged in place by
// proximity or player attacks, chase, and despawn on death until respawn.
const (
	npcCount    = 12
	npcTickSec  = 0.25
	maxMoveStep = 80.0 // ~240 px/s plus slack; rejects teleports
)

type worldNPC struct {
	ID    string
	Name  string
	Kind  string
	Level int
	X, Y  float64

	// Combat state (overworld realtime combat).
	Engaged      bool
	hp, maxHP    int
	targetID     string
	attackCD     time.Time
	statuses     []game.ActiveStatus
	contributors map[string]int // clientID -> damage dealt
	avoidSide    float64        // -1 or +1, stable detour around pack-mates
	statusTick   int
	dropPoolID   string
	capturable   bool

	patrol     game.Patrol
	region     game.Region
	path       []game.Vec2
	pathI      int
	idleUntil  time.Time
	wanderStep int

	// Chase pathfinding: A* waypoints when straight-line pursuit hits terrain.
	chasePath []game.Vec2
	chaseI    int
	chaseGoal game.Tile
	repathAt  time.Time

	// Leash anchor: where the NPC stood when combat began. Wandering ranges
	// region-wide, so distance to patrol.Home says nothing about the fight —
	// the leash measures how far the battle was dragged from its origin.
	leashX, leashY float64
	leashSet       bool

	ow *game.Overworld

	// Hidden from the world while dead and waiting on respawn.
	despawned bool
	respawnAt time.Time
}

func (n *worldNPC) onWorld() bool {
	return n != nil && !n.despawned
}

func dist(ax, ay, bx, by float64) float64 {
	return math.Hypot(ax-bx, ay-by)
}

func (n *worldNPC) snapshot() protocol.WorldNPC {
	return protocol.WorldNPC{
		ID: n.ID, Name: n.Name, Kind: n.Kind, Level: n.Level,
		X: n.X, Y: n.Y, Engaged: n.Engaged,
		HP: n.hp, MaxHP: n.maxHP, TargetID: n.targetID,
	}
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

func (h *Hub) seedNPCs(count int) {
	h.npcs = map[string]*worldNPC{}
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
		start := game.TileCenter(p.Home)
		kind, level, maxHP, dropPoolID, capturable := npcCombatProfile(p)
		n := &worldNPC{
			ID:         p.ID,
			Name:       p.Name,
			Kind:       kind,
			Level:      level,
			X:          start.X,
			Y:          start.Y,
			hp:         maxHP,
			maxHP:      maxHP,
			dropPoolID: dropPoolID,
			capturable: capturable,
			patrol:     p,
			region:     reg,
			ow:         h.overworld,
		}
		n.beginWander()
		h.npcs[n.ID] = n
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
	prev := h.npcs
	h.seedNPCs(count)
	for id, n := range h.npcs {
		old, ok := prev[id]
		if !ok || !old.Engaged {
			continue
		}
		n.Engaged = true
		n.targetID = old.targetID
		n.contributors = old.contributors
		n.hp = old.hp
		n.X, n.Y = old.X, old.Y
		n.leashX, n.leashY, n.leashSet = old.leashX, old.leashY, old.leashSet
		n.despawned = old.despawned
		n.respawnAt = old.respawnAt
	}
	for id, old := range prev {
		if !old.Engaged && !old.despawned {
			continue
		}
		if _, ok := h.npcs[id]; ok {
			continue
		}
		old.ow = h.overworld
		h.npcs[id] = old
	}
}

func (n *worldNPC) beginWander() {
	home := game.TileCenter(n.patrol.Home)
	n.X, n.Y = home.X, home.Y
	n.path = nil
	n.pathI = 0
	n.wanderStep = 0
	n.idleUntil = time.Now().Add(n.wanderIdle())
}

func (n *worldNPC) wanderIdle() time.Duration {
	if n.ow != nil {
		return n.ow.WanderIdleDuration()
	}
	return game.WanderIdleDuration()
}

func (n *worldNPC) pickNextPath() bool {
	from := game.WorldToTile(n.X, n.Y)
	walkable := game.WalkableTile
	if n.ow != nil {
		walkable = n.ow.WalkableTile
	}
	if !walkable(from.C, from.R) {
		home := game.TileCenter(n.patrol.Home)
		n.X, n.Y = home.X, home.Y
		from = n.patrol.Home
	}
	if n.ow != nil {
		n.path = n.ow.PickRandomWanderPath(n.ID, n.region, from, n.wanderStep)
	} else {
		n.path = game.PickRandomWanderPath(n.ID, n.region, from, n.wanderStep)
	}
	n.pathI = 0
	n.wanderStep++
	return len(n.path) > 0
}

func (n *worldNPC) arriveAtDest() {
	n.path = nil
	n.pathI = 0
	n.idleUntil = time.Now().Add(n.wanderIdle())
}

func (n *worldNPC) step(distStep float64) bool {
	if !n.idleUntil.IsZero() && time.Now().Before(n.idleUntil) {
		return false
	}
	if !n.idleUntil.IsZero() {
		n.idleUntil = time.Time{}
		if !n.pickNextPath() {
			n.idleUntil = time.Now().Add(time.Second)
		}
		return len(n.path) > 0
	}

	if len(n.path) == 0 {
		if !n.pickNextPath() {
			n.idleUntil = time.Now().Add(time.Second)
			return false
		}
	}
	if n.pathI >= len(n.path) {
		n.arriveAtDest()
		return true
	}

	dest := n.path[n.pathI]
	dx, dy := dest.X-n.X, dest.Y-n.Y
	d := math.Hypot(dx, dy)
	if d < 6 {
		n.pathI++
		if n.pathI >= len(n.path) {
			n.arriveAtDest()
		}
		return true
	}
	n.X += dx / d * distStep
	n.Y += dy / d * distStep
	ok := false
	if n.ow != nil {
		ok = n.ow.WalkableAt(n.X, n.Y)
	} else {
		ok = game.WalkableAt(n.X, n.Y)
	}
	if !ok {
		n.X, n.Y = dest.X, dest.Y
	}
	return true
}

func (h *Hub) worldNPCs() []protocol.WorldNPC {
	out := make([]protocol.WorldNPC, 0, len(h.npcs))
	for _, n := range h.npcs {
		if !n.onWorld() {
			continue
		}
		out = append(out, n.snapshot())
	}
	return out
}

func (h *Hub) broadcastNPCs() {
	h.broadcastAll(protocol.Encode(protocol.TypeNPCState, protocol.NPCStatePayload{
		NPCs: h.worldNPCs(),
	}))
}

func (h *Hub) tickNPCs() {
	if len(h.npcs) == 0 {
		return
	}
	step := game.WanderSpeed() * npcTickSec
	if h.overworld != nil {
		step = h.overworld.WanderSpeed() * npcTickSec
	}
	changed := false
	for _, n := range h.npcs {
		if n.despawned {
			if h.maybeRespawn(n) {
				changed = true
			}
			continue
		}
		if n.Engaged {
			continue // combat tick drives engaged NPCs
		}
		if n.step(step) {
			changed = true
		}
	}
	h.checkProximityAggro()
	if changed {
		h.broadcastNPCs()
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

// battleImmune blocks aggro briefly after join/respawn/transfer.
func battleImmune(wp *protocol.WorldPlayer) bool {
	return wp != nil && wp.ImmuneUntil > time.Now().UnixMilli()
}

func (h *Hub) maybeRespawn(n *worldNPC) bool {
	if n == nil || !n.despawned || n.Engaged || n.respawnAt.IsZero() {
		return false
	}
	if time.Now().Before(n.respawnAt) {
		return false
	}
	n.despawned = false
	n.respawnAt = time.Time{}
	n.hp = n.maxHP
	n.contributors = nil
	n.statuses = nil
	n.targetID = ""
	n.beginWander()
	log.Printf("%s respawned in %s", n.Name, n.region.ID)
	return true
}
