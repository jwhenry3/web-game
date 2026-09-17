package game

import "strings"

// Combat identity comes from class + weapon. Each core class has one primary
// weapon among the nine implements below.

type WeaponType string

const (
	WeaponSword    WeaponType = "sword"
	WeaponHammer   WeaponType = "hammer"
	WeaponAxe      WeaponType = "axe"
	WeaponSpear    WeaponType = "spear"
	WeaponKatana   WeaponType = "katana"
	WeaponStaff    WeaponType = "staff"
	WeaponWand     WeaponType = "wand"
	WeaponDagger   WeaponType = "dagger"
	WeaponKnuckles WeaponType = "knuckles"
)

var WeaponTypes = []WeaponType{
	WeaponSword, WeaponHammer, WeaponAxe, WeaponSpear, WeaponKatana,
	WeaponStaff, WeaponWand, WeaponDagger, WeaponKnuckles,
}

func ValidWeapon(w WeaponType) bool {
	w = NormalizeWeapon(string(w))
	for _, t := range WeaponTypes {
		if t == w {
			return true
		}
	}
	return false
}

// NormalizeWeapon maps legacy type strings onto current WeaponType values.
func NormalizeWeapon(w string) WeaponType {
	switch w {
	case "mace":
		return WeaponHammer
	default:
		return WeaponType(w)
	}
}

type Category string

const (
	CatSwordplay Category = "swordplay"
	CatStealth   Category = "stealth"
	CatSorcery   Category = "sorcery"
	CatDevotion  Category = "devotion"
)

var Categories = []Category{CatSwordplay, CatStealth, CatSorcery, CatDevotion}

func WeaponCategory(w WeaponType) Category {
	w = NormalizeWeapon(string(w))
	switch w {
	case WeaponSword, WeaponHammer, WeaponAxe, WeaponSpear, WeaponKatana, WeaponKnuckles:
		return CatSwordplay
	case WeaponDagger:
		return CatStealth
	case WeaponStaff:
		return CatSorcery
	case WeaponWand:
		return CatDevotion
	}
	return ""
}

const (
	LevelCap           = 20
	weaponSynergyBonus = 1.15
	SkillMaxLevel      = 5
	SkillUsagePerLevel = 15
	skillLevelPotency  = 0.08
	DefaultCastTimeMs  = 1000
	SpellSkillRange    = 320
	AllySkillRange     = 280
)

// SkillAspect identifies the behavior family passive effects can target.
type SkillAspect string

const (
	AspectPhysical SkillAspect = "physical"
	AspectMagic    SkillAspect = "magic"
	AspectHeal     SkillAspect = "heal"
	AspectBuff     SkillAspect = "buff"
	AspectRanged   SkillAspect = "ranged"
	AspectCombo    SkillAspect = "combo"
)

// PassiveEffect describes always-on modifiers granted by an unlocked passive
// skill. Numeric fields are ratios: 0.10 is +10%, 0.25 is 25%.
type PassiveEffect struct {
	SkillTypes        []SkillAspect `json:"skill_types,omitempty"`
	EffectMultiplier  float64       `json:"effect_multiplier,omitempty"`
	ReflectChance     float64       `json:"reflect_chance,omitempty"`
	ReflectRatio      float64       `json:"reflect_ratio,omitempty"`
	CooldownReduction float64       `json:"cooldown_reduction,omitempty"`
	MinComboStack     int           `json:"min_combo_stack,omitempty"`
	TargetHPBelow     float64       `json:"target_hp_below,omitempty"`
}

// ComboVariant is one step in a repeatable skill chain.
type ComboVariant struct {
	Name          string            `json:"name,omitempty"`
	Power         float64           `json:"power,omitempty"`
	StatusEffects []StatusEffectDef `json:"status_effects,omitempty"`
}

// ComboDef makes a skill cycle through variants while its status stack is live.
type ComboDef struct {
	Status   StatusKind     `json:"status"`
	Duration int            `json:"duration"` // battle ticks (200ms each)
	Variants []ComboVariant `json:"variants"`
}

