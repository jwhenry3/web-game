package game

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadBaseChipConfig(t *testing.T) {
	root := findRepoRoot(t)
	cfg, err := LoadBaseChipConfig(filepath.Join(root, "data", "maps", "base_chip.tsx"))
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.TerrainCenters) != 4 {
		t.Fatalf("terrain count: got %d want 4", len(cfg.TerrainCenters))
	}
	if cfg.TerrainCenters[BaseChipTerrainGrass] != 48 {
		t.Fatalf("grass center: got %d want 48", cfg.TerrainCenters[BaseChipTerrainGrass])
	}
	if !cfg.WaterTiles[176] {
		t.Fatal("expected tile 176 to be water")
	}
	if !cfg.CollidesTiles[52] {
		t.Fatal("expected tile 52 to collide")
	}
	gid := cfg.GID(PipoyaFirstBaseChip, cfg.AutotileLocal(BaseChipTerrainGrass, true, true, true, true))
	if gid != PipoyaFirstBaseChip+48 {
		t.Fatalf("grass fill gid: got %d want %d", gid, PipoyaFirstBaseChip+48)
	}
}

func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "data", "maps", "base_chip.tsx")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("could not find data/maps/base_chip.tsx")
		}
		dir = parent
	}
}
