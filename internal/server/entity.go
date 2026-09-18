package server

import (
	"fmt"
	"math"
	"sort"
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

	// regionID is the server-authoritative simulation owner in singular-world
	// mode. It is intentionally not part of the public entity projection.
	regionID string

	// Shared combat core. stats is the five-affinity block: str scales
	// physical damage, dex accuracy/attack speed, vit physical defense and
	// max HP, int elemental damage and max MP, md magic defense and healing.
	hp, maxHP, mp, maxMP   int
	str, dex, vit, int, md int
	statuses               []game.ActiveStatus
	statusTick             int
	targetID               string
	engageID               string // players only: enemy the player committed an attack on (pets auto-engage it; target selection alone does not count)
	attackCD               time.Time
	casting                *activeCast
	castX, castY           float64
	gcdReadyAt             time.Time
	gcdDur                 time.Duration  // dex-scaled length of the last startGCD
	contributors           map[string]int // rewarded entity ID -> damage dealt to me
	enmity                 map[string]int // NPCs only: entity ID -> threat held toward it
	alive                  bool
	hidden                 bool // not present on the world (npc despawned, player in house)
	petHold                bool // pets only: heeled — never acquire a target, just follow

	components entityComponents
	pipeline   []entitySystem
}

// entityComponents are explicit, typed component slots. Archetypes populate
// only the slots they use; pipeline separately preserves their execution order.
type entityComponents struct {
	clientControl *clientControl
	wander        *wander
	npcEngage     *npcEngage
	chaseTarget   *chaseTarget
	attackTarget  *attackTarget
	respawn       *respawn
	followOwner   *followOwner
	petLevelSync  *petLevelSync
}

// entitySystem runs on every hub tick (combatTickInterval). Components decide
// when to act; each archetype's pipeline fixes the legacy plugin order.
type entitySystem interface {
	Tick(h *Hub, e *entity, now time.Time, dt float64)
}

// Optional component hooks.
type deathHook interface {
	OnDeath(h *Hub, e *entity, killer *entity)
}
type damagedHook interface {
	OnDamaged(h *Hub, e *entity, from *entity, dmg int)
}
type leaveCombatHook interface {
	OnLeaveCombat(h *Hub, e *entity)
}

func (e *entity) onWorld() bool { return e != nil && !e.hidden }

// presentAndAlive is the common "can participate in combat" gate.
func (e *entity) presentAndAlive() bool { return e != nil && e.alive && !e.hidden }

func (e *entity) gcdLen() time.Duration {
	if e.gcdDur <= 0 {
		return gcdDuration
	}
	return e.gcdDur
}

func (e *entity) gcdProgress(now time.Time) float64 {
	if e.gcdReadyAt.IsZero() || !now.Before(e.gcdReadyAt) {
		return 100
	}
	elapsed := e.gcdLen() - time.Until(e.gcdReadyAt)
	if elapsed < 0 {
		return 0
	}
	return math.Min(100, 100*elapsed.Seconds()/e.gcdLen().Seconds())
}

func (e *entity) gcdReady(now time.Time) bool {
	return e.gcdReadyAt.IsZero() || !now.Before(e.gcdReadyAt)
}

// startGCD starts the global cooldown scaled by dex — attack speed.
func (e *entity) startGCD(now time.Time) {
	e.gcdDur = time.Duration(float64(gcdDuration) * game.AttackSpeedScale(e.dex))
	e.gcdReadyAt = now.Add(e.gcdDur)
}

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
	if e == nil {
		return nil
	}
	return e.components.clientControl
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

