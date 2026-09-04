package server

import (
	"log"
	"math"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/plugins/contracts"
	"ffv-web-game/internal/protocol"
)

// Overworld foes are owned by the hub. Clients may predict motion, but only
// this process decides when a collision becomes a battle.
const (
	npcCount    = 12
	npcRadius   = 22.0
	npcTickSec  = 0.25
	maxMoveStep = 80.0 // ~240 px/s plus slack; rejects teleports
)

func engageRangePx() float64 {
	return npcRadius + game.PlayerCollisionHalfW
}

type worldNPC struct {
	ID       string
	Name     string
	Kind     string
	Level    int
	X, Y     float64
	InBattle bool
	BattleID string

	patrol      game.Patrol
	region      game.Region
	path        []game.Vec2
	pathI       int
	idleUntil   time.Time
	wanderStep  int

	ow *game.Overworld

	// Hidden from the world while fighting or waiting on SpawnWindows.
	despawned bool
	respawnAt time.Time
}

func (n *worldNPC) onWorld() bool {
	return n != nil && !n.despawned
}

func dist(ax, ay, bx, by float64) float64 {
	return math.Hypot(ax-bx, ay-by)
}

func withinEngageRange(ax, ay, bx, by float64) bool {
	return dist(ax, ay, bx, by) <= engageRangePx()
}

func (n *worldNPC) snapshot() protocol.WorldNPC {
	return protocol.WorldNPC{
		ID: n.ID, Name: n.Name, Kind: n.Kind, Level: n.Level,
		X: n.X, Y: n.Y, InBattle: n.InBattle, BattleID: n.BattleID,
	}
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
		start := game.TileCenter(p.Home)
		n := &worldNPC{
			ID:     p.ID,
			Name:   p.Name,
			Kind:   p.Kind,
			Level:  p.Level,
			X:      start.X,
			Y:      start.Y,
			patrol: p,
			region: reg,
			ow:     h.overworld,
		}
		n.beginWander()
		h.npcs[n.ID] = n
	}
}

// reseedNPCsPreservingBattles rebuilds overworld foes from the current map
// config while keeping any NPCs that are mid-battle.
func (h *Hub) reseedNPCsPreservingBattles(count int) {
	prev := h.npcs
	h.seedNPCs(count)
	for id, n := range h.npcs {
		old, ok := prev[id]
		if !ok || !old.InBattle {
			continue
		}
		n.InBattle = true
		n.BattleID = old.BattleID
		n.despawned = old.despawned
		n.respawnAt = old.respawnAt
		n.X, n.Y = old.X, old.Y
	}
	for id, old := range prev {
		if !old.InBattle {
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
		if n.InBattle {
			continue
		}
		if n.step(step) {
			changed = true
		}
	}
	if changed {
		h.checkNPCPlayerCollisions()
		h.broadcastNPCs()
	}
}

func (h *Hub) checkNPCPlayerCollisions() {
	for _, wp := range h.world {
		if wp.InBattle {
			continue
		}
		h.mu.RLock()
		c := h.clients[wp.ID]
		h.mu.RUnlock()
		if c == nil || !c.Joined {
			continue
		}
		if h.engageFirstNPCAt(c, wp, wp.X, wp.Y) {
			return
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
	worldW, worldH := h.worldSize()
	toX = clamp(toX, game.PlayerCollisionHalfW, worldW-game.PlayerCollisionHalfW)
	toY = clamp(toY, game.PlayerCollisionHalfH, worldH)
	dx, dy := toX-fromX, toY-fromY
	d := math.Hypot(dx, dy)
	if d > maxMoveStep {
		toX = fromX + dx/d*maxMoveStep
		toY = fromY + dy/d*maxMoveStep
	}
	if h.overworld != nil {
		return h.overworld.SlideMovePlayer(fromX, fromY, toX, toY)
	}
	return game.SlideMovePlayer(fromX, fromY, toX, toY)
}

// engageFirstNPCAt starts a battle if an idle NPC sits on (x,y). The
// player's requested point is ignored: only the hub's coordinates count.
func battleImmune(wp *protocol.WorldPlayer) bool {
	return wp != nil && wp.ImmuneUntil > time.Now().UnixMilli()
}

func (h *Hub) engageFirstNPCAt(c *Client, wp *protocol.WorldPlayer, x, y float64) bool {
	if wp.InBattle || battleImmune(wp) {
		return false
	}
	if h.overworld != nil && h.overworld.SanctuaryAtWorld(x, y) {
		return false
	}
	for _, n := range h.npcs {
		if !n.onWorld() || n.InBattle {
			continue
		}
		if withinEngageRange(x, y, n.X, n.Y) {
			h.startBattleFromNPC(c, wp, n)
			return true
		}
	}
	return false
}

func (h *Hub) startBattleFromNPC(c *Client, wp *protocol.WorldPlayer, n *worldNPC) {
	snap := contracts.NPCSnapshot{
		ID: n.ID, Name: n.Name, Kind: n.Kind, Level: n.Level, X: n.X, Y: n.Y,
		Encounter: game.NormalizeEncounter(n.patrol.Encounter, n.Kind, n.Level),
	}
	battleID, ok := h.combat.StartFromNPC(c.ID, wp, snap)
	if !ok {
		return
	}
	n.InBattle = true
	n.BattleID = battleID
	n.despawn()
	h.broadcastNPCs()
	log.Printf("%s collided with %s and started %s (lv %d)", c.Name, n.Name, battleID, n.Level)
}

func (n *worldNPC) despawn() {
	n.despawned = true
	n.respawnAt = time.Time{}
}

func (n *worldNPC) placeHome() {
	n.beginWander()
}

func (h *Hub) maybeRespawn(n *worldNPC) bool {
	if n == nil || !n.despawned || n.InBattle || n.respawnAt.IsZero() {
		return false
	}
	if time.Now().Before(n.respawnAt) {
		return false
	}
	n.despawned = false
	n.respawnAt = time.Time{}
	n.placeHome()
	log.Printf("%s respawned in %s", n.Name, n.region.ID)
	return true
}

func (h *Hub) releaseNPCs(battleID string) {
	changed := false
	for _, n := range h.npcs {
		if n.BattleID != battleID {
			continue
		}
		n.InBattle = false
		n.BattleID = ""
		n.despawned = true
		n.respawnAt = time.Now().Add(game.RespawnDelay(n.Kind, n.ID))
		changed = true
	}
	if changed {
		h.broadcastNPCs()
	}
}
