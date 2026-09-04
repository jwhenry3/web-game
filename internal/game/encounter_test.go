package game

import (
	"math/rand"
	"testing"
)

func TestParseEncounterJSONDefaults(t *testing.T) {
	cfg := ParseEncounterJSON("", "dire_wolf", 5)
	if cfg.MinEnemies != 2 || cfg.MaxEnemies != 3 {
		t.Fatalf("counts = %d-%d", cfg.MinEnemies, cfg.MaxEnemies)
	}
	if len(cfg.Enemies) != 1 || cfg.Enemies[0].Kind != "dire_wolf" {
		t.Fatalf("enemies = %+v", cfg.Enemies)
	}
	if cfg.Enemies[0].LevelMin != 5 || cfg.Enemies[0].LevelMax != 5 {
		t.Fatalf("levels = %+v", cfg.Enemies[0])
	}
}

func TestParseEncounterJSONValid(t *testing.T) {
	raw := `{"minEnemies":1,"maxEnemies":4,"enemies":[{"kind":"goblin","levelMin":2,"levelMax":4,"dropPoolId":"pool_goblin"}]}`
	cfg := ParseEncounterJSON(raw, "stone_imp", 1)
	if cfg.MinEnemies != 1 || cfg.MaxEnemies != 4 {
		t.Fatalf("counts = %d-%d", cfg.MinEnemies, cfg.MaxEnemies)
	}
	if len(cfg.Enemies) != 1 || cfg.Enemies[0].DropPoolID != "pool_goblin" {
		t.Fatalf("enemies = %+v", cfg.Enemies)
	}
}

func TestRollEnemyCountBounds(t *testing.T) {
	cfg := EncounterConfig{MinEnemies: 2, MaxEnemies: 2, Enemies: []EncounterEnemy{{Kind: "goblin", LevelMin: 1, LevelMax: 1}}}
	rng := rand.New(rand.NewSource(1))
	for i := 0; i < 20; i++ {
		if n := cfg.RollEnemyCount(rng); n != 2 {
			t.Fatalf("got %d", n)
		}
	}
	cfg.MaxEnemies = 4
	seen := map[int]bool{}
	for i := 0; i < 100; i++ {
		n := cfg.RollEnemyCount(rng)
		if n < 2 || n > 4 {
			t.Fatalf("out of range %d", n)
		}
		seen[n] = true
	}
	if len(seen) < 2 {
		t.Fatalf("expected variety, got %v", seen)
	}
}

func TestGenerateVictoryLootFallback(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	loot := GenerateVictoryLoot(rng, 3, 0, nil)
	if len(loot) == 0 {
		t.Fatal("expected procedural loot when no pools assigned")
	}
}

func TestRollDropPoolIndependent(t *testing.T) {
	contentMu.Lock()
	dropPools = map[string]DropPoolDef{
		"pool_test": {
			ID: "pool_test",
			Entries: []DropPoolEntry{
				{ItemID: "potion", Chance: 100},
				{ItemID: "ether", Chance: 0},
			},
		},
	}
	catalogItems = map[string]CatalogItemDef{}
	contentMu.Unlock()

	rng := rand.New(rand.NewSource(7))
	loot := RollDropPool(rng, "pool_test", 1, 0)
	if len(loot) != 1 || loot[0].Consumable != "potion" {
		t.Fatalf("loot = %+v", loot)
	}
}

func TestValidContentKindDrops(t *testing.T) {
	if !ValidContentKind("drops") {
		t.Fatal("drops should be a valid content kind")
	}
}
