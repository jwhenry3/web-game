package game

// PassiveContext carries the situational data passive effects may inspect.
type PassiveContext struct {
	TargetHPFraction float64
	ComboStack       int
}

func skillAspects(skill Skill) map[SkillAspect]bool {
	out := map[SkillAspect]bool{}
	switch {
	case skill.Heals:
		out[AspectHeal] = true
	case skill.Buffs:
		out[AspectBuff] = true
	case skill.UsesMagic:
		out[AspectMagic] = true
	default:
		out[AspectPhysical] = true
	}
	if SkillIsRanged(skill) {
		out[AspectRanged] = true
	}
	if skill.Combo != nil {
		out[AspectCombo] = true
	}
	return out
}

func passiveApplies(effect PassiveEffect, skill Skill, ctx PassiveContext) bool {
	if len(effect.SkillTypes) > 0 {
		aspects := skillAspects(skill)
		matched := false
		for _, aspect := range effect.SkillTypes {
			if aspects[aspect] {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	if effect.MinComboStack > 0 && ctx.ComboStack < effect.MinComboStack {
		return false
	}
	if effect.TargetHPBelow > 0 && ctx.TargetHPFraction > effect.TargetHPBelow {
		return false
	}
	return true
}

// ActivePassives returns the passive rules granted by unlocked skill levels.
func ActivePassives(skillLevels map[string]int) []PassiveEffect {
	out := []PassiveEffect{}
	for id, level := range skillLevels {
		if level < 1 {
			continue
		}
		if skill, ok := FindSkill(id); ok && skill.Passive != nil {
			out = append(out, *skill.Passive)
		}
	}
	return out
}

// PassiveSkillMultiplier returns the total effect multiplier for matching
// passives. A result of 1.15 means the skill is 15% stronger.
func PassiveSkillMultiplier(skillLevels map[string]int, skill Skill, ctx PassiveContext) float64 {
	mult := 1.0
	for _, passive := range ActivePassives(skillLevels) {
		if passive.EffectMultiplier != 0 && passiveApplies(passive, skill, ctx) {
			mult += passive.EffectMultiplier
		}
	}
	return max(0.25, mult)
}

// PassiveReflect aggregates reflect passives. Chance is additive and capped so
// stacked passives cannot make reflection certain.
func PassiveReflect(skillLevels map[string]int) (chance, ratio float64) {
	for _, passive := range ActivePassives(skillLevels) {
		if passive.ReflectChance > 0 {
			chance += passive.ReflectChance
			ratio += passive.ReflectRatio
		}
	}
	if chance > 0.50 {
		chance = 0.50
	}
	if ratio > 0.75 {
		ratio = 0.75
	}
	return chance, ratio
}

// PassiveCooldownReduction returns the ratio removed from a skill's configured
// cooldown. It never reduces the global cooldown itself.
func PassiveCooldownReduction(skillLevels map[string]int, skill Skill, ctx PassiveContext) float64 {
	reduction := 0.0
	for _, passive := range ActivePassives(skillLevels) {
		if passive.CooldownReduction > 0 && passiveApplies(passive, skill, ctx) {
			reduction += passive.CooldownReduction
		}
	}
	return min(0.75, reduction)
}

// HighestComboStack returns the largest live stack across all combo statuses.
func HighestComboStack(list []ActiveStatus) int {
	best := 0
	for _, s := range list {
		if ComboStatus(s.Kind) && int(s.Potency) > best {
			best = int(s.Potency)
		}
	}
	return best
}

// ComboStack returns the number of successful executions currently stored in
// the combo status. Potency holds the stack count.
func ComboStack(list []ActiveStatus, def *ComboDef) int {
	if def == nil || def.Status == "" {
		return 0
	}
	for _, s := range list {
		if s.Kind == def.Status {
			return int(s.Potency)
		}
	}
	return 0
}

// AdvanceCombo selects the variant for the current stack and stores the next
// stack in a short-lived status. Reaching the final variant clears the status
// immediately so the next use starts the chain over.
func AdvanceCombo(list *[]ActiveStatus, def *ComboDef, sourceID string) int {
	if def == nil || len(def.Variants) == 0 {
		return 0
	}
	stack := ComboStack(*list, def)
	step := stack % len(def.Variants)
	next := stack + 1
	if next >= len(def.Variants) {
		out := (*list)[:0]
		for _, s := range *list {
			if s.Kind != def.Status {
				out = append(out, s)
			}
		}
		*list = out
		return step
	}
	duration := def.Duration
	if duration <= 0 {
		duration = 15 // three seconds on the 200ms status cadence
	}
	ApplyStatus(list, StatusEffectDef{
		Kind:     def.Status,
		Duration: duration,
		Potency:  float64(next),
		OnCaster: true,
	}, sourceID, 0)
	return step
}
