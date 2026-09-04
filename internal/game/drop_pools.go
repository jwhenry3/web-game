package game

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
)

// DropPoolEntry is one independent chance roll in a drop pool.
type DropPoolEntry struct {
	ItemID string  `json:"item_id"`
	Chance float64 `json:"chance"`
}

// DropPoolDef is a designer catalog drop table.
type DropPoolDef struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Entries []DropPoolEntry `json:"entries"`
}

// CatalogItemDef mirrors web ItemDef for runtime loot instantiation.
type CatalogItemDef struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Kind        string         `json:"kind"`
	Description string         `json:"description,omitempty"`
	Slot        string         `json:"slot,omitempty"`
	WeaponType  string         `json:"weapon_type,omitempty"`
	Rarity      string         `json:"rarity,omitempty"`
	Level       int            `json:"level,omitempty"`
	Stats       map[string]int `json:"stats,omitempty"`
	Effects     *struct {
		HealHP    int `json:"heal_hp"`
		RestoreMP int `json:"restore_mp"`
		PerLevel  int `json:"per_level"`
	} `json:"effects,omitempty"`
}

var (
	contentMu   sync.RWMutex
	dropPools   = map[string]DropPoolDef{}
	catalogItems = map[string]CatalogItemDef{}
)

// ReloadLootCatalogs loads drops + items catalogs from data/content.
func ReloadLootCatalogs() error {
	poolsRaw, err := LoadContent("drops")
	if err != nil {
		return err
	}
	itemsRaw, err := LoadContent("items")
	if err != nil {
		return err
	}
	var pools []DropPoolDef
	if err := json.Unmarshal(poolsRaw, &pools); err != nil {
		return fmt.Errorf("parse drops: %w", err)
	}
	var items []CatalogItemDef
	if err := json.Unmarshal(itemsRaw, &items); err != nil {
		return fmt.Errorf("parse items: %w", err)
	}
	nextPools := make(map[string]DropPoolDef, len(pools))
	for _, p := range pools {
		if p.ID == "" {
			continue
		}
		nextPools[p.ID] = p
	}
	nextItems := make(map[string]CatalogItemDef, len(items))
	for _, it := range items {
		if it.ID == "" {
			continue
		}
		nextItems[it.ID] = it
	}
	contentMu.Lock()
	dropPools = nextPools
	catalogItems = nextItems
	contentMu.Unlock()
	return nil
}

// EnsureLootCatalogs loads catalogs once if empty.
func EnsureLootCatalogs() {
	contentMu.RLock()
	empty := len(dropPools) == 0 && len(catalogItems) == 0
	contentMu.RUnlock()
	if empty {
		_ = ReloadLootCatalogs()
	}
}

// ItemFromCatalog mints an inventory Item from a catalog definition.
func ItemFromCatalog(rng *rand.Rand, defID string, level int) (Item, bool) {
	EnsureLootCatalogs()
	if level < 1 {
		level = 1
	}
	if _, ok := ConsumableDefs[defID]; ok {
		return NewConsumable(rng, defID, level), true
	}
	contentMu.RLock()
	def, ok := catalogItems[defID]
	contentMu.RUnlock()
	if !ok {
		return Item{}, false
	}
	if def.Level > 0 {
		level = def.Level
	}
	id := fmt.Sprintf("item-%08x%04x", rng.Uint32(), rng.Intn(0xffff))
	if def.Kind == KindConsumable || def.Kind == "consumable" {
		return Item{
			ID: id, Name: def.Name, Kind: KindConsumable, Consumable: def.ID,
			Rarity: RarityCommon, Level: level, Qty: 1,
		}, true
	}
	rarity := Rarity(def.Rarity)
	if rarity == "" {
		rarity = RarityCommon
	}
	stats := map[string]int{}
	for k, v := range def.Stats {
		stats[k] = v
	}
	return Item{
		ID: id, Name: def.Name, Kind: KindEquipment, Slot: def.Slot,
		Type: def.WeaponType, Rarity: rarity, Level: level, Qty: 1, Stats: stats,
	}, true
}

// RollDropPool independently rolls each entry; lootBonus adds 10% per stack (capped).
func RollDropPool(rng *rand.Rand, poolID string, level, lootBonus int) []Item {
	if poolID == "" {
		return nil
	}
	EnsureLootCatalogs()
	contentMu.RLock()
	pool, ok := dropPools[poolID]
	contentMu.RUnlock()
	if !ok {
		return nil
	}
	bonus := lootBonus * 10
	var out []Item
	for _, e := range pool.Entries {
		chance := int(e.Chance) + bonus
		if chance > 100 {
			chance = 100
		}
		if chance <= 0 {
			continue
		}
		if rng.Intn(100) < chance {
			if item, ok := ItemFromCatalog(rng, e.ItemID, level); ok {
				out = append(out, item)
			}
		}
	}
	return out
}

// GenerateVictoryLoot rolls assigned drop pools; falls back to procedural loot when none assigned.
func GenerateVictoryLoot(rng *rand.Rand, level, lootBonus int, dropPoolIDs []string) []Item {
	assigned := false
	var loot []Item
	for _, id := range dropPoolIDs {
		if id == "" {
			continue
		}
		assigned = true
		loot = append(loot, RollDropPool(rng, id, level, lootBonus)...)
	}
	if !assigned {
		return GenerateLoot(rng, level, lootBonus)
	}
	return loot
}
