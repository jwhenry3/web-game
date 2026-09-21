package game

import "math"

// Physics uses map pixels, with X/Y horizontal and Z up. Render adapters map
// this to Three.js (X/16, Z/16, Y/16). Positions are at the character's feet.
// Snappy jump tuning: apex ~36px (one body height) in ~0.55s. The client's
// TypeScript port (src/three/physics3d.ts) mirrors these — change together.
const Gravity3D = 960.0
const JumpVelocity3D = 264.0

type Vec3 struct{ X, Y, Z float64 }
type AABB3D struct{ Min, Max Vec3 }
type Body3D struct {
	Position, Velocity Vec3
	Radius, Height     float64
	Grounded           bool
}

// PhysicsWorld3D is immutable during a simulation pass. Both regular maps and
// private camp instances use this same swept upright-cylinder controller.
type PhysicsWorld3D struct {
	Bounds    AABB3D
	HeightAt  func(x, y float64) float64
	Colliders []AABB3D
	// NearbyColliders supplies legacy map collision without scanning the world.
	NearbyColliders               func(minX, minY, maxX, maxY float64) []AABB3D
	Gravity, StepHeight, MaxSlope float64
}

func NewCharacterBody3D(x, y, z float64) Body3D {
	return Body3D{Position: Vec3{x, y, z}, Radius: PlayerCollisionRadius, Height: 36}
}

