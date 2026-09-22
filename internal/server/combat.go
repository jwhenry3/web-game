package server

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// Overworld realtime combat. One serialized simulation on the hub loop: all
// entities (players, NPCs, pets) fight in the open world through the shared
// entity core (entity.go); snapshots/events are broadcast per-client on an
// area-of-interest radius instead of map-wide.
const (
	combatTickInterval   = 50 * time.Millisecond
	resourceSyncInterval = time.Second

	aggroRadius   = 110.0 // proximity pull: walking this close to a foe starts combat
	assistRadius  = 150.0 // nearby hostile NPCs join a fight their ally is in
	leashRadius   = 380.0 // from fight origin; beyond → reset and walk home
	dropRange     = 460.0 // target this far from the NPC → it gives up
	combatAoIDist = 900.0 // combat ticks/events reach clients within this of a fight

	// Enmity: every offensive action credits enmityActionBase + damage dealt
	// on its target; self/ally actions splash enmityAllyBase (+ half any
	// amount healed) onto every engaged enemy. An NPC switches victims only
	// when a challenger exceeds the current target's enmity by the margin —
	// keeps aggro from flapping on every tick.
	enmityActionBase   = 10
	enmityAllyBase     = 40
	enmityEngagePull   = 10 // seed on the puller when a fight starts
	enmitySwitchMargin = 1.3

	enemySpeedWorld = 90.0
	enemyAttackCDW  = 1200 * time.Millisecond
	contactDamageW  = 8
	attackRangeW    = 70.0
	enemyRadiusW    = 20.0
	meleeStopDistW  = attackRangeW
	npcHoldSlackW   = 10.0
	npcOverlapPadW  = 4.0
	gcdDuration     = time.Second
	castMoveCancel  = 4.0
	dodgeMoveGrace  = 250 * time.Millisecond
	dodgeCooldown   = 500 * time.Millisecond
	// dodgeDashDist mirrors the client's two-tile dash; dodgeLandingWindow
	// covers the tween + latency for the post-dash position report.
	dodgeDashDist      = 64.0
	dodgeLandingWindow = 600 * time.Millisecond
	staminaMax         = 100.0
	dodgeStaminaCost   = 25.0
	// Recovery rates per second, shared by hp/mp/stamina: 10 per 5s in the
	// field — slow enough that resources matter — and 50 per 5s on sanctuary
	// tiles so retreating to a crystal is worth the trip.
	regenPerSec          = 2.0
	regenPerSecSanctuary = 10.0
)

var enemyTemplates = map[string]int{ // kind -> base hp
	"goblin":    70,
	"dire_wolf": 55,
	"stone_imp": 95,
	"imp":       60,
}

// enemySkills maps a foe kind to the catalog actions it can cast. NPCs run
// the same skill pipeline as players — cast start event, cast bar projection,
// effect resolution, combat event — so any catalog action works here.
var enemySkills = map[string][]string{
	"imp":       {"hex_gelu_hex"}, // Frost Brand
	"stone_imp": {"hex_gelu_hex"},
}

// npcCastInterval is the pacing between an enemy's cast starts — long
// enough that melee stays its bread and butter, short enough that the
// spell is a real threat.
const npcCastInterval = 5 * time.Second

var petTemplates = map[string]struct{ hp, str, dex int }{
	"goblin": {70, 9, 11}, "dire_wolf": {55, 8, 17}, "stone_imp": {95, 11, 8},
	"imp": {60, 10, 14},
}

// ---- player entity lifecycle ----

// ensurePlayer returns the player's entity, creating it on first use.
// Returns nil for clients that haven't joined — they must not enter the
// world entity set.
func (h *Hub) ensurePlayer(c *Client) *entity {
	if e := h.playerEnt(c.ID); e != nil {
		return e
	}
	if c == nil || !c.Joined {
		return nil
	}
	e := newPlayerEntity(c.ID)
	e.Name = c.Name
	h.entities[c.ID] = e
	h.refreshCombatStats(c, e)
	return e
}

