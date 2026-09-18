package server

import (
	"math"
	"time"

	"clara-mundi/internal/game"
)

// NPC-side combat helpers: the proximity aggro pull plus the movement
// queries chaseTarget (entity_plugins.go) uses — overlap separation, path
// blocking, sideways unstick, and A* path following.

// checkAggroAt starts fights when a hostile NPC sits within aggro range of a
// vulnerable player position (called on player movement).
func (h *Hub) checkAggroAt(clientID string, x, y float64) {
	p := h.playerEnt(clientID)
	if p == nil || !p.presentAndAlive() || battleImmuneEnt(p) {
		return
	}
	if h.overworld != nil && h.overworld.SanctuaryAtWorld(x, y) {
		return
	}
	h.spatialEach(x, y, aggroRadius, func(n *entity) bool {
		if n.Kind != kindNPC {
			return false
		}
		ng := npcEngageOf(n)
		return ng != nil && !ng.engaged && h.canAttack(n, p)
	}, func(n *entity) {
		h.engage(n, p)
	})
}

// ---- NPC movement helpers (used by chaseTarget) ----

func engagedNPC(o *entity) bool {
	if o.Kind != kindNPC || !o.onWorld() {
		return false
	}
	ng := npcEngageOf(o)
	return ng != nil && ng.engaged
}

// npcHardOverlap reports whether e deeply overlaps another engaged NPC.
func (h *Hub) npcHardOverlap(e *entity) bool {
	_, _, deep := h.npcHardOverlapVec(e)
	return deep
}

func (h *Hub) npcHardOverlapVec(e *entity) (float64, float64, bool) {
	limit := enemyRadiusW*2 - npcOverlapPadW
	var sx, sy float64
	deep := false
	h.spatialEach(e.X, e.Y, limit, func(o *entity) bool {
		return o != e && engagedNPC(o)
	}, func(o *entity) {
		d := dist(e.X, e.Y, o.X, o.Y)
		if d >= limit || d < 0.01 {
			return
		}
		deep = true
		w := (limit - d) / limit
		sx += (e.X - o.X) / d * w
		sy += (e.Y - o.Y) / d * w
	})
	return sx, sy, deep
}

func (h *Hub) npcBlocksPath(e *entity, fx, fy float64) bool {
	const blockRange = enemyRadiusW * 3.2
	const cone = 0.55
	blocked := false
	h.spatialEach(e.X, e.Y, blockRange, func(o *entity) bool {
		return !blocked && o != e && engagedNPC(o)
	}, func(o *entity) {
		ox, oy := o.X-e.X, o.Y-e.Y
		d := math.Hypot(ox, oy)
		if d >= blockRange || d < 0.01 {
			return
		}
		if (ox*fx+oy*fy)/d >= cone {
			blocked = true
		}
	})
	return blocked
}

// npcUnstick slides an in-melee NPC sideways when it overlaps a pack-mate.
func (h *Hub) npcUnstick(e, t *entity, step float64) {
	ox, oy, deep := h.npcHardOverlapVec(e)
	if !deep || t == nil {
		return
	}
	dx, dy := t.X-e.X, t.Y-e.Y
	d := math.Hypot(dx, dy)
	if d < 0.01 {
		return
	}
	side := 1.0
	if ng := npcEngageOf(e); ng != nil && ng.avoidSide != 0 {
		side = ng.avoidSide
	}
	rx, ry := dx/d, dy/d
	radial := ox*rx + oy*ry
	tx, ty := ox-radial*rx, oy-radial*ry
	tm := math.Hypot(tx, ty)
	if tm < 0.15 {
		tx, ty = -ry*side, rx*side
		tm = 1
	}
	slide := step * 0.45
	nx, ny := e.X+tx/tm*slide, e.Y+ty/tm*slide
	if h.walkableAt(nx, ny) {
		e.X, e.Y = nx, ny
	}
}

func (h *Hub) walkableAt(x, y float64) bool {
	if h.overworld != nil {
		return h.overworld.WalkableAt(x, y)
	}
	return game.WalkableAt(x, y)
}

// chaseRepathInterval throttles A* recomputation while pursuing a target.
const chaseRepathInterval = 350 * time.Millisecond

// chaseAlongPath moves an entity along an A* route to (gx,gy) when the direct
// step is terrain-blocked. NPC paths use NPCWalkableTile, so a goal standing
// in a sanctuary is unreachable and the caller gives up; pets use player walk
// rules so they can follow an owner into one.
func (h *Hub) chaseAlongPath(e *entity, ch *chaseTarget, gx, gy, step float64) bool {
	if h.overworld == nil {
		return false
	}
	pathfind := h.overworld.Pathfind
	if e.Kind == kindPet {
		pathfind = h.overworld.PetPathfind
	}
	now := time.Now()
	from := h.overworld.WorldToTile(e.X, e.Y)
	goal := h.overworld.WorldToTile(gx, gy)
	if len(ch.path) == 0 || (ch.goal != goal && now.After(ch.repathAt)) {
		ch.path = pathfind(from, goal, game.Region{})
		ch.pathI = 0
		ch.goal = goal
		ch.repathAt = now.Add(chaseRepathInterval)
		// The first node is the entity's own tile — don't walk back to its center.
		if len(ch.path) > 1 {
			ch.pathI = 1
		}
	}
	for ch.pathI < len(ch.path) {
		w := ch.path[ch.pathI]
		dx, dy := w.X-e.X, w.Y-e.Y
		d := math.Hypot(dx, dy)
		if d <= step {
			if h.walkableAt(w.X, w.Y) {
				e.X, e.Y = w.X, w.Y
			}
			ch.pathI++
			continue
		}
		nx, ny := e.X+dx/d*step, e.Y+dy/d*step
		if !h.walkableAt(nx, ny) {
			ch.path = nil // waypoint became blocked; repath next tick
			return true
		}
		e.X, e.Y = nx, ny
		return true
	}
	ch.path = nil // exhausted; next blocked step recomputes
	return false
}

// stepWalkable moves e toward (gx,gy) by up to step while honoring terrain:
// the straight step when walkable, an A* detour when blocked, and axis
// slides as a last nudge. Reports whether any movement happened — callers
// treat false as "currently unreachable" (drop the target, hold position).
func (h *Hub) stepWalkable(e *entity, ch *chaseTarget, gx, gy, step float64) bool {
	dx, dy := gx-e.X, gy-e.Y
	d := math.Hypot(dx, dy)
	if d < 0.01 {
		return false
	}
	move := math.Min(step, d)
	// Once on an A* route, commit to it.
	if len(ch.path) > 0 && h.chaseAlongPath(e, ch, gx, gy, move) {
		return true
	}
	nx, ny := e.X+dx/d*move, e.Y+dy/d*move
	if h.walkableAt(nx, ny) {
		e.X, e.Y = nx, ny
		return true
	}
	if h.chaseAlongPath(e, ch, gx, gy, move) {
		return true // terrain-blocked: A* around it
	}
	if h.walkableAt(nx, e.Y) {
		e.X = nx
		return true
	}
	if h.walkableAt(e.X, ny) {
		e.Y = ny
		return true
	}
	return false
}
