package game

import "fmt"

// Skill effect components: a skill's behavior is a composition of ordered
// effect components resolved by registered handlers, instead of a flat set of
// booleans whose meaning is reconstructed by inference (skillAspects,
// SkillTargetsAlly, SkillIsRanged). Skills that declare Effects are
// self-contained; skills that don't still work — SkillEffects synthesizes the
// equivalent component list from the legacy flags.

// EffectKind identifies a registered skill effect handler.
type EffectKind string

const (
	// EffectDamage rolls stat*power damage onto the target (enemy skills).
	EffectDamage EffectKind = "damage"
	// EffectHeal restores HP on the target (ally skills).
	EffectHeal EffectKind = "heal"
	// EffectStatus attaches a StatusEffectDef to the target (or the caster
	// when Status.OnCaster is set).
	EffectStatus EffectKind = "status"
	// EffectWorld is a field-skill action (return/port/camp) resolved by
	// world handlers rather than the combat path.
	EffectWorld EffectKind = "world"
)

// TargetRule declares what a skill aims at. Empty means "infer from the
// legacy flags" — TargetRule() preserves the old inference exactly.
type TargetRule string

const (
	TargetEnemy TargetRule = "enemy" // hostile entity; may auto-target
	TargetAlly  TargetRule = "ally"  // friendly entity; empty target = self
	TargetSelf  TargetRule = "self"  // always the caster
	TargetNone  TargetRule = "none"  // field skills: no combat target
)

// SkillEffect is one component of a skill's behavior.
type SkillEffect struct {
	Kind EffectKind `json:"kind"`
	// Power overrides the skill's Power for damage/heal effects.
	Power float64 `json:"power,omitempty"`
	// Stat overrides the affinity stat the effect scales on (one of StatKeys;
	// legacy "mag"/"agi" normalize to "int"/"dex"). Empty uses the default in
	// EffectStat: int for UsesMagic skills, md for heals, str otherwise.
	Stat string `json:"stat,omitempty"`
	// Status is the EffectStatus payload.
	Status *StatusEffectDef `json:"status,omitempty"`
	// World names the field-skill action for EffectWorld ("return", "port",
	// "camp" — resolved by server-side world handlers).
	World string `json:"world,omitempty"`
}

// EffectCondition is a flat predicate over the execution context — every set
// field must hold for the condition to match (fields are ANDed).
type EffectCondition struct {
	// ComboStep matches only when this execution resolved the given combo
	// step (0 = first press / no live stack).
	ComboStep *int `json:"combo_step,omitempty"`
	// MinComboStack requires the caster's highest live combo stack — sampled
	// after this execution's advance, so a first press reads 1.
	MinComboStack int `json:"min_combo_stack,omitempty"`
	// TargetHPBelow requires the target's HP fraction at or under the
	// threshold (0–1).
	TargetHPBelow float64 `json:"target_hp_below,omitempty"`
	// CasterHPBelow requires the caster's HP fraction at or under the
	// threshold (0–1).
	CasterHPBelow float64 `json:"caster_hp_below,omitempty"`
}

// SkillContext carries the situational data branch conditions evaluate
// against. A value type so game stays free of server entity types.
type SkillContext struct {
	ComboStep        int
	ComboStack       int
	TargetHPFraction float64 // 0 when the target has no HP ceiling
	CasterHPFraction float64
}

// Met reports whether every predicate in the condition holds.
func (c EffectCondition) Met(ctx SkillContext) bool {
	if c.ComboStep != nil && *c.ComboStep != ctx.ComboStep {
		return false
	}
	if c.MinComboStack > 0 && ctx.ComboStack < c.MinComboStack {
		return false
	}
	if c.TargetHPBelow > 0 && ctx.TargetHPFraction > c.TargetHPBelow {
		return false
	}
	if c.CasterHPBelow > 0 && ctx.CasterHPFraction > c.CasterHPBelow {
		return false
	}
	return true
}

// SkillBranch is one conditional effect list. Branches evaluate in order and
// the first match wins — an unconditional branch is the catch-all default.
type SkillBranch struct {
	// Name overrides the action name shown in combat events when this
	// branch fires (combo step names: "Attack II", …).
	Name    string           `json:"name,omitempty"`
	When    *EffectCondition `json:"when,omitempty"`
	Effects []SkillEffect    `json:"effects"`
}

// Validate checks that a skill's declared components are well-formed. Skills
// without explicit Effects always validate — their component list is
// synthesized from the legacy flags.
func (s Skill) Validate() error {
	switch s.Target {
	case "", TargetEnemy, TargetAlly, TargetSelf, TargetNone:
	default:
		return fmt.Errorf("skill %s: unknown target rule %q", s.ID, s.Target)
	}
	for i, e := range s.Effects {
		if err := e.validate(s.ID, i); err != nil {
			return err
		}
	}
	for i, b := range s.Branches {
		if len(b.Effects) == 0 {
			return fmt.Errorf("skill %s branch %d: empty effect list", s.ID, i)
		}
		if err := b.When.validate(s.ID, i); err != nil {
			return err
		}
		for j, e := range b.Effects {
			if err := e.validate(s.ID, j); err != nil {
				return fmt.Errorf("branch %d: %w", i, err)
			}
		}
	}
	if s.Combo != nil && s.Combo.Steps < 0 {
		return fmt.Errorf("skill %s: negative combo steps", s.ID)
	}
	return nil
}

