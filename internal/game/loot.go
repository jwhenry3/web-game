package game

import (
	"fmt"
	"math/rand"
)

// Procedural equipment generation per the GDD: stat distributions are rolled
// within ranges determined by the item's rarity and level.

type Rarity string

const (
	RarityCommon    Rarity = "common"
	RarityRare      Rarity = "rare"
	RarityEpic      Rarity = "epic"
	RarityLegendary Rarity = "legendary"
)

// Equipment slots: main weapon, optional sub weapon, plus six armor pieces.
const (
	SlotWeapon    = "weapon"
	SlotSubWeapon = "sub_weapon"
	SlotHead      = "head"
	SlotChest     = "chest"
	SlotHands     = "hands"
	SlotLegs      = "legs"
	SlotFeet      = "feet"
	SlotBack      = "back"
)

var ArmorSlots = []string{SlotHead, SlotChest, SlotHands, SlotLegs, SlotFeet, SlotBack}
var AllSlots = append([]string{SlotWeapon, SlotSubWeapon}, ArmorSlots...)

// lootSlots are inventory slots random gear can roll. Weapons always use SlotWeapon;
// sub_weapon is an equip destination for a second job's weapon, not a drop type.
var lootSlots = append([]string{SlotWeapon}, ArmorSlots...)

// ValidEquipSlot reports whether a slot id can appear in a loadout's equipped map.
func ValidEquipSlot(slot string) bool {
	for _, s := range AllSlots {
		if s == slot {
			return true
		}
	}
	return false
}

// Item kinds: gear that is equipped vs. consumables used in battle.
const (
	KindEquipment  = "equipment"
	KindConsumable = "consumable"
)

type Item struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Kind       string         `json:"kind"`
	Slot       string         `json:"slot,omitempty"`       // equipment only
	Type       string         `json:"type,omitempty"`       // weapon type; empty otherwise
	Consumable string         `json:"consumable,omitempty"` // consumable def id
	Rarity     Rarity         `json:"rarity"`
	Level      int            `json:"level"`
	Qty        int            `json:"qty,omitempty"` // stack size; equipment is always 1
	Stats      map[string]int `json:"stats,omitempty"`
}

// ---- Consumables ----

type ConsumableDef struct {
	ID          string
	Name        string
	HealHP      int // base HP restored
	RestoreMP   int // base MP restored
	PerLevel    int // extra effect per item level
	Description string
}

var ConsumableDefs = map[string]ConsumableDef{
	"potion":    {ID: "potion", Name: "Potion", HealHP: 50, PerLevel: 8, Description: "Restores a moderate amount of HP."},
	"hi_potion": {ID: "hi_potion", Name: "Hi-Potion", HealHP: 130, PerLevel: 14, Description: "Restores a large amount of HP."},
	"ether":     {ID: "ether", Name: "Ether", RestoreMP: 35, PerLevel: 6, Description: "Restores MP."},
}

// ConsumableEffect returns the HP and MP an item restores when used.
func ConsumableEffect(item Item) (hp, mp int) {
	def, ok := ConsumableDefs[item.Consumable]
	if !ok {
		return 0, 0
	}
	if def.HealHP > 0 {
		hp = def.HealHP + def.PerLevel*item.Level
	}
	if def.RestoreMP > 0 {
		mp = def.RestoreMP + def.PerLevel*item.Level
	}
	return
}

// NewConsumable mints an inventory instance of a consumable definition.
func NewConsumable(rng *rand.Rand, defID string, level int) Item {
	def := ConsumableDefs[defID]
	return Item{
		ID:         fmt.Sprintf("cons-%08x%04x", rng.Uint32(), rng.Intn(0xffff)),
		Name:       def.Name,
		Kind:       KindConsumable,
		Consumable: defID,
		Rarity:     RarityCommon,
		Level:      level,
		Qty:        1,
	}
}

var weaponBases = map[WeaponType][]string{
	WeaponSword:  {"Blade", "Saber", "Claymore"},
	WeaponDagger: {"Twin Dirks", "Twin Kris", "Matched Stilettos"},
	WeaponStaff:  {"Staff", "Rod", "Scepter"},
	WeaponMace:   {"Mace", "Cudgel", "Morningstar"},
}

