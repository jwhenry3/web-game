package game

import (
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// BaseChip terrain indices (match terraintypes order in maps/base_chip.tsx).
const (
	BaseChipTerrainGrass   = 0
	BaseChipTerrainDirt    = 1
	BaseChipTerrainCliff    = 2
	BaseChipTerrainCobble  = 3
)

// BaseChipConfig is parsed from maps/base_chip.tsx — terrain centers, tile props, dimensions.
type BaseChipConfig struct {
	Name        string
	Image       string
	TileWidth   int
	TileHeight  int
	TileCount   int
	Columns     int
	ImageWidth  int
	ImageHeight int

	TerrainCenters []int // terrain index -> center tile id
	WaterTiles     map[int]bool
	CollidesTiles  map[int]bool

	TreeTiles []int // decorative tree variants (local tile ids)
}

// DefaultBaseChipPath is the repo tileset definition used by genmaps and tests.
func DefaultBaseChipPath() string {
	return filepath.Join("maps", "base_chip.tsx")
}

// LoadBaseChipConfig reads a Tiled .tsx tileset file.
func LoadBaseChipConfig(path string) (*BaseChipConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var raw tsxTilesetXML
	if err := xml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	cfg := &BaseChipConfig{
		Name:          raw.Name,
		Image:         raw.Image.Source,
		TileWidth:     raw.TileWidth,
		TileHeight:    raw.TileHeight,
		TileCount:     raw.TileCount,
		Columns:       raw.Columns,
		ImageWidth:    raw.Image.Width,
		ImageHeight:   raw.Image.Height,
		WaterTiles:    map[int]bool{},
		CollidesTiles: map[int]bool{},
		TreeTiles:     []int{8, 9, 10, 17, 33, 34},
	}
	for _, t := range raw.TerrainTypes.Terrains {
		cfg.TerrainCenters = append(cfg.TerrainCenters, t.Tile)
	}
	for _, tile := range raw.Tiles {
		id := tile.ID
		for _, p := range tile.Properties.Props {
			switch p.Name {
			case "water":
				if propBool(p) {
					cfg.WaterTiles[id] = true
				}
			case "collides":
				if propBool(p) {
					cfg.CollidesTiles[id] = true
				}
			}
		}
	}
	if len(cfg.TerrainCenters) == 0 {
		return nil, fmt.Errorf("%s: no terraintypes defined", path)
	}
	return cfg, nil
}

func propBool(p tsxPropXML) bool {
	v := strings.ToLower(strings.TrimSpace(p.Value))
	return v == "true" || v == "1"
}

// TerrainForChar maps legacy terrain chars to a BaseChip terrain index or -1 for water tile.
func (c *BaseChipConfig) TerrainForChar(ch byte) int {
	switch ch {
	case TileGrass, TileTree:
		return BaseChipTerrainGrass
	case TilePath, TileRuins:
		return BaseChipTerrainDirt
	case TileHaven:
		return BaseChipTerrainCobble
	case TileRock:
		return BaseChipTerrainCliff
	case TileWater:
		return -1
	default:
		return BaseChipTerrainGrass
	}
}

// CenterTile returns the autotile block origin for a terrain index.
func (c *BaseChipConfig) CenterTile(terrain int) int {
	if terrain < 0 || terrain >= len(c.TerrainCenters) {
		return c.TerrainCenters[0]
	}
	return c.TerrainCenters[terrain]
}

// WaterTileID returns the local tile id used for water (default 176).
func (c *BaseChipConfig) WaterTileID() int {
	for id := range c.WaterTiles {
		return id
	}
	return 176
}

// GID converts a local tile id to a map GID with the given firstgid.
func (c *BaseChipConfig) GID(firstGID, local int) int {
	return firstGID + local
}

// AutotileLocal picks a tile within an 8-tile blob block for matching cardinal neighbors.
func (c *BaseChipConfig) AutotileLocal(terrain int, sameN, sameE, sameS, sameW bool) int {
	if terrain == BaseChipTerrainCliff {
		return c.CenterTile(terrain)
	}
	mask := 0
	if sameN {
		mask |= 1
	}
	if sameE {
		mask |= 2
	}
	if sameS {
		mask |= 4
	}
	if sameW {
		mask |= 8
	}
	tiles := baseChipAutotileTiles(terrain, c)
	if len(tiles) == 0 {
		return c.CenterTile(terrain)
	}
	idx := autotile8Offset(mask)
	if idx >= len(tiles) {
		idx = 0
	}
	return tiles[idx]
}

// baseChipAutotileTiles lists the 8 blob tiles per terrain (from maps/base_chip.tsx).
// Offsets must not cross into other terrain ids (e.g. cliff tile 52 sits inside the grass row).
func baseChipAutotileTiles(terrain int, cfg *BaseChipConfig) []int {
	switch terrain {
	case BaseChipTerrainGrass:
		return []int{48, 49, 50, 51, 56, 57, 58, 59}
	case BaseChipTerrainDirt:
		return []int{112, 113, 114, 115, 120, 121, 122, 123}
	case BaseChipTerrainCobble:
		return []int{116, 117, 118, 119, 124, 125, 126, 127}
	default:
		if terrain >= 0 && terrain < len(cfg.TerrainCenters) {
			return []int{cfg.TerrainCenters[terrain]}
		}
		return nil
	}
}

// CharFromLocalTile resolves a BaseChip local tile id to a terrain char.
func (c *BaseChipConfig) CharFromLocalTile(local int) (byte, bool) {
	if c.WaterTiles[local] {
		return TileWater, true
	}
	if c.CollidesTiles[local] {
		return TileRock, true
	}
	if containsInt(baseChipAutotileTiles(BaseChipTerrainGrass, c), local) {
		return TileGrass, true
	}
	if containsInt(baseChipAutotileTiles(BaseChipTerrainDirt, c), local) {
		return TilePath, true
	}
	if containsInt(baseChipAutotileTiles(BaseChipTerrainCobble, c), local) {
		return TileHaven, true
	}
	if local == c.CenterTile(BaseChipTerrainCliff) {
		return TileRock, true
	}
	return TileGrass, true
}

func containsInt(list []int, v int) bool {
	for _, n := range list {
		if n == v {
			return true
		}
	}
	return false
}

// CharFromGroundGID resolves a ground-layer GID using BaseChip firstgid.
func (c *BaseChipConfig) CharFromGroundGID(firstGID, gid int) (byte, bool) {
	if gid < firstGID || gid >= firstGID+c.TileCount {
		if gid >= PipoyaFirstGrassAnim && gid < PipoyaFirstGrassAnim+528 {
			return TileGrass, true
		}
		return 0, false
	}
	ch, ok := c.CharFromLocalTile(gid - firstGID)
	return ch, ok
}

// autotile8Offset maps 4-bit cardinal-same mask to offset within an 8-tile blob.
func autotile8Offset(mask int) int {
	switch mask {
	case 0xF:
		return 0
	case 0xE:
		return 1
	case 0xD:
		return 2
	case 0xB:
		return 3
	case 0x7:
		return 4
	case 0xA:
		return 5
	case 0x5:
		return 6
	case 0x9:
		return 7
	default:
		return 0
	}
}

type tsxTilesetXML struct {
	XMLName      xml.Name          `xml:"tileset"`
	Name         string            `xml:"name,attr"`
	TileWidth    int               `xml:"tilewidth,attr"`
	TileHeight   int               `xml:"tileheight,attr"`
	TileCount    int               `xml:"tilecount,attr"`
	Columns      int               `xml:"columns,attr"`
	Image        tsxImageXML       `xml:"image"`
	TerrainTypes tsxTerrainsXML    `xml:"terraintypes"`
	Tiles        []tsxTileXML      `xml:"tile"`
}

type tsxImageXML struct {
	Source string `xml:"source,attr"`
	Width  int    `xml:"width,attr"`
	Height int    `xml:"height,attr"`
}

type tsxTerrainsXML struct {
	Terrains []tsxTerrainXML `xml:"terrain"`
}

type tsxTerrainXML struct {
	Name string `xml:"name,attr"`
	Tile int    `xml:"tile,attr"`
}

type tsxTileXML struct {
	ID         int            `xml:"id,attr"`
	Terrain    string         `xml:"terrain,attr"`
	Properties tsxPropsXML    `xml:"properties"`
}

type tsxPropsXML struct {
	Props []tsxPropXML `xml:"property"`
}

type tsxPropXML struct {
	Name  string `xml:"name,attr"`
	Type  string `xml:"type,attr"`
	Value string `xml:"value,attr"`
}

// ParseTerrainAttr parses Tiled terrain="N,E,S,W" on a tile element.
func ParseTerrainAttr(attr string) (n, e, s, w int) {
	parts := strings.Split(attr, ",")
	if len(parts) != 4 {
		return 0, 0, 0, 0
	}
	n, _ = strconv.Atoi(strings.TrimSpace(parts[0]))
	e, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
	s, _ = strconv.Atoi(strings.TrimSpace(parts[2]))
	w, _ = strconv.Atoi(strings.TrimSpace(parts[3]))
	return n, e, s, w
}
