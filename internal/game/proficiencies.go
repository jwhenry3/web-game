package game

// Proficiencies are broad combat/magic disciplines that replace per-action
// skill levels. Using a skill trains the discipline it belongs to — swinging
// a sword trains Swords (or its broader handedness class), casting Fire
// Brand trains Elemental — and the proficiency level scales accuracy and
// potency for everything in that discipline.
type Proficiency string

const (
	ProfElemental Proficiency = "elemental"
	ProfHealing   Proficiency = "healing"
	ProfSupport   Proficiency = "support"
	ProfWeakening Proficiency = "weakening"
	ProfSwords    Proficiency = "swords"
	ProfMaces     Proficiency = "maces"
	ProfAxes      Proficiency = "axes"
	ProfSpears    Proficiency = "spears"
	ProfKatanas   Proficiency = "katanas"
	ProfStaves    Proficiency = "staves"
	ProfOneHanded Proficiency = "one_handed"
	ProfTwoHanded Proficiency = "two_handed"
	ProfShield    Proficiency = "shield"
	ProfOther     Proficiency = "other"
)

// ProficiencyList is the canonical display/order list for the broader
// discipline spectrum: magic schools first, then weapon disciplines.
var ProficiencyList = []Proficiency{
	ProfElemental, ProfHealing, ProfSupport, ProfWeakening,
	ProfSwords, ProfMaces, ProfAxes, ProfSpears, ProfKatanas, ProfStaves,
	ProfOneHanded, ProfTwoHanded, ProfShield, ProfOther,
}

const (
	// ProfMaxLevel caps every discipline.
	ProfMaxLevel = 20
	// ProfGrowthMin/ProfGrowthSpan bound the per-execution growth roll in
	// hundredths of a point: each use rolls 10–40 (0.10–0.40) toward the
	// next level. Buffs may later multiply this roll; nothing does yet.
	ProfGrowthMin  = 10
	ProfGrowthSpan = 31 // 10..40 inclusive
)

// ProfExpToNext returns the growth (in hundredths) needed to advance from
// level to level+1. Level 0 is untrained; the curve is linear so higher
// disciplines take proportionally more use.
func ProfExpToNext(level int) int {
	return (level + 1) * 100
}

// ProfAccuracyBonus returns the flat hit-chance bonus a proficiency level
// grants: +1% per level, on top of the dex contest.
func ProfAccuracyBonus(level int) float64 {
	return float64(level) * 0.01
}

// WeaponProficiency maps a weapon type to the discipline it trains. Weapon
// types with their own school (swords, maces, axes, spears, katanas, staves)
// train it; the remaining one-handed implements share the one_handed
// discipline; anything unmapped falls into other.
func WeaponProficiency(w WeaponType) Proficiency {
	switch w {
	case WeaponSword:
		return ProfSwords
	case WeaponHammer:
		return ProfMaces
	case WeaponAxe:
		return ProfAxes
	case WeaponSpear:
		return ProfSpears
	case WeaponKatana:
		return ProfKatanas
	case WeaponStaff:
		return ProfStaves
	case WeaponDagger, WeaponKnuckles, WeaponWand:
		return ProfOneHanded
	default:
		return ProfOther
	}
}

// MagicProficiency classifies a magic skill into its school: heals are
// healing, debuffs on the target are weakening, self/ally boons are support,
// and raw offensive magic is elemental.
func MagicProficiency(s Skill) Proficiency {
	if skillAspects(s)[AspectHeal] {
		return ProfHealing
	}
	for _, eff := range SkillEffects(s) {
		if eff.Kind == EffectStatus && eff.Status != nil && !eff.Status.OnCaster {
			return ProfWeakening
		}
	}
	if s.Buffs || skillAspects(s)[AspectBuff] {
		return ProfSupport
	}
	return ProfElemental
}

// SkillProficiency resolves the discipline a skill trains (and draws power
// from) when executed with the given weapon. Passives, world skills, and the
// dodge dash train nothing and return "".
func SkillProficiency(s Skill, weapon WeaponType) Proficiency {
	if s.Passive != nil || s.WorldOnly || s.ID == ActionIDDodge {
		return ""
	}
	if s.UsesMagic || s.Heals || s.Buffs {
		return MagicProficiency(s)
	}
	return WeaponProficiency(weapon)
}
