package game

import (
	"math/rand"
	"testing"
)

func TestGenerateItemNeverRollsSubWeaponSlot(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for i := 0; i < 500; i++ {
		item := GenerateItem(rng, 12, 0)
		if item.Slot == SlotSubWeapon {
			t.Fatalf("loot should not roll sub_weapon inventory slot, got %+v", item)
		}
		if item.Slot == SlotWeapon && item.Type == "" {
			t.Fatalf("weapon loot should set type, got %+v", item)
		}
	}
}

func TestGenerateLootDoesNotPanic(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	for i := 0; i < 200; i++ {
		_ = GenerateLoot(rng, 18, 1)
	}
}

func TestDaggerLootIsWeaponSlotPair(t *testing.T) {
	rng := rand.New(rand.NewSource(3))
	found := false
	for i := 0; i < 1000; i++ {
		item := GenerateItem(rng, 10, 0)
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
