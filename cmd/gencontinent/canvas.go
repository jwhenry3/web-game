package main

import (
	"clara-mundi/internal/game"
)

const tileSize = 32

// canvas paints ground/collision GID layers for the whole continent. Water is
// stamped without a collision flag — its ground GID resolves to the '~' tile
// char, which blocks movement on its own and renders as water on the minimap.
type canvas struct {
	cols, rows int
	ground     []int
	collision  []int
	road       []bool // carved road tiles — vegetation must not overwrite them
	plantDirt  bool   // current zone allows planting on dirt fills
}

func newCanvas(cols, rows, fillGID int) *canvas {
	n := cols * rows
	g := make([]int, n)
	for i := range g {
		g[i] = fillGID
	}
	return &canvas{cols: cols, rows: rows, ground: g, collision: make([]int, n), road: make([]bool, n)}
}

func (c *canvas) idx(col, row int) int { return row*c.cols + col }

func (c *canvas) in(col, row int) bool {
	return col >= 0 && row >= 0 && col < c.cols && row < c.rows
}

func (c *canvas) gidAt(col, row int) int {
	if !c.in(col, row) {
		return 0
	}
	return c.ground[c.idx(col, row)]
}

func (c *canvas) setGround(col, row, gid int) {
	if c.in(col, row) {
		c.ground[c.idx(col, row)] = gid
	}
}

func (c *canvas) setBlocked(col, row int, groundGID int) {
	if !c.in(col, row) {
		return
	}
	i := c.idx(col, row)
	c.ground[i] = groundGID
	c.collision[i] = 1
}

func (c *canvas) clearCollision(col, row int) {
	if c.in(col, row) {
		c.collision[c.idx(col, row)] = 0
	}
}

// setWater paints open water: ground GID only, no collision flag (the '~'
// char it produces is already unwalkable).
func (c *canvas) setWater(col, row, waterGID int) {
	if !c.in(col, row) {
		return
	}
	i := c.idx(col, row)
	c.ground[i] = waterGID
	c.collision[i] = 0
}

func (c *canvas) fillRect(c0, r0, c1, r1, gid int, block bool) {
	if c0 > c1 {
		c0, c1 = c1, c0
	}
	if r0 > r1 {
		r0, r1 = r1, r0
	}
	for r := r0; r <= r1; r++ {
		for col := c0; col <= c1; col++ {
			if !c.in(col, r) {
				continue
			}
			i := c.idx(col, r)
			c.ground[i] = gid
			if block {
				c.collision[i] = 1
			} else {
				c.collision[i] = 0
			}
		}
	}
}

func (c *canvas) fillEllipse(cx, cy, rx, ry, gid int, block bool) {
	if rx < 1 {
		rx = 1
	}
	if ry < 1 {
		ry = 1
	}
	for r := cy - ry; r <= cy+ry; r++ {
		for col := cx - rx; col <= cx+rx; col++ {
			dx := float64(col-cx) / float64(rx)
			dy := float64(r-cy) / float64(ry)
			if dx*dx+dy*dy > 1 {
				continue
			}
			if block {
				c.setBlocked(col, r, gid)
			} else if gid == game.PipoyaGIDWater {
				c.setWater(col, r, gid)
			} else {
				c.setGround(col, r, gid)
				c.clearCollision(col, r)
			}
		}
	}
}

// carveRoad lays a walkable path, clearing blockers (rocks, trunks, water) and
// marking the tiles so vegetation stamps never overwrite the road.
func (c *canvas) carveRoad(c0, r0, c1, r1, gid int) {
	if c0 > c1 {
		c0, c1 = c1, c0
	}
	if r0 > r1 {
		r0, r1 = r1, r0
	}
	for r := r0; r <= r1; r++ {
		for col := c0; col <= c1; col++ {
			if !c.in(col, r) {
				continue
			}
			i := c.idx(col, r)
			c.ground[i] = gid
			c.collision[i] = 0
			c.road[i] = true
		}
	}
}

// pathL carves an L-shaped road (horizontal leg at r0, then vertical at c1).
func (c *canvas) pathL(c0, r0, c1, r1, halfW, gid int) {
	c.carveRoad(c0, r0-halfW, c1, r0+halfW, gid)
	c.carveRoad(c1-halfW, r0, c1+halfW, r1, gid)
}

// scatter visits each tile in the rect and calls fn on ~1/density of them,
// deterministically by (seed, col, row).
func (c *canvas) scatter(seed uint64, density, minC, minR, maxC, maxR int, fn func(col, row int, roll uint64)) {
	c.scatterGated(seed, density, minC, minR, maxC, maxR, nil, fn)
}

// scatterGated is scatter with a per-tile acceptance test — clumped features
// (moisture-driven groves) that don't align to the scatter density.
func (c *canvas) scatterGated(seed uint64, density, minC, minR, maxC, maxR int, gate func(col, row int) bool, fn func(col, row int, roll uint64)) {
	for r := minR; r <= maxR; r++ {
		for col := minC; col <= maxC; col++ {
			h := hash2(seed, uint64(col), uint64(r))
			if int(h%uint64(density)) == 0 && (gate == nil || gate(col, r)) {
				fn(col, r, h)
			}
		}
	}
}