var armorBases = map[string][]string{
	SlotHead:  {"Helm", "Circlet", "Hood"},
	SlotChest: {"Cuirass", "Robe", "Vest"},
	SlotHands: {"Gauntlets", "Gloves", "Bracers"},
	SlotLegs:  {"Greaves", "Leggings", "Chausses"},
	SlotFeet:  {"Boots", "Sabatons", "Treads"},
	SlotBack:  {"Cloak", "Mantle", "Cape"},
}

var rarityPrefixes = map[Rarity][]string{
	RarityCommon:    {"Worn", "Simple", "Sturdy"},
	RarityRare:      {"Fine", "Runed", "Gleaming"},
	RarityEpic:      {"Ancient", "Stormforged", "Phantom"},
	RarityLegendary: {"Mythril", "Dragonheart", "Celestial"},
}

// budget multiplier and roll count per rarity
var rarityPower = map[Rarity]struct {
	Mult  float64
	Rolls int
}{
	RarityCommon:    {1.0, 1},
	RarityRare:      {1.5, 2},
	RarityEpic:      {2.2, 3},
	RarityLegendary: {3.2, 4},
}

var armorStatKeys = []string{"str", "mag", "agi", "hp"}

// rollRarity draws from a weighted pool; bonus (e.g. from Thief-style mugs)
// shifts weight away from common drops.
func rollRarity(rng *rand.Rand, bonus int) Rarity {
	roll := rng.Intn(100) + bonus*8
	switch {
	case roll >= 97:
		return RarityLegendary
	case roll >= 85:
		return RarityEpic
	case roll >= 60:
		return RarityRare
	default:
		return RarityCommon
	}
}

// GenerateItem rolls a single piece of equipment for the given level.
func GenerateItem(rng *rand.Rand, level int, rarityBonus int) Item {
	rarity := rollRarity(rng, rarityBonus)
	slot := lootSlots[rng.Intn(len(lootSlots))]
	power := rarityPower[rarity]
	prefixes := rarityPrefixes[rarity]
	prefix := prefixes[rng.Intn(len(prefixes))]

	item := Item{
		ID:     fmt.Sprintf("item-%08x%04x", rng.Uint32(), rng.Intn(0xffff)),
		Kind:   KindEquipment,
		Slot:   slot,
		Rarity: rarity,
		Level:  level,
		Stats:  map[string]int{},
	}

	rollStat := func(key string, mult float64) {
		budget := float64(2+level) * power.Mult * mult
		val := int(budget * (0.5 + rng.Float64()*0.5))
		if val < 1 {
			val = 1
		}
		if key == "hp" {
			val *= 3
		}
		item.Stats[key] += val
	}

	switch slot {
	case SlotWeapon:
		wt := WeaponTypes[rng.Intn(len(WeaponTypes))]
		bases := weaponBases[wt]
		item.Type = string(wt)
		item.Name = fmt.Sprintf("%s %s", prefix, bases[rng.Intn(len(bases))])
		primary := "str"
		if wt == WeaponStaff || wt == WeaponMace {
			primary = "mag"
		}
		rollStat(primary, 1.4)
		for i := 1; i < power.Rolls; i++ {
			rollStat(armorStatKeys[rng.Intn(len(armorStatKeys))], 0.7)
		}
	default:
		bases := armorBases[slot]
		item.Name = fmt.Sprintf("%s %s", prefix, bases[rng.Intn(len(bases))])
		for i := 0; i < power.Rolls; i++ {
			rollStat(armorStatKeys[rng.Intn(len(armorStatKeys))], 1.0)
		}
	}

	return item
}

// GenerateLoot produces a victory drop: one guaranteed piece of gear, a
// chance of a second, and a good chance of a consumable.
func GenerateLoot(rng *rand.Rand, level int, rarityBonus int) []Item {
	loot := []Item{GenerateItem(rng, level, rarityBonus)}
	if rng.Intn(100) < 25+rarityBonus*10 {
		loot = append(loot, GenerateItem(rng, level, rarityBonus))
	}
	if rng.Intn(100) < 45 {
		roll := rng.Intn(100)
		defID := "potion"
		if roll >= 80 {
			defID = "hi_potion"
		} else if roll >= 55 {
			defID = "ether"
		}
		loot = append(loot, NewConsumable(rng, defID, level))
	}
	return loot
}
