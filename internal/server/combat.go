package server

import (
	"encoding/json"
	"fmt"
	"math"
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
	gcdDuration     = 2500 * time.Millisecond
	castMoveCancel  = 4.0
	dodgeMoveGrace  = 250 * time.Millisecond
	dodgeCooldown   = 500 * time.Millisecond
	// dodgeDashDist mirrors the client's two-tile dash; dodgeLandingWindow
	// covers the tween + latency for the post-dash position report.
	dodgeDashDist      = 64.0
	dodgeLandingWindow = 600 * time.Millisecond
	staminaMax         = 100.0
	staminaRegenRate   = 35.0 // per second
	dodgeStaminaCost   = 25.0
)

var enemyTemplates = map[string]int{ // kind -> base hp
	"goblin":    70,
	"dire_wolf": 55,
	"stone_imp": 95,
}

var petTemplates = map[string]struct{ hp, str, agi int }{
	"goblin": {70, 9, 11}, "dire_wolf": {55, 8, 17}, "stone_imp": {95, 11, 8},
}

type activeCast struct {
	SkillID  string
	TargetID string
	Progress float64
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
	hp, mp, str, mag, agi := game.ComputeJobStats(
		game.JobID(profile.MainJob), profile.MainJobLevel(),
		game.JobID(profile.SubJob), profile.SubJobEffectiveLevel(),
		profile.EquippedItems(),
	)
	e.Level = profile.MainJobLevel()
	e.maxHP, e.maxMP = hp, mp
	if e.hp <= 0 || e.hp > hp {
		e.hp = hp
	}
	if e.mp > mp {
		e.mp = mp
	}
	e.str, e.mag, e.agi = str, mag, agi
	cc.weapon = profile.WeaponType()
	cc.subWeapon = profile.SubWeaponType()
	cc.mainJob = game.JobID(profile.MainJob)
	cc.subJob = game.JobID(profile.SubJob)
	cc.skillLevels = map[string]int{}
	for id, lvl := range loadout.SkillLevels {
		cc.skillLevels[id] = lvl
	}
	if cc.pendingSkillUses == nil {
		cc.pendingSkillUses = map[string]int{}
	}
}

// flushSkillUsage persists accumulated battle training for a player.
func (h *Hub) flushSkillUsage(e *entity) {
	cc := clientControlOf(e)
	if cc == nil || len(cc.pendingSkillUses) == 0 {
		return
	}
	if c := h.clients[e.ID]; c != nil && c.Name != "" {
		h.store.AddBattleTraining(c.Name, cc.pendingSkillUses)
	}
	cc.pendingSkillUses = map[string]int{}
}

// entitySync adapts a player entity to the wire WorldEntity for join/sync.
func (h *Hub) entitySync(e *entity) protocol.WorldEntity {
	return h.projector.project(e, time.Now())
}

func (h *Hub) sendPlayerSync(e *entity) {
	if e == nil {
		return
	}
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, h.entitySync(e)))
}

// markPlayerCombat recomputes a player's combat stats on first engagement.
func (h *Hub) markPlayerCombat(clientID string) {
	h.mu.RLock()
	c := h.clients[clientID]
	h.mu.RUnlock()
	if c == nil || !c.Joined {
		return
	}
	e := h.ensurePlayer(c)
	cc := clientControlOf(e)
	if cc != nil && !cc.inCombat {
		h.refreshCombatStats(c, e)
		cc.inCombat = true
		h.sendPlayerSync(e)
	}
}

// checkAggroAt starts fights when a hostile NPC sits within aggro range of a
// vulnerable player position (called on player movement).
func (h *Hub) checkAggroAt(clientID string, x, y float64) {
	p := h.playerEnt(clientID)
	if p == nil || !p.presentAndAlive() || battleImmuneEnt(p) {
		return
	}
	if h.overworld != nil && h.overworld.SanctuaryAtWorld(x, y) {
		return
	}
	h.eachEntity(kindNPC, func(n *entity) {
		ng := npcEngageOf(n)
		if ng == nil || ng.engaged || !h.canAttack(n, p) {
			return
		}
		if dist(x, y, n.X, n.Y) <= aggroRadius {
			h.engage(n, p)
		}
	})
}