func (e SkillEffect) validate(skillID string, i int) error {
	switch e.Kind {
	case EffectDamage, EffectHeal:
		if e.Stat != "" && !ValidStatKey(e.Stat) {
			return fmt.Errorf("skill %s effect %d: unknown stat %q", skillID, i, e.Stat)
		}
		if e.Status != nil || e.World != "" {
			return fmt.Errorf("skill %s effect %d: %s carries a foreign payload", skillID, i, e.Kind)
		}
	case EffectStatus:
		if e.Status == nil {
			return fmt.Errorf("skill %s effect %d: status effect needs a status payload", skillID, i)
		}
	case EffectWorld:
		if e.World == "" {
			return fmt.Errorf("skill %s effect %d: world effect needs an action name", skillID, i)
		}
	default:
		return fmt.Errorf("skill %s effect %d: unknown effect kind %q", skillID, i, e.Kind)
	}
	return nil
}

func (c *EffectCondition) validate(skillID string, i int) error {
	if c == nil {
		return nil
	}
	if c.ComboStep != nil && *c.ComboStep < 0 {
		return fmt.Errorf("skill %s branch %d: negative combo_step", skillID, i)
	}
	for _, v := range []float64{c.TargetHPBelow, c.CasterHPBelow} {
		if v < 0 || v > 1 {
			return fmt.Errorf("skill %s branch %d: hp threshold %v outside 0–1", skillID, i, v)
		}
	}
	return nil
}

func intp(i int) *int { return &i }

// Resolve picks this execution's effect list: the first matching branch's
// components (and its name override), else the skill's base list.
func (s Skill) Resolve(ctx SkillContext) Skill {
	for _, b := range s.Branches {
		if b.When == nil || b.When.Met(ctx) {
			if b.Name != "" {
				s.Name = b.Name
			}
			s.Effects = b.Effects
			return s
		}
	}
	return s
}

// TargetRule resolves the skill's targeting rule: the explicit Target when
// set, else the legacy inference (heals/buffs and non-caster status skills
// aim at allies; field skills at nothing; everything else at enemies).
func (s Skill) TargetRule() TargetRule {
	if s.Target != "" {
		return s.Target
	}
	if s.WorldOnly {
		return TargetNone
	}
	if s.Heals || s.Buffs {
		return TargetAlly
	}
	for _, e := range SkillEffects(s) {
		if e.Kind == EffectStatus && e.Status != nil && !e.Status.OnCaster {
			return TargetAlly
		}
	}
	return TargetEnemy
}

// SkillEffects returns the skill's component list. Skills without an explicit
// Effects list synthesize one from the legacy flags: heals → heal effect,
// buffs → statuses only, other combat skills → damage effect. Passive and
// field skills produce no combat effects.
func SkillEffects(s Skill) []SkillEffect {
	if len(s.Effects) > 0 {
		return s.Effects
	}
	out := []SkillEffect{}
	switch {
	case s.Passive != nil || s.WorldOnly || s.Target == TargetNone:
		// Passives never execute; field skills and utility actions (dodge,
		// capture) resolve through their own paths, not effect dispatch.
	case s.Heals:
		out = append(out, SkillEffect{Kind: EffectHeal, Power: s.Power})
	case !s.Buffs:
		out = append(out, SkillEffect{Kind: EffectDamage, Power: s.Power})
	}
	return out
}

// StatusEffectsFor returns the status payloads across the skill's effect list.
func StatusEffectsFor(s Skill) []StatusEffectDef {
	var out []StatusEffectDef
	for _, e := range SkillEffects(s) {
		if e.Kind == EffectStatus && e.Status != nil {
			out = append(out, *e.Status)
		}
	}
	return out
}

// EffectStat resolves the affinity stat an effect scales on: the explicit
// Stat override when set, else md for heals, int for UsesMagic skills, str
// for everything else. Status/world effects scale nothing — returns "".
func EffectStat(s Skill, e SkillEffect) string {
	if e.Stat != "" {
		return NormalizeStatKey(e.Stat)
	}
	switch e.Kind {
	case EffectHeal:
		return StatMD
	case EffectDamage:
		if s.UsesMagic {
			return StatInt
		}
		return StatStr
	}
	return ""
}

// EffectDamageClass returns the damage class an effect deals given the
// skill: elemental when its affinity stat is int, physical otherwise.
func EffectDamageClass(s Skill, e SkillEffect) string {
	if e.Kind != EffectDamage {
		return ClassTrue
	}
	return DamageClassForStat(EffectStat(s, e))
}

// WorldSkillAction returns the field-skill action name declared by the
// skill's world effect component, or "" for non-field skills.
func WorldSkillAction(s Skill) string {
	for _, e := range SkillEffects(s) {
		if e.Kind == EffectWorld {
			return e.World
		}
	}
	return ""
}
