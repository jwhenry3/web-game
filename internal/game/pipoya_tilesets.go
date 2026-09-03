package game

import (
	"sync"
)

// Pipoya tileset firstgid layout (base_chip.tsx at 577 + overlay tilesets).
const (
	PipoyaFirstWaterFall  = 1
	PipoyaFirstBaseChip   = 577
	PipoyaFirstGrassAnim  = 1641
	PipoyaFirstWaterAnim  = 2169
	PipoyaFirstFlower     = 5241
	PipoyaFirstLongGrass  = 5289
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
		Image:          "base_chip.png",
		TileWidth:      32,
		TileHeight:     32,
		TileCount:      1064,
		Columns:        8,
		ImageWidth:     256,
		ImageHeight:    4256,
		TerrainCenters: []int{48, 112, 52, 116},
		WaterTiles:     map[int]bool{176: true},
		CollidesTiles:  map[int]bool{52: true, 176: true},
		TreeTiles:      []int{8, 9, 10, 17, 33, 34},
	}
}

// CharFromPipoyaGroundGID resolves a ground-layer GID to a terrain char.
func CharFromPipoyaGroundGID(gid int) (byte, bool) {
	return baseChipConfig().CharFromGroundGID(PipoyaFirstBaseChip, gid)
}
