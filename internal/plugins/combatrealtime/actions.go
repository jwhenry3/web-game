package combatrealtime

import (
	"fmt"
	"math"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

func (r *Room) SetTarget(clientID, targetID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	actor := r.find(clientID)
	target := r.find(targetID)
	if actor == nil || target == nil || !target.alive {
		return
	}
	actor.targetID = target.id
}

func (r *Room) HandleAction(clientID string, action protocol.ActionPayload) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ended {
		return
	}
	ev := r.resolveAction(clientID, action)
	if ev != nil {
		r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleEvent, *ev))
		r.checkEnd()
	}
}

func (r *Room) resolveAction(clientID string, action protocol.ActionPayload) *protocol.RTBattleEventPayload {
	now := time.Now()
	actor := r.find(clientID)
	if actor == nil || !actor.alive {
		return r.eventFromResult(actor, protocol.ActionResult{
			ActorID: clientID, ActionID: action.ActionID, TargetID: action.TargetID,
			Message: "Actor is unable to act.",
		})
	}
	if game.IsStunned(actor.statuses) {
		return r.eventFromResult(actor, protocol.ActionResult{
			ActorID: actor.id, ActionID: action.ActionID, Message: "Stunned.",
		})
	}
	if actor.casting != nil {
		return r.eventFromResult(actor, protocol.ActionResult{
			ActorID: actor.id, ActionID: action.ActionID, Message: "Already casting.",
		})
	}
	if !actor.gcdReady(now) {
		return r.eventFromResult(actor, protocol.ActionResult{
			ActorID: actor.id, ActionID: action.ActionID, Message: "Not ready.",
		})
	}

	if action.ActionID == "use_item" {
		res := r.resolveItemUse(actor, action)
		return r.eventFromResult(actor, res)
	}

	skill, ok := game.FindSkill(action.ActionID)
	if !ok {
		return r.eventFromResult(actor, protocol.ActionResult{
			ActorID: actor.id, ActionID: action.ActionID, Message: "Unknown ability.",
		})
	}
	res := protocol.ActionResult{
		ActorID: actor.id, ActionID: skill.ID, ActionName: skill.Name, TargetID: action.TargetID,
	}
	if skill.ID != game.BasicAttack.ID && actor.skillLevels[skill.ID] < 1 {
		res.Message = "Skill not learned."
		return r.eventFromResult(actor, res)
	}
	if skill.WeaponReq != "" && skill.WeaponReq != actor.weaponForSkill(skill) {
		res.Message = "Requires a " + string(skill.WeaponReq) + "."
		return r.eventFromResult(actor, res)
	}
	if actor.mp < skill.MPCost {
		res.Message = "Not enough MP."
		return r.eventFromResult(actor, res)
	}

	var target *entity
	if game.SkillTargetsAlly(skill) {
		target = r.find(action.TargetID)
		if target == nil || !target.alive || !target.isPlayer {
			res.Message = "Invalid target."
			return r.eventFromResult(actor, res)
		}
		if dist(actor.x, actor.y, target.x, target.y) > allySkillRange {
			res.Message = "Target out of range."
			return r.eventFromResult(actor, res)
		}
	} else {
		if t := r.find(action.TargetID); t != nil && t.alive && !t.isPlayer {
			target = t
			actor.targetID = t.id
		} else {
			target = r.autoTarget(actor)
		}
		if target == nil || !target.alive {
			res.Message = "No valid target."
			return r.eventFromResult(actor, res)
		}
		if !r.skillHitsTarget(actor, target, skill) {
			res.Message = "Target out of range."
			return r.eventFromResult(actor, res)
		}
	}
	res.TargetID = target.id

	if game.SkillCastTime(skill) > 0 {
		actor.mp -= skill.MPCost
		actor.startGCD(now)
		actor.casting = &activeCast{SkillID: skill.ID, TargetID: target.id, Progress: 0}
		res.Success = true
		res.CastStarted = true
		return r.eventFromResult(actor, res)
	}

	applied := r.applySkillEffect(actor, target, skill, res)
	return r.eventFromResult(actor, applied)
}

