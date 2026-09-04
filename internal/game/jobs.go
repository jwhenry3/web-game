package game

import (
	"fmt"
	"strings"
)

// Clara Mundi class system: nine cores, one primary weapon each, clear roles.
// Niche fantasy names are combo aliases (main+sub pairs), not separate trees.
//
// JobID is the persisted identifier (historical field name on profiles/wire).

type JobID string

type ClassID = JobID

type JobRole string

const (
	RoleTank    JobRole = "tank"
	RoleHealer  JobRole = "healer"
	RoleSupport JobRole = "support"
	RoleDPS     JobRole = "dps"
)

// CombatStyle is melee / magic / ranged emphasis for UI and filtering.
type CombatStyle string

const (
	StyleMelee  CombatStyle = "melee"
	StyleMagic  CombatStyle = "magic"
	StyleRanged CombatStyle = "ranged"
)

const (
	JobVAN JobID = "VAN" // Vanguard — Tank — sword
	JobAEG JobID = "AEG" // Aegis — Tank — hammer
	JobBRW JobID = "BRW" // Brawler — Melee DPS — knuckles
	JobRVR JobID = "RVR" // Reaver — Melee DPS — axe
	JobLNC JobID = "LNC" // Lancer — Melee/reach DPS — spear
	JobRON JobID = "RON" // Ronin — Melee DPS — katana
	JobHEX JobID = "HEX" // Hexwright — Magic DPS — staff
	JobSAN JobID = "SAN" // Sanctifier — Healer — wand
	JobCAN JobID = "CAN" // Cantor — Support — wand (shared implement family with healer; primary wand)
	JobCUT JobID = "CUT" // Cutpurse — Scout DPS — dagger
)

type JobProgress struct {
	Level int `json:"level"`
	XP    int `json:"xp"`
}

type JobDef struct {
	ID             JobID
	Name           string
	Abbr           string
	Role           JobRole
	Style          CombatStyle
	Category       Category
	Weapon         WeaponType
	AllowedWeapons []WeaponType
	HPMult         float64
	MPMult         float64
	STRMult        float64
	MAGMult        float64
	AGIMult        float64
}

type ComboAlias struct {
	ID    string
	Name  string
	Main  JobID
	Sub   JobID
	Blurb string
}

const (
	DefaultSubjobUnlockLevel = 5
	SubjobMinEffectiveLevel  = 1
	SubjobEffectRatio        = 0.5
)

var SubjobUnlockLevel = DefaultSubjobUnlockLevel

func CurrentSubjobUnlockLevel() int {
	if SubjobUnlockLevel < 1 {
		return DefaultSubjobUnlockLevel
	}
	return SubjobUnlockLevel
}

var Jobs = map[JobID]JobDef{
	JobVAN: {ID: JobVAN, Name: "Vanguard", Abbr: "VAN", Role: RoleTank, Style: StyleMelee, Category: CatSwordplay, Weapon: WeaponSword, HPMult: 1.18, STRMult: 1.08},
	JobAEG: {ID: JobAEG, Name: "Aegis", Abbr: "AEG", Role: RoleTank, Style: StyleMelee, Category: CatSwordplay, Weapon: WeaponHammer, HPMult: 1.20, STRMult: 1.06},
	JobBRW: {ID: JobBRW, Name: "Brawler", Abbr: "BRW", Role: RoleDPS, Style: StyleMelee, Category: CatSwordplay, Weapon: WeaponKnuckles, STRMult: 1.16, AGIMult: 1.10},
	JobRVR: {ID: JobRVR, Name: "Reaver", Abbr: "RVR", Role: RoleDPS, Style: StyleMelee, Category: CatSwordplay, Weapon: WeaponAxe, STRMult: 1.18, HPMult: 1.06},
	JobLNC: {ID: JobLNC, Name: "Lancer", Abbr: "LNC", Role: RoleDPS, Style: StyleRanged, Category: CatSwordplay, Weapon: WeaponSpear, STRMult: 1.14, AGIMult: 1.08},
	JobRON: {ID: JobRON, Name: "Ronin", Abbr: "RON", Role: RoleDPS, Style: StyleMelee, Category: CatSwordplay, Weapon: WeaponKatana, STRMult: 1.16, AGIMult: 1.08},
	JobHEX: {ID: JobHEX, Name: "Hexwright", Abbr: "HEX", Role: RoleDPS, Style: StyleMagic, Category: CatSorcery, Weapon: WeaponStaff, MAGMult: 1.22, MPMult: 1.10},
	JobSAN: {ID: JobSAN, Name: "Sanctifier", Abbr: "SAN", Role: RoleHealer, Style: StyleMagic, Category: CatDevotion, Weapon: WeaponWand, MAGMult: 1.12, MPMult: 1.16, HPMult: 1.04},
	JobCAN: {ID: JobCAN, Name: "Cantor", Abbr: "CAN", Role: RoleSupport, Style: StyleMagic, Category: CatSorcery, Weapon: WeaponWand, AllowedWeapons: []WeaponType{WeaponWand, WeaponStaff}, MAGMult: 1.08, AGIMult: 1.08, MPMult: 1.10},
	JobCUT: {ID: JobCUT, Name: "Cutpurse", Abbr: "CUT", Role: RoleDPS, Style: StyleMelee, Category: CatStealth, Weapon: WeaponDagger, AGIMult: 1.20, STRMult: 1.04},
}

