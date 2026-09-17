package game

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadWorldDefinitionUsesExplicitSimulationRegions(t *testing.T) {
	// Gameplay regions are independent from simulation regions.
	path := saveWorldDefinitionMapConfig(t, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1, Sanctuary: true},
		{ID: "east", MinC: 2, MinR: 0, MaxC: 3, MaxR: 1},
	}, []Region{
		{ID: "sim-west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1},
		{ID: "sim-east", MinC: 2, MinR: 0, MaxC: 3, MaxR: 1},
	})

	world, err := LoadWorldDefinition(path)
	if err != nil {
		t.Fatal(err)
	}
	if world.Path != path || world.Cols != 4 || world.Rows != 2 {
		t.Fatalf("loaded overworld = path %q, size %dx%d", world.Path, world.Cols, world.Rows)
	}
	if len(world.Regions) != 2 {
		t.Fatalf("gameplay region count %d want 2", len(world.Regions))
	}
	if len(world.SimulationRegions) != 2 {
		t.Fatalf("simulation region count %d want 2", len(world.SimulationRegions))
	}
	if got, ok := world.SimulationRegionByID("sim-west"); !ok || got.ID != "sim-west" {
		t.Fatalf("SimulationRegionByID(sim-west) = %#v, %v", got, ok)
	}
	if got, ok := world.SimulationRegionAt(0, 0); !ok || got.ID != "sim-west" {
		t.Fatalf("SimulationRegionAt(0, 0) = %#v, %v", got, ok)
	}
	if got, ok := world.SimulationRegionAt(3, 1); !ok || got.ID != "sim-east" {
		t.Fatalf("SimulationRegionAt(3, 1) = %#v, %v", got, ok)
	}
}

func TestLoadWorldDefinitionLegacyFallbackCoversWorld(t *testing.T) {
	path := saveWorldDefinitionMapConfig(t, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1, Sanctuary: true},
		{ID: "east", MinC: 2, MinR: 0, MaxC: 3, MaxR: 1},
	}, nil)

	world, err := LoadWorldDefinition(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(world.SimulationRegions) != 1 {
		t.Fatalf("simulation region count %d want 1", len(world.SimulationRegions))
	}
	reg := world.SimulationRegions[0]
	if reg.ID != "world" {
		t.Fatalf("fallback region id %q want \"world\"", reg.ID)
	}
	if reg.MinC != 0 || reg.MinR != 0 || reg.MaxC != 3 || reg.MaxR != 1 {
		t.Fatalf("fallback bounds (%d,%d)-(%d,%d) want (0,0)-(3,1)", reg.MinC, reg.MinR, reg.MaxC, reg.MaxR)
	}
	if got, ok := world.SimulationRegionAt(0, 0); !ok || got.ID != "world" {
		t.Fatalf("SimulationRegionAt(0, 0) = %#v, %v", got, ok)
	}
	if got, ok := world.SimulationRegionAt(3, 1); !ok || got.ID != "world" {
		t.Fatalf("SimulationRegionAt(3, 1) = %#v, %v", got, ok)
	}
}

func TestLoadWorldDefinitionAllowsOverlappingGameplayRegions(t *testing.T) {
	path := saveWorldDefinitionMapConfig(t, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 2, MaxR: 1, Sanctuary: true},
		{ID: "east", MinC: 1, MinR: 0, MaxC: 3, MaxR: 1},
	}, nil)

	world, err := LoadWorldDefinition(path)
	if err != nil {
		t.Fatalf("expected overlapping gameplay regions to be allowed: %v", err)
	}
	if len(world.Regions) != 2 {
		t.Fatalf("gameplay region count %d want 2", len(world.Regions))
	}
}

func TestLoadWorldDefinitionRejectsDuplicateSimulationRegionIDs(t *testing.T) {
	path := saveWorldDefinitionMapConfig(t, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1, Sanctuary: true},
	}, []Region{
		{ID: "duplicate", MinC: 0, MinR: 0, MaxC: 0, MaxR: 0},
		{ID: "duplicate", MinC: 2, MinR: 0, MaxC: 2, MaxR: 0},
	})

	_, err := LoadWorldDefinition(path)
	if err == nil || !strings.Contains(err.Error(), "duplicate simulation region id") {
		t.Fatalf("expected duplicate simulation region id error, got %v", err)
	}
}

