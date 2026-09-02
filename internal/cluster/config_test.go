package cluster

import (
	"path/filepath"
	"testing"

	"ffv-web-game/internal/servercfg"
)

func TestLoadCluster(t *testing.T) {
	t.Chdir(filepath.Join("..", ".."))
	cfg, err := Load("config/cluster.json")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DefaultMap().ID != "greenwood" {
		t.Fatalf("default map %q", cfg.DefaultMap().ID)
	}
	if len(cfg.Maps) < 2 {
		t.Fatalf("expected at least 2 maps, got %d", len(cfg.Maps))
	}
	if !cfg.HasMap("north") {
		t.Fatal("expected north map")
	}

	greenwood, err := servercfg.Load(mustMapConfig(t, cfg, "greenwood"))
	if err != nil {
		t.Fatal(err)
	}
	north, err := servercfg.Load(mustMapConfig(t, cfg, "north"))
	if err != nil {
		t.Fatal(err)
	}
	if greenwood.Plugins.Combat == north.Plugins.Combat {
		t.Fatalf("maps must use different combat plugins, both %s", greenwood.Plugins.Combat)
	}
	modes := map[string]bool{greenwood.Plugins.Combat: true, north.Plugins.Combat: true}
	if !modes["combat.realtime"] || !modes["combat.atb"] {
		t.Fatalf("expected realtime and atb, got %s and %s", greenwood.Plugins.Combat, north.Plugins.Combat)
	}
}

func mustMapConfig(t *testing.T, cfg Config, id string) string {
	t.Helper()
	m, ok := cfg.MapByID(id)
	if !ok {
		t.Fatalf("missing map %s", id)
	}
	return m.Config
}

func TestRejectUnknownTransferDest(t *testing.T) {
	t.Chdir(filepath.Join("..", ".."))
	cfg := Default()
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}
	if cfg.HasMap("nowhere") {
		t.Fatal("unknown map should not be valid")
	}
}
