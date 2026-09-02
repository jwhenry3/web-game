package game

import (
	"container/heap"
	"math"
)

const (
	TileSize    = 40
	OverworldW  = 1600
	OverworldH  = 1200
	OverworldCols = OverworldW / TileSize
	OverworldRows = OverworldH / TileSize

	// Heroes 99 at display scale 1.25 — keep in sync with web/src/characters/heroes99.ts.
	playerSpriteW         = 100.0 * 1.25
	playerSpriteH         = 40.0 * 1.25
	PlayerCollisionHalfW  = playerSpriteW / 8
	PlayerCollisionHalfH  = playerSpriteH / 4
)

// Tile kinds for the shared overworld. Walkable: H . , R
// Blocked: # ~ T
const (
	TileHaven  = 'H'
	TileGrass  = '.'
	TilePath   = ','
	TileRuins  = 'R'
	TileTree   = 'T'
	TileRock   = '#'
	TileWater  = '~'
)

type Tile struct {
	C, R int
}

type Vec2 struct {
	X, Y float64
}

type Region struct {
	ID         string
	MinC, MinR int
	MaxC, MaxR int
}

func (reg Region) Contains(c, r int) bool {
	return c >= reg.MinC && c <= reg.MaxC && r >= reg.MinR && r <= reg.MaxR
}

type Patrol struct {
	ID     string
	Kind   string
	Name   string
	Level  int
	Region string
	Home   Tile
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

// NPCPatrols are overworld foe spawn definitions loaded from config/overworld.json.
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
	return OverworldCells[r][c]
}

func WalkableTile(c, r int) bool {
	switch OverworldCell(c, r) {
	case TileHaven, TileGrass, TilePath, TileRuins:
		return true
	default:
		return false
	}
}

func WorldToTile(x, y float64) Tile {
	c := int(math.Floor(x / TileSize))
	r := int(math.Floor(y / TileSize))
	return Tile{C: c, R: r}
}

func TileCenter(t Tile) Vec2 {
	return Vec2{X: (float64(t.C) + 0.5) * TileSize, Y: (float64(t.R) + 0.5) * TileSize}
}

func WalkableAt(x, y float64) bool {
	t := WorldToTile(x, y)
	return WalkableTile(t.C, t.R)
}

// BoundsWalkableAt checks a foot-anchored box (cx, cy) with halfW × halfH extending upward.
func BoundsWalkableAt(cx, cy, halfW, halfH float64) bool {
	left := cx - halfW
	right := cx + halfW
	top := cy - halfH
	bottom := cy
	c0 := int(math.Floor(left / TileSize))
	c1 := int(math.Floor(right / TileSize))
	r0 := int(math.Floor(top / TileSize))
	r1 := int(math.Floor(bottom / TileSize))
	for r := r0; r <= r1; r++ {
		for c := c0; c <= c1; c++ {
			if !WalkableTile(c, r) {
				return false
			}
		}
	}
	return true
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

// SlideMovePlayer applies the player foot-anchored collision box.
func SlideMovePlayer(fromX, fromY, toX, toY float64) (float64, float64) {
	if BoundsWalkableAt(toX, toY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		return toX, toY
	}
	if BoundsWalkableAt(toX, fromY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		return toX, fromY
	}
	if BoundsWalkableAt(fromX, toY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
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
	if from == to {
		return []Vec2{TileCenter(to)}
	}
	if !WalkableTile(from.C, from.R) || !WalkableTile(to.C, to.R) {
		return nil
	}
	allow := func(c, r int) bool {
		return WalkableTile(c, r) && (region.ID == "" || region.Contains(c, r))
	}
	if !allow(from.C, from.R) || !allow(to.C, to.R) {
		return nil
	}

	open := &tilePQ{}
	heap.Init(open)
	heap.Push(open, &pathNode{t: from, g: 0, f: heuristic(from, to)})
	came := map[Tile]Tile{}
	bestG := map[Tile]float64{from: 0}

	dirs := []struct{ dc, dr int; cost float64 }{
		{-1, 0, 1}, {1, 0, 1}, {0, -1, 1}, {0, 1, 1},
		{-1, -1, math.Sqrt2}, {1, -1, math.Sqrt2}, {-1, 1, math.Sqrt2}, {1, 1, math.Sqrt2},
	}

	for open.Len() > 0 {
		cur := heap.Pop(open).(*pathNode)
		if cur.t == to {
			return reconstruct(came, to)
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