// ---- NPC movement helpers (used by chaseTarget) ----

func engagedNPC(o *entity) bool {
	if o.Kind != kindNPC || !o.onWorld() {
		return false
	}
	ng := npcEngageOf(o)
	return ng != nil && ng.engaged
}

// npcHardOverlap reports whether e deeply overlaps another engaged NPC.
func (h *Hub) npcHardOverlap(e *entity) bool {
	_, _, deep := h.npcHardOverlapVec(e)
	return deep
}

func (h *Hub) npcHardOverlapVec(e *entity) (float64, float64, bool) {
	limit := enemyRadiusW*2 - npcOverlapPadW
	var sx, sy float64
	deep := false
	for _, o := range h.entities {
		if o == e || !engagedNPC(o) {
			continue
		}
		d := dist(e.X, e.Y, o.X, o.Y)
		if d >= limit || d < 0.01 {
			continue
		}
		deep = true
		w := (limit - d) / limit
		sx += (e.X - o.X) / d * w
		sy += (e.Y - o.Y) / d * w
	}
	return sx, sy, deep
}

func (h *Hub) npcBlocksPath(e *entity, fx, fy float64) bool {
	const blockRange = enemyRadiusW * 3.2
	const cone = 0.55
	for _, o := range h.entities {
		if o == e || !engagedNPC(o) {
			continue
		}
		ox, oy := o.X-e.X, o.Y-e.Y
		d := math.Hypot(ox, oy)
		if d >= blockRange || d < 0.01 {
			continue
		}
		if (ox*fx+oy*fy)/d >= cone {
			return true
		}
	}
	return false
}

// npcUnstick slides an in-melee NPC sideways when it overlaps a pack-mate.
func (h *Hub) npcUnstick(e, t *entity, step float64) {
	ox, oy, deep := h.npcHardOverlapVec(e)
	if !deep || t == nil {
		return
	}
	dx, dy := t.X-e.X, t.Y-e.Y
	d := math.Hypot(dx, dy)
	if d < 0.01 {
		return
	}
	side := 1.0
	if ng := npcEngageOf(e); ng != nil && ng.avoidSide != 0 {
		side = ng.avoidSide
	}
	rx, ry := dx/d, dy/d
	radial := ox*rx + oy*ry
	tx, ty := ox-radial*rx, oy-radial*ry
	tm := math.Hypot(tx, ty)
	if tm < 0.15 {
		tx, ty = -ry*side, rx*side
		tm = 1
	}
	slide := step * 0.45
	nx, ny := e.X+tx/tm*slide, e.Y+ty/tm*slide
	if h.walkableAt(nx, ny) {
		e.X, e.Y = nx, ny
	}
}

func (h *Hub) walkableAt(x, y float64) bool {
	if h.overworld != nil {
		return h.overworld.WalkableAt(x, y)
	}
	return game.WalkableAt(x, y)
}

// chaseRepathInterval throttles A* recomputation while pursuing a target.
const chaseRepathInterval = 350 * time.Millisecond

// chaseAlongPath moves an entity along an A* route when the direct chase
// step is terrain-blocked. Paths use NPCWalkableTile, so a target standing in
// a sanctuary is unreachable and the caller disengages.
func (h *Hub) chaseAlongPath(e *entity, ch *chaseTarget, t *entity, step float64) bool {
	if h.overworld == nil {
		return false
	}
	now := time.Now()
	from := h.overworld.WorldToTile(e.X, e.Y)
	goal := h.overworld.WorldToTile(t.X, t.Y)
	if len(ch.path) == 0 || (ch.goal != goal && now.After(ch.repathAt)) {
		ch.path = h.overworld.Pathfind(from, goal, game.Region{})
		ch.pathI = 0
		ch.goal = goal
		ch.repathAt = now.Add(chaseRepathInterval)
		// The first node is the entity's own tile — don't walk back to its center.
		if len(ch.path) > 1 {
			ch.pathI = 1
		}
	}
	for ch.pathI < len(ch.path) {
		w := ch.path[ch.pathI]
		dx, dy := w.X-e.X, w.Y-e.Y
		d := math.Hypot(dx, dy)
		if d <= step {
			if h.walkableAt(w.X, w.Y) {
				e.X, e.Y = w.X, w.Y
			}
			ch.pathI++
			continue
		}
		nx, ny := e.X+dx/d*step, e.Y+dy/d*step
		if !h.walkableAt(nx, ny) {
			ch.path = nil // waypoint became blocked; repath next tick
			return true
		}
		e.X, e.Y = nx, ny
		return true
	}
	ch.path = nil // exhausted; next blocked step recomputes
	return false
}

