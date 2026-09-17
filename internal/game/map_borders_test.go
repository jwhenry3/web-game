package game

import (
	"path/filepath"
	"strings"
	"testing"
)

// syntheticOverworld builds a cols×rows all-grass overworld at 32px tiles.
func syntheticOverworld(cols, rows int) *Overworld {
	ow := &Overworld{Cols: cols, Rows: rows, TileSize: 32, WorldW: cols * 32, WorldH: rows * 32}
	row := strings.Repeat(string(TileGrass), cols)
	for r := 0; r < rows; r++ {
		ow.Cells = append(ow.Cells, row)
	}
	return ow
}

// syntheticConfig builds a walkable MapConfig for validation tests.
func syntheticConfig(cols, rows int) *MapConfig {
	return &MapConfig{
		Cols: cols, Rows: rows, TileSize: 32,
		Terrain: MapConfigTerrain{
			Collision: make([]int, cols*rows),
			Ground:    make([]int, cols*rows),
		},
	}
}

func TestBorderCrossingAtEdges(t *testing.T) {
	ow := syntheticOverworld(10, 8)
	ow.Borders = []MapBorder{
		{Edge: EdgeEast, Map: "east-map"},
		{Edge: EdgeNorth, Map: "north-map"},
	}
	// Middle of the map: no crossing.
	if _, _, _, ok := ow.BorderCrossingAt(160, 128); ok {
		t.Fatal("center tile should not cross")
	}
	// East edge band: cols 8-9 → x past 8*32.
	dest, edge, frac, ok := ow.BorderCrossingAt(9*32+16, 4*32+16)
	if !ok || edge != EdgeEast || dest != "east-map" {
		t.Fatalf("east crossing = %q %s ok=%v", dest, edge, ok)
	}
	wantT := float64(4*32+16) / float64(ow.WorldH)
	if frac < wantT-0.01 || frac > wantT+0.01 {
		t.Fatalf("edge fraction %f, want ~%f", frac, wantT)
	}
	// North edge: rows 0-1.
	dest, edge, _, ok = ow.BorderCrossingAt(5*32+16, 16)
	if !ok || edge != EdgeNorth || dest != "north-map" {
		t.Fatalf("north crossing = %q %s ok=%v", dest, edge, ok)
	}
	// South/west have no borders → no crossing even inside the band.
	if _, _, _, ok := ow.BorderCrossingAt(16, 4*32+16); ok {
		t.Fatal("west edge has no border — should not cross")
	}
	if _, _, _, ok := ow.BorderCrossingAt(5*32+16, 7*32+16); ok {
		t.Fatal("south edge has no border — should not cross")
	}
}

func TestBorderCrossingBlockedEdge(t *testing.T) {
	ow := syntheticOverworld(10, 8)
	ow.Borders = []MapBorder{{Edge: EdgeEast, Map: "east-map"}}
	// Wall off the east band except one gap at row 4.
	for r := 0; r < 8; r++ {
		row := []byte(ow.Cells[r])
		row[8], row[9] = TileRock, TileRock
		if r == 4 {
			row[8], row[9] = TileGrass, TileGrass
		}
		ow.Cells[r] = string(row)
	}
	if _, _, _, ok := ow.BorderCrossingAt(9*32+16, 2*32+16); ok {
		t.Fatal("blocked east band should not cross")
	}
	if _, _, _, ok := ow.BorderCrossingAt(9*32+16, 4*32+16); !ok {
		t.Fatal("walkable gap in east band should cross")
	}
}

func TestEntryPointMirrored(t *testing.T) {
	ow := syntheticOverworld(10, 8)
	// Entering the west edge at t=0.5 → lands just past the band, mid-edge.
	x, y := ow.EntryPoint(EdgeWest, 0.5)
	tile := ow.WorldToTile(x, y)
	if tile.C < BorderBandTiles {
		t.Fatalf("entry landed inside trigger band col %d", tile.C)
	}
	if tile.R != 3 && tile.R != 4 {
		t.Fatalf("mirrored row should be near mid-edge, got %d", tile.R)
	}
	if !ow.WalkableTile(tile.C, tile.R) {
		t.Fatal("entry tile not walkable")
	}
	// North edge at t=0 → along index 0.
	x, y = ow.EntryPoint(EdgeNorth, 0)
	tile = ow.WorldToTile(x, y)
	if tile.C != 0 || tile.R < BorderBandTiles {
		t.Fatalf("north t=0 entry = tile (%d,%d)", tile.C, tile.R)
	}
}