// refreshCombatStats recomputes stats from the profile. Called on join and on
// each combat entry so level/equipment changes apply to the next fight.
func (h *Hub) refreshCombatStats(c *Client, e *entity) {
	cc := clientControlOf(e)
	profile, ok := h.store.Get(c.Name)
	if !ok || cc == nil {
		return
	}
	loadout := profile.ActiveLoadout()
	stats := game.ComputeJobStats(
		game.JobID(profile.MainJob), profile.MainJobLevel(),
		game.JobID(profile.SubJob), profile.SubJobEffectiveLevel(),
		profile.EquippedItems(),
	)
	e.Level = profile.MainJobLevel()
	e.maxHP, e.maxMP = stats.HP, stats.MP
	if e.hp <= 0 || e.hp > stats.HP {
		e.hp = stats.HP
	}
	if e.mp > stats.MP {
		e.mp = stats.MP
	}
	e.str, e.dex, e.vit, e.int, e.md = stats.Str, stats.Dex, stats.Vit, stats.Int, stats.MD
	cc.weapon = profile.WeaponType()
	cc.subWeapon = profile.SubWeaponType()
	cc.mainJob = game.JobID(profile.MainJob)
	cc.subJob = game.JobID(profile.SubJob)
	cc.skillLevels = map[string]int{}
	for id, lvl := range loadout.SkillLevels {
		cc.skillLevels[id] = lvl
	}
	cc.profLevels = map[string]int{}
	for prof, lvl := range loadout.ProfLevels {
		cc.profLevels[prof] = lvl
	}
	if cc.pendingProfGrowth == nil {
		cc.pendingProfGrowth = map[string]int{}
	}
}

// flushSkillUsage persists accumulated battle training for a player.
func (h *Hub) flushSkillUsage(e *entity) {
	cc := clientControlOf(e)
	if cc == nil || len(cc.pendingProfGrowth) == 0 {
		return
	}
	if c := h.clients[e.ID]; c != nil && c.Name != "" {
		h.store.AddBattleTraining(c.Name, cc.pendingProfGrowth)
	}
	cc.pendingProfGrowth = map[string]int{}
}

// ---- player actions ----

func (h *Hub) handleAction(c *Client, raw json.RawMessage) {
	var action protocol.ActionPayload
	if err := json.Unmarshal(raw, &action); err != nil {
		return
	}
	e := h.playerEnt(c.ID)
	if e == nil || e.hidden {
		return
	}
	h.resolveAction(c, e, action)
}

func (h *Hub) handleSetTarget(c *Client, raw json.RawMessage) {
	var p protocol.SetTargetPayload
	// Protobuf encodes target_id:"" as an empty message; decodeProtobuf then
	// delivers no JSON payload. For set_target, absent payload means untarget.
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &p); err != nil {
			return
		}
	}
	if e := h.ensurePlayer(c); e != nil {
		e.targetID = p.TargetID
		if e.targetID != "" {
			// Focus only resolves to entities on the world: dead/hidden NPCs
			// and stale ids are rejected, so a lingering corpse cannot be
			// re-locked during the window before its snapshot removal lands.
			if t := h.ent(e.targetID); t == nil || t.hidden {
				e.targetID = ""
			}
		}
		if e.targetID == "" {
			// Dropping focus also releases the committed attack so pets heel;
			// a mob still attacking us is re-acquired by their defensive scan.
			e.engageID = ""
		}
		// Echo the authoritative value so the client converges on it.
		h.send(c, protocol.TypeSetTarget, protocol.SetTargetPayload{TargetID: e.targetID})
	}
}

func (h *Hub) handleDodge(c *Client) {
	e := h.playerEnt(c.ID)
	if e == nil || e.hidden {
		return
	}
	h.resolveDodge(c, e)
}

