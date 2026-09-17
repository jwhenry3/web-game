package game

import "fmt"

// statusDef describes the composable behavior of a single StatusKind.
type statusDef struct {
	DisplayName    string
	DescribeFn     func(name string, s ActiveStatus, secs int) string
	OnTick         func(s ActiveStatus, tickPower int) (heal, damage int)
	DamageTakenMod func(potency float64) float64 // additive modifier to damage-taken multiplier
	DamageDealtMod func(potency float64) float64 // additive modifier to damage-dealt multiplier
	ATBMod         func(potency float64) float64 // additive modifier to ATB multiplier
	Stuns          bool
	IsShield       bool
}

var registry = map[StatusKind]*statusDef{}

func registerStatus(kind StatusKind, def *statusDef) {
	registry[kind] = def
}

func lookupDef(kind StatusKind) *statusDef {
	return registry[kind]
}

// descPct builds a "Name — ±N% label (Xs)" describe function.
func descPct(sign, label string) func(string, ActiveStatus, int) string {
	return func(name string, s ActiveStatus, secs int) string {
		return fmt.Sprintf("%s — %s%.0f%% %s (%ds)", name, sign, s.Potency*100, label, secs)
	}
}

// ---------- registrations ----------

func init() {
	registerStatus(StatusDefenseUp, &statusDef{
		DisplayName:    "Protect",
		DescribeFn:     descPct("−", "damage taken"),
		DamageTakenMod: func(p float64) float64 { return -p },
	})
	registerStatus(StatusDefenseDown, &statusDef{
		DisplayName:    "Weaken",
		DescribeFn:     descPct("+", "damage taken"),
		DamageTakenMod: func(p float64) float64 { return p },
	})
	registerStatus(StatusAttackUp, &statusDef{
		DisplayName:    "Boost",
		DescribeFn:     descPct("+", "damage dealt"),
		DamageDealtMod: func(p float64) float64 { return p },
	})
	registerStatus(StatusAttackDown, &statusDef{
		DisplayName:    "Sap",
		DescribeFn:     descPct("−", "damage dealt"),
		DamageDealtMod: func(p float64) float64 { return -p },
	})
	registerStatus(StatusShield, &statusDef{
		DisplayName: "Shield",
		IsShield:    true,
		DescribeFn: func(name string, s ActiveStatus, secs int) string {
			return fmt.Sprintf("%s — %d HP remaining (%ds)", name, s.ShieldHP, secs)
		},
	})
	registerStatus(StatusRegen, &statusDef{
		DisplayName: "Regen",
		DescribeFn: func(name string, _ ActiveStatus, secs int) string {
			return fmt.Sprintf("%s — restores HP each tick (%ds)", name, secs)
		},
		OnTick: func(s ActiveStatus, tickPower int) (int, int) {
			return max(1, int(float64(tickPower)*s.Potency)), 0
		},
	})
	registerStatus(StatusPoison, &statusDef{
		DisplayName: "Poison",
		DescribeFn: func(name string, _ ActiveStatus, secs int) string {
			return fmt.Sprintf("%s — damage each tick (%ds)", name, secs)
		},
		OnTick: func(s ActiveStatus, tickPower int) (int, int) {
			return 0, max(1, int(float64(tickPower)*s.Potency))
		},
	})
	registerStatus(StatusHaste, &statusDef{
		DisplayName: "Haste",
		DescribeFn: func(name string, s ActiveStatus, secs int) string {
			return fmt.Sprintf("%s — +%.0f%% action speed (%ds)", name, s.Potency*100, secs)
		},
		ATBMod: func(p float64) float64 { return p },
	})
	registerStatus(StatusStun, &statusDef{
		DisplayName: "Stun",
		Stuns:       true,
		DescribeFn: func(name string, _ ActiveStatus, secs int) string {
			return fmt.Sprintf("%s — cannot act (%ds)", name, secs)
		},
	})
}