func saveWorldDefinitionMapConfig(t *testing.T, regions, simulationRegions []Region) string {
	t.Helper()
	path := t.TempDir() + "/world.map.json"
	cfg := &MapConfig{
		TileSize: 16,
		Cols:     4,
		Rows:     2,
		Terrain: MapConfigTerrain{
			Ground:    make([]int, 8),
			Collision: make([]int, 8),
		},
		Regions:           regions,
		SimulationRegions: simulationRegions,
		SavePoints: []savePointFile{
			{ID: "start", Name: "Start", Tile: [2]int{0, 0}},
		},
	}
	if err := SaveMapConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestWorldDefinitionRegionLookup(t *testing.T) {
	ow := &Overworld{Path: "test.world.json", Cols: 6, Rows: 4, TileSize: 32}
	world, err := NewWorldDefinition(ow, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 3},
		{ID: "east", MinC: 4, MinR: 0, MaxC: 5, MaxR: 3},
	})
	if err != nil {
		t.Fatal(err)
	}

	if world.Overworld != ow || world.TileSizePx() != 32 {
		t.Fatal("WorldDefinition must preserve the embedded Overworld API")
	}
	if got, ok := world.SimulationRegionByID("east"); !ok || got.ID != "east" {
		t.Fatalf("SimulationRegionByID(east) = %#v, %v", got, ok)
	}
	if got, ok := world.SimulationRegionAt(1, 2); !ok || got.ID != "west" {
		t.Fatalf("SimulationRegionAt(1, 2) = %#v, %v", got, ok)
	}
	if _, ok := world.SimulationRegionAt(2, 2); ok {
		t.Fatal("uncovered tile unexpectedly has an owner")
	}
	if _, ok := world.SimulationRegionByID("missing"); ok {
		t.Fatal("unknown ID unexpectedly found")
	}
}

func TestWorldDefinitionRejectsDuplicateRegionIDs(t *testing.T) {
	_, err := NewWorldDefinition(&Overworld{Path: "test.world.json"}, []Region{
		{ID: "same", MinC: 0, MinR: 0, MaxC: 0, MaxR: 0},
		{ID: "same", MinC: 2, MinR: 0, MaxC: 2, MaxR: 0},
	})
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("expected duplicate ID error, got %v", err)
	}
}

func TestWorldDefinitionRejectsTileOverlapButAllowsTouching(t *testing.T) {
	ow := &Overworld{Path: "test.world.json"}
	if _, err := NewWorldDefinition(ow, []Region{
		{ID: "left", MinC: 0, MinR: 0, MaxC: 2, MaxR: 2},
		{ID: "right", MinC: 2, MinR: 0, MaxC: 4, MaxR: 2},
	}); err == nil || !strings.Contains(err.Error(), "overlap") {
		t.Fatalf("expected overlap error, got %v", err)
	}

	if _, err := NewWorldDefinition(ow, []Region{
		{ID: "left", MinC: 0, MinR: 0, MaxC: 1, MaxR: 2},
		{ID: "right", MinC: 2, MinR: 0, MaxC: 4, MaxR: 2},
	}); err != nil {
		t.Fatalf("adjacent ownership regions should be valid: %v", err)
	}
}

func TestWorldDefinitionPolygonLookupAndOverlap(t *testing.T) {
	triangle := Region{ID: "triangle", Polygon: []Vec2{{X: 0, Y: 0}, {X: 3, Y: 0}, {X: 0, Y: 3}}}
	world, err := NewWorldDefinition(&Overworld{Path: "test.world.json"}, []Region{triangle})
	if err != nil {
		t.Fatal(err)
	}
	if got, ok := world.SimulationRegionAt(0, 0); !ok || got.ID != "triangle" {
		t.Fatalf("polygon lookup = %#v, %v", got, ok)
	}
	if _, ok := world.SimulationRegionAt(2, 2); ok {
		t.Fatal("tile outside polygon unexpectedly owned")
	}

	_, err = NewWorldDefinition(&Overworld{Path: "test.world.json"}, []Region{
		triangle,
		{ID: "overlap", MinC: 0, MinR: 0, MaxC: 0, MaxR: 0},
	})
	if err == nil {
		t.Fatal("expected polygon/rectangle tile overlap error")
	}
}

func TestNewWorldDefinitionRejectsNilOverworld(t *testing.T) {
	_, err := NewWorldDefinition(nil, nil)
	if err == nil || !strings.Contains(err.Error(), "overworld required") {
		t.Fatalf("expected nil overworld error, got %v", err)
	}
}

func TestNewWorldDefinitionRejectsEmptyPath(t *testing.T) {
	_, err := NewWorldDefinition(&Overworld{Cols: 4, Rows: 2}, []Region{
		{ID: "only", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1},
	})
	if err == nil || !strings.Contains(err.Error(), "overworld path required") {
		t.Fatalf("expected empty path error, got %v", err)
	}
}