func finite3(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
func (w PhysicsWorld3D) height(x, y float64) float64 {
	if w.HeightAt == nil {
		return 0
	}
	return w.HeightAt(x, y)
}
func (w PhysicsWorld3D) nearby(x, y, r float64) []AABB3D {
	if w.NearbyColliders == nil {
		return w.Colliders
	}
	return append(w.NearbyColliders(x-r, y-r, x+r, y+r), w.Colliders...)
}
func overlapsDisk(x, y, r float64, b AABB3D) bool {
	dx := x - math.Max(b.Min.X, math.Min(x, b.Max.X))
	dy := y - math.Max(b.Min.Y, math.Min(y, b.Max.Y))
	return dx*dx+dy*dy < r*r-1e-8
}
func (w PhysicsWorld3D) blocked(b Body3D, p Vec3) bool {
	if w.Bounds.Max.X > w.Bounds.Min.X && (p.X-b.Radius < w.Bounds.Min.X || p.X+b.Radius > w.Bounds.Max.X) {
		return true
	}
	if w.Bounds.Max.Y > w.Bounds.Min.Y && (p.Y-b.Radius < w.Bounds.Min.Y || p.Y+b.Radius > w.Bounds.Max.Y) {
		return true
	}
	for _, a := range w.nearby(p.X, p.Y, b.Radius) {
		if p.Z < a.Max.Z-1e-6 && p.Z+b.Height > a.Min.Z+1e-6 && overlapsDisk(p.X, p.Y, b.Radius, a) {
			return true
		}
	}
	return false
}

// support finds the highest surface at or below limit. It permits stepping
// onto low platforms while tall obstacles remain solid and roofs stay above.
func (w PhysicsWorld3D) support(b Body3D, x, y, limit float64) float64 {
	h := w.height(x, y)
	for _, a := range w.nearby(x, y, b.Radius) {
		if a.Max.Z <= limit+1e-6 && a.Max.Z > h && overlapsDisk(x, y, b.Radius, a) {
			h = a.Max.Z
		}
	}
	return h
}

// Move sweeps horizontal motion in increments smaller than the body radius,
// then integrates vertical motion in bounded timesteps. Neither endpoint-only
// collision nor client-provided elevation is used. dt=0 resolves planar intent
// without advancing gravity (the server tick owns physical time).
func (w PhysicsWorld3D) Move(b Body3D, target Vec2, dt float64) Body3D {
	if !finite3(target.X) || !finite3(target.Y) || !finite3(dt) || !finite3(b.Position.Z) {
		return b
	}
	if b.Radius <= 0 {
		b.Radius = PlayerCollisionRadius
	}
	if b.Height <= 0 {
		b.Height = 36
	}
	dt = math.Max(0, math.Min(.25, dt))
	gravity := w.Gravity
	if gravity <= 0 {
		gravity = Gravity3D
	}
	maxSlope := w.MaxSlope
	if maxSlope <= 0 {
		maxSlope = 1
	}
	dx, dy := target.X-b.Position.X, target.Y-b.Position.Y
	steps := int(math.Ceil(math.Max(math.Hypot(dx, dy)/math.Max(1, b.Radius*.4), dt/.016)))
	if steps < 1 {
		steps = 1
	}
	if steps > 4096 {
		return b
	}
	sx, sy, sd := dx/float64(steps), dy/float64(steps), dt/float64(steps)
	for i := 0; i < steps; i++ {
		from := b.Position
		floor := w.support(b, from.X, from.Y, from.Z+.001)
		if from.Z < floor {
			b.Position.Z = floor
			b.Grounded = true
			b.Velocity.Z = 0
			from = b.Position
		}
		if math.Abs(from.Z-floor) < .001 && b.Velocity.Z <= 0 {
			b.Grounded = true
		}
		try := func(x, y float64) bool {
			p := Vec3{x, y, b.Position.Z}
			ground := w.height(x, y)
			if b.Grounded {
				// Compare actual mesh incline independently of step height, otherwise
				// repeated tiny steps could climb arbitrarily steep terrain.
				delta := ground - w.height(from.X, from.Y)
				if delta > math.Hypot(x-from.X, y-from.Y)*maxSlope+1e-6 {
					return false
				}
				support := w.support(b, x, y, from.Z+w.StepHeight)
				if support > from.Z+w.StepHeight+1e-6 {
					return false
				}
				if support >= from.Z-w.StepHeight {
					p.Z = support
				}
			} else if ground > p.Z {
				return false
			}
			if w.blocked(b, p) {
				return false
			}
			b.Position = p
			return true
		}
		if !try(from.X+sx, from.Y+sy) {
			if !try(from.X+sx, from.Y) {
				try(from.X, from.Y+sy)
			}
		}
		floor = w.support(b, b.Position.X, b.Position.Y, b.Position.Z+.001)
		if b.Position.Z > floor+.001 || b.Velocity.Z > 0 {
			b.Grounded = false
			vz := b.Velocity.Z - gravity*sd
			nextZ := b.Position.Z + (b.Velocity.Z+vz)*.5*sd
			if vz > 0 {
				for _, a := range w.nearby(b.Position.X, b.Position.Y, b.Radius) {
					if overlapsDisk(b.Position.X, b.Position.Y, b.Radius, a) && b.Position.Z+b.Height <= a.Min.Z+1e-6 && nextZ+b.Height >= a.Min.Z {
						nextZ = a.Min.Z - b.Height
						vz = 0
					}
				}
			}
			// Land only when actually descending onto (or resting on) the floor. A
			// rising body with dt=0 — e.g. a jump whose intent resolves planar motion
			// in the same call — computes nextZ==Position.Z==floor and must keep its
			// upward velocity rather than settling instantly.
			if nextZ <= floor {
				nextZ = floor
				if vz <= 0 {
					vz = 0
					b.Grounded = true
				}
			}
			b.Position.Z = nextZ
			b.Velocity.Z = vz
		} else {
			b.Position.Z = floor
			b.Velocity.Z = 0
			b.Grounded = true
		}
	}
	return b
}

// LineOfSight tests full 3D AABB slabs and samples the heightfield at less than
// one map pixel intervals. Broad-phase candidates are bounded by the segment.
func (w PhysicsWorld3D) LineOfSight(from, to Vec3) bool {
	boxes := w.Colliders
	if w.NearbyColliders != nil {
		boxes = append(w.NearbyColliders(math.Min(from.X, to.X), math.Min(from.Y, to.Y), math.Max(from.X, to.X), math.Max(from.Y, to.Y)), boxes...)
	}
	for _, b := range boxes {
		enter, leave := 0.0, 1.0
		for _, axis := range [][4]float64{{from.X, to.X, b.Min.X, b.Max.X}, {from.Y, to.Y, b.Min.Y, b.Max.Y}, {from.Z, to.Z, b.Min.Z, b.Max.Z}} {
			d := axis[1] - axis[0]
			if math.Abs(d) < 1e-9 {
				if axis[0] < axis[2] || axis[0] > axis[3] {
					leave = -1
				}
				continue
			}
			a, z := (axis[2]-axis[0])/d, (axis[3]-axis[0])/d
			if a > z {
				a, z = z, a
			}
			enter = math.Max(enter, a)
			leave = math.Min(leave, z)
		}
		if enter <= leave && leave > 1e-5 && enter < 1-1e-5 {
			return false
		}
	}
	steps := int(math.Ceil(math.Hypot(to.X-from.X, to.Y-from.Y)))
	for i := 1; i < steps; i++ {
		t := float64(i) / float64(steps)
		x, y := from.X+(to.X-from.X)*t, from.Y+(to.Y-from.Y)*t
		if from.Z+(to.Z-from.Z)*t < w.height(x, y) {
			return false
		}
	}
	return true
}
