package game

import "strconv"

const HotbarSlotCount = 24

// Hotbar bar identifiers: each loadout keeps one bar per context — the world
// bar shows in the overworld, the battle bar during combat.
const (
	HotbarBarWorld  = "world"
	HotbarBarBattle = "battle"
)

func ValidHotbarBar(bar string) bool {
	return bar == HotbarBarWorld || bar == HotbarBarBattle
}

// HotbarBarFor returns the bar a binding may sit on: field-only skills go on
// the world bar; battle skills and consumables go on the battle bar. "" means
// the binding kind is unknown.
func HotbarBarFor(kind, id string) string {
	switch kind {
	case "skill":
		if s, ok := FindSkill(id); ok && s.WorldOnly {
			return HotbarBarWorld
		}
		return HotbarBarBattle
	case "item":
		return HotbarBarBattle
	}
	return ""
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
