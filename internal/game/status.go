package game

import "fmt"

// StatusKind identifies a combat buff or debuff.
type StatusKind string

const (
	StatusDefenseUp   StatusKind = "defense_up"
	StatusDefenseDown StatusKind = "defense_down"
	StatusAttackUp    StatusKind = "attack_up"
	StatusAttackDown  StatusKind = "attack_down"
	StatusShield      StatusKind = "shield"
	StatusRegen       StatusKind = "regen"
	StatusPoison      StatusKind = "poison"
	StatusHaste       StatusKind = "haste"
	StatusStun        StatusKind = "stun"
)

// StatusEffectDef is applied when a skill resolves successfully.
type StatusEffectDef struct {
	Kind     StatusKind
	Duration int     // battle ticks (200ms each)
	Potency  float64 // meaning depends on kind
	OnCaster bool    // apply to actor instead of skill target
}

// ActiveStatus is a live buff/debuff on a combatant.
type ActiveStatus struct {
	Kind      StatusKind
	Source    string
	Remaining int
	Potency   float64
	ShieldHP  int // remaining absorb for shield
}

// StatusSnapshot is the wire-safe view of an active status.
type StatusSnapshot struct {
	Kind      string  `json:"kind"`
	Potency   float64 `json:"potency"`
	Remaining int     `json:"remaining"`
	ShieldHP  int     `json:"shield_hp,omitempty"`
}

func (s ActiveStatus) Snapshot() StatusSnapshot {
	return StatusSnapshot{
		Kind:      string(s.Kind),
		Potency:   s.Potency,
		Remaining: s.Remaining,
		ShieldHP:  s.ShieldHP,
	}
}

func Snapshots(list []ActiveStatus) []StatusSnapshot {
	if len(list) == 0 {
		return nil
	}
	out := make([]StatusSnapshot, len(list))
	for i, s := range list {
		out[i] = s.Snapshot()
	}
	return out
}

// SkillStatusEffects maps skill ids to status effects applied on success.
var SkillStatusEffects = map[string][]StatusEffectDef{
	"can_carmen_tutus":    {{Kind: StatusDefenseUp, Duration: 40, Potency: 0.30, OnCaster: false}},
	"can_carmen_ferox":    {{Kind: StatusAttackUp, Duration: 35, Potency: 0.25, OnCaster: false}},
	"van_clamor_castra":   {{Kind: StatusDefenseUp, Duration: 30, Potency: 0.30, OnCaster: true}},
	"van_furor_linea":     {{Kind: StatusDefenseUp, Duration: 25, Potency: 0.20, OnCaster: true}},
	"aeg_custodia_ferrea": {{Kind: StatusDefenseUp, Duration: 30, Potency: 0.35, OnCaster: true}},
	"aeg_tegimen":         {{Kind: StatusDefenseUp, Duration: 25, Potency: 0.40, OnCaster: false}},
	"aeg_umbo":            {{Kind: StatusStun, Duration: 8, Potency: 1, OnCaster: false}},
	"san_lux_mitis":       {{Kind: StatusDefenseDown, Duration: 40, Potency: 0.20, OnCaster: false}},
	"brw_robur_manus":     {{Kind: StatusAttackUp, Duration: 25, Potency: 0.20, OnCaster: true}},
	"ron_altum_custos":    {{Kind: StatusDefenseUp, Duration: 20, Potency: 0.15, OnCaster: true}},
}

// SkillTargetsAlly reports whether a skill should be aimed at a friendly player.
func SkillTargetsAlly(skill Skill) bool {
	if skill.Heals || skill.Buffs {
		return true
	}
	for _, d := range SkillStatusEffects[skill.ID] {
		if !d.OnCaster {
			return true
		}
	}
	return false
}

// StatusesForSkill returns configured effects for a skill id.
func StatusesForSkill(skillID string) []StatusEffectDef {
	return SkillStatusEffects[skillID]
}

// StatusDisplayName is a short label for UI badges.
func StatusDisplayName(kind StatusKind) string {
	switch kind {
	case StatusDefenseUp:
		return "Protect"
	case StatusDefenseDown:
		return "Weaken"
	case StatusAttackUp:
		return "Boost"
	case StatusAttackDown:
		return "Sap"
	case StatusShield:
		return "Shield"
	case StatusRegen:
		return "Regen"
	case StatusPoison:
		return "Poison"
	case StatusHaste:
		return "Haste"
	case StatusStun:
		return "Stun"
	default:
		return string(kind)
	}
}

