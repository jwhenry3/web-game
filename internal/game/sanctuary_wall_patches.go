package game

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const (
	sanctuaryWallCollisionGID = 1
	sanctuaryWallGroundGID     = PipoyaGIDRock
	sanctuaryGateGroundGID     = PipoyaGIDPath
	sanctuaryGateWidth         = 2
)

type wallSide int

const (
	wallNorth wallSide = iota
	wallSouth
	wallWest
	wallEast
)

// GenerateSanctuaryWallOverride diffs base map terrain against sanctuary perimeter walls.
func GenerateSanctuaryWallOverride(mapPath string) (*MapTileOverrides, error) {
	if IsMapConfigPath(mapPath) {
		return generateSanctuaryWallOverrideFromConfig(mapPath)
	}
	return generateSanctuaryWallOverrideFromTiled(mapPath)
}

func generateSanctuaryWallOverrideFromConfig(path string) (*MapTileOverrides, error) {
	cfg, err := LoadMapConfig(path)
	if err != nil {
		return nil, err
	}
	regions, exits, err := parseRegionsAndExitsFromConfig(cfg)
	if err != nil {
		return nil, err
	}
	base := map[string][]int{
		"ground":    append([]int(nil), cfg.Terrain.Ground...),
		"collision": append([]int(nil), cfg.Terrain.Collision...),
	}
	return diffSanctuaryWalls(base, cfg.Cols, cfg.Rows, regions, exits, MapIDFromPath(path))
}

func generateSanctuaryWallOverrideFromTiled(tmjPath string) (*MapTileOverrides, error) {
	data, err := os.ReadFile(tmjPath)
	if err != nil {
		return nil, err
	}
	var raw tiledMapFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse tiled map %s: %w", tmjPath, err)
	}
	collision, ground, err := parseTiledTileLayers(raw, raw.Width, raw.Height)
	if err != nil {
		return nil, err
	}
	regions, exits, err := parseRegionsAndExits(raw, raw.TileWidth)
	if err != nil {
		return nil, err
	}
	base := map[string][]int{"ground": ground, "collision": collision}
	return diffSanctuaryWalls(base, raw.Width, raw.Height, regions, exits, MapIDFromPath(tmjPath))
}

func parseRegionsAndExitsFromConfig(cfg *MapConfig) ([]Region, []MapExit, error) {
	exits := make([]MapExit, 0, len(cfg.Exits))
	for _, e := range cfg.Exits {
		dest := normalizeDestMap(e.DestMap)
		if dest == "" {
			return nil, nil, fmt.Errorf("exit missing destMap")
		}
		exits = append(exits, MapExit{
			DestMap: dest,
			MinC:    e.Tiles[0], MinR: e.Tiles[1],
			MaxC: e.Tiles[2], MaxR: e.Tiles[3],
			DestX: e.Dest[0], DestY: e.Dest[1],
		})
	}
	return cfg.Regions, exits, nil
}

func diffSanctuaryWalls(
	base map[string][]int,
	cols, rows int,
	regions []Region,
	exits []MapExit,
	mapID string,
) (*MapTileOverrides, error) {
	current := CloneLayerMap(base)
	if err := applySanctuaryWallsToLayers(current, cols, rows, regions, exits); err != nil {
		return nil, err
	}
	diff := DiffMapOverride(mapID, base, current)
	if len(diff.Layers) == 0 {
		return nil, nil
	}
	return diff, nil
}

// MergeMapOverrides combines layer patches; later patches win on index conflicts.
func MergeMapOverrides(base, extra *MapTileOverrides) *MapTileOverrides {
	if base == nil && extra == nil {
		return nil
	}
	out := &MapTileOverrides{Layers: map[string]map[string]int{}}
	if base != nil {
		out.MapID = base.MapID
		for layer, patches := range base.Layers {
			out.Layers[layer] = map[string]int{}
			for k, v := range patches {
				out.Layers[layer][k] = v
			}
		}
	}
	if extra == nil {
		return out
	}
	if out.MapID == "" {
		out.MapID = extra.MapID
	}
	for layer, patches := range extra.Layers {
		if out.Layers[layer] == nil {
			out.Layers[layer] = map[string]int{}
		}
		for k, v := range patches {
			out.Layers[layer][k] = v
		}
	}
	return out
}

