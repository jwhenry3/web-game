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
	Loop   []Tile
}

var Regions = []Region{
	{ID: "haven", MinC: 2, MinR: 2, MaxC: 10, MaxR: 9},
	{ID: "greenwood", MinC: 12, MinR: 2, MaxC: 22, MaxR: 14},
	{ID: "wolfrun", MinC: 22, MinR: 8, MaxC: 37, MaxR: 21},
	{ID: "imphollow", MinC: 3, MinR: 18, MaxC: 24, MaxR: 27},
}

func RegionByID(id string) (Region, bool) {
	for _, r := range Regions {
		if r.ID == id {
			return r, true
		}
	}
	return Region{}, false
}

// NPCPatrols are the designated routes. Each foe stays inside its region
// and walks the loop with A* between waypoints.
var NPCPatrols = []Patrol{
	{ID: "g1", Kind: "goblin", Name: "Goblin", Level: 1, Region: "greenwood",
		Loop: []Tile{{13, 4}, {17, 4}, {17, 7}, {13, 7}}},
	{ID: "g2", Kind: "goblin", Name: "Goblin", Level: 1, Region: "greenwood",
		Loop: []Tile{{18, 3}, {21, 3}, {21, 6}, {18, 6}}},
	{ID: "g3", Kind: "goblin", Name: "Goblin", Level: 1, Region: "greenwood",
		Loop: []Tile{{13, 10}, {16, 10}, {16, 13}, {13, 13}}},
	{ID: "g4", Kind: "goblin", Name: "Goblin", Level: 1, Region: "greenwood",
		Loop: []Tile{{18, 10}, {21, 10}, {21, 13}, {18, 13}}},
	{ID: "w1", Kind: "dire_wolf", Name: "Dire Wolf", Level: 1, Region: "wolfrun",
		Loop: []Tile{{23, 10}, {27, 10}, {27, 13}, {23, 13}}},
	{ID: "w2", Kind: "dire_wolf", Name: "Dire Wolf", Level: 1, Region: "wolfrun",
		Loop: []Tile{{31, 11}, {35, 11}, {35, 15}, {31, 15}}},
	{ID: "w3", Kind: "dire_wolf", Name: "Dire Wolf", Level: 1, Region: "wolfrun",
		Loop: []Tile{{23, 16}, {27, 16}, {27, 19}, {23, 19}}},
	{ID: "w4", Kind: "dire_wolf", Name: "Dire Wolf", Level: 1, Region: "wolfrun",
		Loop: []Tile{{31, 17}, {35, 17}, {35, 20}, {31, 20}}},
	{ID: "i1", Kind: "stone_imp", Name: "Stone Imp", Level: 2, Region: "imphollow",
		Loop: []Tile{{5, 19}, {8, 19}, {8, 22}, {5, 22}}},
	{ID: "i2", Kind: "stone_imp", Name: "Stone Imp", Level: 2, Region: "imphollow",
		Loop: []Tile{{16, 19}, {18, 19}, {18, 22}, {16, 22}}},
	{ID: "i3", Kind: "stone_imp", Name: "Stone Imp", Level: 2, Region: "imphollow",
		Loop: []Tile{{5, 24}, {8, 24}, {8, 26}, {5, 26}}},
	{ID: "i4", Kind: "stone_imp", Name: "Stone Imp", Level: 2, Region: "imphollow",
		Loop: []Tile{{16, 26}, {18, 26}, {18, 27}, {16, 27}}},
}

// OverworldCells is the authoritative 40×30 tile map (row-major).
// H haven  . grass  , path  R ruins  T trees  # rock  ~ water
var OverworldCells []string

func init() {
	OverworldCells = buildOverworld()
}

func buildOverworld() []string {
	g := make([][]byte, OverworldRows)
	for r := 0; r < OverworldRows; r++ {
		g[r] = bytesRepeat(TileGrass, OverworldCols)
		for c := 0; c < OverworldCols; c++ {
			if r < 2 || r >= OverworldRows-2 || c == 0 || c == OverworldCols-1 {
				g[r][c] = TileRock
			}
		}
	}
	fill(g, 2, 2, 10, 9, TileHaven)
	fill(g, 11, 2, 12, 6, TileTree) // tree belt east of haven
	fill(g, 13, 2, 22, 14, TileGrass)
	stamp(g, 15, 8, TileTree)
	stamp(g, 16, 8, TileTree)
	stamp(g, 19, 5, TileTree)
	fill(g, 8, 8, 24, 8, TilePath)
	fill(g, 10, 9, 10, 14, TilePath)
	fill(g, 24, 8, 24, 18, TilePath)
	fill(g, 22, 9, 37, 21, TileGrass)
	fill(g, 28, 3, 36, 6, TileWater)
	fill(g, 28, 7, 36, 7, TileRock)
	fill(g, 29, 18, 30, 20, TileWater)
	fill(g, 3, 18, 24, 27, TileGrass)
	// west pond
	fill(g, 1, 24, 4, 27, TileWater)
	// two ruin courtyards with interiors
	ring(g, 10, 20, 15, 25, TileRock)
	fill(g, 11, 21, 14, 24, TileRuins)
	ring(g, 19, 20, 24, 25, TileRock)
	fill(g, 20, 21, 23, 24, TileRuins)
	// south ruin yard for i3/i4 stays grass; add a copse they walk around
	stamp(g, 10, 26, TileTree)
	stamp(g, 20, 23, TileTree)
	// keep test anchors walkable
	stamp(g, 10, 10, TilePath)
	stamp(g, 12, 12, TileGrass)
	stamp(g, 5, 5, TileHaven)
	// reopen patrol yards in case decorations overlapped
	for _, p := range NPCPatrols {
		for _, wp := range p.Loop {
			if wp.C > 0 && wp.C < OverworldCols-1 && wp.R > 1 && wp.R < OverworldRows-2 {
				if p.Region == "haven" {
					g[wp.R][wp.C] = TileHaven
				} else {
					g[wp.R][wp.C] = TileGrass
				}
			}
		}
	}
	// i2 waypoints 14,19 etc are outside the ring — keep grass. Good.
	out := make([]string, OverworldRows)
	for r, row := range g {
		out[r] = string(row)
	}
	return out
}

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
