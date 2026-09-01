package server

import (
	"fmt"
	"log"
	"math"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

// Overworld foes are owned by the hub. Clients may predict motion, but only
// this process decides when a collision becomes a battle.
const (
	npcCount     = 12
	npcRadius    = 22.0
	playerRadius = 16.0
	engageRange  = npcRadius + playerRadius
	npcSpeed     = 70.0
	npcTickSec   = 0.25
	maxMoveStep  = 80.0 // ~240 px/s plus slack; rejects teleports
)

type worldNPC struct {
	ID       string
	Name     string
	Kind     string
	Level    int
	X, Y     float64
	InBattle bool
	BattleID string

	patrol   game.Patrol
	region   game.Region
	patrolI  int
	path     []game.Vec2
	pathI    int

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
	return dist(ax, ay, bx, by) <= engageRange
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
	for i, p := range game.NPCPatrols {
		if i >= count {
			break
		}
		reg, _ := game.RegionByID(p.Region)
		start := game.TileCenter(p.Loop[0])
		n := &worldNPC{
			ID:     p.ID,
			Name:   p.Name,
			Kind:   p.Kind,
			Level:  p.Level,
			X:      start.X,
			Y:      start.Y,
			patrol: p,
			region: reg,
		}
		n.routeTo(1)
		h.npcs[n.ID] = n
	}
}

func (n *worldNPC) routeTo(loopIndex int) {
	if len(n.patrol.Loop) == 0 {
		n.path = nil
		n.pathI = 0
		return
	}
	n.patrolI = loopIndex % len(n.patrol.Loop)
	from := game.WorldToTile(n.X, n.Y)
	if !game.WalkableTile(from.C, from.R) {
		from = n.patrol.Loop[n.patrolI]
		c := game.TileCenter(from)
		n.X, n.Y = c.X, c.Y
	}
	n.path = game.Pathfind(from, n.patrol.Loop[n.patrolI], n.region)
	n.pathI = 0
}

func (n *worldNPC) step(distStep float64) bool {
	if len(n.path) == 0 {
		if len(n.patrol.Loop) == 0 {
			return false
		}
		n.routeTo(n.patrolI)
		if len(n.path) == 0 {
			return false
		}
	}
	if n.pathI >= len(n.path) {
		n.routeTo(n.patrolI + 1)
		if len(n.path) == 0 {
			return false
		}
	}
	dest := n.path[n.pathI]
	dx, dy := dest.X-n.X, dest.Y-n.Y
	d := math.Hypot(dx, dy)
	if d < 6 {
		n.pathI++
		return true
	}
	n.X += dx / d * distStep
	n.Y += dy / d * distStep
	if !game.WalkableAt(n.X, n.Y) {
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
	step := npcSpeed * npcTickSec
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

func (h *Hub) clampMove(fromX, fromY, toX, toY float64) (float64, float64) {
	toX = clamp(toX, 0, worldWidth)
	toY = clamp(toY, 0, worldHeight)
	dx, dy := toX-fromX, toY-fromY
	d := math.Hypot(dx, dy)
	if d > maxMoveStep {
		toX = fromX + dx/d*maxMoveStep
		toY = fromY + dy/d*maxMoveStep
	}
	return game.SlideMove(fromX, fromY, toX, toY)
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
	profile, ok := h.store.Get(c.Name)
	if !ok {
		return
	}
	level := n.Level
	if profile.MainJobLevel() > level {
		level = profile.MainJobLevel()
	}
	h.battleSeq++
	id := fmt.Sprintf("battle-%d", h.battleSeq)
	room := NewBattleRoom(id, level, h)
	h.battles[id] = room
	go room.Run(h.tickWindow)

	n.InBattle = true
	n.BattleID = id
	n.despawn()
	h.enterBattle(c, wp, room, profile)
	h.promptPartyForBattle(c.ID, room, wp.X, wp.Y)
	h.broadcastNPCs()
	log.Printf("%s collided with %s and started %s (lv %d)", c.Name, n.Name, id, level)
}

func (n *worldNPC) despawn() {
	n.despawned = true
	n.respawnAt = time.Time{}
}

func (n *worldNPC) placeHome() {
	if len(n.patrol.Loop) == 0 {
		return
	}
	home := game.TileCenter(n.patrol.Loop[0])
	n.X, n.Y = home.X, home.Y
	n.routeTo(1)
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
