package game

import "testing"

func TestAddItemsStacksConsumables(t *testing.T) {
	a := Item{ID: "p1", Kind: KindConsumable, Consumable: "potion", Level: 1, Qty: 3}
	b := Item{ID: "p2", Kind: KindConsumable, Consumable: "potion", Level: 1, Qty: 2}
	out := AddItems([]Item{a}, []Item{b})
	if len(out) != 1 {
		t.Fatalf("expected one pile, got %d", len(out))
	}
	if ItemQty(out[0]) != 5 {
		t.Fatalf("expected qty 5, got %d", ItemQty(out[0]))
	}
}

func TestAddItemsDoesNotStackEquipment(t *testing.T) {
	a := Item{ID: "e1", Kind: KindEquipment, Slot: SlotHead, Level: 1}
	b := Item{ID: "e2", Kind: KindEquipment, Slot: SlotHead, Level: 1}
	out := AddItems([]Item{a}, []Item{b})
	if len(out) != 2 {
		t.Fatalf("equipment must not merge, got %d", len(out))
	}
}

func TestAddItemsCapsAtMaxStack(t *testing.T) {
	a := Item{ID: "p1", Kind: KindConsumable, Consumable: "potion", Level: 1, Qty: MaxStack}
	b := Item{ID: "p2", Kind: KindConsumable, Consumable: "potion", Level: 1, Qty: 10}
	out := AddItems([]Item{a}, []Item{b})
	if len(out) != 1 || ItemQty(out[0]) != MaxStack {
		t.Fatalf("expected cap %d, got len=%d qty=%d", MaxStack, len(out), ItemQty(out[0]))
	}
}

func TestCompactStacksMergesLegacyPiles(t *testing.T) {
	inv := []Item{
		{ID: "p1", Kind: KindConsumable, Consumable: "potion", Level: 1},
		{ID: "p2", Kind: KindConsumable, Consumable: "potion", Level: 1},
		{ID: "e1", Kind: KindEquipment, Slot: SlotWeapon},
	}
	out := CompactStacks(inv)
	if len(out) != 2 {
		t.Fatalf("expected weapon + potion pile, got %d", len(out))
	}
	var qty int
	for _, item := range out {
		if item.Consumable == "potion" {
			qty = ItemQty(item)
		}
	}
	if qty != 2 {
		t.Fatalf("legacy potions should merge to 2, got %d", qty)
	}
}
