package game

import "strings"

// jobAbility defines one node in a job's four-skill tree.
type jobAbility struct {
	Suffix  string // appended to job id, e.g. "heavy_swing" -> war_heavy_swing
	Name    string
	Desc    string
	MPCost  int
	Power   float64
	Prereq  int // index of prior ability, -1 for root
	Heals   bool
	Buffs   bool
	Magic   bool
	Loot    bool
	Ranged  bool // jump / throw / missile: usable at range in realtime combat
}

var jobAbilityTrees = map[JobID][]jobAbility{
	JobWAR: {
		{Suffix: "heavy_swing", Name: "Heavy Swing", Desc: "A brutal overhead chop.", MPCost: 5, Power: 1.8},
		{Suffix: "berserk", Name: "Berserk", Desc: "Sacrifice defense for fury.", MPCost: 8, Power: 2.2, Prereq: 0},
		{Suffix: "war_cry", Name: "War Cry", Desc: "A rallying shout turned strike.", MPCost: 9, Power: 2.1, Prereq: 0},
		{Suffix: "rampage", Name: "Rampage", Desc: "An unstoppable flurry.", MPCost: 14, Power: 3.0, Prereq: 1},
	},
	JobMNK: {
		{Suffix: "combo", Name: "Combo", Desc: "A chained martial strike.", MPCost: 4, Power: 1.6},
		{Suffix: "boost", Name: "Boost", Desc: "Focus chi into the next blow.", MPCost: 7, Power: 2.0, Prereq: 0},
		{Suffix: "tackle", Name: "Tackle", Desc: "Close the gap with a shoulder rush.", MPCost: 8, Power: 2.2, Prereq: 0},
		{Suffix: "focus", Name: "Focus", Desc: "A disciplined finishing hit.", MPCost: 13, Power: 2.9, Prereq: 1},
	},
	JobPLD: {
		{Suffix: "shield_bash", Name: "Shield Bash", Desc: "Stun with the shield's rim.", MPCost: 6, Power: 1.7},
		{Suffix: "sentinel", Name: "Sentinel", Desc: "A guarded, crushing blow.", MPCost: 9, Power: 2.2, Prereq: 0},
		{Suffix: "cover", Name: "Cover", Desc: "Shield an ally from harm.", MPCost: 8, Power: 1.0, Prereq: 0, Buffs: true},
		{Suffix: "requiescat", Name: "Requiescat", Desc: "Holy steel in a single swing.", MPCost: 14, Power: 2.8, Prereq: 1, Magic: true},
	},
	JobDRK: {
		{Suffix: "last_resort", Name: "Last Resort", Desc: "Embrace darkness for power.", MPCost: 6, Power: 1.9},
		{Suffix: "drain", Name: "Drain", Desc: "Siphon life from a foe.", MPCost: 9, Power: 2.0, Prereq: 0, Magic: true},
		{Suffix: "absorb", Name: "Absorb", Desc: "Rip vitality with dark magic.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "weapon_bash", Name: "Weapon Bash", Desc: "A heavy, soul-rending hit.", MPCost: 14, Power: 3.1, Prereq: 1},
	},
	JobSAM: {
		{Suffix: "third_eye", Name: "Third Eye", Desc: "Read the foe, then counter.", MPCost: 5, Power: 1.7},
		{Suffix: "hasso", Name: "Hasso", Desc: "High guard into a fierce cut.", MPCost: 8, Power: 2.2, Prereq: 0},
		{Suffix: "meditate", Name: "Meditate", Desc: "Center the spirit, then strike.", MPCost: 7, Power: 2.0, Prereq: 0},
		{Suffix: "tachi", Name: "Tachi", Desc: "A masterful iaijutsu arc.", MPCost: 15, Power: 3.2, Prereq: 1},
	},
	JobDRG: {
		{Suffix: "jump", Name: "Jump", Desc: "Leap and impale from above.", MPCost: 6, Power: 1.9, Ranged: true},
		{Suffix: "high_jump", Name: "High Jump", Desc: "A soaring lance dive.", MPCost: 10, Power: 2.4, Prereq: 0, Ranged: true},
		{Suffix: "penta_thrust", Name: "Penta Thrust", Desc: "Five rapid spear thrusts.", MPCost: 11, Power: 2.3, Prereq: 0},
		{Suffix: "super_jump", Name: "Super Jump", Desc: "Vanish skyward, then crash down.", MPCost: 15, Power: 3.1, Prereq: 1, Ranged: true},
	},
	JobBLU: {
		{Suffix: "head_butt", Name: "Head Butt", Desc: "A borrowed blunt strike.", MPCost: 5, Power: 1.7},
		{Suffix: "screwdriver", Name: "Screwdriver", Desc: "A spiraling blue technique.", MPCost: 8, Power: 2.1, Prereq: 0},
		{Suffix: "actinic_burst", Name: "Actinic Burst", Desc: "Light magic from a learned foe.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "bludgeon", Name: "Bludgeon", Desc: "A brutal borrowed finisher.", MPCost: 14, Power: 2.9, Prereq: 1},
	},
	JobRUN: {
		{Suffix: "valiance", Name: "Valiance", Desc: "Runes guide a protective blow.", MPCost: 6, Power: 1.8, Magic: true},
		{Suffix: "pflug", Name: "Pflug", Desc: "Runic energy in a thrust.", MPCost: 9, Power: 2.2, Prereq: 0, Magic: true},
		{Suffix: "swordplay", Name: "Swordplay", Desc: "A disciplined runic slash.", MPCost: 8, Power: 2.0, Prereq: 0},
		{Suffix: "dimidiation", Name: "Dimidiation", Desc: "Runes erupt in a final cut.", MPCost: 14, Power: 3.0, Prereq: 1, Magic: true},
	},
	JobTHF: {
		{Suffix: "steal", Name: "Steal", Desc: "Slash and snatch.", MPCost: 4, Power: 1.4},
		{Suffix: "mug", Name: "Mug", Desc: "Strike and pilfer.", MPCost: 8, Power: 1.9, Prereq: 0, Loot: true},
		{Suffix: "sneak_attack", Name: "Sneak Attack", Desc: "Strike from the shadows.", MPCost: 9, Power: 2.2, Prereq: 0},
		{Suffix: "trick_attack", Name: "Trick Attack", Desc: "A deceptive finishing stab.", MPCost: 13, Power: 2.8, Prereq: 1},
	},
	JobNIN: {
		{Suffix: "utsusemi", Name: "Utsusemi", Desc: "Afterimage and a quick cut.", MPCost: 5, Power: 1.6},
		{Suffix: "katon", Name: "Katon", Desc: "Fire ninjutsu woven into a slash.", MPCost: 9, Power: 2.2, Prereq: 0, Magic: true},
		{Suffix: "hyoton", Name: "Hyoton", Desc: "Ice technique from the shadows.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "raiton", Name: "Raiton", Desc: "Lightning ninjutsu burst.", MPCost: 14, Power: 2.9, Prereq: 1, Magic: true},
	},
	JobDNC: {
		{Suffix: "flourish", Name: "Flourish", Desc: "A dance-step strike.", MPCost: 5, Power: 1.6},
		{Suffix: "drain_samba", Name: "Drain Samba", Desc: "Rhythm that saps the foe.", MPCost: 8, Power: 2.0, Prereq: 0},
		{Suffix: "haste_samba", Name: "Haste Samba", Desc: "Quick feet, quicker blades.", MPCost: 7, Power: 1.9, Prereq: 0},
		{Suffix: "waltz", Name: "Waltz", Desc: "A healing dance for allies.", MPCost: 10, Power: 2.2, Prereq: 0, Heals: true},
	},
	JobBST: {
		{Suffix: "charm", Name: "Charm", Desc: "Command beasts through force.", MPCost: 5, Power: 1.5},
		{Suffix: "gauge", Name: "Gauge", Desc: "Study the prey, then strike.", MPCost: 7, Power: 1.9, Prereq: 0},
		{Suffix: "reward", Name: "Reward", Desc: "A whistle and a swift hit.", MPCost: 8, Power: 2.0, Prereq: 0},
		{Suffix: "call_beast", Name: "Call Beast", Desc: "Your companion joins the blow.", MPCost: 13, Power: 2.7, Prereq: 1},
	},
	JobRNG: {
		{Suffix: "barrage", Name: "Barrage", Desc: "A rapid volley at close range.", MPCost: 6, Power: 1.8},
		{Suffix: "sharpshot", Name: "Sharpshot", Desc: "A precise critical shot.", MPCost: 9, Power: 2.3, Prereq: 0},
		{Suffix: "shadowbind", Name: "Shadowbind", Desc: "Pin the target, then strike.", MPCost: 8, Power: 2.1, Prereq: 0},
		{Suffix: "camouflage", Name: "Camouflage", Desc: "Vanish, aim, and release.", MPCost: 14, Power: 3.0, Prereq: 1},
	},
	JobCOR: {
		{Suffix: "quick_draw", Name: "Quick Draw", Desc: "Fan a card into a bullet.", MPCost: 6, Power: 1.7, Magic: true},
		{Suffix: "wild_card", Name: "Wild Card", Desc: "Luck turned to damage.", MPCost: 9, Power: 2.2, Prereq: 0, Magic: true},
		{Suffix: "fold", Name: "Fold", Desc: "Reset fate, then fire.", MPCost: 8, Power: 2.0, Prereq: 0},
		{Suffix: "roulette", Name: "Roulette", Desc: "A gambler's devastating shot.", MPCost: 14, Power: 3.0, Prereq: 1, Magic: true},
	},
	JobBLM: {
		{Suffix: "fire", Name: "Fire", Desc: "Scorch a foe with flames.", MPCost: 6, Power: 1.9, Magic: true},
		{Suffix: "thunder", Name: "Thunder", Desc: "Call down a bolt.", MPCost: 11, Power: 2.5, Prereq: 0, Magic: true},
		{Suffix: "blizzard", Name: "Blizzard", Desc: "A burst of killing frost.", MPCost: 10, Power: 2.4, Prereq: 0, Magic: true},
		{Suffix: "firaga", Name: "Firaga", Desc: "An inferno mastered through study.", MPCost: 16, Power: 3.2, Prereq: 2, Magic: true},
	},
	JobSMN: {
		{Suffix: "stone", Name: "Stone", Desc: "Earth magic from an avatar.", MPCost: 6, Power: 1.8, Magic: true},
		{Suffix: "aero", Name: "Aero", Desc: "Wind magic channeled outward.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "water", Name: "Water", Desc: "A crushing aqueous spell.", MPCost: 11, Power: 2.4, Prereq: 0, Magic: true},
		{Suffix: "meteor", Name: "Meteor", Desc: "Call a star from the heavens.", MPCost: 16, Power: 3.3, Prereq: 2, Magic: true},
	},
	JobBRD: {
		{Suffix: "minne", Name: "Minne", Desc: "A defensive battle hymn.", MPCost: 6, Power: 1.7, Magic: true, Buffs: true},
		{Suffix: "minuet", Name: "Minuet", Desc: "An offensive battle hymn.", MPCost: 9, Power: 2.2, Prereq: 0, Magic: true},
		{Suffix: "madrigal", Name: "Madrigal", Desc: "Sharp notes turned to harm.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "etude", Name: "Etude", Desc: "A virtuoso's finishing chord.", MPCost: 14, Power: 2.9, Prereq: 1, Magic: true},
	},
	JobGEO: {
		{Suffix: "indi_haste", Name: "Indi-Haste", Desc: "Geomancy that quickens allies.", MPCost: 6, Power: 1.6, Magic: true, Buffs: true},
		{Suffix: "geo_regen", Name: "Geo-Regen", Desc: "Healing geomancy on the field.", MPCost: 9, Power: 2.2, Prereq: 0, Magic: true, Heals: true},
		{Suffix: "indi_wilt", Name: "Indi-Wilt", Desc: "Sap strength from foes.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "geo_poison", Name: "Geo-Poison", Desc: "Toxic ley lines erupt.", MPCost: 14, Power: 3.0, Prereq: 2, Magic: true},
	},
	JobWHM: {
		{Suffix: "cure", Name: "Cure", Desc: "Restore an ally's HP.", MPCost: 6, Power: 2.2, Magic: true, Heals: true},
		{Suffix: "dia", Name: "Dia", Desc: "Holy light weakens a foe.", MPCost: 8, Power: 1.9, Prereq: 0, Magic: true},
		{Suffix: "curaga", Name: "Curaga", Desc: "A miracle of the devoted.", MPCost: 15, Power: 3.4, Prereq: 0, Magic: true, Heals: true},
		{Suffix: "banish", Name: "Banish", Desc: "Holy damage against undead.", MPCost: 14, Power: 2.8, Prereq: 1, Magic: true},
	},
	JobRDM: {
		{Suffix: "enfire", Name: "Enfire", Desc: "Enchant steel with flame.", MPCost: 6, Power: 1.8, Magic: true},
		{Suffix: "enthunder", Name: "Enthunder", Desc: "Enchant steel with lightning.", MPCost: 9, Power: 2.2, Prereq: 0, Magic: true},
		{Suffix: "enblizzard", Name: "Enblizzard", Desc: "Enchant steel with ice.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "phalanx", Name: "Phalanx", Desc: "Protective magic on an ally.", MPCost: 12, Power: 2.0, Prereq: 0, Magic: true, Buffs: true},
	},
	JobSCH: {
		{Suffix: "adloquium", Name: "Adloquium", Desc: "Strategic healing arts.", MPCost: 7, Power: 2.1, Magic: true, Heals: true},
		{Suffix: "accession", Name: "Accession", Desc: "Spread a spell's blessing.", MPCost: 9, Power: 2.0, Prereq: 0, Magic: true},
		{Suffix: "celerity", Name: "Celerity", Desc: "Swift casting, sharp effect.", MPCost: 10, Power: 2.3, Prereq: 0, Magic: true},
		{Suffix: "embrava", Name: "Embrava", Desc: "A scholar's perfected ward.", MPCost: 14, Power: 2.8, Prereq: 1, Magic: true, Buffs: true},
	},
	JobPUP: {
		{Suffix: "deploy", Name: "Deploy", Desc: "Send the automaton to strike.", MPCost: 5, Power: 1.7},
		{Suffix: "activate", Name: "Activate", Desc: "Wake the puppet for battle.", MPCost: 7, Power: 1.9, Prereq: 0},
		{Suffix: "repair", Name: "Repair", Desc: "Patch up an ally mid-fight.", MPCost: 9, Power: 2.0, Prereq: 0, Heals: true},
		{Suffix: "maneuver", Name: "Maneuver", Desc: "Overcharge the automaton's blow.", MPCost: 13, Power: 2.8, Prereq: 1},
	},
}

// Catalog lists every job-specific ability in the game.
var Catalog []Skill

func init() {
	Catalog = buildJobCatalog()
}

func buildJobCatalog() []Skill {
	var out []Skill
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

func skillID(job JobID, suffix string) string {
	return strings.ToLower(string(job)) + "_" + suffix
}

func castTimeForAbility(ab jobAbility) int {
	if ab.Magic || ab.Heals {
		return DefaultCastTimeMs
	}
	return 0
}

// RootSkillID returns the first ability in a job's skill tree (level-1 root).
func RootSkillID(job JobID) string {
	tree, ok := jobAbilityTrees[job]
	if !ok || len(tree) == 0 {
		return ""
	}
	return skillID(job, tree[0].Suffix)
}

// SkillsForJob returns abilities belonging to a single job.
func SkillsForJob(job JobID) []Skill {
	var out []Skill
	for _, s := range Catalog {
		if s.Job == job {
			out = append(out, s)
		}
	}
	return out
}

// ActiveJobs returns main and sub job ids when equipped.
func ActiveJobs(main JobID, sub JobID) []JobID {
	out := []JobID{main}
	if sub != "" && sub != main {
		out = append(out, sub)
	}
	return out
}