// StatusDescribe builds tooltip text for an active status.
func StatusDescribe(s ActiveStatus) string {
	name := StatusDisplayName(s.Kind)
	secs := (s.Remaining * 200) / 1000
	switch s.Kind {
	case StatusDefenseUp:
		return fmt.Sprintf("%s — −%.0f%% damage taken (%ds)", name, s.Potency*100, secs)
	case StatusDefenseDown:
		return fmt.Sprintf("%s — +%.0f%% damage taken (%ds)", name, s.Potency*100, secs)
	case StatusAttackUp:
		return fmt.Sprintf("%s — +%.0f%% damage dealt (%ds)", name, s.Potency*100, secs)
	case StatusAttackDown:
		return fmt.Sprintf("%s — −%.0f%% damage dealt (%ds)", name, s.Potency*100, secs)
	case StatusShield:
		return fmt.Sprintf("%s — %d HP remaining (%ds)", name, s.ShieldHP, secs)
	case StatusRegen:
		return fmt.Sprintf("%s — restores HP each tick (%ds)", name, secs)
	case StatusPoison:
		return fmt.Sprintf("%s — damage each tick (%ds)", name, secs)
	case StatusHaste:
		return fmt.Sprintf("%s — +%.0f%% action speed (%ds)", name, s.Potency*100, secs)
	case StatusStun:
		return fmt.Sprintf("%s — cannot act (%ds)", name, secs)
	default:
		return name
	}
}

// ApplyStatus adds or refreshes a status on a list.
func ApplyStatus(list *[]ActiveStatus, def StatusEffectDef, sourceID string, shieldAmount int) {
	for i := range *list {
		s := &(*list)[i]
		if s.Kind == def.Kind {
			s.Source = sourceID
			s.Remaining = def.Duration
			s.Potency = def.Potency
			if def.Kind == StatusShield {
				s.ShieldHP = shieldAmount
			}
			return
		}
	}
	s := ActiveStatus{
		Kind:      def.Kind,
		Source:    sourceID,
		Remaining: def.Duration,
		Potency:   def.Potency,
	}
	if def.Kind == StatusShield {
		s.ShieldHP = shieldAmount
	}
	*list = append(*list, s)
}

// TickStatuses applies HoT/DoT and decrements durations. Returns heal and damage dealt.
func TickStatuses(list *[]ActiveStatus, maxHP int, tickPower int) (heal, damage int) {
	if len(*list) == 0 {
		return 0, 0
	}
	kept := (*list)[:0]
	for _, s := range *list {
		s.Remaining--
		switch s.Kind {
		case StatusRegen:
			heal += max(1, int(float64(tickPower)*s.Potency))
		case StatusPoison:
			damage += max(1, int(float64(tickPower)*s.Potency))
		}
		if s.Remaining > 0 {
			kept = append(kept, s)
		}
	}
	*list = kept
	return heal, damage
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// IsStunned reports whether the entity cannot act.
func IsStunned(list []ActiveStatus) bool {
	for _, s := range list {
		if s.Kind == StatusStun && s.Remaining > 0 {
			return true
		}
	}
	return false
}

// ATBMultiplier from haste/slow-style effects.
func ATBMultiplier(list []ActiveStatus) float64 {
	mult := 1.0
	for _, s := range list {
		if s.Kind == StatusHaste {
			mult += s.Potency
		}
	}
	return mult
}

// ModifyDamageDealt adjusts outgoing damage from attack modifiers.
func ModifyDamageDealt(list []ActiveStatus, amount int) int {
	mult := 1.0
	for _, s := range list {
		switch s.Kind {
		case StatusAttackUp:
			mult += s.Potency
		case StatusAttackDown:
			mult -= s.Potency
		}
	}
	if mult < 0.25 {
		mult = 0.25
	}
	return max(1, int(float64(amount)*mult))
}

// ModifyDamageTaken adjusts incoming damage from defense modifiers, then absorbs shield.
func ModifyDamageTaken(list *[]ActiveStatus, amount int) int {
	mult := 1.0
	for _, s := range *list {
		switch s.Kind {
		case StatusDefenseUp:
			mult -= s.Potency
		case StatusDefenseDown:
			mult += s.Potency
		}
	}
	if mult < 0.1 {
		mult = 0.1
	}
	dmg := max(1, int(float64(amount)*mult))
	return AbsorbShield(list, dmg)
}

// AbsorbShield consumes shield HP and returns remaining damage.
func AbsorbShield(list *[]ActiveStatus, amount int) int {
	remaining := amount
	out := make([]ActiveStatus, 0, len(*list))
	for _, s := range *list {
		if s.Kind == StatusShield && s.ShieldHP > 0 && remaining > 0 {
			if s.ShieldHP >= remaining {
				s.ShieldHP -= remaining
				remaining = 0
			} else {
				remaining -= s.ShieldHP
				s.ShieldHP = 0
			}
		}
		if s.Kind == StatusShield && s.ShieldHP <= 0 {
			continue
		}
		if s.Remaining > 0 {
			out = append(out, s)
		}
	}
	*list = out
	return remaining
}
