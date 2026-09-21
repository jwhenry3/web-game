package server

import (
	"math"

	"clara-mundi/internal/game"
)

func (h *Hub) physicsWorld3D() game.PhysicsWorld3D {
	if h.overworld != nil {
		return h.overworld.Physics3D()
	}
	if ow := game.Loaded(); ow != nil {
		return ow.Physics3D()
	}
	return game.PhysicsWorld3D{HeightAt: func(x, y float64) float64 { return 0 }, Gravity: game.Gravity3D, StepHeight: 10, MaxSlope: 1.2}
}

func (h *Hub) ensureBody3D(e *entity) {
	if e == nil || e.physicsReady {
		return
	}
	e.Z = h.physicsWorld3D().HeightAt(e.X, e.Y)
	e.velocityZ = 0
	e.grounded = true
	e.physicsReady = true
}

func (h *Hub) moveEntity3D(e *entity, x, y, dt float64) {
	h.ensureBody3D(e)
	b := game.NewCharacterBody3D(e.X, e.Y, e.Z)
	b.Velocity.Z = e.velocityZ
	b.Grounded = e.grounded
	b = h.physicsWorld3D().Move(b, game.Vec2{X: x, Y: y}, dt)
	e.X, e.Y, e.Z = b.Position.X, b.Position.Y, b.Position.Z
	e.velocityZ, e.grounded = b.Velocity.Z, b.Grounded
}

// steppable3D reports whether the 3D solver would let e reach (x,y) from its
// current position — the same check resolveEntityPhysics3D applies when it
// sweeps the pipeline's committed position. Steering must ask this, not just
// the 2D tile lookup: a step that passes walkableAt but fails the solver
// (slope apron, authored collider) would otherwise read as success while the
// entity snaps back, and repathing would never trigger.
func (h *Hub) steppable3D(e *entity, x, y float64) bool {
	if !h.walkableAt(x, y) {
		return false
	}
	h.ensureBody3D(e)
	b := game.NewCharacterBody3D(e.X, e.Y, e.Z)
	b.Velocity.Z = e.velocityZ
	b.Grounded = e.grounded
	b = h.physicsWorld3D().Move(b, game.Vec2{X: x, Y: y}, 0)
	const eps = .5
	return math.Abs(b.Position.X-x) < eps && math.Abs(b.Position.Y-y) < eps
}

// Server simulation time advances gravity even when the player sends no input.
// NPC and pet systems still choose a planar route, then sweep their desired
// movement through the same 3D solver before the tick is replicated.
func (h *Hub) resolveEntityPhysics3D(e *entity, from game.Vec3, dt float64) {
	if e == nil || e.hidden {
		return
	}
	toX, toY := e.X, e.Y
	if e.Kind != kindPlayer {
		if !e.physicsReady || math.Hypot(toX-from.X, toY-from.Y) > 256 {
			// Explicit respawn/leash/pet recall: spawn on the destination surface.
			// Systems flag a committed teleport by clearing physicsReady so even
			// short hops re-seat instead of rewinding to `from`.
			e.physicsReady = false
			h.ensureBody3D(e)
		} else {
			e.X, e.Y, e.Z = from.X, from.Y, from.Z
		}
	}
	h.moveEntity3D(e, toX, toY, dt)
	if e.X != from.X || e.Y != from.Y || e.Z != from.Z {
		h.spatialInvalidate()
		h.entityDirty = true
		if e.Kind == kindPlayer {
			h.broadcastPlayerMoved(e.ID, e)
		}
	}
}

func entityDistance3D(a, b *entity) float64 {
	return math.Sqrt((a.X-b.X)*(a.X-b.X) + (a.Y-b.Y)*(a.Y-b.Y) + (a.Z-b.Z)*(a.Z-b.Z))
}

func (h *Hub) entityLineOfSight3D(a, b *entity) bool {
	// Eye/chest heights avoid treating the ground under either character as a
	// projectile blocker while retaining occlusion by platforms and walls.
	return h.physicsWorld3D().LineOfSight(game.Vec3{X: a.X, Y: a.Y, Z: a.Z + 24}, game.Vec3{X: b.X, Y: b.Y, Z: b.Z + 24})
}
