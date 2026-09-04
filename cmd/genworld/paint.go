package main

import (
	"clara-mundi/internal/game"
)

const tileSize = 32

type canvas struct {
	cols, rows int
	ground     []int
	collision  []int
	plantDirt  bool // frost: allow planting on dirt fills
}


func newCanvas(cols, rows int, fillGID int) *canvas {
	n := cols * rows
	g := make([]int, n)
	c := make([]int, n)
	for i := range g {
		g[i] = fillGID
	}
	return &canvas{cols: cols, rows: rows, ground: g, collision: c}
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
			c.setGround(col, r, gid)
			if block {
				c.collision[c.idx(col, r)] = 1
			} else {
				c.collision[c.idx(col, r)] = 0
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
			if dx*dx+dy*dy <= 1 {
				if block {
					c.setBlocked(col, r, gid)
				} else {
					c.setGround(col, r, gid)
					c.clearCollision(col, r)
				}
			}
		}
	}
}

func (c *canvas) strokeRect(c0, r0, c1, r1, gid int, block bool) {
	c.fillRect(c0, r0, c1, r0, gid, block)
	c.fillRect(c0, r1, c1, r1, gid, block)
	c.fillRect(c0, r0, c0, r1, gid, block)
	c.fillRect(c1, r0, c1, r1, gid, block)
}

func (c *canvas) pathH(r, c0, c1, halfW, gid int) {
	if c0 > c1 {
		c0, c1 = c1, c0
	}
	c.fillRect(c0, r-halfW, c1, r+halfW, gid, false)
}

func (c *canvas) pathV(col, r0, r1, halfW, gid int) {
	if r0 > r1 {
		r0, r1 = r1, r0
	}
	c.fillRect(col-halfW, r0, col+halfW, r1, gid, false)
}

func (c *canvas) borderFrame(thickness int, gid int) {
	c.fillRect(0, 0, c.cols-1, thickness-1, gid, true)
	c.fillRect(0, c.rows-thickness, c.cols-1, c.rows-1, gid, true)
	c.fillRect(0, 0, thickness-1, c.rows-1, gid, true)
	c.fillRect(c.cols-thickness, 0, c.cols-1, c.rows-1, gid, true)
}

func (c *canvas) openGate(side string, mid, halfSpan, depth int) {
	path := game.PipoyaGIDPath
	switch side {
	case "n":
		c.fillRect(mid-halfSpan, 0, mid+halfSpan, depth, path, false)
	case "s":
		c.fillRect(mid-halfSpan, c.rows-1-depth, mid+halfSpan, c.rows-1, path, false)
	case "w":
		c.fillRect(0, mid-halfSpan, depth, mid+halfSpan, path, false)
	case "e":
		c.fillRect(c.cols-1-depth, mid-halfSpan, c.cols-1, mid+halfSpan, path, false)
	}
}

func (c *canvas) scatter(seed uint64, density int, minC, minR, maxC, maxR int, fn func(col, row int, roll uint64)) {
	for r := minR; r <= maxR; r++ {
		for col := minC; col <= maxC; col++ {
			h := hash2(seed, uint64(col), uint64(r))
			if int(h%uint64(density)) == 0 {
				fn(col, r, h)
			}
		}
	}
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

func isPathGID(gid int) bool {
	return gid == game.PipoyaGIDPath ||
		gid == game.PipoyaFirstBaseChip+115 ||
		gid == game.PipoyaGIDHaven
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
				// Multi-side / open water: solid fill (single-side edge chips only).
				next[i] = game.PipoyaGIDWaterFill
			}
		}
	}
	c.ground = next
}

// varyPathFills swaps some path tiles to the alternate solid dirt (local 115) for texture.
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

// canPlant reports whether a cell can receive a tree/bush stamp.
func (c *canvas) canPlant(col, row int) bool {
	if !c.in(col, row) || c.collision[c.idx(col, row)] != 0 {
		return false
	}
	gid := c.gidAt(col, row)
	if isWaterGID(gid) || gid == game.PipoyaGIDHaven {
		return false
	}
	local := gid - game.PipoyaFirstBaseChip
	if local < 0 || local >= 1064 {
		return false
	}
	switch local {
	case 0, 1, 2: // grass fills
		return true
	case 5, 115: // dirt — frost fields (and roads; vegetation runs after roads so verdant roads stay clear if grass-only)
		return c.plantDirt
	default:
		return false
	}
}

// stampTree places a Pipoya 2×2 tree (sheet-adjacent locals, as in samplemap's tree layer).
func (c *canvas) stampTree(col, row, variant int) bool {
	stamps := game.PipoyaTreeStamps
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
		gid := game.PipoyaFirstBaseChip + stamp[i]
		cc, rr := col+o[0], row+o[1]
		if i < 2 {
			// Canopy tops: drawable + walk-under (no collision).
			c.setGround(cc, rr, gid)
			c.clearCollision(cc, rr)
		} else {
			// Trunk / lower canopy: blocked.
			c.setBlocked(cc, rr, gid)
		}
	}
	return true
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

// stampRockCluster places a small stone cluster.
func (c *canvas) stampRockCluster(col, row, rockGID int, seed uint64) {
	if !c.in(col, row) || c.collision[c.idx(col, row)] != 0 || isWaterGID(c.gidAt(col, row)) {
		return
	}
	if c.gidAt(col, row) == game.PipoyaGIDHaven {
		return
	}
	c.setBlocked(col, row, rockGID)
	// Occasional east/south expand — kept sparse so rocks don't maze corridors.
	if hash2(seed, uint64(col), 3)%4 == 0 && c.in(col+1, row) && c.collision[c.idx(col+1, row)] == 0 {
		g := c.gidAt(col+1, row)
		if !isWaterGID(g) && g != game.PipoyaGIDHaven {
			c.setBlocked(col+1, row, rockGID)
		}
	}
	if hash2(seed, uint64(row), 5)%5 == 0 && c.in(col, row+1) && c.collision[c.idx(col, row+1)] == 0 {
		g := c.gidAt(col, row+1)
		if !isWaterGID(g) && g != game.PipoyaGIDHaven {
			c.setBlocked(col, row+1, rockGID)
		}
	}
}

// clearSpawnPad restores walkable ground around a point (NPC homes, etc.).
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

func px(col, row int) (float64, float64) {
	return (float64(col) + 0.5) * float64(tileSize), (float64(row) + 0.5) * float64(tileSize)
}