func parseRegionsAndExits(raw tiledMapFile, tileSize int) ([]Region, []MapExit, error) {
	tw := float64(tileSize)
	th := float64(tileSize)
	var regions []Region
	var exits []MapExit

	for _, layer := range raw.Layers {
		if layer.Type != "objectgroup" {
			continue
		}
		for _, obj := range layer.Objects {
			typ := strings.ToLower(obj.Type)
			if typ == "" {
				typ = strings.ToLower(obj.Name)
			}
			switch typ {
			case "region", "sanctuary":
				reg, err := regionFromObject(OverrideObject{
					ID: obj.ID, Name: obj.Name, Type: obj.Type,
					X: obj.X, Y: obj.Y, Width: obj.Width, Height: obj.Height,
					Point: obj.Point, Polygon: obj.Polygon, Properties: obj.Properties,
				}, int(tw))
				if err != nil {
					return nil, nil, err
				}
				regions = append(regions, reg)
			case "exit":
				dest := tiledPropString(obj.Properties, "destMap")
				if dest == "" {
					return nil, nil, fmt.Errorf("exit missing destMap")
				}
				minC := int(obj.X / tw)
				minR := int((obj.Y - obj.Height) / th)
				maxC := int((obj.X+obj.Width)/tw) - 1
				maxR := int(obj.Y/th) - 1
				exits = append(exits, MapExit{
					DestMap: normalizeDestMap(dest),
					MinC:    minC, MinR: minR,
					MaxC:    maxC, MaxR: maxR,
					DestX:   tiledPropFloat(obj.Properties, "destX"),
					DestY:   tiledPropFloat(obj.Properties, "destY"),
				})
			}
		}
	}
	return regions, exits, nil
}

func applySanctuaryWallsToLayers(
	layers map[string][]int,
	cols, rows int,
	regions []Region,
	exits []MapExit,
) error {
	ground := layers["ground"]
	collision := layers["collision"]
	if len(ground) == 0 || len(collision) == 0 {
		return fmt.Errorf("missing ground/collision layers")
	}
	cells := buildCellsFromLayers(collision, ground, cols, rows)
	ow := &Overworld{
		Cols:       cols,
		Rows:       rows,
		Ground:     ground,
		Collision:  collision,
		Cells:      cells,
		Regions:    regions,
		Exits:      exits,
		TileSize:   defaultMapTileSize,
	}
	for _, reg := range regions {
		if !reg.Sanctuary {
			continue
		}
		stampSanctuaryWallTiles(ow, reg)
	}
	return nil
}

func stampSanctuaryWallTiles(ow *Overworld, reg Region) {
	entranceSet := map[Tile]bool{}
	for _, t := range sanctuaryEntranceTiles(ow, reg) {
		entranceSet[t] = true
	}
	for _, t := range sanctuaryWallRing(reg) {
		if !ow.inBounds(t.C, t.R) {
			continue
		}
		if ow.tileInSanctuaryInterior(t.C, t.R) {
			continue
		}
		if ow.tileOnMapExit(t.C, t.R) {
			entranceSet[t] = true
		}
		if entranceSet[t] {
			setLayerTile(ow, t.C, t.R, sanctuaryGateGroundGID, 0, TilePath)
			continue
		}
		setLayerTile(ow, t.C, t.R, sanctuaryWallGroundGID, sanctuaryWallCollisionGID, TileRock)
	}
}

func sanctuaryEntranceTiles(ow *Overworld, reg Region) []Tile {
	h := hashString(reg.ID)
	want := 1 + int(h%2)

	type candidate struct {
		score int
		order int
		tiles []Tile
	}
	candidates := make([]candidate, 0, 4)
	for s := wallSide(0); s < 4; s++ {
		tiles, ok := entranceGapForSide(ow, reg, s)
		if !ok || len(tiles) == 0 {
			continue
		}
		candidates = append(candidates, candidate{
			score: scoreEntranceApproach(ow, reg, s, tiles),
			order: int(s),
			tiles: tiles,
		})
	}
	if len(candidates) == 0 {
		return nil
	}
	for i := 0; i < len(candidates); i++ {
		for j := i + 1; j < len(candidates); j++ {
			a, b := candidates[i], candidates[j]
			if b.score > a.score || (b.score == a.score && ((h+uint32(b.order))%997) < ((h+uint32(a.order))%997)) {
				candidates[i], candidates[j] = candidates[j], candidates[i]
			}
		}
	}
	if want > len(candidates) {
		want = len(candidates)
	}
	candidates = candidates[:want]

	out := make([]Tile, 0, want*sanctuaryGateWidth)
	seen := map[Tile]bool{}
	for _, c := range candidates {
		for _, t := range c.tiles {
			if !seen[t] {
				seen[t] = true
				out = append(out, t)
			}
		}
	}
	return out
}

