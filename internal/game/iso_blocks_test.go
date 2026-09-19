package game

import "testing"

func TestIsoBlockGIDsResolveToRock(t *testing.T) {
	for _, gid := range []int{
		IsoBlocksFirstTerrain,
		IsoBlockGID(0, 1),
		IsoBlockGID(3, 4),
		IsoBlockGID(IsoBlocksTypeCount-1, IsoBlocksLevels),
	} {
		ch, ok := CharFromPipoyaGroundGID(gid)
		if !ok || ch != TileRock {
			t.Fatalf("block gid %d resolved to %q want %q", gid, ch, TileRock)
		}
	}
}

func TestIsIsoBlockGIDRange(t *testing.T) {
	if IsIsoBlockGID(IsoBlocksFirstTerrain - 1) {
		t.Fatal("gid below block range reported as block")
	}
	if IsIsoBlockGID(IsoBlocksFirstTerrain + IsoBlocksTiles) {
		t.Fatal("gid above block range reported as block")
	}
	if !IsIsoBlockGID(IsoBlocksFirstTerrain + IsoBlocksTiles - 1) {
		t.Fatal("last block gid not in range")
	}
}
