package game

import "testing"

func TestSlideMoveHousePlayerStopsAtBounds(t *testing.T) {
	sx, sy := HouseSpawnCenter()
	if !HouseBoundsWalkableAt(sx, sy, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Fatal("spawn should be walkable")
	}
	col0, row0 := HouseWalkOrigin()
	// Push far past the west edge of the island.
	outsideX := float64(col0)*HouseTileSize - 40
	x, y := SlideMoveHousePlayer(sx, sy, outsideX, sy)
	if x == outsideX {
		t.Fatalf("expected slide to block west exit, got x=%v", x)
	}
	if !HouseBoundsWalkableAt(x, y, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Fatalf("slid position not walkable: %v,%v", x, y)
	}
	// North edge
	outsideY := float64(row0)*HouseTileSize - 40
	x2, y2 := SlideMoveHousePlayer(sx, sy, sx, outsideY)
	if y2 == outsideY {
		t.Fatalf("expected slide to block north exit, got y=%v", y2)
	}
	if !HouseBoundsWalkableAt(x2, y2, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Fatalf("slid position not walkable: %v,%v", x2, y2)
	}
}

func TestClampHousePosMatchesCollisionInset(t *testing.T) {
	col0, row0 := HouseWalkOrigin()
	ts := float64(HouseTileSize)
	x, y := ClampHousePos(float64(col0)*ts, float64(row0)*ts)
	if !HouseBoundsWalkableAt(x, y, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Fatalf("clamped corner not walkable: %v,%v", x, y)
	}
}
