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
	body := `{"server":{"overworld":"` + filepath.ToSlash(overworld) + `"},"plugins":{"combat":"combat.atb","modules":[{"id":"combat.atb","enabled":true,"frontend":{"pluginId":"combat.atb"}}]}}`
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
	if cfg.Plugins.Combat != "combat.atb" {
		t.Fatalf("combat = %q", cfg.Plugins.Combat)
	}
}

const minOverworldJSON = `{
  "regions": [{"id":"haven","minC":0,"minR":0,"maxC":10,"maxR":10}],
  "wander": {"minDistance": 2, "pauseSec": 1.5, "speed": 48},
  "map": {"baseTile": ".", "borderTile": "#", "border": {"top":1,"bottom":1,"left":1,"right":1}}
}`

func TestApplyOverridesBattleSpeed(t *testing.T) {
	dir := t.TempDir()
	overworld := filepath.Join(dir, "overworld.json")
	if err := os.WriteFile(overworld, []byte(minOverworldJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := Default()
	cfg.Server.Overworld = overworld
	if err := cfg.ApplyOverrides(Overrides{BattleSpeed: 1.25}); err != nil {
		t.Fatal(err)
	}
	if cfg.Server.BattleSpeed != 1.25 {
		t.Fatalf("battle speed = %v", cfg.Server.BattleSpeed)
	}
}
