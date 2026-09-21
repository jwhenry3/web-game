package game

import (
	"math"
	"strconv"
)

func terrainNoise3D(c, r float64) float64 {
	return (math.Sin(c*.17+math.Cos(r*.13)*2) + math.Cos(r*.21-c*.08) + 2) / 4
}
func (o *Overworld) terrainCell3D(c, r int) byte {
	c = max(0, min(o.Cols-1, c))
	r = max(0, min(o.Rows-1, r))
	cell := o.Cell(c, r)
	if idx := r*o.Cols + c; cell == TileRock && idx < len(o.Ground) {
		gid := o.Ground[idx] & 0x1fffffff
		if (gid >= 585 && gid <= 608) || (gid >= 6008 && gid <= 6015) {
			return TileTree
		}
	}
	return cell
}
func (o *Overworld) terrainVertex3D(c, r int) float64 {
	if o.Scene3D != nil {
		if h, ok := o.Scene3D.Terrain.Heights[strconv.Itoa(c)+","+strconv.Itoa(r)]; ok {
			return h
		}
	}
	cells := [4]byte{o.terrainCell3D(c-1, r-1), o.terrainCell3D(c, r-1), o.terrainCell3D(c-1, r), o.terrainCell3D(c, r)}
	for _, cell := range cells {
		if cell == TileHaven || cell == TileRuins {
			return .24 * 32
		}
	}
	for _, cell := range cells {
		if cell == TileIce {
			return .06 * 32
		}
	}
	n := terrainNoise3D(float64(c), float64(r))
	for _, cell := range cells {
		if cell == TileWater {
			return (-.18 - n*.18) * 32
		}
	}
	height := 0.0
	for _, cell := range cells {
		switch cell {
		case TileRock:
			height += 1.7 + n*2.9
		case TileSnow:
			height += .55 + n*.7
		case TileSand:
			height += .18 + n*.5
		case TileTree:
			height += .38 + n*.6
		default:
			height += .22 + n*.38
		}
	}
	return height * 8
}

// TerrainHeightAt exactly matches WorldHeightmap's triangle interpolation and
// procedural formula. Sparse authored vertices are absolute map-pixel heights.
func (o *Overworld) TerrainHeightAt(x, y float64) float64 {
	if o == nil || o.Cols <= 0 || o.Rows <= 0 {
		return 0
	}
	u := math.Max(0, math.Min(float64(o.Cols)-1e-7, x/float64(o.tileSz())))
	v := math.Max(0, math.Min(float64(o.Rows)-1e-7, y/float64(o.tileSz())))
	c, r := int(math.Floor(u)), int(math.Floor(v))
	fx, fy := u-float64(c), v-float64(r)
	b, d := o.terrainVertex3D(c+1, r), o.terrainVertex3D(c, r+1)
	if fx+fy <= 1 {
		return o.terrainVertex3D(c, r)*(1-fx-fy) + b*fx + d*fy
	}
	return o.terrainVertex3D(c+1, r+1)*(fx+fy-1) + b*(1-fy) + d*(1-fx)
}

func (o *Overworld) Physics3D() PhysicsWorld3D {
	cols, rows := o.dims()
	ts := float64(o.tileSz())
	w := PhysicsWorld3D{Bounds: AABB3D{Min: Vec3{0, 0, -100000}, Max: Vec3{float64(cols) * ts, float64(rows) * ts, 100000}}, HeightAt: o.TerrainHeightAt, Gravity: Gravity3D, StepHeight: 10, MaxSlope: 1.2, Colliders: o.SceneColliders3D()}
	w.NearbyColliders = func(minX, minY, maxX, maxY float64) []AABB3D {
		var boxes []AABB3D
		for r := max(0, int(math.Floor(minY/ts))); r <= min(rows-1, int(math.Floor(maxY/ts))); r++ {
			for c := max(0, int(math.Floor(minX/ts))); c <= min(cols-1, int(math.Floor(maxX/ts))); c++ {
				if o.WalkableTile(c, r) {
					continue
				}
				h := o.TerrainHeightAt((float64(c)+.5)*ts, (float64(r)+.5)*ts)
				top := h + 48.0
				if o.Cell(c, r) == TileWater {
					top = h + 8
				}
				boxes = append(boxes, AABB3D{Min: Vec3{float64(c) * ts, float64(r) * ts, h - 10000}, Max: Vec3{float64(c+1) * ts, float64(r+1) * ts, top}})
			}
		}
		return boxes
	}
	return w
}
