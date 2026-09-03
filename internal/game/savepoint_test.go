package game

import "testing"

func TestSavePointsLoadWalkable(t *testing.T) {
	if len(SavePoints) == 0 {
		t.Fatal("expected save points from map config")
	}
	for _, sp := range SavePoints {
		if !WalkableTile(sp.Tile.C, sp.Tile.R) {
			t.Fatalf("%s tile (%d,%d) not walkable", sp.ID, sp.Tile.C, sp.Tile.R)
		}
	}
}

func TestSpawnPositionUsesSavePoint(t *testing.T) {
	if len(SavePoints) == 0 {
		t.Fatal("expected save points")
	}
	sp := SavePoints[0]
	x, y := SpawnPosition(sp.ID)
	c := TileCenter(sp.Tile)
	if x != c.X || y != c.Y {
		t.Fatalf("spawn position mismatch: got %f,%f want %f,%f", x, y, c.X, c.Y)
	}
}

func TestSpawnPositionDefault(t *testing.T) {
	x, y := SpawnPosition("")
	if x != DefaultSpawnX || y != DefaultSpawnY {
		t.Fatalf("default spawn expected %f,%f got %f,%f", DefaultSpawnX, DefaultSpawnY, x, y)
	}
}
