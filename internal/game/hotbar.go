package game

import "strconv"

const HotbarSlotCount = 24

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
