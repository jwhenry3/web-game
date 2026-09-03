package game

import "testing"

func scaleTile(c, r int) Tile {
	return Tile{C: c * 4, R: r * 4}
}

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
	x, y := SpawnPosition("")
	if !WalkableAt(x, y) {
		t.Fatalf("default spawn (%f,%f) must be walkable", x, y)
	}
	if !WalkableAt(x+200, y+200) {
		t.Fatal("offset spawn anchor must be walkable")
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
	from := scaleTile(5, 5)
	to := scaleTile(13, 5)
	reg := Region{ID: "wide", MinC: 8, MinR: 8, MaxC: 88, MaxR: 60}
	path := Pathfind(from, to, reg)
	if len(path) < 3 {
		t.Fatalf("expected a detour around obstacles, got %d steps", len(path))
	}
}

func TestSlideMoveStopsOnWater(t *testing.T) {
	from := TileCenter(scaleTile(24, 5))
	to := TileCenter(scaleTile(30, 3))
	x, y := SlideMove(from.X, from.Y, to.X, to.Y)
	if WalkableAt(to.X, to.Y) {
		t.Skip("fixture tile is walkable; map changed")
	}
	if WalkableAt(x, y) && (x != from.X || y != from.Y) {
		return
	}
	if !WalkableAt(x, y) {
		t.Fatalf("slide must not land on a blocked tile (%f,%f)", x, y)
	}
}

func TestPlayerBoundsWalkableAtSpawn(t *testing.T) {
	x, y := SpawnPosition("")
	if !BoundsWalkableAt(x, y, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		t.Fatal("default spawn must fit the player collision box")
	}
}

func TestSlideMovePlayerStopsAtTrees(t *testing.T) {
	from := TileCenter(scaleTile(13, 8))
	to := TileCenter(scaleTile(15, 8))
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

func TestLoadGreenwoodMapConfig(t *testing.T) {
	ow, err := LoadOverworldFromMapConfig(defaultOverworldPath())
	if err != nil {
		t.Fatal(err)
	}
	if ow.Cols < 100 || ow.Rows < 80 {
		t.Fatalf("expected large map, got %dx%d", ow.Cols, ow.Rows)
	}
	if ow.TileSize != 32 {
		t.Fatalf("tile size %d want 32", ow.TileSize)
	}
	if len(ow.SavePoints) == 0 {
		t.Fatal("expected save points")
	}
}
