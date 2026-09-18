package game

import "math"

// Stats is the five-affinity combat block shared by players, NPCs, and pets.
// Str scales physical damage; Dex scales accuracy and attack speed; Vit adds
// physical defense and max HP; Int scales elemental damage and max MP; MD adds
// magic defense and scales healing.
type Stats struct {
	HP, MP                 int
	Str, Dex, Vit, Int, MD int
}

// Stat keys as they appear in skill effects, item stats, and serialized data.
const (
	StatStr = "str"
	StatDex = "dex"
	StatVit = "vit"
	StatInt = "int"
	StatMD  = "md"
)

// StatKeys is the full affinity stat vocabulary for validation and editors.
var StatKeys = []string{StatStr, StatDex, StatVit, StatInt, StatMD}

// legacyStatKeys maps pre-affinity stat names onto the new vocabulary so old
// catalogs, items, and saves keep working.
var legacyStatKeys = map[string]string{
	"mag": StatInt,
	"agi": StatDex,
}

// NormalizeStatKey maps a legacy stat key onto the affinity vocabulary. Unknown
// keys pass through unchanged so validation still catches real typos.
func NormalizeStatKey(key string) string {
	if mapped, ok := legacyStatKeys[key]; ok {
		return mapped
	}
	return key
}

// ValidStatKey reports whether key names a combat stat (legacy aliases count).
func ValidStatKey(key string) bool {
	switch NormalizeStatKey(key) {
	case StatStr, StatDex, StatVit, StatInt, StatMD:
		return true
	}
	return false
}

const (
	vitPoolFactor = 8 // HP granted per point of vit
	intPoolFactor = 4 // MP granted per point of int
)

// AddItemStats folds an item's stat map into the block, normalizing legacy
// keys. vit/int gear grows the HP/MP pools the same way base stats do.
func (s *Stats) AddItemStats(stats map[string]int) {
	for k, v := range stats {
		switch NormalizeStatKey(k) {
		case StatStr:
			s.Str += v
		case StatDex:
			s.Dex += v
		case StatVit:
			s.Vit += v
			s.HP += v * vitPoolFactor
		case StatInt:
			s.Int += v
			s.MP += v * intPoolFactor
		case StatMD:
			s.MD += v
		case "hp":
			s.HP += v
		case "mp":
			s.MP += v
		}
	}
}

// Damage classes decide which defensive stat mitigates an effect.
const (
	ClassPhysical  = "physical"  // mitigated by vit
	ClassElemental = "elemental" // mitigated by md
	ClassTrue      = "true"      // unmitigated
)

// DamageClassForStat classifies a scaling stat: int-scaled effects are
// elemental, everything else is physical.
func DamageClassForStat(stat string) string {
	if NormalizeStatKey(stat) == StatInt {
		return ClassElemental
	}
	return ClassPhysical
}

// HitChance returns the probability an attack lands given attacker and
// defender dex. Equal dex hits 85% of the time; each point of dex advantage
// shifts the odds by 1%, capping at certainty 15 points up.
func HitChance(atkDex, defDex int) float64 {
	c := 0.85 + 0.01*float64(atkDex-defDex)
	return math.Max(0.5, math.Min(1.0, c))
}

// Mitigation returns the fraction of incoming damage a defense stat absorbs.
// Diminishing returns: def 10 ≈ 8%, def 30 ≈ 20%, def 60 ≈ 33%.
func Mitigation(def int) float64 {
	if def <= 0 {
		return 0
	}
	return float64(def) / (float64(def) + 120)
}

// AttackSpeedScale returns the cooldown multiplier dex grants to attack
// cadence: each point removes half a percent, capped at 35% faster.
func AttackSpeedScale(dex int) float64 {
	return 1 - math.Min(0.35, float64(max(dex, 0))*0.005)
}

// DefenseFor returns the stat that mitigates the given damage class.
func (s Stats) DefenseFor(class string) int {
	switch class {
	case ClassElemental:
		return s.MD
	case ClassPhysical:
		return s.Vit
	}
	return 0
}
