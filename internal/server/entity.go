package server

import (
	"fmt"
	"math"
	"reflect"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// Unified world entity. Players, NPCs and pets are all `entity` values living
// in Hub.entities. Shared combat/targeting/status behaviour lives here on the
// hub; kind-specific behaviour (client control, wander, follow-owner, chase,
// attack, respawn, level sync) is supplied by plugins attached per entity.

type entityKind string

const (
	kindPlayer entityKind = "player"
	kindNPC    entityKind = "npc"
	kindPet    entityKind = "pet"
)

type faction int

const (
	factionAlly    faction = iota // players and pets
	factionHostile                // hostile NPCs
	factionNeutral                // non-hostile NPCs: never attack, never targetable
)

type entity struct {
	ID      string
	Name    string
	Kind    entityKind
	Sprite  string // template key: enemy kind ("goblin") for npc/pet, race for players
	Level   int
	X, Y    float64
	Facing  float64
	Faction faction
	OwnerID string // pets only

	// Shared combat core.
	hp, maxHP, mp, maxMP int
	str, mag, agi        int
	statuses             []game.ActiveStatus
	statusTick           int
	targetID             string
	engageID             string // players only: enemy the player committed an attack on (pets auto-engage it; target selection alone does not count)
	attackCD             time.Time
	casting              *activeCast
	castX, castY         float64
	gcdReadyAt           time.Time
	contributors         map[string]int // rewarded entity ID -> damage dealt to me
	alive                bool
	hidden               bool // not present on the world (npc despawned, player in house)
	petHold              bool // pets only: heeled — never acquire a target, just follow

	plugins []entityPlugin
}

// entityPlugin is a behaviour attached to an entity. Tick runs on every hub
// tick (combatTickInterval) for every entity; plugins decide when to act.
type entityPlugin interface {
	Tick(h *Hub, e *entity, now time.Time, dt float64)
}

// Optional plugin hooks.
type deathHook interface {
	OnDeath(h *Hub, e *entity, killer *entity)
}
type damagedHook interface {
	OnDamaged(h *Hub, e *entity, from *entity, dmg int)
}
type leaveCombatHook interface {
	OnLeaveCombat(h *Hub, e *entity)
}

// plugin finds the plugin whose concrete type matches *target (target must be
// a non-nil pointer to a pointer-typed plugin variable), like errors.As.
//
//	var cc *clientControl
//	if e.plugin(&cc) { ... }
func (e *entity) plugin(target any) bool {
	if e == nil || target == nil {
		return false
	}
	tv := reflect.ValueOf(target)
	if tv.Kind() != reflect.Pointer || tv.IsNil() {
		return false
	}
	want := tv.Elem().Type()
	for _, p := range e.plugins {
		pv := reflect.ValueOf(p)
		if pv.Type() == want {
			tv.Elem().Set(pv)
			return true
		}
	}
	return false
}

func (e *entity) onWorld() bool { return e != nil && !e.hidden }

// presentAndAlive is the common "can participate in combat" gate.
func (e *entity) presentAndAlive() bool { return e != nil && e.alive && !e.hidden }

func (e *entity) gcdProgress(now time.Time) float64 {
	if e.gcdReadyAt.IsZero() || !now.Before(e.gcdReadyAt) {
		return 100
	}
	elapsed := gcdDuration - time.Until(e.gcdReadyAt)
	if elapsed < 0 {
		return 0
	}
	return math.Min(100, 100*elapsed.Seconds()/gcdDuration.Seconds())
}

func (e *entity) gcdReady(now time.Time) bool {
	return e.gcdReadyAt.IsZero() || !now.Before(e.gcdReadyAt)
}

func (e *entity) startGCD(now time.Time) { e.gcdReadyAt = now.Add(gcdDuration) }

// ---- lookup ----

func (h *Hub) ent(id string) *entity {
	if id == "" {
		return nil
	}
	return h.entities[id]
}

// playerEnt returns the player entity for a client ID (nil for other kinds).
func (h *Hub) playerEnt(clientID string) *entity {
	e := h.ent(clientID)
	if e == nil || e.Kind != kindPlayer {
		return nil
	}
	return e
}

func (h *Hub) eachEntity(kind entityKind, fn func(*entity)) {
	for _, e := range h.entities {
		if e.Kind == kind {
			fn(e)
		}
	}
}

// ownerOf resolves a pet's owner entity (nil for non-pets / offline owner).
func (h *Hub) ownerOf(e *entity) *entity {
	if e == nil || e.Kind != kindPet {
		return nil
	}
	return h.playerEnt(e.OwnerID)
}

// clientControlOf returns the player plugin, or nil.
func clientControlOf(e *entity) *clientControl {
	var cc *clientControl
	if e != nil && e.plugin(&cc) {
		return cc
	}
	return nil
}

// ---- faction / targeting rules ----

// battleImmuneEnt reports the join/respawn grace window for players.
func battleImmuneEnt(e *entity) bool {
	cc := clientControlOf(e)
	return cc != nil && cc.immuneUntil > time.Now().UnixMilli()
}

// inSanctuary reports whether an entity stands on a sanctuary tile.
func (h *Hub) inSanctuary(e *entity) bool {
	return h.overworld != nil && h.overworld.SanctuaryAtWorld(e.X, e.Y)
}

// canAttack: a may deal damage to b.
func (h *Hub) canAttack(a, b *entity) bool {
	if a == nil || b == nil || a == b {
		return false
	}
	if !a.presentAndAlive() || !b.presentAndAlive() {
		return false
	}
	if a.Faction == factionNeutral || b.Faction == factionNeutral {
		return false
	}
	if a.Faction == b.Faction {
		return false
	}
	if battleImmuneEnt(b) {
		return false
	}
	return true
}

// canAssist: a may heal/buff b (same faction, b present and alive).
func (h *Hub) canAssist(a, b *entity) bool {
	if a == nil || b == nil {
		return false
	}
	if !b.presentAndAlive() || !a.onWorld() {
		return false
	}
	return a.Faction == b.Faction
}

// validTarget resolves e.targetID to an attackable entity, clearing a stale
// target and returning nil otherwise.
func (h *Hub) validTarget(e *entity) *entity {
	t := h.ent(e.targetID)
	if t == nil || !h.canAttack(e, t) {
		if e.targetID != "" {
			e.targetID = ""
		}
		return nil
	}
	return t
}

// nearestAttackable picks the closest entity `from` may attack within maxD.
// Hostile attackers skip players standing in a sanctuary (unreachable).
func (h *Hub) nearestAttackable(from *entity, maxD float64) *entity {
	var best *entity
	bestD := maxD
	for _, t := range h.entities {
		if !h.canAttack(from, t) {
			continue
		}
		if from.Faction == factionHostile && t.Kind == kindPlayer && h.inSanctuary(t) {
			continue
		}
		if d := dist(from.X, from.Y, t.X, t.Y); d <= bestD && (best == nil || d < bestD) {
			bestD, best = d, t
		}
	}
	return best
}

// clearTargeting drops `id` as a target from every entity; players also get a
// set_target "" echo so the client releases the focus ring.
func (h *Hub) clearTargeting(id string) {
	for _, e := range h.entities {
		if e.engageID == id {
			e.engageID = ""
		}
		if e.targetID != id {
			continue
		}
		e.targetID = ""
		if e.Kind == kindPlayer {
			if c := h.clients[e.ID]; c != nil {
				h.send(c, protocol.TypeSetTarget, protocol.SetTargetPayload{TargetID: ""})
			}
		}
	}
}

// rewardID is the ID credited for damage dealt by `src` (pets credit owner).
func rewardID(src *entity) string {
	if src == nil {
		return ""
	}
	if src.Kind == kindPet && src.OwnerID != "" {
		return src.OwnerID
	}
	return src.ID
}

// ---- damage / heal / death ----

// basicAttackEvent is the event template for plugin melee hits.
func basicAttackEvent() protocol.CombatEventPayload {
	return protocol.CombatEventPayload{ActionID: game.BasicAttack.ID, ActionName: game.BasicAttack.Name}
}

// applyDamage is the single damage path for every entity pairing. `ev`
// supplies ActionID/ActionName; attacker, target, damage and hit flags are
// filled in here. Returns the damage dealt.
func (h *Hub) applyDamage(src, dst *entity, dmg int, ev protocol.CombatEventPayload) int {
	return h.applyDamageMsg(src, dst, dmg, ev, "")
}

// applyDamageMsg is applyDamage with a custom message format. msgFmt is a
// fmt.Sprintf template taking (attacker name, target name, dealt damage);
// empty uses the default "%s struck %s" melee text.
func (h *Hub) applyDamageMsg(src, dst *entity, dmg int, ev protocol.CombatEventPayload, msgFmt string) int {
	if dst == nil || !dst.alive {
		return 0
	}
	dmg = game.ModifyDamageTaken(&dst.statuses, dmg)
	if dmg < 0 {
		dmg = 0
	}
	dst.hp -= dmg
	if dst.hp < 0 {
		dst.hp = 0
	}
	if src != nil {
		if dst.contributors == nil {
			dst.contributors = map[string]int{}
		}
		dst.contributors[rewardID(src)] += dmg
	}
	srcName := "the world"
	x, y := dst.X, dst.Y
	if src != nil {
		ev.AttackerID = src.ID
		srcName = src.Name
		x, y = src.X, src.Y
	}
	ev.TargetID = dst.ID
	ev.Damage = dmg
	ev.Hit, ev.Success = true, true
	if ev.Message == "" {
		if msgFmt != "" {
			ev.Message = fmt.Sprintf(msgFmt, srcName, dst.Name, dmg)
		} else {
			ev.Message = fmt.Sprintf("%s struck %s", srcName, dst.Name)
		}
	}
	h.sendCombatEvent(ev, x, y)
	for _, p := range dst.plugins {
		if hk, ok := p.(damagedHook); ok {
			hk.OnDamaged(h, dst, src, dmg)
		}
	}
	if dst.hp <= 0 {
		h.kill(dst, src)
	}
	return dmg
}

func (h *Hub) applyHeal(dst *entity, amount int) int {
	if dst == nil || !dst.alive || amount <= 0 {
		return 0
	}
	before := dst.hp
	dst.hp = min(dst.maxHP, dst.hp+amount)
	return dst.hp - before
}

// kill marks an entity dead, releases everyone targeting it, and runs the
// kind-specific death hooks (rewards/despawn/respawn/defeat).
func (h *Hub) kill(e, killer *entity) {
	if e == nil || !e.alive {
		return
	}
	e.alive = false
	e.hp = 0
	e.casting = nil
	e.statuses = nil
	e.targetID = ""
	h.clearTargeting(e.ID)
	for _, p := range e.plugins {
		if hk, ok := p.(deathHook); ok {
			hk.OnDeath(h, e, killer)
		}
	}
}

// ---- shared per-tick behaviour ----

// tickEntityStatuses applies DoT/HoT on the 200ms ATB cadence (every 4th
// 50ms tick). Players use (str+mag)/4 as tick power; NPCs/pets maxHP/20.
func (h *Hub) tickEntityStatuses(e *entity) {
	if !e.alive || len(e.statuses) == 0 {
		return
	}
	e.statusTick++
	if e.statusTick%4 != 0 {
		return
	}
	tickPower := max(1, e.maxHP/20)
	if e.Kind == kindPlayer {
		tickPower = max(1, (e.str+e.mag)/4)
	}
	heal, poison := game.TickStatuses(&e.statuses, e.maxHP, tickPower)
	if heal > 0 {
		h.applyHeal(e, heal)
	}
	if poison > 0 {
		e.hp -= poison
		if e.hp <= 0 {
			e.hp = 0
			h.kill(e, nil)
			return
		}
	}
	if e.Kind == kindPlayer && (heal > 0 || poison > 0) {
		if cc := clientControlOf(e); cc != nil && !cc.inCombat {
			h.sendPlayerSync(e)
		}
	}
}

// tickEntities is the single hub simulation step, run every combatTickInterval.
func (h *Hub) tickEntities(now time.Time) {
	dt := combatTickInterval.Seconds()
	h.syncPetEntities()
	for _, e := range h.entities {
		for _, p := range e.plugins {
			p.Tick(h, e, now, dt)
		}
		h.tickEntityStatuses(e)
		h.advanceCast(e, now)
	}
	if h.entityDirty {
		h.entityDirty = false
		h.broadcastEntityState()
	}
	if !h.combatActive() {
		if len(h.aoi) > 0 {
			h.clearAoI()
		}
		return
	}
	h.updateCombatFlags(now)
	h.broadcastCombatTick()
}

// combatActive reports whether any fight/cast/status is live anywhere.
func (h *Hub) combatActive() bool {
	now := time.Now()
	for _, e := range h.entities {
		switch e.Kind {
		case kindNPC:
			if e.onWorld() && e.targetID != "" {
				return true
			}
		case kindPlayer:
			cc := clientControlOf(e)
			if (cc != nil && cc.inCombat) || e.casting != nil || e.targetID != "" ||
				len(e.statuses) > 0 || !e.gcdReady(now) {
				return true
			}
		}
	}
	return false
}

// entitySnapshot adapts any entity to the wire WorldEntity. Kind-specific
// fields (player presence, npc engagement, pet ownership) come from plugins.
func (h *Hub) entitySnapshot(e *entity, now time.Time) protocol.WorldEntity {
	we := protocol.WorldEntity{
		ID: e.ID, Name: e.Name, Kind: string(e.Kind), Sprite: e.Sprite,
		OwnerID: e.OwnerID, Level: e.Level,
		X: e.X, Y: e.Y, Facing: e.Facing,
		HP: e.hp, MaxHP: e.maxHP, MP: e.mp, MaxMP: e.maxMP,
		Alive: e.alive, TargetID: e.targetID,
		Statuses: game.Snapshots(e.statuses),
	}
	switch e.Kind {
	case kindPlayer:
		if cc := clientControlOf(e); cc != nil {
			we.Weapon, we.MainJob, we.SubJob = cc.weaponName, cc.mainJobName, cc.subJobName
			we.Appearance = cc.appearance
			we.Engaged = cc.inCombat
			we.Stamina = cc.staminaNow(now)
			we.InHouse, we.HouseOwner = cc.inHouse, cc.houseOwner
			we.ImmuneUntil = cc.immuneUntil
			we.CastingSkillID = cc.fieldCastSkillID
			we.CastTimeMs = cc.fieldCastTimeMs
			we.CastEndsAt = cc.fieldCastEndsAt
		}
		we.SkillATB = e.gcdProgress(now)
		if e.casting != nil {
			we.CastingSkillID = e.casting.SkillID
			we.CastTargetID = e.casting.TargetID
			we.CastProgress = e.casting.Progress
			we.CastEndsAt = 0
			if sk, ok := game.FindSkill(e.casting.SkillID); ok {
				we.CastTimeMs = game.SkillCastTime(sk)
			}
		}
	case kindNPC:
		if ng := npcEngageOf(e); ng != nil {
			we.Engaged = ng.engaged
		}
		if r := respawnOf(e); r != nil {
			we.Capturable = r.capturable
		}
	case kindPet:
		we.IsAlly = true
	}
	return we
}

// moveToward advances e toward (gx,gy) by at most step, never overshooting.
// Returns the distance actually moved.
func moveToward(e *entity, gx, gy, step float64) float64 {
	dx, dy := gx-e.X, gy-e.Y
	d := math.Hypot(dx, dy)
	if d < 0.01 {
		return 0
	}
	if d <= step {
		e.X, e.Y = gx, gy
		return d
	}
	e.X += dx / d * step
	e.Y += dy / d * step
	return step
}