type Skill struct {
	ID          string
	Name        string
	Job         JobID
	Category    Category
	WeaponReq   WeaponType
	MPCost      int
	Power       float64
	UsesMagic   bool
	Heals       bool
	Buffs       bool
	LootBonus   bool
	Ranged      bool
	Prereq      string
	Cost        int
	Description string
	CastTimeMs  int
	CooldownMs  int
	WorldOnly   bool
	Passive     *PassiveEffect
	Combo       *ComboDef
}

var BasicAttack = Skill{
	ID: "attack", Name: "Attack", Power: 1.0,
	Description: "A basic weapon strike. Repeating it chains through four attacks.",
	Combo: &ComboDef{
		Status:   "combo_attack",
		Duration: 15,
		Variants: []ComboVariant{
			{Name: "Attack", Power: 1.0},
			{Name: "Attack II", Power: 1.15},
			{Name: "Attack III", Power: 1.35},
			{Name: "Attack IV", Power: 1.70},
		},
	},
}

// ActionIDDodge is the universal dash: every class has it from level 1. It
// is usable while casting (and interrupts the cast), moves the player two
// squares along their current movement direction, and does nothing — no
// cooldown — while standing still.
const ActionIDDodge = "dodge"

var SkillDodge = Skill{
	ID:          ActionIDDodge,
	Name:        "Dodge",
	Description: "Dash two squares in your movement direction. Usable while casting — interrupts the cast. Does nothing while standing still.",
}

// Catalog is populated in job_skills.go (init).
var Catalog []Skill

func skillByID(id string) (Skill, bool) {
	for _, s := range Catalog {
		if s.ID == id {
			return s, true
		}
	}
	return Skill{}, false
}

func SkillTier(id string) int {
	seen := map[string]bool{}
	tier := 0
	for id != "" && !seen[id] {
		seen[id] = true
		s, ok := skillByID(id)
		if !ok || s.Prereq == "" {
			return tier
		}
		id = s.Prereq
		tier++
	}
	return tier
}

// SkillAlwaysUnlocked reports skills every character has without a tree unlock.
func SkillAlwaysUnlocked(id string) bool {
	return id == BasicAttack.ID || id == ActionIDCapture || id == ActionIDDodge
}

func SkillUnlockLevel(id string) int {
	if SkillAlwaysUnlocked(id) {
		return 1
	}
	return 1 + SkillTier(id)*4
}

func SkillUsesToNextLevel(currentLevel int) int {
	if currentLevel < 1 || currentLevel >= SkillMaxLevel {
		return 0
	}
	return SkillUsagePerLevel * currentLevel
}

func SkillUpgradeCost(currentLevel int) int {
	if currentLevel < 1 {
		return 1
	}
	return currentLevel
}

func SkillLevelPotency(level int) float64 {
	if level < 1 {
		level = 1
	}
	return 1.0 + skillLevelPotency*float64(level-1)
}

func SkillCost(id string) int {
	return 0
}

func SkillPrereq(id string) string {
	if s, ok := skillByID(id); ok {
		return s.Prereq
	}
	return ""
}

func SkillCastTime(s Skill) int {
	if s.CastTimeMs > 0 {
		return s.CastTimeMs
	}
	return 0
}

func SkillIsRanged(s Skill) bool {
	if s.ID == BasicAttack.ID {
		return false
	}
	if s.Ranged || s.UsesMagic || s.Heals || s.Buffs {
		return true
	}
	if strings.Contains(strings.ToLower(s.ID), "jump") || strings.Contains(strings.ToLower(s.ID), "saltus") {
		return true
	}
	return SkillCastTime(s) > 0
}

func SkillMaxRange(s Skill) float64 {
	if SkillTargetsAlly(s) {
		return AllySkillRange
	}
	if SkillIsRanged(s) {
		return SpellSkillRange
	}
	return 0
}

