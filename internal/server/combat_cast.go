package server

import (
	"fmt"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// Casting lifecycle and skill resolution: activeCast progress advanced on the
// combat tick, cast interruption/refund, and the helpers that turn a skill
// definition into damage, healing, statuses, and combo variants.

type activeCast struct {
	SkillID  string
	TargetID string
	Progress float64
	// EndsAt is the projected completion time (unix millis) so clients
	// outside the combat set can animate the cast bar on a local clock.
	EndsAt int64
}

// advanceCast progresses an entity's cast; on completion the skill resolves.
func (h *Hub) advanceCast(e *entity, now time.Time) {
	if e.casting == nil {
		return
	}
	if !e.alive || e.hidden {
		e.casting = nil
		return
	}
	skill, ok := game.FindSkill(e.casting.SkillID)
	if !ok || game.SkillCastTime(skill) <= 0 {
		e.casting = nil
		return
	}
	castMs := game.SkillCastTime(skill)
	e.casting.Progress += 100.0 * combatTickInterval.Seconds() / (float64(castMs) / 1000.0)
	if e.casting.Progress < 100 {
		return
	}
	cast := e.casting
	e.casting = nil
	res := protocol.CombatEventPayload{
		AttackerID: e.ID, ActionID: skill.ID, ActionName: skill.Name,
		TargetID: cast.TargetID, Success: true,
	}
	t := h.ent(cast.TargetID)
	if game.SkillTargetsAlly(skill) {
		if !h.canAssist(e, t) {
			return
		}
	} else if !h.canAttack(e, t) {
		return
	}
	h.applySkillTo(e, t, skill, res)
}

// interruptCast cancels an in-progress cast, refunding MP and GCD.
func (h *Hub) interruptCast(e *entity) {
	if e.casting == nil {
		return
	}
	skillID := e.casting.SkillID
	if skill, ok := game.FindSkill(skillID); ok {
		e.mp += skill.MPCost
		if e.mp > e.maxMP {
			e.mp = e.maxMP
		}
	}
	e.casting = nil
	e.gcdReadyAt = time.Time{}
	if cc := clientControlOf(e); cc != nil {
		delete(cc.skillReadyAt, skillID)
	}
	name := skillID
	if skill, ok := game.FindSkill(skillID); ok {
		name = skill.Name
	}
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID:    e.ID,
		ActionID:      skillID,
		ActionName:    name,
		CastCancelled: true,
		Message:       fmt.Sprintf("%s's %s was interrupted", e.Name, name),
	}, e.X, e.Y)
}

// passiveContext supplies situational predicates for learned passive skills.
func passiveContext(e, target *entity) game.PassiveContext {
	ctx := game.PassiveContext{ComboStack: game.HighestComboStack(e.statuses)}
	if target != nil && target.maxHP > 0 {
		ctx.TargetHPFraction = float64(target.hp) / float64(target.maxHP)
	}
	return ctx
}

// advanceCombo bumps the caster's combo stack for this skill and returns the
// step that just fired — the input to branch resolution. Non-combo skills
// always resolve at step 0.
func (h *Hub) advanceCombo(caster *entity, skill game.Skill) int {
	return game.AdvanceCombo(&caster.statuses, skill.Combo, caster.ID)
}

// skillContext builds the situational data branch conditions evaluate.
func skillContext(caster, target *entity, comboStep int) game.SkillContext {
	ctx := game.SkillContext{
		ComboStep:  comboStep,
		ComboStack: game.HighestComboStack(caster.statuses),
	}
	if target != nil && target.maxHP > 0 {
		ctx.TargetHPFraction = float64(target.hp) / float64(target.maxHP)
	}
	if caster.maxHP > 0 {
		ctx.CasterHPFraction = float64(caster.hp) / float64(caster.maxHP)
	}
	return ctx
}

