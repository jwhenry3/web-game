package server

import (
	"fmt"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// Skill effect execution: applySkillTo walks a skill's component list and
// dispatches each component to a registered handler. Handlers share a
// skillExec so later components can see earlier results, and status
// components are batched so remote NPC application stays a single command.
// Registering a new handler is the entire integration for a new mechanic —
// no changes to the dispatch loop, targeting, or combo resolution.

// skillExec carries one skill resolution through its effect components.
type skillExec struct {
	caster  *entity
	target  *entity
	skill   game.Skill // combo-resolved skill
	res     *protocol.CombatEventPayload
	pending []game.StatusEffectDef // status defs batched for one apply
	healed  int                    // HP actually restored by heal effects
	damaged bool                   // a damage effect ran (its event is sent)
}

// skillEffectHandler applies one component to the execution context.
type skillEffectHandler func(h *Hub, ex *skillExec, eff game.SkillEffect)

// Populated in init — a literal here would create an init cycle (the
// handlers transitively call back into the dispatcher).
var skillEffectHandlers = map[game.EffectKind]skillEffectHandler{}

func init() {
	skillEffectHandlers[game.EffectDamage] = applyDamageEffect
	skillEffectHandlers[game.EffectHeal] = applyHealEffect
	skillEffectHandlers[game.EffectStatus] = applyStatusEffect
}

// applyDamageEffect rolls accuracy (attacker dex vs. defender dex), then
// damage (stat/power may be overridden per effect) and emits the hit event.
// A miss emits a whiff event and runs no damage; other components still run.
func applyDamageEffect(h *Hub, ex *skillExec, eff game.SkillEffect) {
	hitChance := game.HitChance(ex.caster.dex, ex.target.dex) +
		game.ProfAccuracyBonus(clientControlOf(ex.caster).proficiencyLevel(ex.skill))
	if h.rng.Float64() >= min(1.0, hitChance) {
		ev := *ex.res
		ev.AttackerID, ev.TargetID = ex.caster.ID, ex.target.ID
		ev.Hit, ev.Success = false, true
		ev.Message = fmt.Sprintf("%s misses %s", ex.caster.Name, ex.target.Name)
		h.sendCombatEvent(ev, ex.caster.X, ex.caster.Y)
		ex.damaged = true
		h.engage(ex.target, ex.caster) // a whiffed swing still provokes
		return
	}
	amount := h.rollDamage(ex.caster, ex.target, ex.skill, eff)
	amount = game.ModifyDamageDealt(ex.caster.statuses, amount)
	h.applyDamageMsgClass(ex.caster, ex.target, amount, *ex.res, "%s hits %s for %d", game.EffectDamageClass(ex.skill, eff))
	ex.damaged = true
}

// applyHealEffect rolls a heal with the same stat/power pipeline as damage
// (attack stats drive restorative potency) and applies it to the target.
func applyHealEffect(h *Hub, ex *skillExec, eff game.SkillEffect) {
	amount := h.rollDamage(ex.caster, ex.target, ex.skill, eff)
	amount = game.ModifyDamageDealt(ex.caster.statuses, amount)
	ex.healed += h.applyHeal(ex.target, amount)
	ex.res.Heal = amount
	if ex.res.Message == "" {
		ex.res.Message = fmt.Sprintf("%s heals %s for %d", ex.caster.Name, ex.target.Name, amount)
	}
}

// applyStatusEffect queues a status for the batched flush — every status in
// the list applies together at the end of the dispatch so remote NPC targets
// cost one worker command no matter how many components declare statuses.
func applyStatusEffect(h *Hub, ex *skillExec, eff game.SkillEffect) {
	if eff.Status != nil {
		ex.pending = append(ex.pending, *eff.Status)
	}
}

// flushStatuses applies the collected status defs to the target (or caster
// for OnCaster defs). A dead target skips the whole batch — matching the old
// ordering where statuses only applied to survivors.
func (h *Hub) flushSkillStatuses(ex *skillExec) {
	if len(ex.pending) == 0 {
		return
	}
	// The damage path may have swapped the hub projection (worker commit) —
	// resolve the live entity before touching status lists.
	if t := h.ent(ex.target.ID); t != nil {
		ex.target = t
	}
	if !ex.target.alive {
		return
	}
	h.applyStatusDefs(ex.caster, ex.target, ex.skill, ex.pending)
}