func FindSkill(id string) (Skill, bool) {
	switch id {
	case "reditus":
		id = SkillIDReturn
	case "porta", "teleport":
		id = SkillIDPort
	}
	if id == BasicAttack.ID {
		return BasicAttack, true
	}
	if id == ActionIDCapture {
		return SkillCapture, true
	}
	if id == ActionIDDodge {
		return SkillDodge, true
	}
	for _, s := range Catalog {
		if s.ID == id {
			return s, true
		}
	}
	return Skill{}, false
}

func ComputeStats(level int, equipped []Item) (hp, mp, str, mag, agi int) {
	hp, mp, str, mag, agi = BaseStats(level)
	for _, item := range equipped {
		str += item.Stats["str"]
		mag += item.Stats["mag"]
		agi += item.Stats["agi"]
		hp += item.Stats["hp"]
	}
	return
}

func WeaponSynergy(cat Category, weapon WeaponType) float64 {
	weapon = NormalizeWeapon(string(weapon))
	if (cat == CatSorcery && weapon == WeaponStaff) || (cat == CatDevotion && weapon == WeaponWand) {
		return weaponSynergyBonus
	}
	return 1.0
}

func BaseStats(level int) (hp, mp, str, mag, agi int) {
	g := level - 1
	return 115 + 18*g, 45 + 7*g, 11 + 2*g, 11 + 2*g, 14 + g
}

func XPToNext(level int) int {
	return level * 100
}

var starterNames = map[WeaponType]string{
	WeaponSword:    "Rusty Sword",
	WeaponHammer:   "Worn Hammer",
	WeaponAxe:      "Notched Axe",
	WeaponSpear:    "Rusty Spear",
	WeaponKatana:   "Dull Katana",
	WeaponStaff:    "Gnarled Staff",
	WeaponWand:     "Simple Wand",
	WeaponDagger:   "Chipped Daggers",
	WeaponKnuckles: "Wrapped Knuckles",
}

func isMagicWeapon(w WeaponType) bool {
	w = NormalizeWeapon(string(w))
	return w == WeaponStaff || w == WeaponWand
}

func StarterWeapon(w WeaponType) Item {
	w = NormalizeWeapon(string(w))
	stats := map[string]int{"str": 2}
	if isMagicWeapon(w) {
		stats = map[string]int{"mag": 2}
	}
	return Item{
		ID:     "starter-" + string(w),
		Name:   starterNames[w],
		Kind:   KindEquipment,
		Slot:   SlotWeapon,
		Type:   string(w),
		Rarity: RarityCommon,
		Level:  1,
		Stats:  stats,
	}
}

func StarterConsumables() []Item {
	return []Item{
		{ID: "starter-potio", Name: "Potio", Kind: KindConsumable, Consumable: "potio", Rarity: RarityCommon, Level: 1, Qty: 3},
	}
}

// StarterHousingGoods gives new characters a small decoration + crafting kit.
func StarterHousingGoods() []Item {
	return []Item{
		{ID: "starter-rug", Name: "Woven Rug", Kind: KindDecoration, Type: "decor_woven_rug", Rarity: RarityCommon, Level: 1, Qty: 1},
		{ID: "starter-lamp", Name: "Oil Lamp", Kind: KindDecoration, Type: "decor_oil_lamp", Rarity: RarityCommon, Level: 1, Qty: 1},
		{ID: "starter-crate", Name: "Storage Crate", Kind: KindDecoration, Type: "decor_storage_crate", Rarity: RarityCommon, Level: 1, Qty: 1},
		{ID: "starter-lumber", Name: "Lumber", Kind: KindCrafting, Type: "craft_lumber", Rarity: RarityCommon, Level: 1, Qty: 8},
		{ID: "starter-cloth", Name: "Cloth Scrap", Kind: KindCrafting, Type: "craft_cloth_scrap", Rarity: RarityCommon, Level: 1, Qty: 5},
		{ID: "starter-iron", Name: "Iron Nail", Kind: KindCrafting, Type: "craft_iron_nail", Rarity: RarityCommon, Level: 1, Qty: 12},
	}
}