func (r *Room) resolveItemUse(actor *entity, action protocol.ActionPayload) protocol.ActionResult {
	res := protocol.ActionResult{ActorID: actor.id, ActionID: "use_item", ActionName: "Item", ItemID: action.ItemID}
	item, ok := r.host.Profiles().FindItem(actor.profileName, action.ItemID)
	if !ok || item.Kind != game.KindConsumable {
		res.Message = "No such item."
		return res
	}
	target := r.find(action.TargetID)
	if target == nil || !target.isPlayer {
		res.Message = "Invalid target."
		return res
	}
	if dist(actor.x, actor.y, target.x, target.y) > allySkillRange {
		res.Message = "Target out of range."
		return res
	}
	hp, mp := game.ConsumableEffect(item)
	if hp == 0 && mp == 0 {
		res.Message = "This item has no effect."
		return res
	}
	if !target.alive && hp <= 0 {
		res.Message = "Invalid target."
		return res
	}
	if _, ok := r.host.Profiles().UseConsumable(actor.profileName, item.ID); !ok {
		res.Message = "No such item."
		return res
	}
	res.ActionName = item.Name
	actor.startGCD(time.Now())
	res.Success = true
	if hp > 0 {
		target.hp += hp
		if target.hp > target.maxHP {
			target.hp = target.maxHP
		}
		if target.hp > 0 {
			target.alive = true
		}
		res.Heal = hp
	}
	if mp > 0 {
		target.mp += mp
		if target.mp > target.maxMP {
			target.mp = target.maxMP
		}
		res.MPRestored = mp
	}
	if profile, ok := r.host.Profiles().Get(actor.profileName); ok {
		r.host.SendProfileUpdate(actor.id, profile)
	}
	return res
}

func (r *Room) applySkillEffect(actor, target *entity, skill game.Skill, res protocol.ActionResult) protocol.ActionResult {
	now := time.Now()
	if actor.casting == nil && game.SkillCastTime(skill) == 0 {
		actor.mp -= skill.MPCost
		actor.startGCD(now)
	}
	res.Success = true

	category := skill.Category
	if skill.ID == game.BasicAttack.ID {
		category = game.WeaponCategory(actor.weapon)
	}
	skillJob := skill.Job
	stat := actor.str
	if skill.UsesMagic {
		stat = actor.mag
	}
	power := skill.Power
	skillLvl := actor.skillLevels[skill.ID]
	if skillLvl < 1 {
		skillLvl = 1
	}
	power *= game.SkillLevelPotency(skillLvl)
	if skillJob != "" && skillJob == actor.subJob && skillJob != actor.mainJob {
		power *= game.SubjobEffectRatio
	}
	if category != "" {
		power *= game.WeaponSynergy(category, actor.weaponForSkill(skill))
	}
	amount := r.rollDamage(stat, power)
	amount = game.ModifyDamageDealt(actor.statuses, amount)

	if skill.Heals {
		target.hp += amount
		if target.hp > target.maxHP {
			target.hp = target.maxHP
		}
		res.Heal = amount
	} else if !skill.Buffs {
		amount = game.ModifyDamageTaken(&target.statuses, amount)
		target.hp -= amount
		if target.hp <= 0 {
			target.hp = 0
			target.alive = false
		}
		res.Damage = amount
	}

	r.applySkillStatuses(actor, target, skill, amount, &res)
	if actor.isPlayer && skill.ID != game.BasicAttack.ID && actor.pendingSkillUses != nil {
		actor.pendingSkillUses[skill.ID]++
	}
	return res
}

func (r *Room) applySkillStatuses(actor, target *entity, skill game.Skill, power int, res *protocol.ActionResult) {
	effects := game.StatusesForSkill(skill.ID)
	if len(effects) == 0 {
		return
	}
	shieldAmt := maxInt(1, int(float64(actor.mag)*skill.Power*2))
	for _, def := range effects {
		recipient := target
		if def.OnCaster {
			recipient = actor
		}
		shield := 0
		if def.Kind == game.StatusShield {
			shield = shieldAmt
		}
		game.ApplyStatus(&recipient.statuses, def, actor.id, shield)
		res.StatusApplied = append(res.StatusApplied, game.StatusSnapshot{
			Kind: string(def.Kind), Potency: def.Potency, Remaining: def.Duration, ShieldHP: shield,
		})
	}
}

func (r *Room) skillHitsTarget(actor, target *entity, skill game.Skill) bool {
	d := dist(actor.x, actor.y, target.x, target.y)
	if max := game.SkillMaxRange(skill); max > 0 {
		return d <= max
	}
	return inMeleeArc(actor, target, attackArc)
}

