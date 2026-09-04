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
	if cfg.TerrainCenters[BaseChipTerrainGrass] != BaseChipLocalGrassFill {
		t.Fatalf("grass fill: got %d want %d", cfg.TerrainCenters[BaseChipTerrainGrass], BaseChipLocalGrassFill)
	}
	if cfg.TerrainCenters[BaseChipTerrainDirt] != BaseChipLocalDirtFill {
		t.Fatalf("dirt fill: got %d want %d", cfg.TerrainCenters[BaseChipTerrainDirt], BaseChipLocalDirtFill)
	}
	if !cfg.WaterTiles[BaseChipLocalWaterChip] {
		t.Fatal("expected water chip tile to be flagged")
	}
	if !cfg.CollidesTiles[BaseChipLocalStoneFill] {
		t.Fatal("expected stone fill to collide")
	}
	gid := cfg.GID(PipoyaFirstBaseChip, cfg.AutotileLocal(BaseChipTerrainGrass, true, true, true, true))
	if gid != PipoyaGIDGrass {
		t.Fatalf("grass fill gid: got %d want %d", gid, PipoyaGIDGrass)
	}
	pathGID := cfg.GID(PipoyaFirstBaseChip, cfg.AutotileLocal(BaseChipTerrainDirt, true, true, true, true))
	if pathGID != PipoyaGIDPath {
		t.Fatalf("path fill gid: got %d want %d", pathGID, PipoyaGIDPath)
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