// walkableSpawn reports whether a ground GID resolves to a walkable tile
// char — NPC homes mustn't land on rock ('#') or water ('~') fills, which
// block via the char mapping without a collision flag.
func walkableSpawn(gid int) bool {
	ch, ok := game.CharFromPipoyaGroundGID(gid)
	if !ok {
		return false
	}
	switch ch {
	case game.TileGrass, game.TilePath, game.TileHaven, game.TileRuins, game.TileTree,
		game.TileSnow, game.TileSand:
		return true
	}
	return false
}

func isWaterGID(gid int) bool {
	return gid == game.PipoyaGIDWater ||
		gid == game.PipoyaGIDWaterFill ||
		gid == game.PipoyaGIDWaterEdgeN ||
		gid == game.PipoyaGIDWaterEdgeS ||
		gid == game.PipoyaGIDWaterEdgeE ||
		gid == game.PipoyaGIDWaterEdgeW ||
		(gid >= game.PipoyaFirstWaterAnim && gid < game.PipoyaFirstWaterAnim+3072)
}

func isLandWalkable(c *canvas, col, row int) bool {
	if !c.in(col, row) {
		return false
	}
	i := c.idx(col, row)
	if c.collision[i] != 0 {
		return false
	}
	return !isWaterGID(c.ground[i])
}

// autotileShores replaces water cells that touch land with Water_pipo edge tiles.
func (c *canvas) autotileShores() {
	next := append([]int(nil), c.ground...)
	for r := 0; r < c.rows; r++ {
		for col := 0; col < c.cols; col++ {
			i := c.idx(col, r)
			if !isWaterGID(c.ground[i]) {
				continue
			}
			n := isLandWalkable(c, col, r-1)
			s := isLandWalkable(c, col, r+1)
			e := isLandWalkable(c, col+1, r)
			w := isLandWalkable(c, col-1, r)
			sides := 0
			if n {
				sides++
			}
			if s {
				sides++
			}
			if e {
				sides++
			}
			if w {
				sides++
			}
			switch {
			case sides == 1 && n:
				next[i] = game.PipoyaGIDWaterEdgeN
			case sides == 1 && s:
				next[i] = game.PipoyaGIDWaterEdgeS
			case sides == 1 && e:
				next[i] = game.PipoyaGIDWaterEdgeE
			case sides == 1 && w:
				next[i] = game.PipoyaGIDWaterEdgeW
			default:
				next[i] = game.PipoyaGIDWaterFill
			}
		}
	}
	c.ground = next
}

// varyPathFills swaps some path tiles to the alternate solid dirt (local 115).
func (c *canvas) varyPathFills(seed uint64) {
	alt := game.PipoyaFirstBaseChip + 115
	for r := 0; r < c.rows; r++ {
		for col := 0; col < c.cols; col++ {
			i := c.idx(col, r)
			if c.collision[i] != 0 || c.ground[i] != game.PipoyaGIDPath {
				continue
			}
			if hash2(seed, uint64(col), uint64(r))%5 == 0 {
				c.ground[i] = alt
			}
		}
	}
}

// canPlant reports whether a cell can receive a tree/bush stamp: walkable,
// not water, not a road, and a plantable ground fill for this zone's rules.
func (c *canvas) canPlant(col, row int) bool {
	if !c.in(col, row) {
		return false
	}
	i := c.idx(col, row)
	if c.collision[i] != 0 || c.road[i] {
		return false
	}
	gid := c.ground[i]
	if isWaterGID(gid) || gid == game.PipoyaGIDHaven {
		return false
	}
	if gid >= game.MundiFirstTerrain && gid < game.MundiFirstTerrain+game.MundiTerrainTiles {
		// MundiTerrain fills are plantable except ice — the zone decorator
		// chooses biome-appropriate props for each fill.
		l := gid - game.MundiFirstTerrain
		return l <= 7 && l != game.MundiLocalIce
	}
	local := gid - game.PipoyaFirstBaseChip
	if local < 0 || local >= 1064 {
		return false
	}
	switch local {
	case 0, 1, 2, 3, 4: // grass + savanna fills
		return true
	case 5, 115: // dirt fills — allowed when the zone plants on dirt
		return c.plantDirt
	default:
		return false
	}
}

// stampTree places a Pipoya 2×2 tree (tops + bottom-right walk-under,
// bottom-left trunk blocks — one footprint tile, matching the iso billboard).
func (c *canvas) stampTree(col, row, variant int) bool {
	return c.stampTreeSet(col, row, game.PipoyaTreeStamps, game.PipoyaFirstBaseChip, variant)
}

// stampBigTree places a large-canopy Pipoya 2×2 tree.
func (c *canvas) stampBigTree(col, row, variant int) bool {
	return c.stampTreeSet(col, row, game.PipoyaBigTreeStamps, game.PipoyaFirstBaseChip, variant)
}

