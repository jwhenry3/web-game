package game

import (
	"container/heap"
	"math"
)

const (
	DefaultTileSize = 32
)

// Active map dimensions (updated when an overworld is installed).
var (
	TileSize      = DefaultTileSize
	OverworldW    = 1600
	OverworldH    = 1200
	OverworldCols = 40
	OverworldRows = 30

	// Heroes 99 at display scale 1.25 — keep in sync with wails/frontend/src/characters/heroes99.ts.
	playerSpriteW = 100.0 * 1.25

	// PlayerCollisionRadius is the feet-centered collision circle. On screen
	// the iso projection renders a world circle of radius r as a ground-plane
	// ellipse 2√2r wide (~44px here — about a third of the sprite's width).
	// Kept under half a tile so 1-tile lanes between blocked cells stay
	// passable.
	PlayerCollisionRadius = playerSpriteW / 8
)

// Tile kinds for the shared overworld. Walkable: H . , R T S D I
// Blocked: # ~
const (
	TileHaven = 'H'
	TileGrass = '.'
	TilePath  = ','
	TileRuins = 'R'
	TileTree  = 'T'
	TileRock  = '#'
	TileWater = '~'
	TileSnow  = 'S' // snow-covered ground (MundiTerrain fills)
	TileSand  = 'D' // sand / dunes (MundiTerrain fills)
	TileIce   = 'I' // frozen water — walkable like snow
)

type Tile struct {
	C, R int
}

type Vec2 struct {
	X, Y float64
}

type Region struct {
	ID        string `json:"id"`
	MinC      int    `json:"minC"`
	MinR      int    `json:"minR"`
	MaxC      int    `json:"maxC"`
	MaxR      int    `json:"maxR"`
	Sanctuary bool   `json:"sanctuary,omitempty"`
	Kind      string `json:"kind,omitempty"`
	// Polygon is absolute tile-space vertices. Empty means use AABB Min/Max.
	Polygon []Vec2 `json:"polygon,omitempty"`
}

func (reg Region) Contains(c, r int) bool {
	if len(reg.Polygon) >= 3 {
		return pointInPolygonTile(c, r, reg.Polygon)
	}
	return c >= reg.MinC && c <= reg.MaxC && r >= reg.MinR && r <= reg.MaxR
}

// EnsurePolygon fills Polygon from the AABB when missing (legacy maps).
func (reg Region) EnsurePolygon() Region {
	if len(reg.Polygon) >= 3 {
		return reg
	}
	reg.Polygon = rectPolygonTile(reg.MinC, reg.MinR, reg.MaxC, reg.MaxR)
	return reg
}

type Patrol struct {
	ID        string
	Kind      string
	Name      string
	Level     int
	Region    string
	Home      Tile
	Encounter EncounterConfig
}

var Regions []Region

func RegionByID(id string) (Region, bool) {
	for _, r := range Regions {
		if r.ID == id {
			return r, true
		}
	}
	return Region{}, false
}

// NPCPatrols are overworld foe spawn definitions loaded from map config / objects.
var NPCPatrols []Patrol

// OverworldCells is the authoritative 40×30 tile map (row-major).
// H haven  . grass  , path  R ruins  T trees  # rock  ~ water
var OverworldCells []string

func bytesRepeat(ch byte, n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = ch
	}
	return b
}

func fill(g [][]byte, c0, r0, c1, r1 int, ch byte) {
	if c0 > c1 {
		c0, c1 = c1, c0
	}
	if r0 > r1 {
		r0, r1 = r1, r0
	}
	for r := r0; r <= r1; r++ {
		if r < 0 || r >= len(g) {
			continue
		}
		for c := c0; c <= c1; c++ {
			if c < 0 || c >= len(g[r]) {
				continue
			}
			g[r][c] = ch
		}
	}
}

func stamp(g [][]byte, c, r int, ch byte) {
	if r >= 0 && r < len(g) && c >= 0 && c < len(g[r]) {
		g[r][c] = ch
	}
}

