package game

// FFXI-style job system: each job levels independently. Players equip a main
// job and (once unlocked) a subjob whose stats and abilities contribute at
// half strength, capped at floor(main_level / 2).

type JobID string

const (
	JobWAR JobID = "WAR"
	JobMNK JobID = "MNK"
	JobWHM JobID = "WHM"
	JobBLM JobID = "BLM"
	JobRDM JobID = "RDM"
	JobTHF JobID = "THF"
	JobPLD JobID = "PLD"
	JobDRK JobID = "DRK"
	JobBST JobID = "BST"
	JobBRD JobID = "BRD"
	JobRNG JobID = "RNG"
	JobSAM JobID = "SAM"
	JobNIN JobID = "NIN"
	JobDRG JobID = "DRG"
	JobSMN JobID = "SMN"
	JobBLU JobID = "BLU"
	JobCOR JobID = "COR"
	JobPUP JobID = "PUP"
	JobDNC JobID = "DNC"
	JobSCH JobID = "SCH"
	JobGEO JobID = "GEO"
	JobRUN JobID = "RUN"
)

// JobProgress is per-job level and experience.
type JobProgress struct {
	Level int `json:"level"`
	XP    int `json:"xp"`
}

type JobDef struct {
	ID       JobID
	Name     string
	Abbr     string
	Category Category
	Weapon   WeaponType
	// Multipliers applied to BaseStats for this job at full strength.
	HPMult  float64
	MPMult  float64
	STRMult float64
	MAGMult float64
	AGIMult float64
}

const (
	SubjobUnlockLevel     = 5
	SubjobMinEffectiveLevel = 1 // sub always contributes at least Lv 1 when equipped
	SubjobEffectRatio     = 0.5
)

var Jobs = map[JobID]JobDef{
	JobWAR: {ID: JobWAR, Name: "Warrior", Abbr: "WAR", Category: CatSwordplay, Weapon: WeaponSword, HPMult: 1.12, STRMult: 1.15},
	JobMNK: {ID: JobMNK, Name: "Monk", Abbr: "MNK", Category: CatSwordplay, Weapon: WeaponSword, STRMult: 1.12, AGIMult: 1.10},
	JobPLD: {ID: JobPLD, Name: "Paladin", Abbr: "PLD", Category: CatSwordplay, Weapon: WeaponSword, HPMult: 1.10, STRMult: 1.08, MAGMult: 0.95},
	JobDRK: {ID: JobDRK, Name: "Dark Knight", Abbr: "DRK", Category: CatSwordplay, Weapon: WeaponSword, HPMult: 1.08, STRMult: 1.12, MAGMult: 1.05},
	JobSAM: {ID: JobSAM, Name: "Samurai", Abbr: "SAM", Category: CatSwordplay, Weapon: WeaponSword, STRMult: 1.18, AGIMult: 1.05},
	JobDRG: {ID: JobDRG, Name: "Dragoon", Abbr: "DRG", Category: CatSwordplay, Weapon: WeaponSword, STRMult: 1.14, AGIMult: 1.08},
	JobBLU: {ID: JobBLU, Name: "Blue Mage", Abbr: "BLU", Category: CatSwordplay, Weapon: WeaponSword, MAGMult: 1.10, STRMult: 1.05},
	JobRUN: {ID: JobRUN, Name: "Rune Fencer", Abbr: "RUN", Category: CatSwordplay, Weapon: WeaponSword, HPMult: 1.06, STRMult: 1.10, MAGMult: 1.05},

	JobTHF: {ID: JobTHF, Name: "Thief", Abbr: "THF", Category: CatStealth, Weapon: WeaponDagger, AGIMult: 1.18, STRMult: 1.02},
	JobNIN: {ID: JobNIN, Name: "Ninja", Abbr: "NIN", Category: CatStealth, Weapon: WeaponDagger, AGIMult: 1.14, STRMult: 1.08},
	JobDNC: {ID: JobDNC, Name: "Dancer", Abbr: "DNC", Category: CatStealth, Weapon: WeaponDagger, AGIMult: 1.16, STRMult: 1.04},
	JobBST: {ID: JobBST, Name: "Beastmaster", Abbr: "BST", Category: CatStealth, Weapon: WeaponDagger, AGIMult: 1.08, STRMult: 1.06},
	JobRNG: {ID: JobRNG, Name: "Ranger", Abbr: "RNG", Category: CatStealth, Weapon: WeaponDagger, AGIMult: 1.12, STRMult: 1.10},
	JobCOR: {ID: JobCOR, Name: "Corsair", Abbr: "COR", Category: CatStealth, Weapon: WeaponDagger, AGIMult: 1.10, MAGMult: 1.05},

	JobBLM: {ID: JobBLM, Name: "Black Mage", Abbr: "BLM", Category: CatSorcery, Weapon: WeaponStaff, MAGMult: 1.20, MPMult: 1.10},
	JobSMN: {ID: JobSMN, Name: "Summoner", Abbr: "SMN", Category: CatSorcery, Weapon: WeaponStaff, MAGMult: 1.16, MPMult: 1.14, HPMult: 0.95},
	JobBRD: {ID: JobBRD, Name: "Bard", Abbr: "BRD", Category: CatSorcery, Weapon: WeaponStaff, MAGMult: 1.08, AGIMult: 1.08, MPMult: 1.08},
	JobGEO: {ID: JobGEO, Name: "Geomancer", Abbr: "GEO", Category: CatSorcery, Weapon: WeaponStaff, MAGMult: 1.14, MPMult: 1.06},

	JobWHM: {ID: JobWHM, Name: "White Mage", Abbr: "WHM", Category: CatDevotion, Weapon: WeaponMace, MAGMult: 1.12, MPMult: 1.14, HPMult: 1.04},
	JobRDM: {ID: JobRDM, Name: "Red Mage", Abbr: "RDM", Category: CatDevotion, Weapon: WeaponMace, MAGMult: 1.10, STRMult: 1.06, MPMult: 1.08},
	JobSCH: {ID: JobSCH, Name: "Scholar", Abbr: "SCH", Category: CatDevotion, Weapon: WeaponMace, MAGMult: 1.14, MPMult: 1.12},
	JobPUP: {ID: JobPUP, Name: "Puppetmaster", Abbr: "PUP", Category: CatDevotion, Weapon: WeaponMace, MAGMult: 1.08, STRMult: 1.06, HPMult: 1.02},
}