func TestEntryPointNudgesToWalkable(t *testing.T) {
	ow := syntheticOverworld(10, 8)
	// Wall the west band at every landing depth for rows 2-5 so t=0.5 must
	// slide along the edge to find an open row.
	for r := 2; r <= 5; r++ {
		row := []byte(ow.Cells[r])
		for c := 0; c <= BorderBandTiles+3; c++ {
			row[c] = TileRock
		}
		ow.Cells[r] = string(row)
	}
	x, y := ow.EntryPoint(EdgeWest, 0.5)
	tile := ow.WorldToTile(x, y)
	if !ow.WalkableTile(tile.C, tile.R) {
		t.Fatalf("entry (%d,%d) not walkable", tile.C, tile.R)
	}
	if tile.R >= 2 && tile.R <= 5 {
		t.Fatalf("entry should have slid off the blocked rows, got row %d", tile.R)
	}
}

func TestValidateMapBorders(t *testing.T) {
	mk := func(borders map[string]string) *MapConfig {
		c := syntheticConfig(8, 8)
		c.Borders = borders
		return c
	}

	// Symmetric pair validates clean.
	rep := ValidateMapBorders(map[string]*MapConfig{
		"a": mk(map[string]string{"east": "b"}),
		"b": mk(map[string]string{"west": "a"}),
	})
	if len(rep.Errors) != 0 {
		t.Fatalf("symmetric borders should validate: %v", rep.Errors)
	}

	// Missing reciprocal.
	rep = ValidateMapBorders(map[string]*MapConfig{
		"a": mk(map[string]string{"east": "b"}),
		"b": mk(nil),
	})
	if len(rep.Errors) == 0 || !strings.Contains(rep.Errors[0], "one-way") {
		t.Fatalf("expected one-way error, got %v", rep.Errors)
	}

	// Wrong opposite edge (b borders back on south instead of west).
	rep = ValidateMapBorders(map[string]*MapConfig{
		"a": mk(map[string]string{"east": "b"}),
		"b": mk(map[string]string{"south": "a"}),
	})
	if len(rep.Errors) == 0 {
		t.Fatal("expected opposite-edge mismatch error")
	}

	// Unknown destination.
	rep = ValidateMapBorders(map[string]*MapConfig{
		"a": mk(map[string]string{"east": "nowhere"}),
	})
	if len(rep.Errors) == 0 || !strings.Contains(rep.Errors[0], "unknown map") {
		t.Fatalf("expected unknown-map error, got %v", rep.Errors)
	}

	// Self border.
	rep = ValidateMapBorders(map[string]*MapConfig{
		"a": mk(map[string]string{"east": "a"}),
	})
	if len(rep.Errors) == 0 || !strings.Contains(rep.Errors[0], "itself") {
		t.Fatalf("expected self-border error, got %v", rep.Errors)
	}
}

func TestValidateMapBordersWarnsOnDeadAndOpenEdges(t *testing.T) {
	blocked := syntheticConfig(8, 8)
	// East edge fully walled.
	for r := 0; r < 8; r++ {
		for c := 6; c < 8; c++ {
			blocked.Terrain.Collision[r*8+c] = 1
		}
	}
	blocked.Borders = map[string]string{"east": "b"}
	other := syntheticConfig(8, 8)
	other.Borders = map[string]string{"west": "a"}

	rep := ValidateMapBorders(map[string]*MapConfig{"a": blocked, "b": other})
	if len(rep.Errors) != 0 {
		t.Fatalf("symmetric borders should have no errors: %v", rep.Errors)
	}
	foundDead, foundOpen := false, false
	for _, w := range rep.Warnings {
		if strings.Contains(w, "dead border") {
			foundDead = true
		}
		if strings.Contains(w, "no border declared") {
			foundOpen = true
		}
	}
	if !foundDead {
		t.Fatalf("expected dead-border warning, got %v", rep.Warnings)
	}
	if !foundOpen {
		t.Fatalf("expected open-edge warning, got %v", rep.Warnings)
	}
}

// TestRealMapBorderGraph validates the shipped map configs end-to-end.
func TestRealMapBorderGraph(t *testing.T) {
	dir := filepath.Dir(defaultOverworldPath())
	entries, err := filepath.Glob(filepath.Join(dir, "*.map.json"))
	if err != nil {
		t.Fatal(err)
	}
	cfgs := map[string]*MapConfig{}
	for _, p := range entries {
		cfg, err := LoadMapConfig(p)
		if err != nil {
			t.Fatalf("load %s: %v", p, err)
		}
		cfgs[MapIDFromPath(p)] = cfg
	}
	rep := ValidateMapBorders(cfgs)
	for _, w := range rep.Warnings {
		t.Logf("warning: %s", w)
	}
	if len(rep.Errors) != 0 {
		t.Fatalf("real map border graph has errors:\n  %s", strings.Join(rep.Errors, "\n  "))
	}
}