func ring(g [][]byte, c0, r0, c1, r1 int, ch byte) {
	fill(g, c0, r0, c1, r0, ch)
	fill(g, c0, r1, c1, r1, ch)
	fill(g, c0, r0, c0, r1, ch)
	fill(g, c1, r0, c1, r1, ch)
}

func OverworldCell(c, r int) byte {
	if r < 0 || r >= OverworldRows || c < 0 || c >= OverworldCols {
		return TileRock
	}
	if r >= len(OverworldCells) || c >= len(OverworldCells[r]) {
		return TileRock
	}
	return OverworldCells[r][c]
}

func WalkableTile(c, r int) bool {
	switch OverworldCell(c, r) {
	case TileHaven, TileGrass, TilePath, TileRuins, TileTree, TileSnow, TileSand, TileIce:
		return true
	default:
		return false
	}
}

func WorldToTile(x, y float64) Tile {
	ts := float64(TileSize)
	c := int(math.Floor(x / ts))
	r := int(math.Floor(y / ts))
	return Tile{C: c, R: r}
}

func TileCenter(t Tile) Vec2 {
	ts := float64(TileSize)
	return Vec2{X: (float64(t.C) + 0.5) * ts, Y: (float64(t.R) + 0.5) * ts}
}

func WalkableAt(x, y float64) bool {
	t := WorldToTile(x, y)
	return WalkableTile(t.C, t.R)
}

// CircleWalkableAt reports whether a feet-centered circle of radius r sits
// entirely on walkable tiles inside the map.
func CircleWalkableAt(cx, cy, radius float64) bool {
	ts := float64(TileSize)
	if cx-radius < 0 || cy-radius < 0 ||
		cx+radius > float64(OverworldCols)*ts || cy+radius > float64(OverworldRows)*ts {
		return false
	}
	c0 := int(math.Floor((cx - radius) / ts))
	c1 := int(math.Floor((cx + radius) / ts))
	r0 := int(math.Floor((cy - radius) / ts))
	r1 := int(math.Floor((cy + radius) / ts))
	for r := r0; r <= r1; r++ {
		for c := c0; c <= c1; c++ {
			if WalkableTile(c, r) {
				continue
			}
			if circleOverlapsCell(cx, cy, radius, c, r, ts) {
				return false
			}
		}
	}
	return true
}

// circleOverlapsCell reports whether the circle intersects the cell's rect.
func circleOverlapsCell(cx, cy, radius float64, col, row int, ts float64) bool {
	px := math.Max(float64(col)*ts, math.Min(cx, float64(col+1)*ts))
	py := math.Max(float64(row)*ts, math.Min(cy, float64(row+1)*ts))
	dx, dy := cx-px, cy-py
	return dx*dx+dy*dy < radius*radius
}

// SlideMove keeps motion on walkable tiles: try the full step, then axis slides.
func SlideMove(fromX, fromY, toX, toY float64) (float64, float64) {
	if WalkableAt(toX, toY) {
		return toX, toY
	}
	if WalkableAt(toX, fromY) {
		return toX, fromY
	}
	if WalkableAt(fromX, toY) {
		return fromX, toY
	}
	return fromX, fromY
}

// SlideMovePlayer applies the player feet-centered collision circle.
func SlideMovePlayer(fromX, fromY, toX, toY float64) (float64, float64) {
	if CircleWalkableAt(toX, toY, PlayerCollisionRadius) {
		return toX, toY
	}
	if CircleWalkableAt(toX, fromY, PlayerCollisionRadius) {
		return toX, fromY
	}
	if CircleWalkableAt(fromX, toY, PlayerCollisionRadius) {
		return fromX, toY
	}
	return fromX, fromY
}

func OverworldMapPayload() (tile, cols, rows int, cells string) {
	out := make([]byte, 0, OverworldCols*OverworldRows)
	for _, row := range OverworldCells {
		out = append(out, row...)
	}
	return TileSize, OverworldCols, OverworldRows, string(out)
}

