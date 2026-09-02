package game

import (
	"path/filepath"
	"testing"
)

func TestZoneBordersBetweenGreenwoodAndNorth(t *testing.T) {
	greenwood, err := LoadOverworldData(defaultOverworldPath())
	if err != nil {
		t.Fatal(err)
	}
	northPath := filepath.Join(filepath.Dir(defaultOverworldPath()), "overworld.north.json")
	north, err := LoadOverworldData(northPath)
	if err != nil {
		t.Fatal(err)
	}

	if greenwood.Path == north.Path {
		t.Fatal("maps must load from different overworld configs")
	}
	if len(greenwood.Exits) == 0 || len(north.Exits) == 0 {
		t.Fatal("both maps need at least one zone exit")
	}

	toNorth, ok := exitTo(greenwood, "north")
	if !ok {
		t.Fatal("greenwood missing exit to north")
	}
	toGreenwood, ok := exitTo(north, "greenwood")
	if !ok {
		t.Fatal("north missing exit to greenwood")
	}

	assertInlandSpawn(t, "north spawn from greenwood", north, toNorth)
	assertInlandSpawn(t, "greenwood spawn from north", greenwood, toGreenwood)

	// Zone strips sit on the connecting east/west road, not in the rock border.
	if toNorth.MinC < OverworldCols-4 {
		t.Fatalf("greenwood exit should be on the east edge, minC=%d", toNorth.MinC)
	}
	if toGreenwood.MaxC > 3 {
		t.Fatalf("north exit should be on the west edge, maxC=%d", toGreenwood.MaxC)
	}
	if FacingFromExit(toNorth) != FacingRight {
		t.Fatal("crossing Greenwood east should keep facing right")
	}
	if FacingFromExit(toGreenwood) != FacingLeft {
		t.Fatal("crossing Northern Wastes west should keep facing left")
	}
}

func TestFacingFromDeltaX(t *testing.T) {
	if FacingFromDeltaX(4, FacingLeft) != FacingRight {
		t.Fatal("positive dx faces right")
	}
	if FacingFromDeltaX(-4, FacingRight) != FacingLeft {
		t.Fatal("negative dx faces left")
	}
	if FacingFromDeltaX(0, FacingLeft) != FacingLeft {
		t.Fatal("no dx keeps left")
	}
}

func exitTo(ow *Overworld, dest string) (MapExit, bool) {
	for _, e := range ow.Exits {
		if e.DestMap == dest {
			return e, true
		}
	}
	return MapExit{}, false
}

func assertInlandSpawn(t *testing.T, name string, dest *Overworld, from MapExit) {
	t.Helper()
	if !dest.BoundsWalkableAt(from.DestX, from.DestY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		tile := WorldToTile(from.DestX, from.DestY)
		t.Fatalf("%s (%0.f,%0.f) tile (%d,%d) is not walkable on dest map", name, from.DestX, from.DestY, tile.C, tile.R)
	}
	if _, onExit := dest.ExitAt(from.DestX, from.DestY); onExit {
		t.Fatalf("%s lands on the return portal (would ping-pong)", name)
	}
}
