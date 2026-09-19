package game

// IsoBlocks — elevated block tiles (raised cubes, walls) painted on the
// ground layer, firstgid 7000. The web client renders each cell as a column
// (textured top diamond + shaded side faces, level = elevation in
// 16px steps); the simulation treats every block as solid rock.
//
// local = typeIdx*IsoBlocksLevels + (level-1) — mirrors
// wails/frontend/src/world/isoTiles.ts (ISO_BLOCKS, isoBlockGid).
const (
	IsoBlocksFirstTerrain = 7000
	IsoBlocksLevels       = 8
	IsoBlocksTypeCount    = 8
	IsoBlocksTiles        = IsoBlocksTypeCount * IsoBlocksLevels
)

// IsoBlockGID returns the map GID for a block type at an elevation level.
func IsoBlockGID(typeIdx, level int) int {
	return IsoBlocksFirstTerrain + typeIdx*IsoBlocksLevels + (level - 1)
}

// IsIsoBlockGID reports whether a ground-layer GID is an elevated block.
func IsIsoBlockGID(gid int) bool {
	return gid >= IsoBlocksFirstTerrain && gid < IsoBlocksFirstTerrain+IsoBlocksTiles
}
