package servercfg

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAppliesDefaults(t *testing.T) {
	dir := t.TempDir()
	overworld := filepath.Join(dir, "overworld.json")
	if err := os.WriteFile(overworld, []byte(minOverworldJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "server.json")
	// Legacy fields (plugins, battle_speed) must parse cleanly even though the
	// unified combat model no longer reads them.
	body := `{"server":{"overworld":"` + filepath.ToSlash(overworld) + `","battle_speed":0.75},"plugins":{"combat":"combat.atb","modules":[{"id":"combat.atb","enabled":true}]}}`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Addr != ":8080" {
		t.Fatalf("addr = %q, want :8080", cfg.Server.Addr)
	}
	if cfg.Server.Overworld != filepath.ToSlash(overworld) {
		t.Fatalf("overworld = %q", cfg.Server.Overworld)
	}
}

const minOverworldJSON = `{
  "regions": [{"id":"haven","minC":0,"minR":0,"maxC":10,"maxR":10}],
  "wander": {"minDistance": 2, "pauseSec": 1.5, "speed": 48},
  "map": {"baseTile": ".", "borderTile": "#", "border": {"top":1,"bottom":1,"left":1,"right":1}}
}`

func TestApplyOverrides(t *testing.T) {
	dir := t.TempDir()
	overworld := filepath.Join(dir, "overworld.json")
	if err := os.WriteFile(overworld, []byte(minOverworldJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := Default()
	cfg.Server.Overworld = overworld
	if err := cfg.ApplyOverrides(Overrides{Addr: ":9999", Data: "d.json"}); err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Addr != ":9999" || cfg.Server.Data != "d.json" {
		t.Fatalf("overrides not applied: %+v", cfg.Server)
	}
}

func TestSaveAndReload(t *testing.T) {
	dir := t.TempDir()
	overworld := filepath.Join(dir, "overworld.json")
	if err := os.WriteFile(overworld, []byte(minOverworldJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := Default()
	cfg.Server.Overworld = overworld
	path := filepath.Join(dir, "server.json")
	if err := Save(path, cfg); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.Server.Overworld != cfg.Server.Overworld || got.Server.Addr != cfg.Server.Addr {
		t.Fatalf("reloaded %+v", got.Server)
	}
}
