package game

import (
	"fmt"
	"math/rand"
)

// Equipment comes from a fixed database (equipment_defs.go): every drop is a
// named catalog item with predictable stats and type.

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

// Armor weight classes. Every non-weapon armor piece rolls a class that fixes
// its stat identity, making loadouts predictable: heavy favors physical stats
// (STR/VIT primary), medium favors agility and mixed offense (DEX primary —
// agility maps to DEX in the stat model — with STR/INT secondary), light
// favors magical stats (INT/MD primary). Stored in Item.Type alongside weapon
// types for weapons.
const (
	ArmorHeavy  = "heavy"
	ArmorMedium = "medium"
	ArmorLight  = "light"
)

var ArmorClasses = []string{ArmorHeavy, ArmorMedium, ArmorLight}

func ValidArmorClass(class string) bool {
	for _, c := range ArmorClasses {
		if c == class {
			return true
		}
	}
	return false
}

// ValidEquipSlot reports whether a slot id can appear in a loadout's equipped map.
func ValidEquipSlot(slot string) bool {
	for _, s := range AllSlots {
		if s == slot {
			return true
		}
	}
	return false
}

// Item kinds: gear that is equipped vs. consumables used in battle vs. housing goods.
const (
	KindEquipment  = "equipment"
	KindConsumable = "consumable"
	KindDecoration = "decoration"
	KindCrafting   = "crafting"
)

type Item struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Kind       string         `json:"kind"`
	Slot       string         `json:"slot,omitempty"`       // equipment only
	Type       string         `json:"type,omitempty"`       // weapon type or armor class; empty otherwise
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
	"potio":       {ID: "potio", Name: "Potio", HealHP: 50, PerLevel: 8, Description: "Restores a moderate amount of HP."},
	"potio_maior": {ID: "potio_maior", Name: "Potio Maior", HealHP: 130, PerLevel: 14, Description: "Restores a large amount of HP."},
	"aether":      {ID: "aether", Name: "Aether", RestoreMP: 35, PerLevel: 6, Description: "Restores MP."},
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
	WeaponSword:    {"Blade", "Saber", "Claymore"},
	WeaponHammer:   {"Hammer", "Maul", "Warhammer"},
	WeaponAxe:      {"Axe", "Hatchet", "Greataxe"},
	WeaponSpear:    {"Spear", "Lance", "Pike"},
	WeaponKatana:   {"Katana", "Uchigatana", "Tachi"},
	WeaponStaff:    {"Staff", "Rod", "Scepter"},
	WeaponWand:     {"Wand", "Baton", "Focus"},
	WeaponDagger:   {"Twin Dirks", "Twin Kris", "Matched Stilettos"},
	WeaponKnuckles: {"Knuckles", "Cesti", "Claws"},
}

// armorBases names gear per slot per weight class so a piece's name telegraphs
// its defensive identity (helm vs. hood vs. circlet).
var armorBases = map[string]map[string][]string{
	SlotHead: {
		ArmorHeavy:  {"Helm", "Barbute", "Greathelm"},
		ArmorMedium: {"Hood", "Cap", "Bandana"},
		ArmorLight:  {"Circlet", "Hat", "Mitre"},
	},
	SlotChest: {
		ArmorHeavy:  {"Cuirass", "Hauberk", "Platemail"},
		ArmorMedium: {"Vest", "Jerkin", "Tunic"},
		ArmorLight:  {"Robe", "Vestment", "Gown"},
	},
	SlotHands: {
		ArmorHeavy:  {"Gauntlets", "Vambraces", "Mufflers"},
		ArmorMedium: {"Bracers", "Wristguards", "Wraps"},
		ArmorLight:  {"Gloves", "Mitts", "Cuffs"},
	},
	SlotLegs: {
		ArmorHeavy:  {"Greaves", "Cuisses", "Platelegs"},
		ArmorMedium: {"Chausses", "Trousers", "Breeches"},
		ArmorLight:  {"Leggings", "Tonban", "Brais"},
	},
	SlotFeet: {
		ArmorHeavy:  {"Sabatons", "Warboots", "Sollerets"},
		ArmorMedium: {"Boots", "Treads", "Gaiters"},
		ArmorLight:  {"Shoes", "Sandals", "Slippers"},
	},
	SlotBack: {
		ArmorHeavy:  {"Greatcloak", "Pelt", "Bulwark Cape"},
		ArmorMedium: {"Mantle", "Shawl", "Drape"},
		ArmorLight:  {"Cape", "Sash", "Scarf"},
	},
}