// StartingJobs are available at character creation (2 per mother city).
var StartingJobs = []JobID{JobVAN, JobSAN, JobBRW, JobHEX, JobCUT, JobCAN}

// AdvancedJobs unlock later; still full cores with skill trees.
var AdvancedJobs = []JobID{JobAEG, JobRVR, JobLNC, JobRON}

var ComboAliases = []ComboAlias{
	{ID: "spellblade", Name: "Spellblade", Main: JobVAN, Sub: JobHEX, Blurb: "Sword and hexfire."},
	{ID: "shadeblade", Name: "Shadeblade", Main: JobCUT, Sub: JobHEX, Blurb: "Dagger and dark hexes."},
	{ID: "nightveil", Name: "Nightveil", Main: JobCUT, Sub: JobCAN, Blurb: "Scout cuts under song."},
	{ID: "sigilblade", Name: "Sigilblade", Main: JobVAN, Sub: JobCAN, Blurb: "Shield wall paced by hymns."},
	{ID: "leybinder", Name: "Leybinder", Main: JobHEX, Sub: JobCAN, Blurb: "Hexes woven with tempo."},
	{ID: "lorekeeper", Name: "Lorekeeper", Main: JobSAN, Sub: JobCAN, Blurb: "Healing craft and support arts."},
	{ID: "conjurer", Name: "Conjurer", Main: JobHEX, Sub: JobSAN, Blurb: "Arcane fury with restoration."},
	{ID: "reveler", Name: "Reveler", Main: JobCAN, Sub: JobCUT, Blurb: "Songs into sudden cuts."},
	{ID: "privateer", Name: "Privateer", Main: JobCUT, Sub: JobBRW, Blurb: "Harbor scrap and knuckles."},
	{ID: "beastward", Name: "Beastward", Main: JobBRW, Sub: JobCAN, Blurb: "Fists paced by rhythm."},
	{ID: "echoist", Name: "Echoist", Main: JobCAN, Sub: JobHEX, Blurb: "Hymns answered by hexfire."},
	{ID: "artificer", Name: "Artificer", Main: JobBRW, Sub: JobSAN, Blurb: "Muscle with emergency mending."},
	{ID: "marksman", Name: "Marksman", Main: JobCUT, Sub: JobLNC, Blurb: "Scout precision and reach."},
	{ID: "paladin", Name: "Wardkeeper", Main: JobAEG, Sub: JobSAN, Blurb: "Hammer and sacred wards."},
	{ID: "berserker", Name: "Berserker", Main: JobRVR, Sub: JobBRW, Blurb: "Axe and raw fists."},
	{ID: "duelist", Name: "Duelist", Main: JobRON, Sub: JobCUT, Blurb: "Katana guided by scout cunning."},
}

func AllJobs() []JobDef {
	order := append(append([]JobID{}, StartingJobs...), AdvancedJobs...)
	out := make([]JobDef, 0, len(order))
	for _, id := range order {
		if def, ok := Jobs[id]; ok {
			out = append(out, def)
		}
	}
	return out
}

func ValidJob(id JobID) bool {
	_, ok := Jobs[id]
	return ok
}

func ValidStartingJob(id JobID) bool {
	for _, j := range StartingJobs {
		if j == id {
			return true
		}
	}
	return false
}

func JobCategory(id JobID) Category {
	if def, ok := Jobs[id]; ok {
		return def.Category
	}
	return ""
}

func JobRoleOf(id JobID) JobRole {
	if def, ok := Jobs[id]; ok {
		return def.Role
	}
	return ""
}

func JobWeapon(id JobID) WeaponType {
	if def, ok := Jobs[id]; ok {
		return def.Weapon
	}
	return WeaponSword
}

func JobAllowedWeapons(id JobID) []WeaponType {
	def, ok := Jobs[id]
	if !ok {
		return []WeaponType{WeaponSword}
	}
	if len(def.AllowedWeapons) > 0 {
		return def.AllowedWeapons
	}
	return []WeaponType{def.Weapon}
}

