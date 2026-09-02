package game

import "testing"

func TestOverworldRowsAreWellFormed(t *testing.T) {
	if len(OverworldCells) != OverworldRows {
		t.Fatalf("rows %d want %d", len(OverworldCells), OverworldRows)
	}
	for i, row := range OverworldCells {
		if len(row) != OverworldCols {
			t.Fatalf("row %d len %d want %d", i, len(row), OverworldCols)
		}
	}
}

func TestSpawnAndTestAnchorsAreWalkable(t *testing.T) {
	if !WalkableAt(200, 200) {
		t.Fatal("haven spawn 200,200 must be walkable")
	}
	if !WalkableAt(400, 400) {
		t.Fatal("400,400 used by collision tests must be walkable")
	}
	if !WalkableAt(500, 500) {
		t.Fatal("500,500 used by collision tests must be walkable")
	}
}

func TestPatrolsStayInRegionAndPathfind(t *testing.T) {
	for _, p := range NPCPatrols {
		reg, ok := RegionByID(p.Region)
		if !ok {
			t.Fatalf("unknown region %s", p.Region)
		}
		if !WalkableTile(p.Home.C, p.Home.R) {
			t.Errorf("%s home (%d,%d) is %c", p.ID, p.Home.C, p.Home.R, OverworldCell(p.Home.C, p.Home.R))
		}
		if !reg.Contains(p.Home.C, p.Home.R) {
			t.Errorf("%s home outside %s", p.ID, p.Region)
		}
		var far Tile
		found := false
		for _, dest := range WalkableTilesInRegion(reg) {
			if tileManhattan(p.Home, dest) >= wanderMinDistance() {
				far = dest
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("%s region has no distant walkable tile", p.ID)
		}
		path := Pathfind(p.Home, far, reg)
		if len(path) == 0 {
			t.Errorf("%s no path %v -> %v", p.ID, p.Home, far)
		}
		for _, step := range path {
			tile := WorldToTile(step.X, step.Y)
			if !reg.Contains(tile.C, tile.R) || !WalkableTile(tile.C, tile.R) {
				t.Errorf("%s path left area at %v", p.ID, tile)
			}
		}
	}
}

func TestPathfindGoesAroundRocks(t *testing.T) {
	// Haven interior to a grass tile east of the haven wall, within greenwood.
	from := Tile{C: 5, R: 5}
	to := Tile{C: 13, R: 5}
	reg := Region{ID: "wide", MinC: 2, MinR: 2, MaxC: 21, MaxR: 15}
	path := Pathfind(from, to, reg)
	if len(path) < 3 {
		t.Fatalf("expected a detour around the trees, got %d steps", len(path))
	}
}

func TestSlideMoveStopsOnWater(t *testing.T) {
	// Tile (30,3) is water on the map (~).
	fromX, fromY := TileCenter(Tile{C: 24, R: 5}).X, TileCenter(Tile{C: 24, R: 5}).Y
	toX, toY := TileCenter(Tile{C: 30, R: 3}).X, TileCenter(Tile{C: 30, R: 3}).Y
	x, y := SlideMove(fromX, fromY, toX, toY)
	if WalkableAt(toX, toY) {
		t.Skip("fixture tile is walkable; map changed")
	}
	if WalkableAt(x, y) && (x != fromX || y != fromY) {
		// slide is fine if it stayed walkable
		return
	}
	if !WalkableAt(x, y) {
		t.Fatalf("slide must not land on a blocked tile (%f,%f)", x, y)
	}
}

func TestPlayerBoundsWalkableAtSpawn(t *testing.T) {
	if !BoundsWalkableAt(200, 200, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Fatal("haven spawn must fit the player collision box")
	}
}

func TestSlideMovePlayerStopsAtTrees(t *testing.T) {
	// Tree at (15,8); approach from the west along the path.
	from := TileCenter(Tile{C: 13, R: 8})
	to := TileCenter(Tile{C: 15, R: 8})
	x, y := SlideMovePlayer(from.X, from.Y, to.X, to.Y)
	if BoundsWalkableAt(to.X, to.Y, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Skip("destination is open; map changed")
	}
	if !BoundsWalkableAt(x, y, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Fatalf("player slide must stay walkable, landed at (%f,%f)", x, y)
	}
	if x == to.X && y == to.Y {
		t.Fatal("player should not enter the tree tile")
	}
}