func TestLoadWorldDefinitionFromManifest(t *testing.T) {
	manifestPath, mapPath := saveWorldManifestFixtures(t, "world.map.json", []Region{
		{ID: "sim-west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1},
		{ID: "sim-east", MinC: 2, MinR: 0, MaxC: 3, MaxR: 1},
	})

	world, err := LoadWorldDefinition(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if world.Path != mapPath {
		t.Fatalf("overworld path = %q want %q", world.Path, mapPath)
	}
	if len(world.SimulationRegions) != 2 {
		t.Fatalf("simulation region count %d want 2", len(world.SimulationRegions))
	}
	if got, ok := world.SimulationRegionByID("sim-west"); !ok || got.ID != "sim-west" {
		t.Fatalf("SimulationRegionByID(sim-west) = %#v, %v", got, ok)
	}
	if got, ok := world.SimulationRegionAt(3, 1); !ok || got.ID != "sim-east" {
		t.Fatalf("SimulationRegionAt(3, 1) = %#v, %v", got, ok)
	}
	if len(world.Regions) != 2 {
		t.Fatalf("gameplay region count %d want 2", len(world.Regions))
	}
}

func TestLoadWorldDefinitionManifestRequiresTerrain(t *testing.T) {
	path := saveWorldManifest(t, "", nil)
	_, err := LoadWorldDefinition(path)
	if err == nil || !strings.Contains(err.Error(), "terrain path required") {
		t.Fatalf("expected terrain required error, got %v", err)
	}
}

func TestLoadWorldDefinitionManifestRequiresSimulationRegions(t *testing.T) {
	path := saveWorldManifest(t, "world.map.json", nil)
	_, err := LoadWorldDefinition(path)
	if err == nil || !strings.Contains(err.Error(), "simulation_regions required") {
		t.Fatalf("expected simulation_regions required error, got %v", err)
	}
}

func TestLoadWorldDefinitionManifestRelativeTerrainPath(t *testing.T) {
	// Terrain is resolved relative to the manifest directory.
	dir := t.TempDir()
	mapPath := filepath.Join(dir, "terrain.map.json")
	writeWorldDefinitionMapConfig(t, mapPath, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1, Sanctuary: true},
		{ID: "east", MinC: 2, MinR: 0, MaxC: 3, MaxR: 1},
	}, nil)

	manifestPath := filepath.Join(dir, "world.world.json")
	writeWorldManifest(t, manifestPath, "terrain.map.json", []Region{
		{ID: "sim-west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1},
	})

	world, err := LoadWorldDefinition(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if world.Path != mapPath {
		t.Fatalf("overworld path = %q want %q", world.Path, mapPath)
	}
}

func TestLoadWorldDefinitionRepoRootTerrainPath(t *testing.T) {
	// Terrain path starting with data/ resolves against the repo root discovered
	// by walking up from the manifest to find go.mod.
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module test\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mapPath := filepath.Join(root, "data", "maps", "world.map.json")
	writeWorldDefinitionMapConfig(t, mapPath, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1, Sanctuary: true},
		{ID: "east", MinC: 2, MinR: 0, MaxC: 3, MaxR: 1},
	}, nil)

	manifestDir := filepath.Join(root, "data", "world")
	manifestPath := filepath.Join(manifestDir, "clara_mundi.world.json")
	writeWorldManifest(t, manifestPath, "data/maps/world.map.json", []Region{
		{ID: "sim-west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1},
	})

	world, err := LoadWorldDefinition(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if world.Path != mapPath {
		t.Fatalf("overworld path = %q want %q", world.Path, mapPath)
	}
}

func saveWorldManifestFixtures(t *testing.T, terrainRel string, simulationRegions []Region) (manifestPath, mapPath string) {
	t.Helper()
	dir := t.TempDir()
	mapPath = filepath.Join(dir, "world.map.json")
	writeWorldDefinitionMapConfig(t, mapPath, []Region{
		{ID: "west", MinC: 0, MinR: 0, MaxC: 1, MaxR: 1, Sanctuary: true},
		{ID: "east", MinC: 2, MinR: 0, MaxC: 3, MaxR: 1},
	}, nil)
	manifestPath = filepath.Join(dir, "world.world.json")
	writeWorldManifest(t, manifestPath, terrainRel, simulationRegions)
	return manifestPath, mapPath
}

func saveWorldManifest(t *testing.T, terrainRel string, simulationRegions []Region) string {
	t.Helper()
	manifestPath, _ := saveWorldManifestFixtures(t, terrainRel, simulationRegions)
	return manifestPath
}

func writeWorldManifest(t *testing.T, path, terrain string, simulationRegions []Region) {
	t.Helper()
	cfg := &WorldConfig{
		Terrain:           terrain,
		SimulationRegions: simulationRegions,
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func writeWorldDefinitionMapConfig(t *testing.T, path string, regions, simulationRegions []Region) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := &MapConfig{
		TileSize: 16,
		Cols:     4,
		Rows:     2,
		Terrain: MapConfigTerrain{
			Ground:    make([]int, 8),
			Collision: make([]int, 8),
		},
		Regions:           regions,
		SimulationRegions: simulationRegions,
		SavePoints: []savePointFile{
			{ID: "start", Name: "Start", Tile: [2]int{0, 0}},
		},
	}
	if err := SaveMapConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
}
