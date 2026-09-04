package game

// BaseChip local tile ids — SOLID fills from [Base]BaseChip_pipo.png.
// Note: tiles 48/52/112 in the Tiled "terrain" wang blocks are mostly transparent
// overlays (edges/corners), not ground fills. The Pipoya sample map uses local 0
// as solid grass (GID 577).
const (
	BaseChipLocalGrassFill  = 0   // solid grass (samplemap ground)
	BaseChipLocalDirtFill   = 5   // solid dirt/path (samplemap 582)
	BaseChipLocalStoneFill  = 256 // solid stone wall / rock
	BaseChipLocalCobbleFill = 116 // solid cobble / town plaza
	BaseChipLocalWaterChip  = 176 // sparse water chip (prefer Water_pipo fill)

	// Multi-tile trees in BaseChip (8 columns). Each tree is a 2×2 stamp:
	//   TL TR
	//   BL BR
	// Light green: 8,9 / 16,17 — Dark: 10,11 / 18,19 — Autumn: 12,13 / 20,21 — Dead: 14,15 / 22,23
	BaseChipLocalTreeLightTL = 8
	BaseChipLocalTreeDarkTL  = 10
	BaseChipLocalTreeFallTL  = 12
	BaseChipLocalTreeDeadTL  = 14
	// 1×1 bush / undergrowth props (row under the 2×2 tree bottoms).
	BaseChipLocalBushLight = 32
	BaseChipLocalBushDark  = 33
	BaseChipLocalBushFall  = 34
	BaseChipLocalBushDead  = 35

	// Legacy aliases used by older call sites / CharFrom.
	BaseChipLocalTreeCanopy = BaseChipLocalTreeLightTL
	BaseChipLocalBush       = BaseChipLocalBushDark

	// Legacy wang "center" ids kept for CharFromLocal / editor range checks only.
	BaseChipLocalGrassWang  = 48
	BaseChipLocalDirtWang   = 112
	BaseChipLocalCliffWang  = 52
	BaseChipLocalCobbleWang = 116
)

// Deprecated aliases — same as fills (call sites migrating off wang centers).
const (
	BaseChipLocalGrassCenter  = BaseChipLocalGrassFill
	BaseChipLocalDirtCenter   = BaseChipLocalDirtFill
	BaseChipLocalCliffCenter  = BaseChipLocalStoneFill
	BaseChipLocalCobbleCenter = BaseChipLocalCobbleFill
	BaseChipLocalWater        = BaseChipLocalWaterChip
)

// Pipoya BaseChip terrain GIDs (firstgid=577).
const (
	PipoyaGIDGrass = PipoyaFirstBaseChip + BaseChipLocalGrassFill
	PipoyaGIDPath  = PipoyaFirstBaseChip + BaseChipLocalDirtFill
	PipoyaGIDHaven = PipoyaFirstBaseChip + BaseChipLocalCobbleFill
	PipoyaGIDRock  = PipoyaFirstBaseChip + BaseChipLocalStoneFill
	PipoyaGIDRuins = PipoyaFirstBaseChip + BaseChipLocalDirtFill
	PipoyaGIDTree  = PipoyaFirstBaseChip + BaseChipLocalTreeLightTL
	PipoyaGIDBush  = PipoyaFirstBaseChip + BaseChipLocalBushDark

	PipoyaGIDWaterGrassA = PipoyaFirstBaseChip + 58
	PipoyaGIDWaterGrassB = PipoyaFirstBaseChip + 59

	PipoyaGIDWaterFill  = PipoyaFirstWaterAnim + 454
	PipoyaGIDWaterEdgeN = PipoyaFirstWaterAnim + 389
	PipoyaGIDWaterEdgeS = PipoyaFirstWaterAnim + 391
	PipoyaGIDWaterEdgeE = PipoyaFirstWaterAnim + 453
	PipoyaGIDWaterEdgeW = PipoyaFirstWaterAnim + 455

	// Prefer Water_pipo solid fill over sparse BaseChip chip 176.
	PipoyaGIDWater = PipoyaGIDWaterFill
)

// PipoyaTreeStamp is a 2×2 BaseChip local layout: TL, TR, BL, BR.
type PipoyaTreeStamp [4]int

// PipoyaTreeStamps lists the four sheet-adjacent tree variants (samplemap tree layer).
var PipoyaTreeStamps = []PipoyaTreeStamp{
	{8, 9, 16, 17},   // light green
	{10, 11, 18, 19}, // dark green
	{12, 13, 20, 21}, // autumn
	{14, 15, 22, 23}, // dead / winter
}

// PipoyaBushLocals are 1×1 undergrowth props matching tree colors.
var PipoyaBushLocals = []int{
	BaseChipLocalBushLight,
	BaseChipLocalBushDark,
	BaseChipLocalBushFall,
	BaseChipLocalBushDead,
}

// IsPipoyaTreeLocal reports whether a BaseChip local id is part of a multi-tile tree or bush.
func IsPipoyaTreeLocal(local int) bool {
	if local >= 8 && local <= 23 {
		return true
	}
	for _, b := range PipoyaBushLocals {
		if local == b {
			return true
		}
	}
	return false
}

// IsPipoyaTreeCanopyLocal is the top half of a 2×2 tree (walk-under / overhead).
func IsPipoyaTreeCanopyLocal(local int) bool {
	return local >= 8 && local <= 15
}

// IsPipoyaTreeTrunkLocal is the bottom half of a 2×2 tree (blocked).
func IsPipoyaTreeTrunkLocal(local int) bool {
	return local >= 16 && local <= 23
}

// TerrainGroundGID returns the BaseChip center GID for a legacy terrain char.
func TerrainGroundGID(ch byte) int {
	switch ch {
	case TileGrass:
		return PipoyaGIDGrass
	case TileTree:
		return PipoyaGIDTree
	case TilePath, TileRuins:
		return PipoyaGIDPath
	case TileHaven:
		return PipoyaGIDHaven
	case TileRock:
		return PipoyaGIDRock
	case TileWater:
		return PipoyaGIDWater
	default:
		return PipoyaGIDGrass
	}
}
