package game

import (
	"math/rand"
	"testing"
)

// classStatKeys bounds which stats each armor weight class may carry so the
// fixed table stays on-identity (heavy = physical, medium = agility/mixed,
// light = magical).
var classStatKeys = map[string][]string{
	ArmorHeavy:  {StatStr, StatVit, "hp"},
	ArmorMedium: {StatDex, StatStr, StatInt},
	ArmorLight:  {StatInt, StatMD, "mp"},
}

func TestEquipmentDefsAreFixedAndTyped(t *testing.T) {
	defs := EquipmentDefs()
	if len(defs) == 0 {
		t.Fatal("equipment table is empty")
	}
	seen := map[string]bool{}
	for _, def := range defs {
		if seen[def.ID] {
			t.Fatalf("duplicate equipment id %q", def.ID)
		}
		seen[def.ID] = true
		if def.Kind != KindEquipment || def.Name == "" || len(def.Stats) == 0 {
			t.Fatalf("equipment def incomplete: %+v", def)
		}
		if def.Slot == SlotWeapon {
			if !ValidWeapon(WeaponType(def.Type)) {
				t.Fatalf("weapon def %q has bad type %q", def.ID, def.Type)
			}
			continue
		}
		if !ValidArmorClass(def.Type) {
			t.Fatalf("armor def %q missing weight class, got %q", def.ID, def.Type)
		}
		for k := range def.Stats {
			ok := false
			for _, allowed := range classStatKeys[def.Type] {
				if k == allowed {
					ok = true
					break
				}
			}
			if !ok {
				t.Fatalf("%s def %q rolls off-class stat %q: %+v", def.Type, def.ID, k, def.Stats)
			}
		}
	}
}

func TestEquipmentDefsCoverEverySlotAndClass(t *testing.T) {
	defs := EquipmentDefs()
	covered := map[string]bool{}
	for _, def := range defs {
		covered[def.Slot+":"+def.Type] = true
	}
	for _, slot := range ArmorSlots {
		for _, class := range ArmorClasses {
			if !covered[slot+":"+class] {
				t.Fatalf("no equipment def for %s %s", class, slot)
			}
		}
	}
	for _, wt := range WeaponTypes {
		if !covered[SlotWeapon+":"+string(wt)] {
			t.Fatalf("no equipment def for weapon type %s", wt)
		}
	}
}

func TestRollEquipmentDropNeverRollsSubWeapon(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for i := 0; i < 500; i++ {
		item, ok := rollEquipmentDrop(rng, 12, 0)
		if !ok {
			t.Fatal("rollEquipmentDrop returned no item")
		}
		if item.Slot == SlotSubWeapon {
			t.Fatalf("loot should not roll sub_weapon inventory slot, got %+v", item)
		}
		if item.Slot == SlotWeapon && !ValidWeapon(WeaponType(item.Type)) {
			t.Fatalf("weapon loot should carry a weapon type, got %+v", item)
		}
		if item.Slot != SlotWeapon && !ValidArmorClass(item.Type) {
			t.Fatalf("armor loot should carry a weight class, got %+v", item)
		}
	}
}

func TestRollEquipmentDropTracksEnemyLevel(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	for i := 0; i < 300; i++ {
		item, _ := rollEquipmentDrop(rng, 4, 0)
		if item.Level > 7 {
			t.Fatalf("level 4 enemy dropped level %d gear (%s)", item.Level, item.Name)
		}
	}
	sawTopTier := false
	for i := 0; i < 300; i++ {
		item, _ := rollEquipmentDrop(rng, 20, 0)
		if item.Level >= 16 {
			sawTopTier = true
		}
	}
	if !sawTopTier {
		t.Fatal("level 20 enemies never dropped top-tier gear")
	}
}

func TestDaggerDropsAreWeaponSlot(t *testing.T) {
	rng := rand.New(rand.NewSource(3))
	found := false
	for i := 0; i < 2000; i++ {
		item, _ := rollEquipmentDrop(rng, 20, 0)
		if item.Type != string(WeaponDagger) {
			continue
		}
		found = true
		if item.Slot != SlotWeapon {
			t.Fatalf("dagger loot should use weapon slot, got %q", item.Slot)
		}
	}
	if !found {
		t.Fatal("expected at least one dagger in sample loot")
	}
}

func TestStarterArmorIsMediumClass(t *testing.T) {
	for _, item := range CatalogEquipment() {
		if item.Slot == SlotWeapon {
			continue
		}
		if item.ID != "starter-"+item.Slot {
			continue
		}
		if item.Type != ArmorMedium {
			t.Fatalf("starter armor should be medium class, got %+v", item)
		}
	}
}

func TestItemFromCatalogArmorClass(t *testing.T) {
	contentMu.Lock()
	catalogItems = map[string]CatalogItemDef{
		"plate-1": {ID: "plate-1", Name: "Iron Cuirass", Kind: KindEquipment, Slot: SlotChest, ArmorClass: ArmorHeavy},
		"robe-1":  {ID: "robe-1", Name: "Apprentice Robe", Kind: KindEquipment, Slot: SlotChest},
		"sword-1": {ID: "sword-1", Name: "Bronze Blade", Kind: KindEquipment, Slot: SlotWeapon, WeaponType: "sword"},
	}
	contentMu.Unlock()
	t.Cleanup(func() {
		contentMu.Lock()
		catalogItems = map[string]CatalogItemDef{}
		contentMu.Unlock()
	})

	rng := rand.New(rand.NewSource(5))
	plate, ok := ItemFromCatalog(rng, "plate-1", 1)
	if !ok || plate.Type != ArmorHeavy {
		t.Fatalf("catalog armor should carry its weight class, got %+v", plate)
	}
	robe, ok := ItemFromCatalog(rng, "robe-1", 1)
	if !ok || robe.Type != ArmorMedium {
		t.Fatalf("legacy catalog armor should default to medium, got %+v", robe)
	}
	sword, ok := ItemFromCatalog(rng, "sword-1", 1)
	if !ok || sword.Type != "sword" {
		t.Fatalf("catalog weapon should carry its weapon type, got %+v", sword)
	}
}

func TestGenerateLootDoesNotPanic(t *testing.T) {
	rng := rand.New(rand.NewSource(6))
	for i := 0; i < 200; i++ {
		_ = GenerateLoot(rng, 18, 1)
	}
}
