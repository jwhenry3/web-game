package game

import (
	"sync"
)

// Pipoya tileset firstgid layout (matches assets samplemap.tmx + Dirt overlay).
const (
	PipoyaFirstWaterFall  = 1
	PipoyaFirstBaseChip   = 577
	PipoyaFirstGrassAnim  = 1641
	PipoyaFirstWaterAnim  = 2169
	PipoyaFirstFlower     = 5241
	PipoyaFirstLongGrass  = 5289 // Dirt_pipo in sample grass-layer GIDs
	PipoyaFirstDirt       = 5289
)

// Pipoya visual layer names (bottom → top). collision/objects are game-specific.
var PipoyaVisualLayers = []string{
	"ground",
	"grass",
	"water",
	"water_grass",
	"tree",
}

// PipoyaBaseChipGID converts a local BaseChip tile index to a map GID.
func PipoyaBaseChipGID(local int) int { return PipoyaFirstBaseChip + local }

// PipoyaGrassAnimGID converts a local animated-grass tile index to a map GID.
func PipoyaGrassAnimGID(local int) int { return PipoyaFirstGrassAnim + local }

// PipoyaWaterAnimGID converts a local animated-water tile index to a map GID.
func PipoyaWaterAnimGID(local int) int { return PipoyaFirstWaterAnim + local }

// PipoyaFlowerGID converts a local flower tile index to a map GID.
func PipoyaFlowerGID(local int) int { return PipoyaFirstFlower + local }

// PipoyaLongGrassGID converts a local long-grass autotile index to a map GID.
func PipoyaLongGrassGID(local int) int { return PipoyaFirstLongGrass + local }

var (
	baseChipOnce sync.Once
	baseChipCfg  *BaseChipConfig
)

func baseChipConfig() *BaseChipConfig {
	baseChipOnce.Do(func() {
		cfg, err := LoadBaseChipConfig(DefaultBaseChipPath())
		if err != nil {
			baseChipCfg = fallbackBaseChipConfig()
			return
		}
		baseChipCfg = cfg
	})
	return baseChipCfg
}

func fallbackBaseChipConfig() *BaseChipConfig {
	return &BaseChipConfig{
		Name:           "BaseChip_pipo",
		Image:          "BaseChip_pipo.png",
		TileWidth:      32,
		TileHeight:     32,
		TileCount:      1064,
		Columns:        8,
		ImageWidth:     256,
		ImageHeight:    4256,
		TerrainCenters: []int{BaseChipLocalGrassFill, BaseChipLocalDirtFill, BaseChipLocalStoneFill, BaseChipLocalCobbleFill},
		WaterTiles:     map[int]bool{BaseChipLocalWaterChip: true},
		CollidesTiles: map[int]bool{
			BaseChipLocalStoneFill: true,
			BaseChipLocalWaterChip: true,
			// Trunks + bushes only — canopy tops (8–15) are walk-under.
			16: true, 17: true, 18: true, 19: true, 20: true, 21: true, 22: true, 23: true,
			32: true, 33: true, 34: true, 35: true,
		},
		TreeTiles: []int{8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 32, 33, 34, 35},
	}
}

// CharFromPipoyaGroundGID resolves a ground-layer GID to a terrain char.
func CharFromPipoyaGroundGID(gid int) (byte, bool) {
	return baseChipConfig().CharFromGroundGID(PipoyaFirstBaseChip, gid)
}