// ---- combat flags ----

// playerEngaged reports whether any engaged NPC is fighting this player
// (targeting them, damaged by them, or targeting one of their pets).
func (h *Hub) playerEngaged(p *entity) bool {
	for _, n := range h.entities {
		if !engagedNPC(n) {
			continue
		}
		if n.targetID == p.ID || n.contributors[p.ID] > 0 {
			return true
		}
		if t := h.ent(n.targetID); t != nil && t.Kind == kindPet && t.OwnerID == p.ID {
			return true
		}
	}
	return false
}

// updateCombatFlags recomputes in_combat per player and broadcasts
// player_sync on transitions.
func (h *Hub) updateCombatFlags(now time.Time) {
	h.eachEntity(kindPlayer, func(e *entity) {
		cc := clientControlOf(e)
		if cc == nil {
			return
		}
		engaged := e.casting != nil || h.playerEngaged(e)
		if !e.alive {
			engaged = false
		}
		if engaged == cc.inCombat {
			return
		}
		cc.inCombat = engaged
		if !engaged {
			h.flushSkillUsage(e)
			h.fireLeaveCombat(e)
			h.eachEntity(kindPet, func(pet *entity) {
				if pet.OwnerID == e.ID {
					h.fireLeaveCombat(pet)
				}
			})
		}
		h.sendPlayerSync(e)
		if partyID, ok := h.clientParty[e.ID]; ok {
			h.broadcastPartySocial(h.parties[partyID])
		}
	})
}

func (h *Hub) fireLeaveCombat(e *entity) {
	for _, system := range e.pipeline {
		if hook, ok := system.(leaveCombatHook); ok {
			hook.OnLeaveCombat(h, e)
		}
	}
}

// ---- AoI broadcast ----

// playerActive: the player is actively fighting (target, GCD, cast, statuses,
// or engaged) — not just the inCombat flag.
func (h *Hub) playerActive(e *entity, now time.Time) bool {
	cc := clientControlOf(e)
	return (cc != nil && cc.inCombat) || e.targetID != "" || e.casting != nil ||
		len(e.statuses) > 0 || !e.gcdReady(now)
}

// combatSnapshots builds the entity list for AoI clients: engaged NPCs,
// fighting players, and their pets.
func (h *Hub) combatSnapshots(now time.Time) []protocol.WorldEntity {
	out := []protocol.WorldEntity{}
	activeOwners := map[string]bool{}
	for _, e := range h.entities {
		switch e.Kind {
		case kindNPC:
			if !engagedNPC(e) {
				continue
			}
			out = append(out, h.projector.project(e, now))
		case kindPlayer:
			if e.hidden || !h.playerActive(e, now) {
				continue
			}
			activeOwners[e.ID] = true
			out = append(out, h.projector.project(e, now))
		}
	}
	h.eachEntity(kindPet, func(e *entity) {
		if e.hidden || !activeOwners[e.OwnerID] {
			return
		}
		out = append(out, h.projector.project(e, now))
	})
	return out
}

// broadcastCombatTick sends snapshots only to clients whose AoI overlaps a
// fight; clients leaving the AoI get one empty tick so their HUD clears.
func (h *Hub) broadcastCombatTick() {
	now := time.Now()
	entities := h.combatSnapshots(now)
	if len(entities) == 0 {
		h.clearAoI()
		return
	}
	newAoI := map[string]bool{}
	msg := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{Entities: entities})
	h.eachEntity(kindPlayer, func(p *entity) {
		if p.hidden {
			return
		}
		in := h.playerActive(p, now)
		if !in {
			for _, e := range entities {
				if dist(p.X, p.Y, e.X, e.Y) <= combatAoIDist {
					in = true
					break
				}
			}
		}
		if !in {
			return
		}
		newAoI[p.ID] = true
		h.mu.RLock()
		c := h.clients[p.ID]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, msg)
		}
	})
	// Clients that left the AoI get one empty tick so their combat UI clears.
	if len(h.aoi) > 0 {
		var empty []byte
		for id := range h.aoi {
			if newAoI[id] {
				continue
			}
			if empty == nil {
				empty = protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{})
			}
			h.mu.RLock()
			c := h.clients[id]
			h.mu.RUnlock()
			if c != nil && c.Joined {
				h.sendRaw(c, empty)
			}
		}
	}
	h.aoi = newAoI
}

