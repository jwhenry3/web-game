package main

import "ffv-web-game/internal/game"

type pipoyaLayers struct {
	Ground     []int
	Grass      []int
	Water      []int
	WaterGrass []int
	Tree       []int
	Collision  []int
}

func paintPipoyaLayers(grid [][]byte, cfg *game.BaseChipConfig, cols, rows int) pipoyaLayers {
	n := cols * rows
	l := pipoyaLayers{
		Ground:     make([]int, n),
		Grass:      make([]int, n),
		Water:      make([]int, n),
		WaterGrass: make([]int, n),
		Tree:       make([]int, n),
		Collision:  make([]int, n),
	}

	terrain := make([]int, n)
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			ch := grid[r][c]
			i := r*cols + c
			terrain[i] = cfg.TerrainForChar(ch)
			if !isWalkableChar(ch) {
				l.Collision[i] = 1
			}
		}
	}

	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			i := r*cols + c
			ch := grid[r][c]
			t := terrain[i]

			switch ch {
			case game.TileWater:
				l.Ground[i] = cfg.GID(game.PipoyaFirstBaseChip, cfg.WaterTileID())
				l.Water[i] = waterGID(grid, cols, rows, c, r)
				l.Collision[i] = 1
			case game.TileTree:
				l.Tree[i] = treeGID(cfg, c, r)
				l.Collision[i] = 1
				fallthrough
			default:
				if t < 0 {
					continue
				}
				sameN := sameTerrain(terrain, cols, rows, c, r-1, t)
				sameE := sameTerrain(terrain, cols, rows, c+1, r, t)
				sameS := sameTerrain(terrain, cols, rows, c, r+1, t)
				sameW := sameTerrain(terrain, cols, rows, c-1, r, t)
				local := cfg.AutotileLocal(t, sameN, sameE, sameS, sameW)
				l.Ground[i] = cfg.GID(game.PipoyaFirstBaseChip, local)
			}
		}
	}

	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			if grid[r][c] != game.TileGrass {
				continue
			}
			i := r*cols + c
			if shore := waterShoreGID(grid, cols, rows, c, r); shore != 0 {
				l.WaterGrass[i] = shore
			}
			if deco := grassDetailGID(grid, cols, rows, c, r); deco != 0 {
				l.Grass[i] = deco
			}
		}
	}

	return l
}

func sameTerrain(terrain []int, cols, rows, c, r, t int) bool {
	if c < 0 || r < 0 || c >= cols || r >= rows {
		return false
	}
	return terrain[r*cols+c] == t
}

func at(grid [][]byte, cols, rows, c, r int) byte {
	if c < 0 || r < 0 || c >= cols || r >= rows {
		return game.TileRock
	}
	return grid[r][c]
}

func isWater(ch byte) bool { return ch == game.TileWater }

func isGrassLike(ch byte) bool {
	switch ch {
	case game.TileGrass, game.TileTree:
		return true
	default:
		return false
	}
}

func isPathLike(ch byte) bool {
	switch ch {
	case game.TilePath, game.TileHaven, game.TileRuins:
		return true
	default:
		return false
	}
}

func waterGID(grid [][]byte, cols, rows, c, r int) int {
	if !isWater(at(grid, cols, rows, c, r)) {
		return 0
	}
	n := isWater(at(grid, cols, rows, c, r-1))
	s := isWater(at(grid, cols, rows, c, r+1))
	e := isWater(at(grid, cols, rows, c+1, r))
	w := isWater(at(grid, cols, rows, c-1, r))
	switch {
	case !n && s && e && w:
		return game.PipoyaGIDWaterEdgeN
	case n && !s && e && w:
		return game.PipoyaGIDWaterEdgeS
	case n && s && !e && w:
		return game.PipoyaGIDWaterEdgeE
	case n && s && e && !w:
		return game.PipoyaGIDWaterEdgeW
	default:
		return game.PipoyaGIDWaterFill
	}
}

func waterShoreGID(grid [][]byte, cols, rows, c, r int) int {
	if !isGrassLike(grid[r][c]) {
		return 0
	}
	touchesWater := isWater(at(grid, cols, rows, c, r-1)) ||
		isWater(at(grid, cols, rows, c, r+1)) ||
		isWater(at(grid, cols, rows, c+1, r)) ||
		isWater(at(grid, cols, rows, c-1, r))
	if !touchesWater {
		return 0
	}
	if tileHash(c, r)%2 == 0 {
		return game.PipoyaGIDWaterGrassA
	}
	return game.PipoyaGIDWaterGrassB
}

func grassDetailGID(grid [][]byte, cols, rows, c, r int) int {
	if grid[r][c] != game.TileGrass {
		return 0
	}
	if isPathLike(at(grid, cols, rows, c, r-1)) || isPathLike(at(grid, cols, rows, c, r+1)) ||
		isPathLike(at(grid, cols, rows, c+1, r)) || isPathLike(at(grid, cols, rows, c-1, r)) {
		return 0
	}
	h := tileHash(c, r)
	switch h % 47 {
	case 0, 1:
		return game.PipoyaFlowerGID(5 + (h % 7))
	case 2, 3, 4:
		return game.PipoyaLongGrassGID(5 + (h % 10))
	default:
		return 0
	}
}

func treeGID(cfg *game.BaseChipConfig, c, r int) int {
	tiles := cfg.TreeTiles
	if len(tiles) == 0 {
		return game.PipoyaGIDTree
	}
	local := tiles[tileHash(c, r)%len(tiles)]
	return cfg.GID(game.PipoyaFirstBaseChip, local)
}

func tileHash(c, r int) int {
	h := c*73856093 ^ r*19349663
	if h < 0 {
		h = -h
	}
	return h
}

func scaledGrid(oldGrid [][]byte) [][]byte {
	out := make([][]byte, newRows)
	for or := 0; or < oldRows; or++ {
		for dr := 0; dr < scale; dr++ {
			r := or*scale + dr
			if out[r] == nil {
				out[r] = make([]byte, newCols)
			}
			for oc := 0; oc < oldCols; oc++ {
				ch := oldGrid[or][oc]
				for dc := 0; dc < scale; dc++ {
					out[r][oc*scale+dc] = ch
				}
			}
		}
	}
	return out
}