// CatalogEquipment returns the stock equipment catalog: starter weapons and
// worn armor plus the full fixed equipment ladder (equipment_defs.go).
func CatalogEquipment() []Item {
	out := make([]Item, 0, len(WeaponTypes)+len(ArmorSlots)+150)
	for _, w := range WeaponTypes {
		out = append(out, StarterWeapon(w))
	}
	for _, slot := range ArmorSlots {
		out = append(out, starterArmorTemplate(slot))
	}
	return append(out, EquipmentDefs()...)
}

func starterArmorTemplate(slot string) Item {
	bases := armorBases[slot][ArmorMedium]
	return Item{
		ID:     "starter-" + slot,
		Name:   "Worn " + bases[0],
		Kind:   KindEquipment,
		Slot:   slot,
		Type:   ArmorMedium,
		Rarity: RarityCommon,
		Level:  1,
		Stats:  starterArmorStats(slot),
	}
}

func starterArmorStats(slot string) map[string]int {
	switch slot {
	case SlotHead, SlotChest:
		return map[string]int{"hp": 6}
	case SlotHands:
		return map[string]int{"str": 2}
	case SlotLegs, SlotFeet:
		return map[string]int{StatDex: 2}
	case SlotBack:
		return map[string]int{StatMD: 2}
	default:
		return map[string]int{"hp": 3}
	}
}

// GenerateLoot produces a victory drop: one guaranteed piece of gear drawn
// from the equipment catalog near the enemy's level, a chance of a second,
// and a good chance of a consumable.
func GenerateLoot(rng *rand.Rand, level int, rarityBonus int) []Item {
	loot := make([]Item, 0, 3)
	if item, ok := rollEquipmentDrop(rng, level, rarityBonus); ok {
		loot = append(loot, item)
	}
	if rng.Intn(100) < 25+rarityBonus*10 {
		if item, ok := rollEquipmentDrop(rng, level, rarityBonus); ok {
			loot = append(loot, item)
		}
	}
	if rng.Intn(100) < 45 {
		roll := rng.Intn(100)
		defID := "potio"
		if roll >= 80 {
			defID = "potio_maior"
		} else if roll >= 55 {
			defID = "aether"
		}
		loot = append(loot, NewConsumable(rng, defID, level))
	}
	return loot
}

// rollEquipmentDrop picks one catalog equipment def near the enemy's level
// and mints an instance of it. The designer-authored items catalog is the
// drop source when loaded; the built-in table backs tests and empty catalogs.
func rollEquipmentDrop(rng *rand.Rand, level, rarityBonus int) (Item, bool) {
	defs := catalogEquipmentDefs()
	if len(defs) == 0 {
		defs = CatalogEquipment()
	}
	def, ok := pickEquipmentDef(rng, defs, level, rarityBonus)
	if !ok {
		return Item{}, false
	}
	return cloneItem(rng, def), true
}

// catalogEquipmentDefs converts loaded items-catalog equipment entries into
// item defs for default drop rolling. Empty when the catalog isn't loaded.
func catalogEquipmentDefs() []Item {
	EnsureLootCatalogs()
	contentMu.RLock()
	defer contentMu.RUnlock()
	out := make([]Item, 0, len(catalogItems))
	for _, def := range catalogItems {
		if item, ok := equipmentDefToItem(def); ok && item.Slot != "" {
			out = append(out, item)
		}
	}
	return out
}
