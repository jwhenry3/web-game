package game

import (
	"math/rand"
	"testing"
)

func TestParseEncounterJSONDefaults(t *testing.T) {
	cfg := ParseEncounterJSON("", "dire_wolf", 5)
	if len(cfg.Enemies) != 1 || cfg.Enemies[0].Kind != "dire_wolf" {
		t.Fatalf("enemies = %+v", cfg.Enemies)
	}
	if cfg.Enemies[0].LevelMin != 5 || cfg.Enemies[0].LevelMax != 5 {
		t.Fatalf("levels = %+v", cfg.Enemies[0])
	}
}

func TestParseEncounterJSONValid(t *testing.T) {
	raw := `{"enemies":[{"kind":"goblin","levelMin":2,"levelMax":4,"dropPoolId":"pool_goblin"}]}`
	cfg := ParseEncounterJSON(raw, "stone_imp", 1)
	if len(cfg.Enemies) != 1 || cfg.Enemies[0].DropPoolID != "pool_goblin" {
		t.Fatalf("enemies = %+v", cfg.Enemies)
	}
	if cfg.Enemies[0].LevelMin != 2 || cfg.Enemies[0].LevelMax != 4 {
		t.Fatalf("levels = %+v", cfg.Enemies[0])
	}
}

func TestGenerateVictoryLootNoPoolNoDrop(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	if loot := GenerateVictoryLoot(rng, 3, 0, nil); len(loot) != 0 {
		t.Fatalf("normal enemies without a drop pool should drop nothing, got %+v", loot)
	}
}

func TestRollDropPoolIndependent(t *testing.T) {
	contentMu.Lock()
	dropPools = map[string]DropPoolDef{
		"pool_test": {
			ID: "pool_test",
			Entries: []DropPoolEntry{
				{ItemID: "potio", Chance: 100},
				{ItemID: "aether", Chance: 0},
			},
		},
	}
	catalogItems = map[string]CatalogItemDef{}
	contentMu.Unlock()

	rng := rand.New(rand.NewSource(7))
	loot := RollDropPool(rng, "pool_test", 1, 0)
	if len(loot) != 1 || loot[0].Consumable != "potio" {
		t.Fatalf("loot = %+v", loot)
	}
}

func TestValidContentKindDrops(t *testing.T) {
	if !ValidContentKind("drops") {
		t.Fatal("drops should be a valid content kind")
	}
}
