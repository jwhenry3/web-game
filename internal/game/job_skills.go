package game

import "strings"

type jobAbility struct {
	Suffix string
	Name   string
	Desc   string
	MPCost int
	Power  float64
	Prereq int
	Heals  bool
	Buffs  bool
	Magic  bool
	Loot   bool
	Ranged bool
}

var jobAbilityTrees = map[JobID][]jobAbility{
	// Tank — sword
	JobVAN: {
		{Suffix: "cuneus", Name: "Wedge Guard", Desc: "Pin the foe's attention with a steel wedge.", MPCost: 5, Power: 1.6},
		{Suffix: "clamor_castra", Name: "War Cry", Desc: "A shout that fortifies your stance.", MPCost: 8, Power: 1.8, Prereq: 0, Buffs: true},
		{Suffix: "furor_linea", Name: "Bulwark Advance", Desc: "Advance behind heavy guard.", MPCost: 9, Power: 2.0, Prereq: 0},
		{Suffix: "impetus_acies", Name: "Line Hold", Desc: "An unstoppable rush into an iron stance.", MPCost: 14, Power: 2.6, Prereq: 1},
	},
	// Tank — hammer
	JobAEG: {
		{Suffix: "umbo", Name: "Shield Bash", Desc: "Slam the hammer boss into the foe.", MPCost: 6, Power: 1.7},
		{Suffix: "custodia_ferrea", Name: "Iron Guard", Desc: "A guarded smash that holds the line.", MPCost: 9, Power: 2.2, Prereq: 0},
		{Suffix: "tegimen", Name: "Cover Ally", Desc: "Extend your ward over an ally.", MPCost: 8, Power: 1.0, Prereq: 0, Buffs: true},
		{Suffix: "lumen_ferrum", Name: "Holy Edge", Desc: "Sacred light along the hammer's face.", MPCost: 14, Power: 2.8, Prereq: 1, Magic: true},
	},
	// Melee DPS — knuckles
	JobBRW: {
		{Suffix: "pugnum", Name: "Fist Chain", Desc: "A chained fist that never loses rhythm.", MPCost: 4, Power: 1.7},
		{Suffix: "robur_manus", Name: "Power Fist", Desc: "Coil strength into the next blow.", MPCost: 7, Power: 2.1, Prereq: 0},
		{Suffix: "humerus", Name: "Shoulder Charge", Desc: "Close distance with a punishing charge.", MPCost: 8, Power: 2.3, Prereq: 0},
		{Suffix: "intentio_pugna", Name: "Focus Blow", Desc: "A finishing strike born of discipline.", MPCost: 13, Power: 3.0, Prereq: 1},
	},
	// Melee DPS — axe
	JobRVR: {
		{Suffix: "secare", Name: "Cleaving Cut", Desc: "A heavy axe cut through guard.", MPCost: 5, Power: 1.9},
		{Suffix: "ruina", Name: "Ruin Swing", Desc: "Commit fully to a ruinous swing.", MPCost: 9, Power: 2.4, Prereq: 0},
		{Suffix: "fractura", Name: "Bone Splitter", Desc: "Split armor and bone alike.", MPCost: 10, Power: 2.5, Prereq: 0},
		{Suffix: "tempestas_ferri", Name: "Iron Storm", Desc: "A storm of axe blows.", MPCost: 15, Power: 3.2, Prereq: 1},
	},
	// Reach / ranged melee — spear
	JobLNC: {
		{Suffix: "saltus_hasta", Name: "Spear Leap", Desc: "Leap and drive the spear home.", MPCost: 6, Power: 1.9, Ranged: true},
		{Suffix: "saltus_caelum", Name: "Sky Dive", Desc: "A soaring dive from above.", MPCost: 10, Power: 2.4, Prereq: 0, Ranged: true},
		{Suffix: "quinque_ictus", Name: "Five Thrusts", Desc: "Five rapid thrusts in one breath.", MPCost: 11, Power: 2.3, Prereq: 0},
		{Suffix: "saltus_maximus", Name: "Crash Dive", Desc: "Vanish upward, then crash down.", MPCost: 15, Power: 3.1, Prereq: 1, Ranged: true},
	},
	// Melee DPS — katana
	JobRON: {
		{Suffix: "oculus_ferrum", Name: "Read Opening", Desc: "Read the opening, then answer it.", MPCost: 5, Power: 1.7},
		{Suffix: "altum_custos", Name: "High Guard", Desc: "High guard into a fierce cut.", MPCost: 8, Power: 2.2, Prereq: 0},
		{Suffix: "quies_icta", Name: "Still Strike", Desc: "Still the mind, then strike true.", MPCost: 7, Power: 2.0, Prereq: 0},
		{Suffix: "arcus_gladii", Name: "Blade Arc", Desc: "A masterful drawn arc of steel.", MPCost: 15, Power: 3.2, Prereq: 1},
	},
	// Scout DPS — dagger
	JobCUT: {
		{Suffix: "surripere", Name: "Cut and Grab", Desc: "Cut and snatch in one motion.", MPCost: 4, Power: 1.5},
		{Suffix: "praeda_manus", Name: "Purse Strike", Desc: "Strike hard enough to loosen purses.", MPCost: 8, Power: 2.0, Prereq: 0, Loot: true},
		{Suffix: "insidiae_nox", Name: "Shadow Stab", Desc: "A stab from just outside the light.", MPCost: 9, Power: 2.3, Prereq: 0},
		{Suffix: "dolus_finis", Name: "Feint Thrust", Desc: "A deceptive finishing thrust.", MPCost: 13, Power: 2.9, Prereq: 1},
	},
	// Magic DPS — staff
	JobHEX: {
		{Suffix: "ignis_hex", Name: "Fire Brand", Desc: "Brand the foe with living flame.", MPCost: 6, Power: 2.0, Magic: true},
		{Suffix: "fulmen_hex", Name: "Thunder Brand", Desc: "Call a bolt through the mark.", MPCost: 11, Power: 2.6, Prereq: 0, Magic: true},
		{Suffix: "gelu_hex", Name: "Frost Brand", Desc: "Freeze the brand into killing frost.", MPCost: 10, Power: 2.5, Prereq: 0, Magic: true},
		{Suffix: "ignis_maius", Name: "Inferno", Desc: "Unleash the brand as a roaring inferno.", MPCost: 16, Power: 3.3, Prereq: 2, Magic: true},
	},
	// Healer — wand
	JobSAN: {
		{Suffix: "sanare", Name: "Heal", Desc: "Knit an ally's wounds with sacred craft.", MPCost: 6, Power: 2.3, Magic: true, Heals: true},
		{Suffix: "lux_mitis", Name: "Holy Light", Desc: "Soft light that weakens hostile flesh.", MPCost: 8, Power: 1.8, Prereq: 0, Magic: true},
		{Suffix: "sanare_maius", Name: "Greater Heal", Desc: "A greater miracle of restoration.", MPCost: 15, Power: 3.5, Prereq: 0, Magic: true, Heals: true},
		{Suffix: "expello_impurum", Name: "Banish", Desc: "Drive unclean presence from the field.", MPCost: 14, Power: 2.7, Prereq: 1, Magic: true},
	},
	// Support — wand
	JobCAN: {
		{Suffix: "carmen_tutus", Name: "Hymn of Resolve", Desc: "A hymn that hardens allies' resolve.", MPCost: 6, Power: 1.5, Magic: true, Buffs: true},
		{Suffix: "carmen_ferox", Name: "Hymn of Fury", Desc: "A hymn that sharpens the party's attack.", MPCost: 9, Power: 1.8, Prereq: 0, Magic: true, Buffs: true},
		{Suffix: "carmen_acutus", Name: "Cutting Notes", Desc: "Notes that cut as keenly as steel.", MPCost: 10, Power: 2.2, Prereq: 0, Magic: true},
		{Suffix: "studium_finale", Name: "Finale", Desc: "A virtuoso chord that ends the phrase.", MPCost: 14, Power: 2.8, Prereq: 1, Magic: true},
	},
}