// focusTarget resolves a player's selected focus to an attackable entity
// without dropping the selection: a friendly or dead focus is still a valid
// focus, it just can't be attacked. Departed entities are already cleared by
// clearTargeting.
func (h *Hub) focusTarget(e *entity) *entity {
	t := h.ent(e.targetID)
	if t == nil || !h.canAttack(e, t) {
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
		delete(e.enmity, id)
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
	h.broadcastNPCActorRemoved(id)
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

// addEnmity credits threat on dst toward src. Only NPCs keep enmity tables —
// they are the entities that choose victims by it. src holds the entry under
// its own ID (pets tank for themselves even though XP credits the owner).
func (h *Hub) addEnmity(dst, src *entity, amount int) {
	if dst == nil || src == nil || dst.Kind != kindNPC || amount <= 0 {
		return
	}
	if w := h.npcWorkerFor(dst); w != nil {
		h.commandNPC(dst.ID, npcCommand{Kind: npcCmdEnmity, Source: cloneEntity(src, false), Enmity: amount})
		return
	}
	if dst.enmity == nil {
		dst.enmity = map[string]int{}
	}
	dst.enmity[src.ID] += amount
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
	return h.applyDamageMsgReflectable(src, dst, dmg, ev, msgFmt, true, game.ClassPhysical)
}

// applyDamageMsgClass is applyDamageMsg for a specific damage class: physical
// is mitigated by the target's vit, elemental by md, true is unmitigated.
func (h *Hub) applyDamageMsgClass(src, dst *entity, dmg int, ev protocol.CombatEventPayload, msgFmt, class string) int {
	return h.applyDamageMsgReflectable(src, dst, dmg, ev, msgFmt, true, class)
}

// defenseStat returns the stat that mitigates the damage class.
func defenseStat(e *entity, class string) int {
	switch class {
	case game.ClassElemental:
		return e.md
	case game.ClassPhysical:
		return e.vit
	}
	return 0
}

func (h *Hub) applyDamageMsgReflectable(src, dst *entity, dmg int, ev protocol.CombatEventPayload, msgFmt string, reflectable bool, class string) int {
	if dst == nil || !dst.alive {
		return 0
	}
	if h.npcEffects != nil && dst.Kind != kindNPC {
		return h.npcEffects.recordAttack(src, dst, dmg, ev, msgFmt)
	}
	if h.npcWorkerFor(dst) != nil {
		return h.commandNPCDamage(src, dst, dmg, ev, msgFmt, class)
	}
	dmg = game.ModifyDamageTaken(&dst.statuses, dmg)
	if dmg > 0 {
		dmg = max(1, dmg-int(float64(dmg)*game.Mitigation(defenseStat(dst, class))))
	} else {
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
		// Offensive action on the target: flat action enmity + damage dealt.
		h.addEnmity(dst, src, enmityActionBase+dmg)
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
	if reflectable && src != nil && src != dst && src.alive && dst.alive {
		if cc := clientControlOf(dst); cc != nil {
			if chance, ratio := game.PassiveReflect(cc.skillLevels); chance > 0 && h.rng.Float64() < chance {
				reflected := max(1, int(float64(dmg)*ratio))
				h.applyDamageMsgReflectable(dst, src, reflected, protocol.CombatEventPayload{
					ActionID:   "reflect",
					ActionName: "Reflect",
					Message:    fmt.Sprintf("%s reflects %d damage", dst.Name, reflected),
				}, "", false, game.ClassTrue)
			}
		}
	}
	for _, system := range dst.pipeline {
		if hook, ok := system.(damagedHook); ok {
			hook.OnDamaged(h, dst, src, dmg)
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
	if h.npcWorkerFor(e) != nil {
		captured := false
		if r := respawnOf(e); r != nil {
			captured = r.captured
		}
		h.commandNPC(e.ID, npcCommand{Kind: npcCmdKill, Source: cloneEntity(killer, false), Captured: captured})
		h.clearTargeting(e.ID)
		return
	}
	e.alive = false
	e.hp = 0
	e.casting = nil
	e.statuses = nil
	e.targetID = ""
	e.enmity = nil
	h.clearTargeting(e.ID)
	for _, system := range e.pipeline {
		if hook, ok := system.(deathHook); ok {
			hook.OnDeath(h, e, killer)
		}
	}
}

// ---- shared per-tick behaviour ----

// tickEntityStatuses applies DoT/HoT on the 200ms ATB cadence (every 4th
// 50ms tick). Players use (str+int)/4 as tick power; NPCs/pets maxHP/20.
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
		tickPower = max(1, (e.str+e.int)/4)
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
	if h.petSyncDue(now) {
		h.syncPetEntities()
	}

	if h.world != nil {
		h.tickEntitiesWorld(now, dt)
	} else {
		h.tickEntitiesLegacy(now, dt)
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

// tickEntitiesLegacy preserves the original map-iteration order for legacy maps.
func (h *Hub) tickEntitiesLegacy(now time.Time, dt float64) {
	for _, e := range h.entities {
		h.tickEntity(e, now, dt)
	}
}

// tickEntitiesWorld runs hub-owned actors (players and pets) in deterministic
// region buckets while region workers concurrently tick their owned NPCs. NPC
// state crosses the boundary only as actor snapshots in and committed
// snapshots/intents out.
func (h *Hub) tickEntitiesWorld(now time.Time, dt float64) {
	h.assignEntityRegionOwnership()
	pendingNPCs := h.startNPCWorkerTicks(now, dt)

	partitions := make(map[string][]*entity, len(h.world.SimulationRegions)+1)
	for _, e := range h.entities {
		if e.Kind == kindNPC {
			if _, owned := h.npcOwners[e.ID]; owned {
				continue
			}
		}
		partitions[e.regionID] = append(partitions[e.regionID], e)
	}
	for _, bucket := range partitions {
		sort.Slice(bucket, func(i, j int) bool { return bucket[i].ID < bucket[j].ID })
	}
	for _, reg := range h.world.SimulationRegions {
		for _, e := range partitions[reg.ID] {
			h.tickEntity(e, now, dt)
		}
	}
	for _, e := range partitions[""] {
		h.tickEntity(e, now, dt)
	}

	h.finishNPCWorkerTicks(pendingNPCs)
	h.refreshServerEntityRegionOwnership()
}

// tickEntity runs one entity's full pipeline for a single simulation step.
func (h *Hub) tickEntity(e *entity, now time.Time, dt float64) {
	for _, system := range e.pipeline {
		system.Tick(h, e, now, dt)
	}
	h.tickEntityStatuses(e)
	h.advanceCast(e, now)
}

// assignEntityRegionOwnership updates regionID for every world entity from its
// current coordinates. It does not send player notifications.
func (h *Hub) assignEntityRegionOwnership() {
	for _, e := range h.entities {
		e.regionID = h.regionIDAt(e.X, e.Y)
	}
}

// refreshServerEntityRegionOwnership re-derives region ownership for NPCs and
// pets after their systems have moved them. Player ownership is refreshed by the
// move/dodge/respawn handlers that carry the owning Client.
func (h *Hub) refreshServerEntityRegionOwnership() {
	for _, e := range h.entities {
		if e.Kind == kindNPC {
			if _, owned := h.npcOwners[e.ID]; owned {
				continue
			}
		}
		if e.Kind == kindNPC || e.Kind == kindPet {
			h.refreshRegionOwnership(nil, e)
		}
	}
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

// entitySnapshot adapts any entity to the wire WorldEntity. It is a
// compatibility wrapper around the projector; callers that only need a single
// entity projection should use entitySync / worldEntities / combatSnapshots /
// serverEntitySnapshots, which delegate to the projector directly.
func (h *Hub) entitySnapshot(e *entity, now time.Time) protocol.WorldEntity {
	return h.projector.project(e, now)
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
