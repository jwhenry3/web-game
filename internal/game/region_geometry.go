package game

import "math"

// pointInPolygonTile reports whether tile (c,r) is inside a polygon in tile space.
// Vertices use absolute tile coordinates (same space as MinC/MaxR). Boundary counts as inside.
func pointInPolygonTile(c, r int, poly []Vec2) bool {
	if len(poly) < 3 {
		return false
	}
	px := float64(c) + 0.5
	py := float64(r) + 0.5
	if pointOnPolygonBoundary(px, py, poly) {
		return true
	}
	inside := false
	j := len(poly) - 1
	for i := 0; i < len(poly); i++ {
		xi, yi := poly[i].X, poly[i].Y
		xj, yj := poly[j].X, poly[j].Y
		intersect := (yi > py) != (yj > py) &&
			px < (xj-xi)*(py-yi)/(yj-yi)+xi
		if intersect {
			inside = !inside
		}
		j = i
	}
	return inside
}

func pointOnPolygonBoundary(px, py float64, poly []Vec2) bool {
	const eps = 1e-6
	for i := 0; i < len(poly); i++ {
		a := poly[i]
		b := poly[(i+1)%len(poly)]
		if pointOnSegment(px, py, a.X, a.Y, b.X, b.Y, eps) {
			return true
		}
	}
	return false
}

func pointOnSegment(px, py, ax, ay, bx, by, eps float64) bool {
	cross := (px-ax)*(by-ay) - (py-ay)*(bx-ax)
	if math.Abs(cross) > eps {
		return false
	}
	dot := (px-ax)*(bx-ax) + (py-ay)*(by-ay)
	if dot < -eps {
		return false
	}
	lenSq := (bx-ax)*(bx-ax) + (by-ay)*(by-ay)
	return dot <= lenSq+eps
}

func pointStrictlyInPolygon(px, py float64, poly []Vec2) bool {
	if len(poly) < 3 {
		return false
	}
	if pointOnPolygonBoundary(px, py, poly) {
		return false
	}
	inside := false
	j := len(poly) - 1
	for i := 0; i < len(poly); i++ {
		xi, yi := poly[i].X, poly[i].Y
		xj, yj := poly[j].X, poly[j].Y
		intersect := (yi > py) != (yj > py) &&
			px < (xj-xi)*(py-yi)/(yj-yi)+xi
		if intersect {
			inside = !inside
		}
		j = i
	}
	return inside
}

func segmentsProperlyIntersect(a1, a2, b1, b2 Vec2) bool {
	orient := func(p, q, r Vec2) int {
		v := (q.Y-p.Y)*(r.X-q.X) - (q.X-p.X)*(r.Y-q.Y)
		if math.Abs(v) < 1e-9 {
			return 0
		}
		if v > 0 {
			return 1
		}
		return 2
	}
	o1 := orient(a1, a2, b1)
	o2 := orient(a1, a2, b2)
	o3 := orient(b1, b2, a1)
	o4 := orient(b1, b2, a2)
	return o1 != 0 && o2 != 0 && o3 != 0 && o4 != 0 && o1 != o2 && o3 != o4
}

// polygonsOverlap reports whether two tile-space polygons have intersecting interiors.
// Shared edges/vertices are allowed.
func polygonsOverlap(a, b []Vec2) bool {
	if len(a) < 3 || len(b) < 3 {
		return false
	}
	for i := 0; i < len(a); i++ {
		a1 := a[i]
		a2 := a[(i+1)%len(a)]
		for j := 0; j < len(b); j++ {
			b1 := b[j]
			b2 := b[(j+1)%len(b)]
			if segmentsProperlyIntersect(a1, a2, b1, b2) {
				return true
			}
		}
	}
	for _, p := range a {
		if pointStrictlyInPolygon(p.X, p.Y, b) {
			return true
		}
	}
	for _, p := range b {
		if pointStrictlyInPolygon(p.X, p.Y, a) {
			return true
		}
	}
	return false
}

func bboxFromPolygon(poly []Vec2) (minC, minR, maxC, maxR int) {
	if len(poly) == 0 {
		return 0, 0, 0, 0
	}
	minX, maxX := poly[0].X, poly[0].X
	minY, maxY := poly[0].Y, poly[0].Y
	for _, p := range poly[1:] {
		if p.X < minX {
			minX = p.X
		}
		if p.X > maxX {
			maxX = p.X
		}
		if p.Y < minY {
			minY = p.Y
		}
		if p.Y > maxY {
			maxY = p.Y
		}
	}
	minC = int(math.Floor(minX))
	minR = int(math.Floor(minY))
	maxC = int(math.Ceil(maxX)) - 1
	maxR = int(math.Ceil(maxY)) - 1
	if maxC < minC {
		maxC = minC
	}
	if maxR < minR {
		maxR = minR
	}
	return
}

func rectPolygonTile(minC, minR, maxC, maxR int) []Vec2 {
	return []Vec2{
		{X: float64(minC), Y: float64(minR)},
		{X: float64(maxC + 1), Y: float64(minR)},
		{X: float64(maxC + 1), Y: float64(maxR + 1)},
		{X: float64(minC), Y: float64(maxR + 1)},
	}
}
