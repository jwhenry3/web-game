package game

// MaxStack is the hard cap for any non-equipment pile.
const MaxStack = 65535

// CanStack reports whether an item merges with others of the same type.
// Equipment never stacks; everything else does.
func CanStack(item Item) bool {
	return item.Kind != KindEquipment && item.Kind != ""
}

// ItemQty returns the pile size, treating a missing qty as 1.
func ItemQty(item Item) int {
	if item.Qty < 1 {
		return 1
	}
	return item.Qty
}

func sameStack(a, b Item) bool {
	if !CanStack(a) || !CanStack(b) {
		return false
	}
	if a.Kind != b.Kind || a.Level != b.Level {
		return false
	}
	switch a.Kind {
	case KindConsumable:
		return a.Consumable == b.Consumable
	case KindDecoration, KindCrafting:
		// Type stores the catalog def id for stack identity.
		if a.Type != "" || b.Type != "" {
			return a.Type == b.Type
		}
		return a.Name == b.Name
	default:
		return a.Consumable == b.Consumable && a.Name == b.Name
	}
}

func clampStack(n int) int {
	if n < 1 {
		return 1
	}
	if n > MaxStack {
		return MaxStack
	}
	return n
}

// AddItems inserts incoming items, merging stackable piles up to MaxStack.
func AddItems(inv []Item, incoming []Item) []Item {
	out := append([]Item(nil), inv...)
	for _, add := range incoming {
		if add.Qty < 1 {
			add.Qty = 1
		}
		if !CanStack(add) {
			out = append(out, add)
			continue
		}
		merged := false
		for i := range out {
			if !sameStack(out[i], add) {
				continue
			}
			out[i].Qty = clampStack(ItemQty(out[i]) + ItemQty(add))
			merged = true
			break
		}
		if !merged {
			add.Qty = clampStack(ItemQty(add))
			out = append(out, add)
		}
	}
	return out
}

// CompactStacks merges existing inventory piles (used when loading old profiles).
func CompactStacks(inv []Item) []Item {
	return AddItems(nil, inv)
}
