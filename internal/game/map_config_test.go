package game

import "testing"

func TestLoadGreenwoodMapConfigFile(t *testing.T) {
	cfg, err := LoadMapConfig(defaultOverworldPath())
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Cols != 160 || cfg.Rows != 120 {
		t.Fatalf("unexpected size %dx%d", cfg.Cols, cfg.Rows)
	}
	if len(cfg.Terrain.Ground) != cfg.Cols*cfg.Rows {
		t.Fatal("ground layer size mismatch")
	}
	if len(cfg.Objects) == 0 {
		t.Fatal("expected objects in map config")
	}
}

func TestReloadMapConfigMatchesRegions(t *testing.T) {
	cfg, err := LoadMapConfig(defaultOverworldPath())
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := LoadOverworldFromMapConfig(defaultOverworldPath())
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Regions) != len(cfg.Regions) {
		t.Fatalf("region count %d want %d", len(loaded.Regions), len(cfg.Regions))
	}
}