func (h *Hub) clearAoI() {
	if len(h.aoi) == 0 {
		return
	}
	empty := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{})
	for id := range h.aoi {
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, empty)
		}
	}
	h.aoi = nil
}

// sendCombatEvent delivers an action event to every client in the AoI (set)
// plus anyone within radius of the event origin who isn't tracked yet.
func (h *Hub) sendCombatEvent(ev protocol.CombatEventPayload, x, y float64) {
	ev.Entities = h.combatSnapshots(time.Now())
	msg := protocol.Encode(protocol.TypeCombatEvent, ev)
	h.eachEntity(kindPlayer, func(p *entity) {
		if p.hidden {
			return
		}
		if !h.aoi[p.ID] && dist(p.X, p.Y, x, y) > combatAoIDist {
			return
		}
		h.mu.RLock()
		c := h.clients[p.ID]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, msg)
		}
	})
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
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	if e := h.ensurePlayer(c); e != nil {
		e.targetID = p.TargetID
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
	tx := clamp(e.X+dx*dodgeDashDist, game.PlayerCollisionHalfW, worldW-game.PlayerCollisionHalfW)
	ty := clamp(e.Y+dy*dodgeDashDist, game.PlayerCollisionHalfH, worldH)
	if h.overworld != nil {
		e.X, e.Y = h.overworld.SlideMovePlayer(prevX, prevY, tx, ty)
	} else {
		e.X, e.Y = game.SlideMovePlayer(prevX, prevY, tx, ty)
	}
	e.Facing = game.ResolveFacingYaw(e.X-prevX, e.Y-prevY, 0, false, e.Facing)

	h.send(c, protocol.TypePlayerSync, h.entitySync(e))
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: c.ID, X: e.X, Y: e.Y, Facing: e.Facing,
	}))
	h.persistWorldLocation(c, e, false)
	h.checkAggroAt(c.ID, e.X, e.Y)
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: c.ID, ActionID: game.ActionIDDodge,
		ActionName: game.SkillDodge.Name, Success: true, Hit: true,
		Message: fmt.Sprintf("%s dodges", e.Name),
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
	if skill.WorldOnly {
		res.Message = "Cannot use that here."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	if skill.WeaponReq != "" && skill.WeaponReq != cc.weaponForSkill(skill) {
		res.Message = "Requires a " + string(skill.WeaponReq) + "."
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
		// Ally-targeted: any same-faction entity (players, pets), self when empty.
		tgtID := action.TargetID
		if tgtID == "" {
			tgtID = c.ID
		}
		t = h.ent(tgtID)
		if !h.canAssist(e, t) {
			res.Message = "Invalid target."
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
		if dist(e.X, e.Y, t.X, t.Y) > allySkillRangeW {
			res.Message = "Target out of range."
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
	} else {
		// Enemy-targeted: the given target if attackable, else auto-target.
		t = h.ent(action.TargetID)
		if !h.canAttack(e, t) {
			t = h.autoTarget(e)
		}
		if t == nil {
			res.Message = "No valid target."
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
		e.targetID = t.ID
		e.engageID = t.ID // committing an attack — pets may follow it
		if !h.skillHits(e, t, skill) {
			res.Message = "Target out of range."
			res.TargetID = t.ID
			h.sendCombatEvent(res, e.X, e.Y)
			return
		}
	}
	res.TargetID = t.ID
	if game.SkillCastTime(skill) > 0 {
		e.mp -= skill.MPCost
		if !game.SkillTargetsAlly(skill) || cc.inCombat {
			e.startGCD(now)
		}
		e.casting = &activeCast{SkillID: skill.ID, TargetID: t.ID}
		e.castX, e.castY = e.X, e.Y
		res.Success = true
		res.CastStarted = true
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	h.applySkillTo(e, t, skill, res)
}

// autoTarget keeps a valid current target, else picks the nearest attackable
// entity within drop range — the client only offers on-screen targets, so a
// far-away fallback would target something the player can't see.
func (h *Hub) autoTarget(e *entity) *entity {
	if t := h.validTarget(e); t != nil {
		return t
	}
	best := h.nearestAttackable(e, dropRange)
	if best != nil {
		e.targetID = best.ID
	}
	return best
}

func (h *Hub) skillHits(e, t *entity, skill game.Skill) bool {
	d := dist(e.X, e.Y, t.X, t.Y)
	if mx := game.SkillMaxRange(skill); mx > 0 {
		return d <= mx
	}
	return d <= attackRangeW+enemyRadiusW
}

const allySkillRangeW = game.AllySkillRange

// splashEnmity credits threat on every engaged enemy that considers `e`
// attackable — self/ally actions (cures, buffs, items) raise enmity with the
// whole fight, not just one target.
func (h *Hub) splashEnmity(e *entity, amount int) {
	if e == nil || amount <= 0 {
		return
	}
	h.eachEntity(kindNPC, func(n *entity) {
		ng := npcEngageOf(n)
		if ng == nil || !ng.engaged || !h.canAttack(n, e) {
			return
		}
		h.addEnmity(n, e, amount)
	})
}

// topEnmity returns the attackable entity holding the most threat on e's
// enmity table, or nil when the table is empty or fully stale.
func (h *Hub) topEnmity(e *entity) *entity {
	var best *entity
	bestV := 0
	for id, v := range e.enmity {
		t := h.ent(id)
		if !h.canAttack(e, t) {
			continue
		}
		if v > bestV || best == nil {
			best, bestV = t, v
		}
	}
	return best
}

// applySkillTo resolves an instant or finished-cast skill from caster onto
// target — heals/buffs for ally skills, damage for enemy skills. The caster
// must be a player (skills are player abilities).
func (h *Hub) applySkillTo(caster, target *entity, skill game.Skill, res protocol.CombatEventPayload) {
	now := time.Now()
	cc := clientControlOf(caster)
	if cc == nil {
		return
	}
	ally := game.SkillTargetsAlly(skill)
	if caster.casting == nil && game.SkillCastTime(skill) == 0 {
		caster.mp -= skill.MPCost
		if !ally || cc.inCombat {
			caster.startGCD(now)
		}
	}
	res.Success = true
	amount := h.rollDamage(caster, skill)
	amount = game.ModifyDamageDealt(caster.statuses, amount)
	if ally {
		healed := 0
		if skill.Heals {
			healed = h.applyHeal(target, amount)
			res.Heal = amount
		}
		h.applyStatuses(caster, target, skill)
		h.trackSkillUse(caster, skill)
		// Helping your side raises threat with everything fighting it.
		h.splashEnmity(caster, enmityAllyBase+healed/2)
		res.Message = fmt.Sprintf("%s heals %s for %d", caster.Name, target.Name, amount)
		h.sendCombatEvent(res, caster.X, caster.Y)
		if target.Kind == kindPlayer {
			h.sendPlayerSync(target)
		}
		return
	}
	h.applyDamageMsg(caster, target, amount, res, "%s hits %s for %d")
	if target.alive {
		h.applyStatuses(caster, target, skill)
	}
	h.trackSkillUse(caster, skill)
}

func (h *Hub) rollDamage(e *entity, skill game.Skill) int {
	cc := clientControlOf(e)
	stat := e.str
	if skill.UsesMagic {
		stat = e.mag
	}
	power := skill.Power
	skillLvl := 1
	if cc != nil {
		if lvl := cc.skillLevels[skill.ID]; lvl > 1 {
			skillLvl = lvl
		}
	}
	power *= game.SkillLevelPotency(skillLvl)
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
	}
	dmg := int(float64(stat) * power * (0.85 + h.rng.Float64()*0.3))
	if dmg < 1 {
		dmg = 1
	}
	return dmg
}

// applyStatuses attaches a skill's configured effects to the target (or the
// caster for OnCaster effects).
func (h *Hub) applyStatuses(caster, target *entity, skill game.Skill) {
	for _, def := range game.StatusesForSkill(skill.ID) {
		list := &target.statuses
		if def.OnCaster {
			list = &caster.statuses
		}
		shield := 0
		if def.Kind == game.StatusShield {
			shield = max(1, int(float64(caster.mag)*skill.Power*2))
		}
		game.ApplyStatus(list, def, caster.ID, shield)
	}
}

func (h *Hub) trackSkillUse(e *entity, skill game.Skill) {
	if game.SkillAlwaysUnlocked(skill.ID) {
		return
	}
	if cc := clientControlOf(e); cc != nil {
		cc.pendingSkillUses[skill.ID]++
	}
}

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
	if dist(e.X, e.Y, t.X, t.Y) > allySkillRangeW {
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
		h.sendWelcome(c, profile)
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
		// No usable target in the payload — pick the closest attackable foe,
		// same as every other enemy-targeted skill.
		n = h.autoTarget(e)
	}
	r := respawnOf(n)
	if n == nil || n.Kind != kindNPC || r == nil {
		res.Message = "Invalid target."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
	res.TargetID = n.ID
	if dist(e.X, e.Y, n.X, n.Y) > allySkillRangeW {
		res.Message = "Target out of range."
		h.sendCombatEvent(res, e.X, e.Y)
		return
	}
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
	h.sendWelcome(c, profile)
	h.captureNPC(n, e)
}

// captureNPC removes a caught NPC (no loot, XP still awarded).
func (h *Hub) captureNPC(n, by *entity) {
	if r := respawnOf(n); r != nil {
		r.captured = true
	}
	h.kill(n, by)
}

// defeatPlayer respawns a fallen player at their save point and drops them
// from every fight. Invoked from clientControl.OnDeath (via h.kill).
func (h *Hub) defeatPlayer(clientID string) {
	e := h.playerEnt(clientID)
	cc := clientControlOf(e)
	if e == nil || cc == nil {
		return
	}
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: clientID, TargetID: clientID,
		Message: fmt.Sprintf("%s was defeated", e.Name),
	}, e.X, e.Y)
	e.casting = nil
	e.statuses = nil
	e.targetID = ""
	e.engageID = ""
	cc.inCombat = false
	h.flushSkillUsage(e)
	for _, n := range h.entities {
		if n.Kind == kindNPC {
			delete(n.contributors, clientID)
			delete(n.enmity, clientID)
		}
	}
	// Restore and respawn.
	e.alive = true
	e.hp = e.maxHP
	e.mp = e.maxMP
	cc.stamina = staminaMax
	cc.staminaAt = time.Now()
	h.respawnAtSavePoint(clientID)
	h.grantBattleImmunity(e)
	h.sendPlayerSync(e)
	h.mu.RLock()
	c := h.clients[clientID]
	h.mu.RUnlock()
	if c != nil {
		if profile, ok := h.store.Get(c.Name); ok {
			h.sendWelcome(c, profile)
		}
	}
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

func (h *Hub) nameOf(id string) string {
	if e := h.ent(id); e != nil {
		return e.Name
	}
	return id
}

// ---- rewards ----

// awardKill splits XP/loot among everyone who damaged the NPC, plus a passive
// share for nearby party members who stayed out of the fight.
func (h *Hub) awardKill(n *entity) {
	h.awardKillInternal(n, true)
}

func (h *Hub) awardKillXPOnly(n *entity) {
	h.awardKillInternal(n, false)
}

func (h *Hub) awardKillInternal(n *entity, loot bool) {
	if len(n.contributors) == 0 {
		return
	}
	totalXP := 20 + n.Level*15
	contributors := make([]string, 0, len(n.contributors))
	for id := range n.contributors {
		contributors = append(contributors, id)
	}
	share := totalXP / len(contributors)
	if share < 1 {
		share = 1
	}

	// Party bonus: 2+ members of one party contributing.
	partyCount := map[string]int{}
	for _, id := range contributors {
		if p := h.clientParty[id]; p != "" {
			partyCount[p]++
		}
	}
	bonusParty := ""
	for p, n2 := range partyCount {
		if n2 >= 2 {
			bonusParty = p
			break
		}
	}

	var pools []string
	if r := respawnOf(n); loot && r != nil && r.dropPoolID != "" {
		pools = []string{r.dropPoolID}
	}

	for _, id := range contributors {
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c == nil {
			continue
		}
		xp := share
		if bonusParty != "" && h.clientParty[id] == bonusParty {
			xp = share * (100 + partyInCombatBonusPercent) / 100
		}
		hasSub := false
		if profile, ok := h.store.Get(c.Name); ok && profile.SubJob != "" {
			hasSub = true
		}
		mainXP, subXP := game.DistributeJobXP(xp, hasSub)
		items := game.GenerateVictoryLoot(h.rng, n.Level, 0, pools)
		updated, _, _ := h.store.AwardJobVictory(c.Name, mainXP, subXP, items)
		h.sendWelcome(c, updated)
		msg := fmt.Sprintf("Defeated %s — +%d EXP", n.Name, xp)
		if len(items) > 0 {
			msg += fmt.Sprintf(", found %s", items[0].Name)
		}
		h.send(c, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
			XP: xp, Victory: true, Message: msg,
		})
		// Refresh world level after a level-up.
		if p := h.playerEnt(id); p != nil {
			p.Level = updated.MainJobLevel()
		}
		// Award XP to the battle pet (same base share as the player).
		h.awardPetXP(c, xp)
	}

	// Passive party share for nearby members who didn't fight.
	partyIDs := map[string]bool{}
	for _, id := range contributors {
		if p := h.clientParty[id]; p != "" {
			partyIDs[p] = true
		}
	}
	fought := map[string]bool{}
	for _, id := range contributors {
		fought[id] = true
	}
	passiveXP := share * partyPassiveXPPercent / 100
	if passiveXP < 1 {
		passiveXP = 1
	}
	for pid := range partyIDs {
		party := h.parties[pid]
		if party == nil {
			continue
		}
		for _, memberID := range party.MemberIDs {
			if fought[memberID] {
				continue
			}
			p := h.playerEnt(memberID)
			if p == nil || p.hidden || dist(p.X, p.Y, n.X, n.Y) > partyBattleRange {
				continue
			}
			h.mu.RLock()
			mc := h.clients[memberID]
			h.mu.RUnlock()
			if mc == nil {
				continue
			}
			hasSub := false
			if profile, ok := h.store.Get(mc.Name); ok && profile.SubJob != "" {
				hasSub = true
			}
			pm, ps := game.DistributeJobXP(passiveXP, hasSub)
			updated, _, _ := h.store.AwardJobVictory(mc.Name, pm, ps, nil)
			h.sendWelcome(mc, updated)
			h.send(mc, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
				XP: pm, Passive: true, Victory: true,
				Message: fmt.Sprintf("Party victory — +%d passive EXP (you stayed out of combat).", pm),
			})
		}
	}
}