func JobAllowsWeapon(id JobID, weapon WeaponType) bool {
	weapon = NormalizeWeapon(string(weapon))
	for _, w := range JobAllowedWeapons(id) {
		if NormalizeWeapon(string(w)) == weapon {
			return true
		}
	}
	return false
}

func FormatWeaponList(types []WeaponType) string {
	if len(types) == 0 {
		return "none"
	}
	names := make([]string, len(types))
	for i, t := range types {
		names[i] = string(t)
	}
	if len(names) == 1 {
		return names[0]
	}
	return strings.Join(names[:len(names)-1], ", ") + ", or " + names[len(names)-1]
}

func EquipWeaponDeniedMessage(job JobID, weapon WeaponType) string {
	name := string(job)
	if def, ok := Jobs[job]; ok {
		name = def.Name
	}
	return fmt.Sprintf("%s cannot equip %s weapons (allowed: %s).", name, weapon, FormatWeaponList(JobAllowedWeapons(job)))
}

func WeaponDefaultJob(w WeaponType) JobID {
	w = NormalizeWeapon(string(w))
	switch w {
	case WeaponHammer:
		return JobAEG
	case WeaponAxe:
		return JobRVR
	case WeaponSpear:
		return JobLNC
	case WeaponKatana:
		return JobRON
	case WeaponKnuckles:
		return JobBRW
	case WeaponDagger:
		return JobCUT
	case WeaponStaff:
		return JobHEX
	case WeaponWand:
		return JobSAN
	default:
		return JobVAN
	}
}

func AliasForCombo(main, sub JobID) (ComboAlias, bool) {
	if sub == "" {
		return ComboAlias{}, false
	}
	for _, a := range ComboAliases {
		if a.Main == main && a.Sub == sub {
			return a, true
		}
	}
	return ComboAlias{}, false
}

func ComboForAlias(id string) (ComboAlias, bool) {
	id = strings.ToLower(strings.TrimSpace(id))
	for _, a := range ComboAliases {
		if a.ID == id {
			return a, true
		}
	}
	return ComboAlias{}, false
}

func ComboDisplayName(main, sub JobID) string {
	if a, ok := AliasForCombo(main, sub); ok {
		return a.Name
	}
	mainName := JobName(main)
	if sub == "" {
		return mainName
	}
	return mainName + " / " + JobName(sub)
}

func SubjobEffectiveLevel(mainLevel, subLevel int) int {
	if subLevel < 1 {
		return 0
	}
	if mainLevel < 1 {
		mainLevel = 1
	}
	cap := mainLevel / 2
	effective := subLevel
	if effective > cap {
		effective = cap
	}
	if effective < SubjobMinEffectiveLevel {
		effective = SubjobMinEffectiveLevel
	}
	return effective
}

func applyJobMult(v int, mult float64) int {
	if mult <= 0 {
		mult = 1
	}
	return int(float64(v) * mult)
}

func JobBaseStats(job JobID, level int) (hp, mp, str, mag, agi int) {
	hp, mp, str, mag, agi = BaseStats(level)
	def, ok := Jobs[job]
	if !ok {
		return
	}
	hp = applyJobMult(hp, def.HPMult)
	mp = applyJobMult(mp, def.MPMult)
	str = applyJobMult(str, def.STRMult)
	mag = applyJobMult(mag, def.MAGMult)
	agi = applyJobMult(agi, def.AGIMult)
	return
}

func ComputeJobStats(mainJob JobID, mainLvl int, subJob JobID, subLvl int, equipped []Item) (hp, mp, str, mag, agi int) {
	mainHP, mainMP, mainStr, mainMag, mainAgi := JobBaseStats(mainJob, mainLvl)
	if subJob == "" || subLvl < 1 {
		hp, mp, str, mag, agi = mainHP, mainMP, mainStr, mainMag, mainAgi
	} else {
		subHP, subMP, subStr, subMag, subAgi := JobBaseStats(subJob, subLvl)
		hp = mainHP + subHP/2
		mp = mainMP + subMP/2
		str = mainStr + subStr/2
		mag = mainMag + subMag/2
		agi = mainAgi + subAgi/2
	}
	for _, item := range equipped {
		str += item.Stats["str"]
		mag += item.Stats["mag"]
		agi += item.Stats["agi"]
		hp += item.Stats["hp"]
	}
	return
}

func StarterWeaponForJob(job JobID) Item {
	return StarterWeapon(JobWeapon(job))
}

func JobComboKey(main, sub JobID) string {
	if sub == "" {
		return string(main)
	}
	return string(main) + "/" + string(sub)
}

func JobName(id JobID) string {
	if def, ok := Jobs[id]; ok {
		return def.Name
	}
	return string(id)
}
