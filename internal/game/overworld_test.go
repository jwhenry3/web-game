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
		if len(p.Loop) < 2 {
			t.Fatalf("%s needs a loop", p.ID)
		}
		for i, wp := range p.Loop {
			if !WalkableTile(wp.C, wp.R) {
				t.Errorf("%s waypoint %d (%d,%d) is %c", p.ID, i, wp.C, wp.R, OverworldCell(wp.C, wp.R))
			}
			if !reg.Contains(wp.C, wp.R) {
				t.Errorf("%s waypoint %d outside %s", p.ID, i, p.Region)
			}
			next := p.Loop[(i+1)%len(p.Loop)]
			path := Pathfind(wp, next, reg)
			if len(path) == 0 {
				t.Errorf("%s no path %v -> %v", p.ID, wp, next)
			}
			for _, step := range path {
				tile := WorldToTile(step.X, step.Y)
				if !reg.Contains(tile.C, tile.R) || !WalkableTile(tile.C, tile.R) {
					t.Errorf("%s path left area at %v", p.ID, tile)
				}
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
