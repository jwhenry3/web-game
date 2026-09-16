package game

import "strconv"

const HotbarSlotCount = 24

// HotbarBindable reports whether a kind/id may sit on the hotbar. Combat and
// field skills share one bar; Dodge lives on the Shift keybind instead.
func HotbarBindable(kind, id string) bool {
	switch kind {
	case "skill":
		if id == ActionIDDodge {
			return false
		}
		_, ok := FindSkill(id)
		return ok
	case "item":
		return true
	}
	return false
}

// HotbarSlotIDs returns all valid hotbar slot ids: 1-8, ctrl+1-8, shift+1-8.
func HotbarSlotIDs() []string {
	out := make([]string, 0, HotbarSlotCount)
	for i := 1; i <= 8; i++ {
		out = append(out, strconv.Itoa(i))
	}
	for i := 1; i <= 8; i++ {
		out = append(out, "ctrl+"+strconv.Itoa(i))
	}
	for i := 1; i <= 8; i++ {
		out = append(out, "shift+"+strconv.Itoa(i))
	}
	return out
}

func ValidHotbarSlot(slot string) bool {
	for _, id := range HotbarSlotIDs() {
		if id == slot {
			return true
		}
	}
	return false
}
