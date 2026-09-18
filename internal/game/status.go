package game

import (
	"fmt"
	"strings"
)

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
	Kind     StatusKind `json:"kind"`
	Duration int        `json:"duration"`            // battle ticks (200ms each)
	Potency  float64    `json:"potency"`             // meaning depends on kind
	OnCaster bool       `json:"on_caster,omitempty"` // apply to actor instead of skill target
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

// SkillTargetsAlly reports whether a skill should be aimed at a friendly
// entity — ally or self target rules both resolve through the friendly path.
func SkillTargetsAlly(skill Skill) bool {
	rule := skill.TargetRule()
	return rule == TargetAlly || rule == TargetSelf
}

// StatusesForSkill returns the status payloads in a skill's effect list
// (inline Effects, or the list synthesized for legacy defs).
func StatusesForSkill(skillID string) []StatusEffectDef {
	skill, ok := FindSkill(skillID)
	if !ok {
		return nil
	}
	return StatusEffectsFor(skill)
}

const comboStatusPrefix = "combo_"

// ComboStatus reports whether a status kind carries a combo stack.
func ComboStatus(kind StatusKind) bool {
	return strings.HasPrefix(string(kind), comboStatusPrefix)
}

// StatusDisplayName is a short label for UI badges.
func StatusDisplayName(kind StatusKind) string {
	if d := lookupDef(kind); d != nil {
		return d.DisplayName
	}
	if ComboStatus(kind) {
		return "Combo"
	}
	return string(kind)
}

// StatusDescribe builds tooltip text for an active status.
func StatusDescribe(s ActiveStatus) string {
	name := StatusDisplayName(s.Kind)
	if ComboStatus(s.Kind) {
		secs := (s.Remaining * 200) / 1000
		return fmt.Sprintf("%s — stack %.0f (%ds)", name, s.Potency, secs)
	}
	if d := lookupDef(s.Kind); d != nil && d.DescribeFn != nil {
		secs := (s.Remaining * 200) / 1000
		return d.DescribeFn(name, s, secs)
	}
	return name
}

// ApplyStatus adds or refreshes a status on a list.
func ApplyStatus(list *[]ActiveStatus, def StatusEffectDef, sourceID string, shieldAmount int) {
	isShield := false
	if d := lookupDef(def.Kind); d != nil {
		isShield = d.IsShield
	}
	for i := range *list {
		s := &(*list)[i]
		if s.Kind == def.Kind {
			s.Source = sourceID
			s.Remaining = def.Duration
			s.Potency = def.Potency
			if isShield {
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
	if isShield {
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
		if d := lookupDef(s.Kind); d != nil && d.OnTick != nil {
			h, dmg := d.OnTick(s, tickPower)
			heal += h
			damage += dmg
		}
		if s.Remaining > 0 {
			kept = append(kept, s)
		}
	}
	*list = kept
	return heal, damage
}

// IsStunned reports whether the entity cannot act.
func IsStunned(list []ActiveStatus) bool {
	for _, s := range list {
		if d := lookupDef(s.Kind); d != nil && d.Stuns && s.Remaining > 0 {
			return true
		}
	}
	return false
}

// ATBMultiplier from haste/slow-style effects.
func ATBMultiplier(list []ActiveStatus) float64 {
	mult := 1.0
	for _, s := range list {
		if d := lookupDef(s.Kind); d != nil && d.ATBMod != nil {
			mult += d.ATBMod(s.Potency)
		}
	}
	return mult
}

// ModifyDamageDealt adjusts outgoing damage from attack modifiers.
func ModifyDamageDealt(list []ActiveStatus, amount int) int {
	mult := 1.0
	for _, s := range list {
		if d := lookupDef(s.Kind); d != nil && d.DamageDealtMod != nil {
			mult += d.DamageDealtMod(s.Potency)
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
		if d := lookupDef(s.Kind); d != nil && d.DamageTakenMod != nil {
			mult += d.DamageTakenMod(s.Potency)
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
		d := lookupDef(s.Kind)
		isShield := d != nil && d.IsShield
		if isShield && s.ShieldHP > 0 && remaining > 0 {
			if s.ShieldHP >= remaining {
				s.ShieldHP -= remaining
				remaining = 0
			} else {
				remaining -= s.ShieldHP
				s.ShieldHP = 0
			}
		}
		if isShield && s.ShieldHP <= 0 {
			continue
		}
		if s.Remaining > 0 {
			out = append(out, s)
		}
	}
	*list = out
	return remaining
}
