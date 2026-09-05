package game

import (
	"path/filepath"
	"testing"
)

func TestZoneBordersVerdantFrost(t *testing.T) {
	northwatch, err := LoadOverworldData(filepath.Join(filepath.Dir(defaultOverworldPath()), "northwatch.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	frostmarch, err := LoadOverworldData(filepath.Join(filepath.Dir(defaultOverworldPath()), "frostmarch.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(northwatch.Exits) == 0 || len(frostmarch.Exits) == 0 {
		t.Fatal("border maps need zone exits")
	}
	toFrost, ok := exitTo(northwatch, "frostmarch")
	if !ok {
		t.Fatal("northwatch missing exit to frostmarch")
	}
	toWatch, ok := exitTo(frostmarch, "northwatch")
	if !ok {
		t.Fatal("frostmarch missing exit to northwatch")
	}
	assertInlandSpawn(t, "frostmarch spawn from northwatch", frostmarch, toFrost)
	assertInlandSpawn(t, "northwatch spawn from frostmarch", northwatch, toWatch)
	if toFrost.MinR > 4 {
		t.Fatalf("northwatch→frostmarch exit should sit on north edge, minR=%d", toFrost.MinR)
	}
	if toWatch.MaxR < frostmarch.Rows-5 {
		t.Fatalf("frostmarch→northwatch exit should sit on south edge, maxR=%d", toWatch.MaxR)
	}
}

func TestZoneBordersVerdantTide(t *testing.T) {
	deep, err := LoadOverworldData(filepath.Join(filepath.Dir(defaultOverworldPath()), "deepcanopy.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	wharf, err := LoadOverworldData(filepath.Join(filepath.Dir(defaultOverworldPath()), "westwharf.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	toWharf, ok := exitTo(deep, "westwharf")
	if !ok {
		t.Fatal("deepcanopy missing exit to westwharf")
	}
	toDeep, ok := exitTo(wharf, "deepcanopy")
	if !ok {
		t.Fatal("westwharf missing exit to deepcanopy")
	}
	assertInlandSpawn(t, "westwharf spawn", wharf, toWharf)
	assertInlandSpawn(t, "deepcanopy spawn", deep, toDeep)
}

func TestMandateFerryFrostTide(t *testing.T) {
	frost, err := LoadOverworldData(filepath.Join(filepath.Dir(defaultOverworldPath()), "frostkeep.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	tide, err := LoadOverworldData(filepath.Join(filepath.Dir(defaultOverworldPath()), "tidecourt.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	toTide, ok := exitTo(frost, "tidecourt")
	if !ok {
		t.Fatal("frostkeep missing Mandate ferry to tidecourt")
	}
	toFrost, ok := exitTo(tide, "frostkeep")
	if !ok {
		t.Fatal("tidecourt missing Mandate ferry to frostkeep")
	}
	assertInlandSpawn(t, "tidecourt ferry landing", tide, toTide)
	assertInlandSpawn(t, "frostkeep ferry landing", frost, toFrost)
	// Ferry docks are inland, not edge strips.
	if toTide.MinC <= 2 || toTide.MaxC >= frost.Cols-3 {
		t.Fatal("frostkeep ferry should be an inland dock, not a west/east edge")
	}
}

func TestFacingFromDeltaX(t *testing.T) {
	// Kept as a smoke alias around FacingYawFromDelta for zone-exit suite.
	if FacingYawFromDelta(4, 0, FacingYawWest) != FacingYawEast {
		t.Fatal("positive dx faces east")
	}
	if FacingYawFromDelta(-4, 0, FacingYawEast) != FacingYawWest {
		t.Fatal("negative dx faces west")
	}
	if FacingYawFromDelta(0, 0, FacingYawWest) != FacingYawWest {
		t.Fatal("no dx keeps west")
	}
}

// Expected contiguous + ferry adjacency (must stay in sync with cmd/genworld links + GDD §3.4).
var expectedZoneLinks = [][2]string{
	{"greenwood", "timberroad"},
	{"greenwood", "willowford"},
	{"greenwood", "deepcanopy"},
	{"timberroad", "sanctuarygrove"},
	{"timberroad", "northwatch"},
	{"willowford", "sanctuarygrove"},
	{"northwatch", "frostmarch"},
	{"frostkeep", "frostmarch"},
	{"frostkeep", "windswept"},
	{"windswept", "cairnwatch"},
	{"windswept", "stillstone"},
	{"windswept", "icehollow"},
	{"deepcanopy", "westwharf"},
	{"westwharf", "brinecoast"},
	{"brinecoast", "tidecourt"},
	{"brinecoast", "cliffhaven"},
	{"tidecourt", "dunesreach"},
	{"tidecourt", "redsash"},
	{"frostkeep", "tidecourt"},
}

func TestZoneExitGraph(t *testing.T) {
	dir := filepath.Dir(defaultOverworldPath())
	byID := map[string]*Overworld{}
	entries, err := filepath.Glob(filepath.Join(dir, "*.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range entries {
		ow, err := LoadOverworldData(path)
		if err != nil {
			t.Fatalf("load %s: %v", path, err)
		}
		id := MapIDFromPath(path)
		byID[id] = ow
		for _, e := range ow.Exits {
			if e.DestMap == "" {
				t.Fatalf("%s has exit with empty destMap", id)
			}
			if e.DestMap == id {
				t.Fatalf("%s has self-transition exit (destMap=%s)", id, e.DestMap)
			}
			assertInlandSpawn(t, id+"→"+e.DestMap, mustLoad(t, byID, dir, e.DestMap), e)
		}
	}

	have := map[string]bool{}
	for id, ow := range byID {
		for _, e := range ow.Exits {
			a, b := id, e.DestMap
			if a > b {
				a, b = b, a
			}
			have[a+"|"+b] = true
			if _, ok := exitTo(mustLoad(t, byID, dir, e.DestMap), id); !ok {
				t.Fatalf("one-way link %s→%s (missing reverse)", id, e.DestMap)
			}
		}
	}
	for _, pair := range expectedZoneLinks {
		a, b := pair[0], pair[1]
		if a > b {
			a, b = b, a
		}
		if !have[a+"|"+b] {
			t.Fatalf("missing bidirectional link %s↔%s", pair[0], pair[1])
		}
	}
	// Towns flank Windswept, not Frostkeep.
	if _, ok := exitTo(byID["frostkeep"], "cairnwatch"); ok {
		t.Fatal("frostkeep should not exit to cairnwatch (link via windswept)")
	}
	if _, ok := exitTo(byID["frostkeep"], "stillstone"); ok {
		t.Fatal("frostkeep should not exit to stillstone (link via windswept)")
	}
}

func mustLoad(t *testing.T, cache map[string]*Overworld, dir, id string) *Overworld {
	t.Helper()
	if ow, ok := cache[id]; ok {
		return ow
	}
	ow, err := LoadOverworldData(filepath.Join(dir, id+".map.json"))
	if err != nil {
		t.Fatalf("load %s: %v", id, err)
	}
	cache[id] = ow
	return ow
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
		tile := dest.WorldToTile(from.DestX, from.DestY)
		t.Fatalf("%s (%0.f,%0.f) tile (%d,%d) is not walkable on dest map", name, from.DestX, from.DestY, tile.C, tile.R)
	}
	if _, onExit := dest.ExitAt(from.DestX, from.DestY); onExit {
		t.Fatalf("%s lands on the return portal (would ping-pong)", name)
	}
}
