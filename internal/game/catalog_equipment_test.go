package game

import "testing"

func TestCatalogEquipment(t *testing.T) {
	items := CatalogEquipment()
	want := len(WeaponTypes) + len(ArmorSlots)
	if len(items) != want {
		t.Fatalf("CatalogEquipment() len = %d, want %d", len(items), want)
	}
	seen := map[string]bool{}
	for _, item := range items {
		if item.Kind != KindEquipment {
			t.Fatalf("expected equipment, got %q kind %q", item.ID, item.Kind)
		}
		if seen[item.ID] {
			t.Fatalf("duplicate catalog id %q", item.ID)
		}
		seen[item.ID] = true
		if item.Slot == SlotWeapon {
			if item.Type == "" {
				t.Fatalf("weapon %q missing type", item.ID)
			}
			if len(item.Stats) == 0 {
				t.Fatalf("weapon %q missing stats", item.ID)
			}
		}
	}
	if !seen["starter-sword"] || !seen["starter-chest"] {
		t.Fatalf("missing expected starter templates: %+v", seen)
	}
}
