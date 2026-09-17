package cluster

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"clara-mundi/internal/game"
)

func TestMapSpecIsEnabledDefault(t *testing.T) {
	m := MapSpec{ID: "a", Name: "A", Config: "x"}
	if !m.IsEnabled() {
		t.Fatal("nil enabled should default true")
	}
	m.Enabled = BoolPtr(false)
	if m.IsEnabled() {
		t.Fatal("expected disabled")
	}
}

func TestCanTravelTo(t *testing.T) {
	c := Config{Maps: []MapSpec{
		{ID: "a", Name: "A", Config: "x", Default: true, Enabled: BoolPtr(true)},
		{ID: "b", Name: "B", Config: "x", Enabled: BoolPtr(false)},
	}}
	if !c.CanTravelTo("a") {
		t.Fatal("enabled map should allow travel")
	}
	if c.CanTravelTo("b") {
		t.Fatal("disabled map should block travel")
	}
	if c.CanTravelTo("missing") {
		t.Fatal("unknown map should block travel")
	}
}

func TestMapsRegistryRoundTrip(t *testing.T) {
	dir := t.TempDir()
	dataFile := filepath.Join(dir, "profiles.json")
	_ = os.WriteFile(dataFile, []byte("{}"), 0o644)

	mapPath := filepath.Join(dir, "blank.map.json")
	blank, err := game.NewBlankMapConfig(16, 16, 32)
	if err != nil {
		t.Fatal(err)
	}
	if err := game.SaveMapConfig(mapPath, blank); err != nil {
		t.Fatal(err)
	}

	serverCfg := filepath.Join(dir, "server.json")
	serverJSON := strings.ReplaceAll(`{
  "server": {
    "name": "t",
    "addr": ":0",
    "data": "d",
    "accounts": "a",
    "static": "s",
    "overworld": "OVERWORLD"
  }
}`, "OVERWORLD", filepath.ToSlash(mapPath))
	if err := os.WriteFile(serverCfg, []byte(serverJSON), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := Config{
		Proxy: ProxyConfig{Data: dataFile},
		Maps: []MapSpec{
			{ID: "greenwood", Name: "Greenwood", Config: serverCfg, Default: true},
			{ID: "cave", Name: "Cave", Config: serverCfg, Enabled: BoolPtr(true)},
		},
	}
	if err := SaveMapsRegistry(cfg); err != nil {
		t.Fatalf("save registry: %v", err)
	}
	if _, err := os.Stat(MapsRegistryPath(dataFile)); err != nil {
		t.Fatalf("registry missing: %v", err)
	}

	loaded := Config{Proxy: ProxyConfig{Data: dataFile}, Maps: []MapSpec{{ID: "old", Name: "Old", Config: serverCfg}}}
	if err := loaded.loadMapsRegistry(); err != nil {
		t.Fatal(err)
	}
	if len(loaded.Maps) != 2 || loaded.Maps[1].ID != "cave" {
		t.Fatalf("maps = %+v", loaded.Maps)
	}
}

// TestRealClusterBorderGraph loads the shipped cluster.json + map configs
// and verifies the border graph validates (symmetric opposite edges).
// Load also picks up data/cluster.maps.json — the live deployment path.
func TestRealClusterBorderGraph(t *testing.T) {
	root := filepath.Join("..", "..")
	if _, err := os.Stat(filepath.Join(root, "data", "cluster.json")); err != nil {
		t.Skip("repo data/cluster.json not available")
	}
	// cluster.json paths are relative to the repo root.
	cwd, _ := os.Getwd()
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	defer os.Chdir(cwd)
	cfg, err := Load("data/cluster.json")
	if err != nil {
		t.Fatalf("cluster.Load: %v", err)
	}
	if len(cfg.Maps) == 0 {
		t.Fatal("expected maps in cluster config")
	}
}

func TestWorldSpecValidation(t *testing.T) {
	dir := t.TempDir()
	serverCfg := writeValidServerConfig(t, dir)

	cfg := Config{
		Proxy: ProxyConfig{Data: filepath.Join(dir, "profiles.json")},
		Maps:  []MapSpec{{ID: "legacy", Name: "Legacy", Config: serverCfg, Default: true}},
		World: &WorldSpec{ID: "default", Name: "Default World", Config: serverCfg},
	}
	_ = os.WriteFile(cfg.Proxy.Data, []byte("{}"), 0o644)
	if err := cfg.Validate(); err != nil {
		t.Fatalf("expected world validation to pass: %v", err)
	}
}

func TestWorldSpecValidationMissingConfig(t *testing.T) {
	dir := t.TempDir()
	serverCfg := writeValidServerConfig(t, dir)

	cfg := Config{
		Proxy: ProxyConfig{Data: filepath.Join(dir, "profiles.json")},
		Maps:  []MapSpec{{ID: "legacy", Name: "Legacy", Config: serverCfg, Default: true}},
		World: &WorldSpec{ID: "default", Name: "Default World", Config: filepath.Join(dir, "missing.json")},
	}
	_ = os.WriteFile(cfg.Proxy.Data, []byte("{}"), 0o644)
	if err := cfg.Validate(); err == nil {
		t.Fatal("expected validation error for missing world config")
	}
}

func TestWorldSpecHelpers(t *testing.T) {
	dir := t.TempDir()
	serverCfg := writeValidServerConfig(t, dir)
	cfg := Config{
		Maps:  []MapSpec{{ID: "legacy", Name: "Legacy", Config: serverCfg, Default: true}},
		World: &WorldSpec{Name: "Default World", Config: serverCfg},
	}

	if cfg.HasWorld() {
		t.Fatal("expected no world without ID")
	}

	cfg.World.ID = "default"
	if !cfg.HasWorld() {
		t.Fatal("expected world to be present")
	}

	w, ok := cfg.WorldSpec()
	if !ok || w.ID != "default" {
		t.Fatalf("unexpected world spec: %+v %v", w, ok)
	}

	sc, err := cfg.LoadWorldConfig()
	if err != nil {
		t.Fatalf("LoadWorldConfig: %v", err)
	}
	if sc.Server.Name != "t" {
		t.Fatalf("unexpected server name %q", sc.Server.Name)
	}

	cfg.World = nil
	if _, err := cfg.LoadWorldConfig(); err == nil {
		t.Fatal("expected error loading world config when no world configured")
	}
}

func TestWorldJSONRoundTrip(t *testing.T) {
	dir := t.TempDir()
	serverCfg := writeValidServerConfig(t, dir)
	dataFile := filepath.Join(dir, "profiles.json")
	_ = os.WriteFile(dataFile, []byte("{}"), 0o644)

	original := Config{
		Proxy: ProxyConfig{Data: dataFile},
		Maps:  []MapSpec{{ID: "legacy", Name: "Legacy", Config: serverCfg, Default: true}},
		World: &WorldSpec{ID: "default", Name: "Default World", Config: serverCfg},
	}

	path := filepath.Join(dir, "cluster.json")
	if err := Save(path, original); err != nil {
		t.Fatalf("Save: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"world"`) {
		t.Fatalf("saved cluster should contain world field: %s", raw)
	}

	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !loaded.HasWorld() || loaded.World.ID != "default" {
		t.Fatalf("loaded world not preserved: %+v", loaded.World)
	}
	if len(loaded.Maps) != 1 || loaded.Maps[0].ID != "legacy" {
		t.Fatalf("loaded maps not preserved: %+v", loaded.Maps)
	}
}

func writeValidServerConfig(t *testing.T, dir string) string {
	t.Helper()
	mapPath := filepath.Join(dir, "blank.map.json")
	blank, err := game.NewBlankMapConfig(16, 16, 32)
	if err != nil {
		t.Fatal(err)
	}
	if err := game.SaveMapConfig(mapPath, blank); err != nil {
		t.Fatal(err)
	}
	serverCfg := filepath.Join(dir, "server.json")
	serverJSON := fmt.Sprintf(`{
  "server": {
    "name": "t",
    "addr": ":0",
    "data": "d",
    "accounts": "a",
    "static": "s",
    "overworld": %q
  }
}`, filepath.ToSlash(mapPath))
	if err := os.WriteFile(serverCfg, []byte(serverJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	return serverCfg
}
