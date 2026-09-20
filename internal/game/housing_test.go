package game

import "testing"

// The house interior is a generated Overworld — collision runs through the
// standard SlideMovePlayer/CircleWalkableAt path used by every other map.
func TestHouseOverworldSlideStopsAtBounds(t *testing.T) {
	ow := NewHouseOverworld()
	sx, sy := HouseSpawnCenter()
	if !ow.CircleWalkableAt(sx, sy, PlayerCollisionRadius) {
		t.Fatal("spawn should be walkable")
	}
	col0, row0 := HouseWalkOrigin()
	// Push far past the west edge of the island.
	outsideX := float64(col0)*HouseTileSize - 40
	x, y := ow.SlideMovePlayer(sx, sy, outsideX, sy)
	if x == outsideX {
		t.Fatalf("expected slide to block west exit, got x=%v", x)
	}
	if !ow.CircleWalkableAt(x, y, PlayerCollisionRadius) {
		t.Fatalf("slid position not walkable: %v,%v", x, y)
	}
	// North edge
	outsideY := float64(row0)*HouseTileSize - 40
	x2, y2 := ow.SlideMovePlayer(sx, sy, sx, outsideY)
	if y2 == outsideY {
		t.Fatalf("expected slide to block north exit, got y=%v", y2)
	}
	if !ow.CircleWalkableAt(x2, y2, PlayerCollisionRadius) {
		t.Fatalf("slid position not walkable: %v,%v", x2, y2)
	}
}

func TestHouseOverworldMatchesWalkableFootprint(t *testing.T) {
	ow := NewHouseOverworld()
	col0, row0 := HouseWalkOrigin()
	ts := float64(HouseTileSize)
	// Island corners are walkable with the collision circle inset.
	for _, p := range [][2]float64{
		{float64(col0)*ts + PlayerCollisionRadius, float64(row0)*ts + PlayerCollisionRadius},
		{float64(col0+HouseWalkCols)*ts - PlayerCollisionRadius, float64(row0+HouseWalkRows)*ts - PlayerCollisionRadius},
	} {
		if !ow.CircleWalkableAt(p[0], p[1], PlayerCollisionRadius) {
			t.Fatalf("island corner %.0f,%.0f should be walkable", p[0], p[1])
		}
	}
	// Just outside the island is blocked.
	if ow.WalkableAt(float64(col0)*ts-1, float64(row0)*ts-1) {
		t.Fatal("tile outside the island should be blocked")
	}
}
