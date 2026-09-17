package game

import (
	"path/filepath"
	"testing"
)

// loadMap is the shared test helper: load a sibling .map.json by id.
func loadMap(t *testing.T, id string) *Overworld {
	t.Helper()
	ow, err := LoadOverworldData(filepath.Join(filepath.Dir(defaultOverworldPath()), id+".map.json"))
	if err != nil {
		t.Fatal(err)
	}
	return ow
}

func TestZoneBordersVerdantFrost(t *testing.T) {
	northwatch := loadMap(t, "northwatch")
	frostmarch := loadMap(t, "frostmarch")

	toFrost, ok := borderTo(northwatch, "frostmarch")
	if !ok {
		t.Fatal("northwatch missing border to frostmarch")
	}
	if toFrost.Edge != EdgeNorth {
		t.Fatalf("northwatch→frostmarch should border north, got %s", toFrost.Edge)
	}
	toWatch, ok := borderTo(frostmarch, "northwatch")
	if !ok {
		t.Fatal("frostmarch missing border to northwatch")
	}
	if toWatch.Edge != EdgeSouth {
		t.Fatalf("frostmarch→northwatch should border south, got %s", toWatch.Edge)
	}
	// Crossing northwatch's north edge lands on frostmarch's south edge.
	assertBorderEntry(t, "frostmarch entry from northwatch", frostmarch, EdgeSouth)
	assertBorderEntry(t, "northwatch entry from frostmarch", northwatch, EdgeNorth)
}

func TestZoneBordersVerdantTide(t *testing.T) {
	deep := loadMap(t, "deepcanopy")
	wharf := loadMap(t, "westwharf")

	toWharf, ok := borderTo(deep, "westwharf")
	if !ok {
		t.Fatal("deepcanopy missing border to westwharf")
	}
	if toWharf.Edge != EdgeEast {
		t.Fatalf("deepcanopy→westwharf should border east, got %s", toWharf.Edge)
	}
	toDeep, ok := borderTo(wharf, "deepcanopy")
	if !ok {
		t.Fatal("westwharf missing border to deepcanopy")
	}
	if toDeep.Edge != EdgeWest {
		t.Fatalf("westwharf→deepcanopy should border west, got %s", toDeep.Edge)
	}
	assertBorderEntry(t, "westwharf entry", wharf, EdgeWest)
	assertBorderEntry(t, "deepcanopy entry", deep, EdgeEast)
}

func TestMandateFerryFrostTide(t *testing.T) {
	frost := loadMap(t, "frostkeep")
	tide := loadMap(t, "tidecourt")

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
	}

	have := map[string]bool{}
	link := func(a, b string) {
		if a > b {
			a, b = b, a
		}
		have[a+"|"+b] = true
	}

	for id, ow := range byID {
		// Borders: edge adjacency — must reciprocate on the opposite edge and
		// produce a walkable landing that does not ping-pong back.
		for _, b := range ow.Borders {
			if b.Map == "" {
				t.Fatalf("%s has %s border with empty map id", id, b.Edge)
			}
			if b.Map == id {
				t.Fatalf("%s has self-border on %s", id, b.Edge)
			}
			dst := mustLoad(t, byID, dir, b.Map)
			back, ok := borderTo(dst, id)
			if !ok {
				t.Fatalf("one-way border %s→%s (missing reverse)", id, b.Map)
			} else if back.Edge != b.Edge.Opposite() {
				t.Fatalf("border %s→%s: reverse sits on %s, want %s", id, b.Map, back.Edge, b.Edge.Opposite())
			}
			assertBorderEntry(t, id+"→"+b.Map, dst, b.Edge.Opposite())
			link(id, b.Map)
		}
		// Exits: interior portals — must reciprocate and land inland.
		for _, e := range ow.Exits {
			if e.DestMap == "" {
				t.Fatalf("%s has exit with empty destMap", id)
			}
			if e.DestMap == id {
				t.Fatalf("%s has self-transition exit (destMap=%s)", id, e.DestMap)
			}
			dst := mustLoad(t, byID, dir, e.DestMap)
			assertInlandSpawn(t, id+"→"+e.DestMap, dst, e)
			if _, ok := exitTo(dst, id); !ok {
				t.Fatalf("one-way link %s→%s (missing reverse)", id, e.DestMap)
			}
			link(id, e.DestMap)
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
	if _, ok := borderTo(byID["frostkeep"], "cairnwatch"); ok {
		t.Fatal("frostkeep should not border cairnwatch (link via windswept)")
	}
	if _, ok := borderTo(byID["frostkeep"], "stillstone"); ok {
		t.Fatal("frostkeep should not border stillstone (link via windswept)")
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

func borderTo(ow *Overworld, dest string) (MapBorder, bool) {
	for _, b := range ow.Borders {
		if b.Map == dest {
			return b, true
		}
	}
	return MapBorder{}, false
}

func exitTo(ow *Overworld, dest string) (MapExit, bool) {
	for _, e := range ow.Exits {
		if e.DestMap == dest {
			return e, true
		}
	}
	return MapExit{}, false
}

// assertBorderEntry checks that entering dest across entryEdge lands on a
// walkable point just inside that edge — not on the trigger band (which
// would ping-pong back across the border).
func assertBorderEntry(t *testing.T, name string, dest *Overworld, entryEdge BorderEdge) {
	t.Helper()
	for _, frac := range []float64{0.25, 0.5, 0.75} {
		x, y := dest.EntryPoint(entryEdge, frac)
		if !dest.BoundsWalkableAt(x, y, PlayerCollisionHalfW, PlayerCollisionHalfH) {
			t.Fatalf("%s entry (%0.f,%0.f) is not walkable on dest map", name, x, y)
		}
		if _, _, _, crossing := dest.BorderCrossingAt(x, y); crossing {
			t.Fatalf("%s entry lands inside the return band (would ping-pong)", name)
		}
	}
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
	if _, _, _, crossing := dest.BorderCrossingAt(from.DestX, from.DestY); crossing {
		t.Fatalf("%s lands inside a border band (would ping-pong)", name)
	}
}