// resolveDodge performs the universal dash. It needs recent movement (the
// client dashes along its current heading), costs stamina, and has its own
// 500ms cooldown — independent of the GCD. Dodging interrupts a cast.
func (h *Hub) resolveDodge(c *Client, e *entity) {
	now := time.Now()
	cc := clientControlOf(e)
	if cc == nil || !e.alive || now.Sub(cc.lastMoveAt) > dodgeMoveGrace || now.Before(cc.dodgeReadyAt) {
		return
	}
	stam := cc.staminaNow(now)
	if stam < dodgeStaminaCost {
		return
	}
	cc.stamina = stam - dodgeStaminaCost
	cc.staminaAt = now
	cc.dodgeReadyAt = now.Add(dodgeCooldown)
	cc.dodgedAt = now
	if e.casting != nil {
		h.interruptCast(e)
	}

	// Authoritative dash: move the player immediately on the server so we don't
	// depend on a follow-up client move that may be clamped or arrive late.
	dx, dy := cc.lastMoveDX, cc.lastMoveDY
	if d := math.Hypot(dx, dy); d > 0.001 {
		dx /= d
		dy /= d
	} else {
		dx, dy = game.FacingDir(e.Facing)
	}
	prevX, prevY := e.X, e.Y
	worldW, worldH := h.worldSize()
	tx := clamp(e.X+dx*dodgeDashDist, game.PlayerCollisionRadius, worldW-game.PlayerCollisionRadius)
	ty := clamp(e.Y+dy*dodgeDashDist, game.PlayerCollisionRadius, worldH-game.PlayerCollisionRadius)
	h.moveEntity3D(e, tx, ty, 0)
	h.spatialInvalidate()
	e.Facing = game.ResolveFacingYaw(e.X-prevX, e.Y-prevY, 0, false, e.Facing)

	h.send(c, protocol.TypePlayerSync, h.entitySync(e))
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: c.ID, X: e.X, Y: e.Y, Z: e.Z, Grounded: e.grounded, Facing: e.Facing,
	}))
	h.persistWorldLocation(c, e, false)
	h.refreshRegionOwnership(c, e)
	h.checkAggroAt(c.ID, e.X, e.Y)
	// No Message: dodges drive the dash VFX but don't belong in the combat log.
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: c.ID, ActionID: game.ActionIDDodge,
		ActionName: game.SkillDodge.Name, Success: true, Hit: true,
	}, e.X, e.Y)
}