func init() {
	Catalog = buildJobCatalog()
}

func buildJobCatalog() []Skill {
	out := []Skill{SkillReturn, SkillPort, SkillCamp}
	for _, def := range AllJobs() {
		tree, ok := jobAbilityTrees[def.ID]
		if !ok {
			continue
		}
		ids := make([]string, len(tree))
		for i, ab := range tree {
			id := skillID(def.ID, ab.Suffix)
			ids[i] = id
			prereq := ""
			prereqIdx := ab.Prereq
			if i == 0 && prereqIdx == 0 {
				prereqIdx = -1
			}
			if prereqIdx >= 0 && prereqIdx < len(ids) {
				prereq = ids[prereqIdx]
			}
			out = append(out, Skill{
				ID:          id,
				Name:        ab.Name,
				Job:         def.ID,
				Category:    def.Category,
				WeaponReq:   def.Weapon,
				MPCost:      ab.MPCost,
				Power:       ab.Power,
				UsesMagic:   ab.Magic,
				Heals:       ab.Heals,
				Buffs:       ab.Buffs,
				LootBonus:   ab.Loot,
				Ranged:      ab.Ranged,
				Prereq:      prereq,
				Description: ab.Desc,
				CastTimeMs:  castTimeForAbility(ab),
			})
		}
	}
	return out
}

func castTimeForAbility(ab jobAbility) int {
	if ab.Magic || ab.Heals {
		return DefaultCastTimeMs
	}
	return 0
}

func skillID(job JobID, suffix string) string {
	return strings.ToLower(string(job)) + "_" + suffix
}

func RootSkillID(job JobID) string {
	tree, ok := jobAbilityTrees[job]
	if !ok || len(tree) == 0 {
		return ""
	}
	return skillID(job, tree[0].Suffix)
}

func JobSkillIDs(job JobID) []string {
	tree, ok := jobAbilityTrees[job]
	if !ok {
		return nil
	}
	out := make([]string, len(tree))
	for i, ab := range tree {
		out[i] = skillID(job, ab.Suffix)
	}
	return out
}

func SkillsForJob(job JobID) []Skill {
	var out []Skill
	for _, s := range Catalog {
		if s.Job == job {
			out = append(out, s)
		}
	}
	return out
}

func ActiveJobs(main JobID, sub JobID) []JobID {
	out := []JobID{main}
	if sub != "" && sub != main {
		out = append(out, sub)
	}
	return out
}

type JobSkillTreeNode struct {
	SkillID       string `json:"skill_id"`
	PrereqSkillID string `json:"prereq_skill_id,omitempty"`
}

func JobSkillTree(job JobID) []JobSkillTreeNode {
	tree, ok := jobAbilityTrees[job]
	if !ok {
		return nil
	}
	ids := make([]string, len(tree))
	for i, ab := range tree {
		ids[i] = skillID(job, ab.Suffix)
	}
	out := make([]JobSkillTreeNode, len(tree))
	for i, ab := range tree {
		prereqIdx := ab.Prereq
		if i == 0 && prereqIdx == 0 {
			prereqIdx = -1
		}
		prereq := ""
		if prereqIdx >= 0 && prereqIdx < len(ids) {
			prereq = ids[prereqIdx]
		}
		out[i] = JobSkillTreeNode{SkillID: ids[i], PrereqSkillID: prereq}
	}
	return out
}