func entranceGapForSide(ow *Overworld, reg Region, side wallSide) ([]Tile, bool) {
	midC := (reg.MinC + reg.MaxC) / 2
	midR := (reg.MinR + reg.MaxR) / 2
	half := sanctuaryGateWidth / 2

	var tiles []Tile
	switch side {
	case wallNorth:
		r := reg.MinR - 1
		if r < 0 {
			return nil, false
		}
		for d := -half; d < sanctuaryGateWidth-half; d++ {
			tiles = append(tiles, Tile{C: midC + d, R: r})
		}
	case wallSouth:
		r := reg.MaxR + 1
		if r >= ow.Rows {
			return nil, false
		}
		for d := -half; d < sanctuaryGateWidth-half; d++ {
			tiles = append(tiles, Tile{C: midC + d, R: r})
		}
	case wallWest:
		c := reg.MinC - 1
		if c < 0 {
			return nil, false
		}
		for d := -half; d < sanctuaryGateWidth-half; d++ {
			tiles = append(tiles, Tile{C: c, R: midR + d})
		}
	case wallEast:
		c := reg.MaxC + 1
		if c >= ow.Cols {
			return nil, false
		}
		for d := -half; d < sanctuaryGateWidth-half; d++ {
			tiles = append(tiles, Tile{C: c, R: midR + d})
		}
	}
	for _, t := range tiles {
		if !ow.inBounds(t.C, t.R) {
			return nil, false
		}
	}
	return tiles, true
}

func scoreEntranceApproach(ow *Overworld, reg Region, side wallSide, gap []Tile) int {
	score := 0
	for _, t := range gap {
		for _, a := range approachTiles(reg, side, t) {
			if !ow.inBounds(a.C, a.R) {
				continue
			}
			if ow.tileInSanctuaryInterior(a.C, a.R) {
				continue
			}
			if ow.WalkableTile(a.C, a.R) {
				score++
			}
		}
	}
	return score
}

func approachTiles(reg Region, side wallSide, gap Tile) []Tile {
	switch side {
	case wallNorth:
		return []Tile{{gap.C - 1, gap.R - 1}, {gap.C, gap.R - 1}, {gap.C + 1, gap.R - 1}}
	case wallSouth:
		return []Tile{{gap.C - 1, gap.R + 1}, {gap.C, gap.R + 1}, {gap.C + 1, gap.R + 1}}
	case wallWest:
		return []Tile{{gap.C - 1, gap.R - 1}, {gap.C - 1, gap.R}, {gap.C - 1, gap.R + 1}}
	case wallEast:
		return []Tile{{gap.C + 1, gap.R - 1}, {gap.C + 1, gap.R}, {gap.C + 1, gap.R + 1}}
	default:
		return nil
	}
}

func sanctuaryWallRing(reg Region) []Tile {
	minC, minR := reg.MinC-1, reg.MinR-1
	maxC, maxR := reg.MaxC+1, reg.MaxR+1
	seen := map[Tile]bool{}
	var out []Tile
	add := func(c, r int) {
		t := Tile{C: c, R: r}
		if seen[t] {
			return
		}
		seen[t] = true
		out = append(out, t)
	}
	for c := minC; c <= maxC; c++ {
		add(c, minR)
		add(c, maxR)
	}
	for r := minR + 1; r < maxR; r++ {
		add(minC, r)
		add(maxC, r)
	}
	return out
}

func setLayerTile(ow *Overworld, c, r int, groundGID, collisionGID int, cell byte) {
	if !ow.inBounds(c, r) {
		return
	}
	i := r*ow.Cols + c
	ow.Ground[i] = groundGID
	ow.Collision[i] = collisionGID
	row := []byte(ow.Cells[r])
	row[c] = cell
	ow.Cells[r] = string(row)
}

func (ow *Overworld) inBounds(c, r int) bool {
	return c >= 0 && r >= 0 && c < ow.Cols && r < ow.Rows
}

func (ow *Overworld) tileInSanctuaryInterior(c, r int) bool {
	for _, reg := range ow.Regions {
		if reg.Sanctuary && reg.Contains(c, r) {
			return true
		}
	}
	return false
}

func (ow *Overworld) tileOnMapExit(c, r int) bool {
	for _, e := range ow.Exits {
		if c >= e.MinC && c <= e.MaxC && r >= e.MinR && r <= e.MaxR {
			return true
		}
	}
	return false
}

func hashString(s string) uint32 {
	const prime32 = 16777619
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= prime32
	}
	return h
}