// StartingJobs are the six jobs a new hero may choose (classic FFXI starters).
var StartingJobs = []JobID{JobWAR, JobMNK, JobWHM, JobBLM, JobRDM, JobTHF}

func AllJobs() []JobDef {
	out := make([]JobDef, 0, len(Jobs))
	for _, id := range []JobID{
		JobWAR, JobMNK, JobWHM, JobBLM, JobRDM, JobTHF,
		JobPLD, JobDRK, JobBST, JobBRD, JobRNG, JobSAM,
		JobNIN, JobDRG, JobSMN, JobBLU, JobCOR, JobPUP,
		JobDNC, JobSCH, JobGEO, JobRUN,
	} {
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

func JobWeapon(id JobID) WeaponType {
	if def, ok := Jobs[id]; ok {
		return def.Weapon
	}
	return WeaponSword
}

// WeaponDefaultJob maps a legacy starting weapon to a default main job.
func WeaponDefaultJob(w WeaponType) JobID {
	switch w {
	case WeaponDagger:
		return JobTHF
	case WeaponStaff:
		return JobBLM
	case WeaponMace:
		return JobWHM
	default:
		return JobWAR
	}
}

// SubjobEffectiveLevel is the classic FFXI cap: min(sub level, floor(main/2)),
// floored at SubjobMinEffectiveLevel so a subjob always contributes something.
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

// JobXPSplit divides battle XP between main and sub jobs proportional to their
// effective levels. With no subjob, all XP goes to main.
func JobXPSplit(totalXP, mainLvl, subEffectiveLvl int) (mainXP, subXP int) {
	if totalXP < 1 {
		return 0, 0
	}
	if subEffectiveLvl < 1 {
		return totalXP, 0
	}
	if mainLvl < 1 {
		mainLvl = 1
	}
	sum := mainLvl + subEffectiveLvl
	mainXP = totalXP * mainLvl / sum
	subXP = totalXP - mainXP
	if mainXP < 1 {
		mainXP = 1
		subXP = totalXP - mainXP
	}
	return mainXP, subXP
}

func applyJobMult(v int, mult float64) int {
	if mult <= 0 {
		mult = 1
	}
	return int(float64(v) * mult)
}

// JobBaseStats returns combat stats for a single job at the given level.
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

// ComputeJobStats combines main and subjob stats (sub at half) plus gear.
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

// StarterWeaponForJob returns the guaranteed first weapon for a new hero.
func StarterWeaponForJob(job JobID) Item {
	return StarterWeapon(JobWeapon(job))
}

// JobComboKey identifies a main/sub loadout slot. Subjob omitted when empty.
func JobComboKey(main, sub JobID) string {
	if sub == "" {
		return string(main)
	}
	return string(main) + "/" + string(sub)
}