func Pathfind(from, to Tile, region Region) []Vec2 {
	return pathfindWith(WalkableTile, from, to, region)
}

// pathfindMaxExpansions bounds A* search effort. Wander paths are
// region-scoped (small); unbounded chase paths on very large maps must give up
// rather than flood the whole grid when the target is unreachable.
const pathfindMaxExpansions = 20000

func pathfindWith(walkable func(c, r int) bool, from, to Tile, region Region) []Vec2 {
	if from == to {
		return []Vec2{TileCenter(to)}
	}
	if !walkable(from.C, from.R) || !walkable(to.C, to.R) {
		return nil
	}
	allow := func(c, r int) bool {
		return walkable(c, r) && (region.ID == "" || region.Contains(c, r))
	}
	if !allow(from.C, from.R) || !allow(to.C, to.R) {
		return nil
	}

	open := &tilePQ{}
	heap.Init(open)
	heap.Push(open, &pathNode{t: from, g: 0, f: heuristic(from, to)})
	came := map[Tile]Tile{}
	bestG := map[Tile]float64{from: 0}
	expanded := 0

	dirs := []struct {
		dc, dr int
		cost   float64
	}{
		{-1, 0, 1}, {1, 0, 1}, {0, -1, 1}, {0, 1, 1},
		{-1, -1, math.Sqrt2}, {1, -1, math.Sqrt2}, {-1, 1, math.Sqrt2}, {1, 1, math.Sqrt2},
	}

	for open.Len() > 0 {
		cur := heap.Pop(open).(*pathNode)
		if cur.t == to {
			return reconstruct(came, to)
		}
		expanded++
		if expanded > pathfindMaxExpansions {
			return nil
		}
		for _, d := range dirs {
			nc, nr := cur.t.C+d.dc, cur.t.R+d.dr
			if !allow(nc, nr) {
				continue
			}
			if d.dc != 0 && d.dr != 0 {
				if !allow(cur.t.C+d.dc, cur.t.R) || !allow(cur.t.C, cur.t.R+d.dr) {
					continue
				}
			}
			nt := Tile{C: nc, R: nr}
			g := cur.g + d.cost
			if prev, ok := bestG[nt]; ok && g >= prev {
				continue
			}
			bestG[nt] = g
			came[nt] = cur.t
			heap.Push(open, &pathNode{t: nt, g: g, f: g + heuristic(nt, to)})
		}
	}
	return nil
}

func heuristic(a, b Tile) float64 {
	dx := float64(a.C - b.C)
	if dx < 0 {
		dx = -dx
	}
	dy := float64(a.R - b.R)
	if dy < 0 {
		dy = -dy
	}
	if dx > dy {
		return dx + (math.Sqrt2-1)*dy
	}
	return dy + (math.Sqrt2-1)*dx
}

func reconstruct(came map[Tile]Tile, end Tile) []Vec2 {
	rev := []Tile{end}
	cur := end
	for {
		prev, ok := came[cur]
		if !ok {
			break
		}
		rev = append(rev, prev)
		cur = prev
	}
	out := make([]Vec2, 0, len(rev))
	for i := len(rev) - 1; i >= 0; i-- {
		out = append(out, TileCenter(rev[i]))
	}
	return out
}

type pathNode struct {
	t     Tile
	g, f  float64
	index int
}

type tilePQ []*pathNode

func (h tilePQ) Len() int           { return len(h) }
func (h tilePQ) Less(i, j int) bool { return h[i].f < h[j].f }
func (h tilePQ) Swap(i, j int)      { h[i], h[j] = h[j], h[i]; h[i].index = i; h[j].index = j }
func (h *tilePQ) Push(x any) {
	n := x.(*pathNode)
	n.index = len(*h)
	*h = append(*h, n)
}
func (h *tilePQ) Pop() any {
	old := *h
	n := old[len(old)-1]
	*h = old[:len(old)-1]
	return n
}
