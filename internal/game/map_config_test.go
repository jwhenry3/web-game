package game

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadGreenwoodMapConfigFile(t *testing.T) {
	cfg, err := LoadMapConfig(defaultOverworldPath())
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Cols != 128 || cfg.Rows != 96 {
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

// TestMapConfigFileLoads loads a .map.json using the canonical field names —
// guards the on-disk contract the backend loader and editor rely on.
func TestMapConfigFileLoads(t *testing.T) {
	const cols, rows = 32, 24
	ground := make([]int, cols*rows)
	for i := range ground {
		ground[i] = 577 // basechip grass fill
	}
	collision := make([]int, cols*rows)

	doc := fmt.Sprintf(`{
  "tile_size": 32,
  "cols": %d,
  "rows": %d,
  "wander": {"minDistance": 8, "pauseSec": 5.0, "speed": 28.0},
  "terrain": {"ground": %s, "collision": %s},
  "regions": [
    {"id": "haven", "minC": 2, "minR": 2, "maxC": 8, "maxR": 8, "sanctuary": true},
    {"id": "wilds", "minC": 10, "minR": 2, "maxC": 20, "maxR": 10}
  ],
  "save_points": [{"id": "sp_haven", "name": "Haven Crystal", "tile": [4, 4]}],
  "job_changers": [{"id": "jc_haven", "name": "Job Master", "tile": [5, 5]}],
  "npcs": [{
    "id": "hw_goblin_1", "kind": "goblin", "name": "Field Goblin",
    "level": 2, "region": "wilds", "home": [15, 5],
    "encounter": {"enemies": [{
      "kind": "goblin", "levelMin": 2, "levelMax": 2,
      "capturable": true, "dropPoolId": "pool_boss"
    }]}
  }],
  "borders": {},
  "exits": [{"destMap": "other_map", "tiles": [25, 2, 27, 4], "dest": [48.0, 80.0]}],
  "objects": []
}`, cols, rows, intArrayJSON(ground), intArrayJSON(collision))

	path := filepath.Join(t.TempDir(), "hand_world.map.json")
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	ow, err := LoadOverworldFromMapConfig(path)
	if err != nil {
		t.Fatalf("map config failed to load: %v", err)
	}
	if len(ow.Regions) != 2 || len(ow.SavePoints) != 1 || len(ow.NPCPatrols) != 1 {
		t.Fatalf("entities = %d regions %d saves %d npcs",
			len(ow.Regions), len(ow.SavePoints), len(ow.NPCPatrols))
	}
	if ow.NPCPatrols[0].Encounter.Enemies[0].DropPoolID != "pool_boss" {
		t.Fatalf("npc encounter = %+v", ow.NPCPatrols[0].Encounter)
	}
	if len(ow.Exits) != 1 || ow.Exits[0].DestMap != "other_map" {
		t.Fatalf("exits = %+v", ow.Exits)
	}
}

func intArrayJSON(v []int) string {
	parts := make([]string, len(v))
	for i, n := range v {
		parts[i] = fmt.Sprintf("%d", n)
	}
	return "[" + strings.Join(parts, ",") + "]"
}