// outOfCombatRegen slowly restores hp/mp/stamina for players not fighting.
// Runs on the 250ms tick so idle players don't need the combat tick.
func (h *Hub) outOfCombatRegen() {
	now := time.Now()
	h.eachEntity(kindPlayer, func(e *entity) {
		cc := clientControlOf(e)
		if cc == nil || e.hidden {
			return
		}
		changed := false
		prev := cc.stamina
		stam := cc.staminaNow(now)
		if math.Abs(stam-prev) >= 0.5 {
			changed = true
		}
		if !cc.inCombat && e.alive && (e.hp < e.maxHP || e.mp < e.maxMP) {
			cc.regenAcc += npcTickSec
			if cc.regenAcc >= 1 {
				cc.regenAcc = 0
				e.hp = min(e.maxHP, e.hp+max(1, e.maxHP/12))
				e.mp = min(e.maxMP, e.mp+max(1, e.maxMP/12))
				changed = true
			}
		}
		if changed || now.Sub(cc.lastResourceSync) >= resourceSyncInterval {
			h.mu.RLock()
			c := h.clients[e.ID]
			h.mu.RUnlock()
			if c != nil && c.Joined {
				h.send(c, protocol.TypePlayerSync, h.entitySync(e))
				cc.lastResourceSync = now
			}
		}
	})
}
