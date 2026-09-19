package game

import "testing"

// (*Overworld).WalkableTile must agree with the package-level WalkableTile
// (overworld.go) and the client WALKABLE set: snow, sand, and ice are
// walkable ground, not rock.
func TestOverworldWalkableTileIncludesBiomeFills(t *testing.T) {
	ow := &Overworld{
		Cols:  8,
		Rows:  1,
		Cells: []string{string([]byte{TileGrass, TileSnow, TileSand, TileIce, TileTree, TileRock, TileWater, TileHaven})},
	}
	for c, want := range []bool{true, true, true, true, true, false, false, true} {
		if got := ow.WalkableTile(c, 0); got != want {
			t.Fatalf("WalkableTile(%d,0)=%v want %v (cell %q)", c, got, want, ow.Cells[0][c])
		}
	}
}