func (h *Hub) resolveAction(c *Client, e *entity, action protocol.ActionPayload) {
	now := time.Now()
	cc := clientControlOf(e)
	if cc == nil || !e.alive {
		return
	}
	if game.IsStunned(e.statuses) {
		h.sendCombatEvent(protocol.CombatEventPayload{
			AttackerID: c.ID, ActionID: action.ActionID, Message: "Stunned.",
		}, e.X, e.Y)
		return
	}
	if e.casting != nil {
		h.sendCombatEvent(protocol.CombatEventPayload{
			AttackerID: c.ID, ActionID: action.ActionID, Message: "Already casting.",
		}, e.X, e.Y)
		return
	}
	if !e.gcdReady(now) {
		return // silent: client already shows the GCD sweep
	}

	if action.ActionID == "use_item" {
		h.resolveItemUse(c, e, action)
		return
	}
	if action.ActionID == game.ActionIDCapture {
		h.resolveCapture(c, e, action)
		return
	}
	if action.ActionID == game.ActionIDDodge {
		h.resolveDodge(c, e)
		return
	}

	skill, ok := game.FindSkill(action.ActionID)
	if !ok {
		return
	}
	res := protocol.CombatEventPayload{
		AttackerID: c.ID, ActionID: skill.ID, ActionName: skill.Name, TargetID: action.TargetID,
	}
	if !game.SkillAlwaysUnlocked(skill.ID) && cc.skillLevels[skill.ID] < 1 {
		res.Message = "Skill not learned."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if skill.Passive != nil {
		res.Message = "Passive skill."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if cc.skillReadyAt != nil && now.Before(cc.skillReadyAt[skill.ID]) {
		res.Message = "Skill is recharging."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if skill.WorldOnly {
		res.Message = "Cannot use that here."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if len(skill.WeaponReqs) > 0 && !slices.Contains(skill.WeaponReqs, cc.weaponForSkill(skill)) {
		names := make([]string, len(skill.WeaponReqs))
		for i, w := range skill.WeaponReqs {
			names[i] = string(w)
		}
		res.Message = "Requires a " + strings.Join(names, " or ") + "."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if e.mp < skill.MPCost {
		res.Message = "Not enough MP."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}

	var t *entity
	if game.SkillTargetsAlly(skill) {
		// Ally-targeted: any same-faction entity (players, pets), self when
		// empty — and always self for TargetSelf skills.
		tgtID := action.TargetID
		if tgtID == "" || skill.TargetRule() == game.TargetSelf {
			tgtID = c.ID
		}
		t = h.ent(tgtID)
		if !h.canAssist(e, t) {
			res.Message = "Invalid target."
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
		if entityDistance3D(e, t) > allySkillRangeW {
			res.Message = "Target out of range."
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
	} else {
		// Enemy-targeted: the given target if attackable, else the player's
		// currently selected target. No nearest-enemy acquisition — skill
		// execution requires an explicit target selection. A friendly focus
		// isn't attackable but stays selected.
		t = h.ent(action.TargetID)
		if !h.canAttack(e, t) {
			t = h.focusTarget(e)
		}
		if t == nil {
			res.Message = "No valid target."
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
		if !h.skillHits(e, t, skill) {
			res.Message = "Target out of range."
			res.TargetID = t.ID
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
		e.targetID = t.ID
		e.engageID = t.ID // committing an attack — pets may follow it
	}
	res.TargetID = t.ID
	if game.SkillCastTime(skill) > 0 {
		e.mp -= skill.MPCost
		h.startSkillCooldown(e, t, skill, now)
		e.casting = &activeCast{
			SkillID:  skill.ID,
			TargetID: t.ID,
			EndsAt:   now.UnixMilli() + int64(game.SkillCastTime(skill)),
		}
		e.castX, e.castY = e.X, e.Y
		res.Success = true
		res.CastStarted = true
		h.sendCombatEvent(res, e.X, e.Y)
		if e.Kind == kindPlayer {
			// Push the projection now so the caster's own bar shows before
			// they enter the combat set — it animates from cast_ends_at.
			h.sendPlayerSync(e)
		}
		return
	}
	h.applySkillTo(e, t, skill, res)
}

// startSkillCooldown starts the shared GCD and, when configured, the skill's
// own ready time. A configured skill cooldown is added after the GCD ends.
func (h *Hub) startSkillCooldown(e, target *entity, skill game.Skill, now time.Time) {
	cc := clientControlOf(e)
	if cc == nil {
		return
	}
	if !game.SkillTargetsAlly(skill) || cc.inCombat {
		e.startGCD(now)
	}
	if cc.skillReadyAt == nil {
		cc.skillReadyAt = map[string]time.Time{}
	}
	if skill.CooldownMs <= 0 {
		delete(cc.skillReadyAt, skill.ID)
		return
	}
	cd := time.Duration(skill.CooldownMs) * time.Millisecond
	reduction := game.PassiveCooldownReduction(cc.skillLevels, skill, passiveContext(e, target))
	cd = time.Duration(float64(cd) * (1 - reduction))
	cc.skillReadyAt[skill.ID] = now.Add(e.gcdLen() + cd)
}

func (h *Hub) skillHits(e, t *entity, skill game.Skill) bool {
	if !h.entityLineOfSight3D(e, t) {
		return false
	}
	d := entityDistance3D(e, t)
	if mx := game.SkillMaxRange(skill); mx > 0 {
		return d <= mx
	}
	return d <= attackRangeW+enemyRadiusW
}

const allySkillRangeW = game.AllySkillRange

// resolveItemUse consumes a potion-type item on self or an ally.
func (h *Hub) resolveItemUse(c *Client, e *entity, action protocol.ActionPayload) {
	res := protocol.CombatEventPayload{AttackerID: c.ID, ActionID: "use_item", ActionName: "Item"}
	item, ok := h.store.FindItem(c.Name, action.ItemID)
	if !ok || item.Kind != game.KindConsumable {
		res.Message = "No such item."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	tgtID := action.TargetID
	if tgtID == "" {
		tgtID = c.ID
	}
	t := h.ent(tgtID)
	if t == nil || t.Kind != kindPlayer || !t.alive {
		res.Message = "Invalid target."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if entityDistance3D(e, t) > allySkillRangeW {
		res.Message = "Target out of range."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	hp, mp := game.ConsumableEffect(item)
	if hp == 0 && mp == 0 {
		res.Message = "This item has no effect."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if _, ok := h.store.UseConsumable(c.Name, item.ID); !ok {
		res.Message = "No such item."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	res.ActionName = item.Name
	res.TargetID = tgtID
	if cc := clientControlOf(e); cc != nil && cc.inCombat {
		e.startGCD(time.Now())
	}
	res.Success = true
	if hp > 0 {
		h.applyHeal(t, hp)
		res.Heal = hp
	}
	if mp > 0 {
		t.mp = min(t.maxMP, t.mp+mp)
		res.MPRestored = mp
	}
	h.splashEnmity(e, enmityAllyBase+hp/2)
	if profile, ok := h.store.Get(c.Name); ok {
		h.sendProfileRefresh(c, profile)
	}
	res.Message = fmt.Sprintf("%s uses %s", e.Name, item.Name)
	h.sendCombatEvent(res, e.X, e.Y)
}

// resolveCapture attempts to capture a weakened NPC.
func (h *Hub) resolveCapture(c *Client, e *entity, action protocol.ActionPayload) {
	res := protocol.CombatEventPayload{
		AttackerID: c.ID, ActionID: game.ActionIDCapture, ActionName: "Capture", TargetID: action.TargetID,
	}
	n := h.ent(action.TargetID)
	if n == nil || n.Kind != kindNPC || !h.canAttack(e, n) {
		// No usable target in the payload — fall back to the player's
		// selected target. Capturing never auto-acquires a foe, and a
		// friendly focus stays selected.
		n = h.focusTarget(e)
	}
	r := respawnOf(n)
	if n == nil || n.Kind != kindNPC || r == nil {
		res.Message = "Invalid target."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	res.TargetID = n.ID
	if entityDistance3D(e, n) > allySkillRangeW {
		res.Message = "Target out of range."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	e.targetID = n.ID
	if !game.EligibleForCapture(r.capturable, true, n.hp, n.maxHP) {
		res.Message = "Target is not weak enough to capture."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	// Everything that can veto the attempt must run before the GCD and the
	// roll — a capture that can't proceed is free.
	prof, ok := h.store.Get(c.Name)
	if !ok {
		res.Message = "Character not found."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if len(prof.Pets) >= game.MaxPets {
		res.Message = fmt.Sprintf("Pet collection is full (%d).", game.MaxPets)
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	e.startGCD(time.Now())
	h.addEnmity(n, e, enmityActionBase) // the attempt itself is an offense
	chance := game.CaptureChance(e.Level, n.Level)
	if h.rng.Float64() >= chance {
		res.Message = fmt.Sprintf("Capture failed (%.0f%%).", chance*100)
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	profile, _, errMsg := h.store.AddPet(c.Name, n.Sprite, n.Name, n.Level)
	if errMsg != "" {
		res.Message = errMsg
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	res.Success = true
	res.Hit = true
	res.Message = fmt.Sprintf("Captured %s!", n.Name)
	h.sendCombatEvent(res, e.X, e.Y)
	h.sendProfileRefresh(c, profile)
	h.captureNPC(n, e)
}

// captureNPC removes a caught NPC (no loot, XP still awarded).
func (h *Hub) captureNPC(n, by *entity) {
	if r := respawnOf(n); r != nil {
		r.captured = true
	}
	h.kill(n, by)
}

func (h *Hub) nameOf(id string) string {
	if e := h.ent(id); e != nil {
		return e.Name
	}
	return id
}
