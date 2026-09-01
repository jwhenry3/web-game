package game

// The Armory system replaces fixed jobs: every player can use any skill
// category, but using skills of a category (and attacking with its weapon
// type) earns proficiency points in it. Points raise potency in that
// category and unlock stronger skills at thresholds, so a character's
// "class" emerges from how they actually fight.

type WeaponType string

const (
	WeaponSword  WeaponType = "sword"
	WeaponDagger WeaponType = "dagger"
	WeaponStaff  WeaponType = "staff"
	WeaponMace   WeaponType = "mace"
)

var WeaponTypes = []WeaponType{WeaponSword, WeaponDagger, WeaponStaff, WeaponMace}

func ValidWeapon(w WeaponType) bool {
	for _, t := range WeaponTypes {
		if t == w {
			return true
		}
	}
	return false
}

type Category string

const (
	CatSwordplay Category = "swordplay" // heavy physical, sword
	CatStealth   Category = "stealth"   // fast physical, dagger
	CatSorcery   Category = "sorcery"   // offensive magic, staff-boosted
	CatDevotion  Category = "devotion"  // healing/holy magic, mace-boosted
)

var Categories = []Category{CatSwordplay, CatStealth, CatSorcery, CatDevotion}

// WeaponCategory is the proficiency category trained by basic attacks with
// each weapon type.
func WeaponCategory(w WeaponType) Category {
	switch w {
	case WeaponSword:
		return CatSwordplay
	case WeaponDagger:
		return CatStealth
	case WeaponStaff:
		return CatSorcery
	case WeaponMace:
		return CatDevotion
	}
	return ""
}

const (
	LevelCap = 20
	// Off-hand synergy: matching weapon boosts magic categories.
	weaponSynergyBonus = 1.15
	// Skill leveling: auto-unlock at job level; raise level through battle use.
	SkillMaxLevel      = 5
	SkillUsagePerLevel = 15
	skillLevelPotency  = 0.08 // +8% per level above 1
)

type Skill struct {
	ID          string
	Name        string
	Job         JobID
	Category    Category
	WeaponReq   WeaponType // "" = usable with any weapon
	MPCost      int
	Power       float64
	UsesMagic   bool
	Heals       bool
	Buffs       bool // targets a friendly player (protections, wards)
	LootBonus   bool // improves the battle's loot pool when used (Mug)
	Prereq      string
	Cost        int
	Description string
}

// BasicAttack is always available; it trains the equipped weapon's job category.
var BasicAttack = Skill{
	ID: "attack", Name: "Auto-attack", Power: 1.0,
	Description: "Toggle weapon swings. Auto-attack fills its own timer and does not spend the GCD.",
}

// Catalog is populated in job_skills.go (init) with per-job ability trees.

func skillByID(id string) (Skill, bool) {
	for _, s := range Catalog {
		if s.ID == id {
			return s, true
		}
	}
	return Skill{}, false
}

// SkillTier is the 0-based depth of a skill along its prereq chain.
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

// SkillUnlockLevel is the job level required to auto-learn a skill.
func SkillUnlockLevel(id string) int {
	if id == BasicAttack.ID {
		return 1
	}
	return 1 + SkillTier(id)*4
}

// SkillUsesToNextLevel is the cumulative battle uses required to reach the
// next skill level from the given level (0 when already maxed).
func SkillUsesToNextLevel(currentLevel int) int {
	if currentLevel < 1 || currentLevel >= SkillMaxLevel {
		return 0
	}
	return SkillUsagePerLevel * currentLevel
}

// SkillUpgradeCost is kept for tests that predate usage-only leveling.
func SkillUpgradeCost(currentLevel int) int {
	if currentLevel < 1 {
		return 1
	}
	return currentLevel
}

// SkillLevelPotency scales damage/healing by individual skill level.
func SkillLevelPotency(level int) float64 {
	if level < 1 {
		level = 1
	}
	return 1.0 + skillLevelPotency*float64(level-1)
}

// SkillCost is kept for UI hints (legacy).
func SkillCost(id string) int {
	return 0
}

// SkillPrereq returns the parent node that must be unlocked first.
func SkillPrereq(id string) string {
	if s, ok := skillByID(id); ok {
		return s.Prereq
	}
	return ""
}

// FindSkill looks up any skill (including the basic attack) by ID.
func FindSkill(id string) (Skill, bool) {
	if id == BasicAttack.ID {
		return BasicAttack, true
	}
	for _, s := range Catalog {
		if s.ID == id {
			return s, true
		}
	}
	return Skill{}, false
}

// ComputeStats derives full combat stats from level plus equipped gear.
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

// WeaponSynergy returns the bonus for pairing a magic category with its
// favored implement (staff for sorcery, mace for devotion).
func WeaponSynergy(cat Category, weapon WeaponType) float64 {
	if (cat == CatSorcery && weapon == WeaponStaff) || (cat == CatDevotion && weapon == WeaponMace) {
		return weaponSynergyBonus
	}
	return 1.0
}

// BaseStats derives level-based stats; identity now comes from gear and
// proficiency rather than a job class.
func BaseStats(level int) (hp, mp, str, mag, agi int) {
	g := level - 1
	return 115 + 18*g, 45 + 7*g, 11 + 2*g, 11 + 2*g, 14 + g
}

// XPToNext is the XP required to advance from the given level.
func XPToNext(level int) int {
	return level * 100
}

var starterNames = map[WeaponType]string{
	WeaponSword:  "Rusty Sword",
	WeaponDagger: "Chipped Dagger",
	WeaponStaff:  "Gnarled Staff",
	WeaponMace:   "Worn Mace",
}

// StarterWeapon is the guaranteed first piece of equipment for new heroes.
func StarterWeapon(w WeaponType) Item {
	stats := map[string]int{"str": 2}
	if w == WeaponStaff || w == WeaponMace {
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

// StarterConsumables is the pouch every new hero begins with.
func StarterConsumables() []Item {
	return []Item{
		{ID: "starter-potion", Name: "Potion", Kind: KindConsumable, Consumable: "potion", Rarity: RarityCommon, Level: 1, Qty: 3},
		{ID: "starter-ether", Name: "Ether", Kind: KindConsumable, Consumable: "ether", Rarity: RarityCommon, Level: 1, Qty: 1},
	}
}