// applySkillTo resolves an instant or finished-cast skill from caster onto
// target by dispatching the skill's effect components through the registry —
// heals/buffs for ally skills, damage for enemy skills, statuses for both.
// Any entity can cast: player bookkeeping (GCD, proficiency growth, weapon
// synergy) is clientControl-gated and simply skips NPC casters.
func (h *Hub) applySkillTo(caster, target *entity, skill game.Skill, res protocol.CombatEventPayload) {
	now := time.Now()
	ally := game.SkillTargetsAlly(skill)
	if caster.casting == nil && game.SkillCastTime(skill) == 0 {
		caster.mp -= skill.MPCost
		h.startSkillCooldown(caster, target, skill, now)
	}
	res.Success = true
	// Advance the combo stack first — the step it returns drives branch
	// selection (combo_step conditions) for this execution.
	step := h.advanceCombo(caster, skill)
	resolved := skill.Resolve(skillContext(caster, target, step))
	res.ActionName = resolved.Name

	ex := &skillExec{caster: caster, target: target, skill: resolved, res: &res}
	for _, eff := range game.SkillEffects(resolved) {
		if handler := skillEffectHandlers[eff.Kind]; handler != nil {
			handler(h, ex, eff)
		}
	}
	h.flushSkillStatuses(ex)
	h.trackSkillUse(caster, skill)

	if ex.damaged {
		return // the damage effect already emitted the combat event
	}
	if ally {
		// Helping your side raises threat with everything fighting it.
		h.splashEnmity(caster, enmityAllyBase+ex.healed/2)
	}
	if res.Message == "" {
		res.Message = fmt.Sprintf("%s uses %s on %s", caster.Name, resolved.Name, target.Name)
	}
	h.sendCombatEvent(res, caster.X, caster.Y)
	if target.Kind == kindPlayer {
		h.sendPlayerSync(target)
	}
}

// affinityStat returns the entity's value for a named affinity stat.
func affinityStat(e *entity, stat string) int {
	switch game.NormalizeStatKey(stat) {
	case game.StatStr:
		return e.str
	case game.StatDex:
		return e.dex
	case game.StatVit:
		return e.vit
	case game.StatInt:
		return e.int
	case game.StatMD:
		return e.md
	}
	return 0
}

// rollDamage rolls one effect's potency: affinity stat × power scaled by
// skill level, subjob ratio, weapon synergy, and matching passives.
func (h *Hub) rollDamage(e, target *entity, skill game.Skill, eff game.SkillEffect) int {
	cc := clientControlOf(e)
	stat := affinityStat(e, game.EffectStat(skill, eff))
	power := skill.Power
	if eff.Power > 0 {
		power = eff.Power
	}
	power *= game.SkillLevelPotency(cc.proficiencyLevel(skill))
	if cc != nil {
		if skill.Job != "" && skill.Job == cc.subJob && skill.Job != cc.mainJob {
			power *= game.SubjobEffectRatio
		}
		cat := skill.Category
		if skill.ID == game.BasicAttack.ID {
			cat = game.WeaponCategory(cc.weapon)
		}
		if cat != "" {
			power *= game.WeaponSynergy(cat, cc.weaponForSkill(skill))
		}
		power *= game.PassiveSkillMultiplier(cc.skillLevels, skill, passiveContext(e, target))
	}
	dmg := int(float64(stat) * power * (0.85 + h.rng.Float64()*0.3))
	if dmg < 1 {
		dmg = 1
	}
	return dmg
}

// applyStatusDefs attaches status effects to the target (or the caster for
// OnCaster effects), batching remote worker commands into a single call.
func (h *Hub) applyStatusDefs(caster, target *entity, skill game.Skill, defs []game.StatusEffectDef) {
	remote := []game.StatusEffectDef{}
	remoteShield := 0
	for _, def := range defs {
		list := &target.statuses
		if def.OnCaster {
			list = &caster.statuses
		} else if h.npcWorkerFor(target) != nil {
			remote = append(remote, def)
			if def.Kind == game.StatusShield {
				remoteShield = max(remoteShield, max(1, int(float64(caster.md)*skill.Power*2)))
			}
			continue
		}
		shield := 0
		if def.Kind == game.StatusShield {
			shield = max(1, int(float64(caster.md)*skill.Power*2))
		}
		game.ApplyStatus(list, def, caster.ID, shield)
	}
	h.commandNPCStatuses(caster, target, remote, remoteShield)
}

// trackSkillUse rolls discipline growth for one execution: 0.10–0.40 growth
// (hundredths) toward the proficiency the skill trains — weapon disciplines
// for weapon skills, magic schools for spells. Passives, field skills, and
// dodge train nothing.
func (h *Hub) trackSkillUse(e *entity, skill game.Skill) {
	cc := clientControlOf(e)
	if cc == nil {
		return
	}
	prof := game.SkillProficiency(skill, cc.weaponForSkill(skill))
	if prof == "" {
		return
	}
	cc.pendingProfGrowth[string(prof)] += game.ProfGrowthMin + h.rng.Intn(game.ProfGrowthSpan)
}
