package game

import (
	"fmt"
	"math/rand"
	"strings"
)

// Fixed equipment database. Every droppable/catalog piece of gear is an
// explicit entry — no procedural stat rolling — so item names, types, and
// stats are predictable and designers can reference (or override) them in
// the items catalog. The ladder spans item level 1–20 (the job cap): Worn
// starter gear at 1, then a material tier every few levels for every weapon
// type and every armor slot × weight class.

type equipmentTier struct {
	Level  int
	Prefix string
	Rarity Rarity
}

var weaponTiers = []equipmentTier{
	{Level: 4, Prefix: "Bronze", Rarity: RarityCommon},
	{Level: 8, Prefix: "Iron", Rarity: RarityCommon},
	{Level: 12, Prefix: "Steel", Rarity: RarityRare},
	{Level: 16, Prefix: "Silver", Rarity: RarityEpic},
	{Level: 20, Prefix: "Mythril", Rarity: RarityLegendary},
}

var armorTiers = append([]equipmentTier{
	{Level: 1, Prefix: "Worn", Rarity: RarityCommon},
}, weaponTiers...)

// weaponDefStats fixes each weapon's stat line by tier. Primary follows the
// weapon's identity (magic → INT, daggers/knuckles → DEX, else STR); high
// tiers add a small secondary — VIT for melee, MD for magic, STR for finesse.
func weaponDefStats(wt WeaponType, t int) map[string]int {
	primary, secondary := StatStr, StatVit
	switch {
	case isMagicWeapon(wt):
		primary, secondary = StatInt, StatMD
	case wt == WeaponDagger || wt == WeaponKnuckles:
		primary, secondary = StatDex, StatStr
	}
	stats := map[string]int{primary: 3 + 2*t}
	if t >= 3 {
		stats[secondary] = t - 2
	}
	return stats
}

// armorDefStats fixes each armor piece's stat line by weight class and tier:
// heavy favors VIT/STR (physical defense), medium DEX with STR/INT secondary,
// light INT/MD (magical defense). The medium secondary alternates by slot so
// medium sets mix offense stats predictably.
func armorDefStats(slot, class string, t int) map[string]int {
	switch class {
	case ArmorHeavy:
		stats := map[string]int{StatVit: 2 + t, StatStr: 1 + t}
		if t >= 3 {
			stats["hp"] = 5 * t
		}
		return stats
	case ArmorLight:
		stats := map[string]int{StatInt: 1 + t, StatMD: 2 + t}
		if t >= 3 {
			stats["mp"] = 4 * t
		}
		return stats
	default: // ArmorMedium
		stats := map[string]int{StatDex: 2 + t}
		if t >= 2 {
			secondary := StatStr
			if slotIndex(slot)%2 == 1 {
				secondary = StatInt
			}
			stats[secondary] = 1 + t/2
		}
		return stats
	}
}

func slotIndex(slot string) int {
	for i, s := range ArmorSlots {
		if s == slot {
			return i
		}
	}
	return 0
}

// equipmentID derives a stable catalog id from the item's display name:
// "Bronze Cuirass" → "bronze_cuirass". Names are unique per def.
func equipmentID(name string) string {
	return strings.ToLower(strings.ReplaceAll(name, " ", "_"))
}

// EquipmentDefs returns the full fixed equipment table: a named piece for
// every weapon type and every armor slot × weight class at each tier. Stats
// are deterministic — the same piece always mints identical.
func EquipmentDefs() []Item {
	out := make([]Item, 0, len(WeaponTypes)*len(weaponTiers)+len(ArmorSlots)*len(ArmorClasses)*len(armorTiers))
	for _, wt := range WeaponTypes {
		bases := weaponBases[wt]
		for t, tier := range weaponTiers {
			name := fmt.Sprintf("%s %s", tier.Prefix, bases[t%len(bases)])
			out = append(out, Item{
				ID:     equipmentID(name),
				Name:   name,
				Kind:   KindEquipment,
				Slot:   SlotWeapon,
				Type:   string(wt),
				Rarity: tier.Rarity,
				Level:  tier.Level,
				Stats:  weaponDefStats(wt, t),
			})
		}
	}
	for _, slot := range ArmorSlots {
		for _, class := range ArmorClasses {
			bases := armorBases[slot][class]
			for t, tier := range armorTiers {
				if t == 0 && class == ArmorMedium {
					// The worn medium row is the existing starter-* set.
					continue
				}
				name := fmt.Sprintf("%s %s", tier.Prefix, bases[t%len(bases)])
				out = append(out, Item{
					ID:     equipmentID(name),
					Name:   name,
					Kind:   KindEquipment,
					Slot:   slot,
					Type:   class,
					Rarity: tier.Rarity,
					Level:  tier.Level,
					Stats:  armorDefStats(slot, class, t),
				})
			}
		}
	}
	return out
}

// cloneItem mints a fresh inventory instance of a catalog-shaped item.
func cloneItem(rng *rand.Rand, def Item) Item {
	item := def
	item.ID = fmt.Sprintf("item-%08x%04x", rng.Uint32(), rng.Intn(0xffff))
	item.Qty = 1
	stats := make(map[string]int, len(def.Stats))
	for k, v := range def.Stats {
		stats[k] = v
	}
	item.Stats = stats
	return item
}

// pickEquipmentDef draws one equipment def weighted toward items near the
// defeated enemy's level (±band). rarityBonus shifts weight toward
// above-common pieces (mug-style loot boosts).
func pickEquipmentDef(rng *rand.Rand, defs []Item, level, rarityBonus int) (Item, bool) {
	if len(defs) == 0 {
		return Item{}, false
	}
	weights := make([]int, len(defs))
	total, maxLevel := 0, 0
	for i, d := range defs {
		dl := d.Level
		if dl < 1 {
			dl = 1
		}
		if dl > maxLevel {
			maxLevel = dl
		}
		if dl > level+3 || dl < level-8 {
			continue
		}
		w := 9 - abs(dl-level)
		if w < 1 {
			w = 1
		}
		if rarityBonus > 0 && d.Rarity != RarityCommon {
			w *= 1 + rarityBonus
		}
		weights[i] = w
		total += w
	}
	if total == 0 {
		// Enemy out-levels the whole table — drop from the top shelf only.
		for i, d := range defs {
			if d.Level == maxLevel {
				weights[i] = 1
				total++
			}
		}
	}
	roll := rng.Intn(total)
	for i, w := range weights {
		if roll < w {
			return defs[i], true
		}
		roll -= w
	}
	return defs[len(defs)-1], true
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