func inMeleeArc(actor, target *entity, halfArc float64) bool {
	d := dist(actor.x, actor.y, target.x, target.y)
	if d > attackRange+enemyRadius {
		return false
	}
	dx := target.x - actor.x
	dy := target.y - actor.y
	dm := math.Hypot(dx, dy)
	if dm < 0.01 {
		return true
	}
	fx, fy := actor.facingX, actor.facingY
	fm := math.Hypot(fx, fy)
	if fm < 0.01 {
		fx, fy = 1, 0
	} else {
		fx /= fm
		fy /= fm
	}
	dot := (dx/dm)*fx + (dy/dm)*fy
	return dot >= math.Cos(halfArc)
}

func (r *Room) autoTarget(actor *entity) *entity {
	if t := r.find(actor.targetID); t != nil && t.alive && !t.isPlayer {
		return t
	}
	var best *entity
	bestD := math.MaxFloat64
	for _, e := range r.entities {
		if e.isPlayer || !e.alive {
			continue
		}
		d := dist(actor.x, actor.y, e.x, e.y)
		if d < bestD {
			bestD = d
			best = e
		}
	}
	if best != nil {
		actor.targetID = best.id
	}
	return best
}

func (r *Room) rollDamage(stat int, power float64) int {
	base := float64(stat) * power
	dmg := int(base * (0.85 + r.rng.Float64()*0.3))
	if dmg < 1 {
		dmg = 1
	}
	return dmg
}

func (r *Room) eventFromResult(actor *entity, res protocol.ActionResult) *protocol.RTBattleEventPayload {
	msg := res.Message
	if msg == "" && res.Success {
		if res.CastStarted {
			msg = fmt.Sprintf("%s begins casting %s", r.nameOf(res.ActorID), res.ActionName)
		} else if res.Heal > 0 {
			msg = fmt.Sprintf("%s heals %s for %d", r.nameOf(res.ActorID), r.nameOf(res.TargetID), res.Heal)
		} else if res.Damage > 0 {
			msg = fmt.Sprintf("%s hits %s for %d", r.nameOf(res.ActorID), r.nameOf(res.TargetID), res.Damage)
		}
	}
	return &protocol.RTBattleEventPayload{
		AttackerID:  res.ActorID,
		TargetID:    res.TargetID,
		Damage:      res.Damage,
		Heal:        res.Heal,
		MPRestored:  res.MPRestored,
		Hit:         res.Success && (res.Damage > 0 || res.Heal > 0 || res.CastStarted),
		Message:     msg,
		ActionID:    res.ActionID,
		ActionName:  res.ActionName,
		Success:     res.Success,
		CastStarted: res.CastStarted,
		Entities:    r.snapshots(),
	}
}

func (r *Room) nameOf(id string) string {
	if e := r.find(id); e != nil {
		return e.name
	}
	return id
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (r *Room) interruptCast(e *entity) {
	if e.casting == nil {
		return
	}
	skillID := e.casting.SkillID
	name := skillID
	if skill, ok := game.FindSkill(skillID); ok {
		name = skill.Name
	}
	e.casting = nil
	ev := protocol.RTBattleEventPayload{
		AttackerID:    e.id,
		ActionID:      skillID,
		ActionName:    name,
		Hit:           false,
		Success:       false,
		CastCancelled: true,
		Message:       fmt.Sprintf("%s's %s was interrupted", e.name, name),
		Entities:      r.snapshots(),
	}
	r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleEvent, ev))
}

func (r *Room) advanceCasts(now time.Time) {
	for _, e := range r.entities {
		if !e.alive || e.casting == nil {
			continue
		}
		skill, ok := game.FindSkill(e.casting.SkillID)
		if !ok {
			e.casting = nil
			continue
		}
		castMs := game.SkillCastTime(skill)
		if castMs <= 0 {
			e.casting = nil
			continue
		}
		step := 100.0 * tickInterval.Seconds() / (float64(castMs) / 1000.0)
		e.casting.Progress += step
		if e.casting.Progress < 100 {
			continue
		}
		target := r.find(e.casting.TargetID)
		actor := e
		e.casting = nil
		if target == nil || !target.alive {
			continue
		}
		res := protocol.ActionResult{
			ActorID: actor.id, ActionID: skill.ID, ActionName: skill.Name,
			TargetID: target.id, Success: true,
		}
		applied := r.applySkillEffect(actor, target, skill, res)
		ev := r.eventFromResult(actor, applied)
		r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleEvent, *ev))
	}
}
