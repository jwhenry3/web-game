package game

// BaseChip local tile ids (from maps/base_chip.tsx terraintypes + properties).
const (
	BaseChipLocalGrassCenter  = 48
	BaseChipLocalDirtCenter   = 112
	BaseChipLocalCliffCenter  = 52
	BaseChipLocalCobbleCenter = 116
	BaseChipLocalWater        = 176
)

// Pipoya BaseChip terrain GIDs (firstgid=577).
const (
	PipoyaGIDGrass = PipoyaFirstBaseChip + BaseChipLocalGrassCenter
	PipoyaGIDPath  = PipoyaFirstBaseChip + BaseChipLocalDirtCenter
	PipoyaGIDHaven = PipoyaFirstBaseChip + BaseChipLocalCobbleCenter
	PipoyaGIDRock  = PipoyaFirstBaseChip + BaseChipLocalCliffCenter
	PipoyaGIDRuins = PipoyaFirstBaseChip + BaseChipLocalDirtCenter
	PipoyaGIDWater = PipoyaFirstBaseChip + BaseChipLocalWater
	PipoyaGIDTree  = PipoyaFirstBaseChip + 8 // tree layer variants

	PipoyaGIDWaterGrassA = PipoyaFirstBaseChip + 58
	PipoyaGIDWaterGrassB = PipoyaFirstBaseChip + 59

	PipoyaGIDWaterFill  = PipoyaFirstWaterAnim + 454
	PipoyaGIDWaterEdgeN = PipoyaFirstWaterAnim + 389
	PipoyaGIDWaterEdgeS = PipoyaFirstWaterAnim + 391
	PipoyaGIDWaterEdgeE = PipoyaFirstWaterAnim + 453
	PipoyaGIDWaterEdgeW = PipoyaFirstWaterAnim + 455
)

// TerrainGroundGID returns the BaseChip center GID for a legacy terrain char.
func TerrainGroundGID(ch byte) int {
	switch ch {
	case TileGrass, TileTree:
		return PipoyaGIDGrass
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