// stampMundiTree places a MundiTerrain 2×2 tree (pine, snowy pine, palm, dead grey).
func (c *canvas) stampMundiTree(col, row, variant int) bool {
	return c.stampTreeSet(col, row, game.MundiTreeStamps, game.MundiFirstTerrain, variant)
}

// stampTreeSet places a 2×2 stamp from a stamp table at a firstgid offset.
// Only the bottom-left cell blocks — the iso renderer draws the stamp as one
// billboard anchored at that cell's bottom vertex. Tops and the bottom-right
// mate stay walkable.
func (c *canvas) stampTreeSet(col, row int, stamps []game.PipoyaTreeStamp, firstGID, variant int) bool {
	if len(stamps) == 0 {
		return false
	}
	if variant < 0 {
		variant = 0
	}
	stamp := stamps[variant%len(stamps)]
	offs := [4][2]int{{0, 0}, {1, 0}, {0, 1}, {1, 1}}
	for _, o := range offs {
		if !c.canPlant(col+o[0], row+o[1]) {
			return false
		}
	}
	for i, o := range offs {
		gid := firstGID + stamp[i]
		cc, rr := col+o[0], row+o[1]
		if i == 2 {
			c.setBlocked(cc, rr, gid)
		} else {
			c.setGround(cc, rr, gid)
			c.clearCollision(cc, rr)
		}
	}
	return true
}

// stampProp places a 1×1 prop on a plantable tile; block marks it impassable.
func (c *canvas) stampProp(col, row, gid int, block bool) {
	if !c.canPlant(col, row) {
		return
	}
	if block {
		c.setBlocked(col, row, gid)
	} else {
		c.setGround(col, row, gid)
	}
}

// stampMundiProp places a MundiTerrain prop; collision follows
// game.MundiBlockingLocals so rocks/spires/stumps block like Pipoya clusters.
func (c *canvas) stampMundiProp(col, row, local int) {
	c.stampProp(col, row, game.MundiGID(local), game.MundiBlockingLocals[local])
}

// nearWater reports whether any 4-neighbor holds open water — gates reeds,
// lilypads and driftwood to real shorelines.
func (c *canvas) nearWater(col, row int) bool {
	for _, d := range [4][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}} {
		if isWaterGID(c.gidAt(col+d[0], row+d[1])) {
			return true
		}
	}
	return false
}

// groundIs reports whether the tile holds one of the given ground GIDs —
// gates palms to sand, ferns to jungle floor, etc.
func (c *canvas) groundIs(col, row int, gids ...int) bool {
	g := c.gidAt(col, row)
	for _, gid := range gids {
		if g == gid {
			return true
		}
	}
	return false
}

// stampBush places a 1×1 bush prop (visual only — does not block movement).
func (c *canvas) stampBush(col, row, variant int) {
	if !c.canPlant(col, row) {
		return
	}
	bushes := game.PipoyaBushLocals
	if len(bushes) == 0 {
		return
	}
	if variant < 0 {
		variant = 0
	}
	c.setGround(col, row, game.PipoyaFirstBaseChip+bushes[variant%len(bushes)])
}

// stampRockCluster places a small stone cluster (blocked), sparing roads and haven.
func (c *canvas) stampRockCluster(col, row, rockGID int, seed uint64) {
	if !c.in(col, row) {
		return
	}
	i := c.idx(col, row)
	if c.collision[i] != 0 || c.road[i] || isWaterGID(c.ground[i]) || c.ground[i] == game.PipoyaGIDHaven {
		return
	}
	c.setBlocked(col, row, rockGID)
	if hash2(seed, uint64(col), 3)%4 == 0 && c.in(col+1, row) {
		j := c.idx(col+1, row)
		g := c.ground[j]
		if c.collision[j] == 0 && !c.road[j] && !isWaterGID(g) && g != game.PipoyaGIDHaven {
			c.setBlocked(col+1, row, rockGID)
		}
	}
	if hash2(seed, uint64(row), 5)%5 == 0 && c.in(col, row+1) {
		j := c.idx(col, row+1)
		g := c.ground[j]
		if c.collision[j] == 0 && !c.road[j] && !isWaterGID(g) && g != game.PipoyaGIDHaven {
			c.setBlocked(col, row+1, rockGID)
		}
	}
}

// clearSpawnPad restores walkable ground around a point (NPC homes, save pads).
func (c *canvas) clearSpawnPad(col, row, groundGID int) {
	for dr := -1; dr <= 1; dr++ {
		for dc := -1; dc <= 1; dc++ {
			cc, rr := col+dc, row+dr
			if !c.in(cc, rr) {
				continue
			}
			c.setGround(cc, rr, groundGID)
			c.clearCollision(cc, rr)
		}
	}
}

func hash2(seed, a, b uint64) uint64 {
	x := seed ^ (a * 0x9e3779b97f4a7c15) ^ (b * 0xbf58476d1ce4e5b9)
	x ^= x >> 30
	x *= 0xbf58476d1ce4e5b9
	x ^= x >> 27
	x *= 0x94d049bb133111eb
	x ^= x >> 31
	return x
}
