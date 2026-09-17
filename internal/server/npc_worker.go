package server

import (
	"log"
	"math"
	"math/rand"
	"sort"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// npcWorker owns the mutable NPC entities for one simulation region. The hub
// keeps only projection copies for targeting, AOI, and wire snapshots; every
// mutation crosses this mailbox boundary.
type npcWorker struct {
	id    string
	world *game.WorldDefinition
	ow    *game.Overworld

	inbox chan npcWorkerCall
	done  chan struct{}

	npcs   map[string]*entity
	actors map[string]*entity
	sim    *Hub
	fx     npcSimEffects
}

type npcWorkerCall struct {
	tick    *npcTickRequest
	command *npcCommand
	reply   chan npcWorkerReply
}

type npcTickRequest struct {
	Seq    uint64
	Now    time.Time
	DT     float64
	Actors map[string]*entity
}

type npcCommandKind int

const (
	npcCmdAdopt npcCommandKind = iota
	npcCmdRemove
	npcCmdRemoveActor
	npcCmdDamage
	npcCmdStatuses
	npcCmdEnmity
	npcCmdEngage
	npcCmdDisengage
	npcCmdKill
)

type npcCommand struct {
	Kind       npcCommandKind
	NPC        *entity
	Source     *entity
	TargetID   string
	Damage     int
	Event      protocol.CombatEventPayload
	MessageFmt string
	Statuses   []game.StatusEffectDef
	Shield     int
	Enmity     int
	Captured   bool
}

type npcWorkerReply struct {
	OK      bool
	Damage  int
	NPC     *entity
	NPCs    map[string]*entity
	Result  npcTickResult
	Effects npcSimEffects
}

// npcSimEffects records side effects produced inside a worker-owned simulation
// context. The hub remains authoritative for player mutation and broadcasts.
type npcSimEffects struct {
	attacks        []npcAttackIntent
	playerCombat   map[string]bool
	engagements    []npcEngagementIntent
	disengagements []string
	events         []npcCombatEvent
	deaths         []npcDeath
}

type npcAttackIntent struct {
	SourceID   string
	TargetID   string
	Damage     int
	Event      protocol.CombatEventPayload
	MessageFmt string
}

type npcEngagementIntent struct {
	NPCID    string
	TargetID string
}

type npcCombatEvent struct {
	Event protocol.CombatEventPayload
	X, Y  float64
}

type npcDeath struct {
	Entity   *entity
	Captured bool
}

type npcTransfer struct {
	NPC      *entity
	ToRegion string
}

type npcStateFingerprint struct {
	x, y, facing float64
	hp, maxHP    int
	mp, maxMP    int
	alive        bool
	hidden       bool
	targetID     string
	engaged      bool
	capturable   bool
	statusCount  int
}

type npcTickResult struct {
	RegionID  string
	Seq       uint64
	NPCs      map[string]*entity
	Transfers []npcTransfer
	Effects   npcSimEffects
	Dirty     bool
}

func newNPCWorker(id string, world *game.WorldDefinition, ow *game.Overworld) *npcWorker {
	w := &npcWorker{
		id:     id,
		world:  world,
		ow:     ow,
		inbox:  make(chan npcWorkerCall, 64),
		done:   make(chan struct{}),
		npcs:   map[string]*entity{},
		actors: map[string]*entity{},
	}
	w.sim = &Hub{
		clients:          map[string]*Client{},
		entities:         map[string]*entity{},
		aoi:              map[string]bool{},
		farEntityClients: map[string]bool{},
		movedPlayers:     map[string]bool{},
		routes:           newRouteRegistry(),
		rng:              rand.New(rand.NewSource(time.Now().UnixNano())),
		projector:        newProjector(),
		overworld:        ow,
		npcEffects:       &w.fx,
	}
	go w.run()
	return w
}

func (w *npcWorker) run() {
	defer close(w.done)
	for call := range w.inbox {
		reply := npcWorkerReply{}
		switch {
		case call.tick != nil:
			reply.Result = w.tick(*call.tick)
		case call.command != nil:
			reply = w.command(*call.command)
		}
		if call.reply != nil {
			call.reply <- reply
		}
	}
}

func (w *npcWorker) stop() {
	close(w.inbox)
	<-w.done
}

func (w *npcWorker) call(cmd npcCommand) (npcWorkerReply, bool) {
	reply := make(chan npcWorkerReply, 1)
	select {
	case w.inbox <- npcWorkerCall{command: &cmd, reply: reply}:
	case <-w.done:
		return npcWorkerReply{}, false
	}
	select {
	case res := <-reply:
		return res, true
	case <-w.done:
		return npcWorkerReply{}, false
	}
}

func (w *npcWorker) tickAsync(req npcTickRequest) chan npcWorkerReply {
	reply := make(chan npcWorkerReply, 1)
	select {
	case w.inbox <- npcWorkerCall{tick: &req, reply: reply}:
	case <-w.done:
		close(reply)
	}
	return reply
}

func (w *npcWorker) rebuildEntities() {
	w.sim.entities = make(map[string]*entity, len(w.actors)+len(w.npcs))
	for id, e := range w.actors {
		w.sim.entities[id] = e
	}
	for id, e := range w.npcs {
		w.sim.entities[id] = e
	}
}

func (w *npcWorker) tick(req npcTickRequest) npcTickResult {
	w.actors = req.Actors
	w.fx = npcSimEffects{playerCombat: map[string]bool{}}
	w.sim.entityDirty = false
	w.rebuildEntities()

	ids := make([]string, 0, len(w.npcs))
	before := make(map[string]npcStateFingerprint, len(w.npcs))
	for id := range w.npcs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		before[id] = npcFingerprint(w.npcs[id])
	}
	for _, id := range ids {
		e := w.npcs[id]
		if e == nil {
			continue
		}
		e.regionID = w.id
		for _, system := range e.pipeline {
			system.Tick(w.sim, e, req.Now, req.DT)
		}
		w.sim.tickEntityStatuses(e)
		w.sim.advanceCast(e, req.Now)
		if npcFingerprint(e) != before[id] {
			w.sim.entityDirty = true
		}
	}

	result := npcTickResult{
		RegionID: w.id,
		Seq:      req.Seq,
		NPCs:     map[string]*entity{},
		Effects:  w.fx,
		Dirty:    w.sim.entityDirty,
	}
	for _, id := range ids {
		e := w.npcs[id]
		if e == nil {
			continue
		}
		next := w.regionIDAt(e.X, e.Y)
		e.regionID = next
		if next != w.id {
			result.Transfers = append(result.Transfers, npcTransfer{
				NPC:      cloneEntity(e, true),
				ToRegion: next,
			})
			delete(w.npcs, id)
			continue
		}
		result.NPCs[id] = cloneEntity(e, false)
	}
	w.rebuildEntities()
	return result
}

func (w *npcWorker) command(cmd npcCommand) npcWorkerReply {
	w.fx = npcSimEffects{playerCombat: map[string]bool{}}
	w.sim.entityDirty = false
	reply := npcWorkerReply{}

	switch cmd.Kind {
	case npcCmdAdopt:
		if cmd.NPC == nil {
			return reply
		}
		// Adoption transfers ownership of the object itself; the hub stores only
		// the cloned projection returned below.
		n := cmd.NPC
		n.regionID = w.id
		w.npcs[n.ID] = n
		reply.OK = true
		reply.NPC = cloneEntity(n, false)
	case npcCmdRemove:
		delete(w.npcs, cmd.TargetID)
		reply.OK = true
	case npcCmdRemoveActor:
		delete(w.actors, cmd.TargetID)
		reply.NPCs = map[string]*entity{}
		for id, n := range w.npcs {
			changed := false
			if _, ok := n.contributors[cmd.TargetID]; ok {
				delete(n.contributors, cmd.TargetID)
				changed = true
			}
			if _, ok := n.enmity[cmd.TargetID]; ok {
				delete(n.enmity, cmd.TargetID)
				changed = true
			}
			if n.targetID == cmd.TargetID {
				n.targetID = ""
				changed = true
			}
			if changed {
				reply.NPCs[id] = cloneEntity(n, false)
			}
		}
		reply.OK = true
	case npcCmdDamage:
		dst := w.npcs[cmd.TargetID]
		if dst == nil {
			return reply
		}
		if cmd.Source != nil {
			w.actors[cmd.Source.ID] = cloneEntity(cmd.Source, false)
		}
		w.rebuildEntities()
		reply.Damage = w.sim.applyDamageMsg(cmd.Source, dst, cmd.Damage, cmd.Event, cmd.MessageFmt)
		reply.OK = true
		reply.NPC = cloneEntity(dst, false)
	case npcCmdStatuses:
		dst := w.npcs[cmd.TargetID]
		if dst == nil || cmd.Source == nil {
			return reply
		}
		for _, def := range cmd.Statuses {
			shield := 0
			if def.Kind == game.StatusShield {
				shield = cmd.Shield
			}
			game.ApplyStatus(&dst.statuses, def, cmd.Source.ID, shield)
		}
		reply.OK = true
		reply.NPC = cloneEntity(dst, false)
	case npcCmdEnmity:
		dst := w.npcs[cmd.TargetID]
		if dst == nil || cmd.Source == nil {
			return reply
		}
		w.rebuildEntities()
		w.sim.addEnmity(dst, cmd.Source, cmd.Enmity)
		reply.OK = true
		reply.NPC = cloneEntity(dst, false)
	case npcCmdEngage:
		n := w.npcs[cmd.TargetID]
		if n == nil || cmd.Source == nil {
			return reply
		}
		w.actors[cmd.Source.ID] = cloneEntity(cmd.Source, false)
		w.rebuildEntities()
		w.sim.engage(n, cmd.Source)
		reply.OK = true
		reply.NPC = cloneEntity(n, false)
	case npcCmdDisengage:
		n := w.npcs[cmd.TargetID]
		if n == nil {
			return reply
		}
		w.rebuildEntities()
		w.sim.disengage(n, cmd.Captured)
		reply.OK = true
		reply.NPC = cloneEntity(n, false)
	case npcCmdKill:
		n := w.npcs[cmd.TargetID]
		if n == nil {
			return reply
		}
		if cmd.Captured {
			if r := respawnOf(n); r != nil {
				r.captured = true
			}
		}
		w.rebuildEntities()
		w.sim.kill(n, cmd.Source)
		reply.OK = true
		reply.NPC = cloneEntity(n, false)
	}

	reply.Effects = w.fx
	return reply
}

func npcFingerprint(e *entity) npcStateFingerprint {
	fp := npcStateFingerprint{}
	if e == nil {
		return fp
	}
	fp.x, fp.y, fp.facing = e.X, e.Y, e.Facing
	fp.hp, fp.maxHP, fp.mp, fp.maxMP = e.hp, e.maxHP, e.mp, e.maxMP
	fp.alive, fp.hidden, fp.targetID = e.alive, e.hidden, e.targetID
	fp.statusCount = len(e.statuses)
	if ng := npcEngageOf(e); ng != nil {
		fp.engaged = ng.engaged
	}
	if r := respawnOf(e); r != nil {
		fp.capturable = r.capturable
	}
	return fp
}

func (w *npcWorker) regionIDAt(x, y float64) string {
	if w.world == nil {
		return ""
	}
	tileSize := w.world.TileSizePx()
	if tileSize <= 0 {
		return ""
	}
	region, ok := w.world.SimulationRegionAt(
		int(math.Floor(x/float64(tileSize))),
		int(math.Floor(y/float64(tileSize))),
	)
	if !ok {
		return ""
	}
	return region.ID
}

// cloneEntity produces a worker-safe copy. NPC clones preserve the component
// pipeline for handoff; actor clones intentionally omit their pipelines so a
// worker cannot invoke player/pet hooks or mutate canonical state.
func cloneEntity(e *entity, fullNPC bool) *entity {
	if e == nil {
		return nil
	}
	cp := *e
	cp.statuses = append([]game.ActiveStatus(nil), e.statuses...)
	if e.casting != nil {
		casting := *e.casting
		cp.casting = &casting
	}
	cp.contributors = cloneIntMap(e.contributors)
	cp.enmity = cloneIntMap(e.enmity)
	cp.components = entityComponents{}
	cp.pipeline = nil
	if cc := clientControlOf(e); cc != nil {
		ccp := *cc
		ccp.skillLevels = cloneIntMap(cc.skillLevels)
		ccp.pendingSkillUses = cloneIntMap(cc.pendingSkillUses)
		ccp.skillReadyAt = cloneTimeMap(cc.skillReadyAt)
		cp.components.clientControl = &ccp
	}
	if e.Kind != kindNPC {
		return &cp
	}
	replacements := map[entitySystem]entitySystem{}
	if w := e.components.wander; w != nil {
		wc := *w
		wc.path = append([]game.Vec2(nil), w.path...)
		cp.components.wander = &wc
		replacements[w] = &wc
	}
	if ng := e.components.npcEngage; ng != nil {
		ngc := *ng
		cp.components.npcEngage = &ngc
		replacements[ng] = &ngc
	}
	if ch := e.components.chaseTarget; ch != nil {
		chc := *ch
		chc.path = append([]game.Vec2(nil), ch.path...)
		cp.components.chaseTarget = &chc
		replacements[ch] = &chc
	}
	if at := e.components.attackTarget; at != nil {
		atc := *at
		cp.components.attackTarget = &atc
		replacements[at] = &atc
	}
	if r := e.components.respawn; r != nil {
		rc := *r
		cp.components.respawn = &rc
		replacements[r] = &rc
	}
	if fullNPC {
		pipeline := make([]entitySystem, 0, len(e.pipeline))
		for _, system := range e.pipeline {
			if replacement, ok := replacements[system]; ok {
				pipeline = append(pipeline, replacement)
			} else {
				pipeline = append(pipeline, system)
			}
		}
		if len(pipeline) == 0 {
			if cp.components.wander != nil {
				pipeline = append(pipeline, cp.components.wander)
			}
			if cp.components.npcEngage != nil {
				pipeline = append(pipeline, cp.components.npcEngage)
			}
			if cp.components.chaseTarget != nil {
				pipeline = append(pipeline, cp.components.chaseTarget)
			}
			if cp.components.attackTarget != nil {
				pipeline = append(pipeline, cp.components.attackTarget)
			}
			if cp.components.respawn != nil {
				pipeline = append(pipeline, cp.components.respawn)
			}
		}
		cp.pipeline = pipeline
	}
	return &cp
}

func cloneIntMap(in map[string]int) map[string]int {
	if in == nil {
		return nil
	}
	out := make(map[string]int, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func cloneTimeMap(in map[string]time.Time) map[string]time.Time {
	if in == nil {
		return nil
	}
	out := make(map[string]time.Time, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func (fx *npcSimEffects) reset() {
	fx.attacks = nil
	fx.playerCombat = map[string]bool{}
	fx.engagements = nil
	fx.disengagements = nil
	fx.events = nil
	fx.deaths = nil
}

func (fx *npcSimEffects) recordAttack(src, dst *entity, dmg int, ev protocol.CombatEventPayload, msgFmt string) int {
	if dst == nil {
		return 0
	}
	sourceID := ""
	if src != nil {
		sourceID = src.ID
	}
	fx.attacks = append(fx.attacks, npcAttackIntent{
		SourceID: sourceID, TargetID: dst.ID, Damage: dmg, Event: ev, MessageFmt: msgFmt,
	})
	return dmg
}

func (fx *npcSimEffects) recordDeath(e *entity, captured bool) {
	fx.deaths = append(fx.deaths, npcDeath{Entity: cloneEntity(e, false), Captured: captured})
}

func (fx *npcSimEffects) recordEngagement(e, target *entity) {
	if e == nil || target == nil {
		return
	}
	fx.engagements = append(fx.engagements, npcEngagementIntent{NPCID: e.ID, TargetID: target.ID})
}

func (fx *npcSimEffects) recordDisengagement(e *entity) {
	if e != nil {
		fx.disengagements = append(fx.disengagements, e.ID)
	}
}

func (h *Hub) ensureNPCWorkers() {
	if h.world == nil || h.npcWorkers != nil {
		return
	}
	h.npcWorkers = map[string]*npcWorker{}
	h.npcWorkerOrder = nil
	seen := map[string]bool{}
	for _, region := range h.world.SimulationRegions {
		if seen[region.ID] {
			continue
		}
		seen[region.ID] = true
		h.npcWorkers[region.ID] = newNPCWorker(region.ID, h.world, h.overworld)
		h.npcWorkerOrder = append(h.npcWorkerOrder, region.ID)
	}
	if !seen[""] {
		h.npcWorkers[""] = newNPCWorker("", h.world, h.overworld)
		h.npcWorkerOrder = append(h.npcWorkerOrder, "")
	}
	h.npcOwners = map[string]string{}
	log.Printf("world %s started %d npc region workers", h.mapID, len(h.npcWorkers))
}

func (h *Hub) stopNPCWorkers() {
	for _, id := range h.npcWorkerOrder {
		if w := h.npcWorkers[id]; w != nil {
			w.stop()
		}
	}
	h.npcWorkers = nil
	h.npcWorkerOrder = nil
	h.npcOwners = nil
}

func (h *Hub) npcWorkersActive() bool {
	return h.world != nil && len(h.npcWorkers) > 0
}

func (h *Hub) npcWorkerFor(e *entity) *npcWorker {
	if e == nil || e.Kind != kindNPC || h.world == nil {
		return nil
	}
	h.ensureNPCWorkers()
	if _, owned := h.npcOwners[e.ID]; !owned && h.entities[e.ID] == e {
		// Test hooks and late spawns may install directly into the projection map;
		// adoption makes the owning worker authoritative before combat routes.
		h.installNPC(e)
	}
	if owner, ok := h.npcOwners[e.ID]; ok {
		return h.npcWorkers[owner]
	}
	return nil
}

func (h *Hub) installNPC(n *entity) {
	if n == nil {
		return
	}
	n.regionID = h.regionIDAt(n.X, n.Y)
	if h.world == nil {
		h.entities[n.ID] = n
		return
	}
	h.ensureNPCWorkers()
	w := h.npcWorkers[n.regionID]
	if w == nil {
		w = h.npcWorkers[""]
		n.regionID = ""
	}
	if w == nil {
		h.entities[n.ID] = n
		return
	}
	if reply, ok := w.call(npcCommand{Kind: npcCmdAdopt, NPC: n}); ok && reply.NPC != nil {
		h.entities[n.ID] = reply.NPC
	} else {
		h.entities[n.ID] = cloneEntity(n, false)
	}
	h.npcOwners[n.ID] = w.id
}

func (h *Hub) adoptUnownedNPCs() {
	if h.world == nil {
		return
	}
	for _, e := range h.entities {
		if e.Kind != kindNPC {
			continue
		}
		if _, ok := h.npcOwners[e.ID]; ok {
			continue
		}
		delete(h.entities, e.ID)
		h.installNPC(e)
	}
}

type npcPendingTick struct {
	worker *npcWorker
	reply  chan npcWorkerReply
}

func (h *Hub) startNPCWorkerTicks(now time.Time, dt float64) []npcPendingTick {
	if h.world == nil {
		return nil
	}
	h.ensureNPCWorkers()
	h.adoptUnownedNPCs()
	h.npcWorkerSeq++
	pending := make([]npcPendingTick, 0, len(h.npcWorkerOrder))
	for _, id := range h.npcWorkerOrder {
		w := h.npcWorkers[id]
		if w == nil {
			continue
		}
		pending = append(pending, npcPendingTick{
			worker: w,
			reply: w.tickAsync(npcTickRequest{
				Seq:    h.npcWorkerSeq,
				Now:    now,
				DT:     dt,
				Actors: h.workerActorSnapshot(),
			}),
		})
	}
	return pending
}

func (h *Hub) workerActorSnapshot() map[string]*entity {
	out := map[string]*entity{}
	for id, e := range h.entities {
		if e.Kind == kindPlayer || e.Kind == kindPet {
			out[id] = cloneEntity(e, false)
		}
	}
	return out
}

func (h *Hub) finishNPCWorkerTicks(pending []npcPendingTick) {
	results := make([]npcTickResult, 0, len(pending))
	for _, p := range pending {
		reply, ok := <-p.reply
		if ok {
			results = append(results, reply.Result)
		}
	}
	for _, result := range results {
		h.commitNPCTickState(result)
	}
	for _, result := range results {
		h.commitNPCTickEffects(result)
	}
}

func (h *Hub) commitNPCTickState(result npcTickResult) {
	for _, transfer := range result.Transfers {
		if transfer.NPC == nil {
			continue
		}
		target := h.npcWorkers[transfer.ToRegion]
		if target == nil {
			target = h.npcWorkers[""]
			transfer.NPC.regionID = ""
		}
		if target == nil {
			continue
		}
		if reply, ok := target.call(npcCommand{Kind: npcCmdAdopt, NPC: transfer.NPC}); ok && reply.NPC != nil {
			h.entities[transfer.NPC.ID] = reply.NPC
			h.npcOwners[transfer.NPC.ID] = target.id
		}
	}
	for id, snapshot := range result.NPCs {
		h.entities[id] = snapshot
		h.npcOwners[id] = result.RegionID
	}
}

func (h *Hub) commitNPCTickEffects(result npcTickResult) {
	for id := range result.Effects.playerCombat {
		h.markPlayerCombat(id)
	}
	for _, intent := range result.Effects.engagements {
		h.propagateNPCEngagement(intent.NPCID, intent.TargetID, result.RegionID)
	}
	for _, npcID := range result.Effects.disengagements {
		if h.npcOwners[npcID] == result.RegionID {
			continue
		}
		h.commandNPCDisengage(npcID, false)
	}
	for _, ev := range result.Effects.events {
		h.sendCombatEvent(ev.Event, ev.X, ev.Y)
	}
	for _, attack := range result.Effects.attacks {
		src := h.ent(attack.SourceID)
		dst := h.ent(attack.TargetID)
		if src == nil || dst == nil {
			continue
		}
		h.applyDamageMsg(src, dst, attack.Damage, attack.Event, attack.MessageFmt)
	}
	for _, death := range result.Effects.deaths {
		if death.Entity == nil {
			continue
		}
		if death.Captured {
			h.awardKillXPOnly(death.Entity)
		} else {
			h.awardKill(death.Entity)
		}
	}
	if result.Dirty {
		h.entityDirty = true
	}
}

// propagateNPCEngagement extends pack assist across worker boundaries without
// copying NPC state into a worker. The Hub compares read-only projections and
// sends an engagement command only to workers that own eligible pack-mates.
func (h *Hub) propagateNPCEngagement(npcID, targetID, sourceRegion string) {
	source, target := h.ent(npcID), h.ent(targetID)
	if source == nil || target == nil {
		return
	}
	for _, candidate := range h.entities {
		if candidate.Kind != kindNPC || candidate.ID == npcID {
			continue
		}
		owner, owned := h.npcOwners[candidate.ID]
		if !owned || owner == sourceRegion {
			continue
		}
		if engagedNPC(candidate) || !h.canAttack(candidate, target) {
			continue
		}
		if dist(candidate.X, candidate.Y, source.X, source.Y) > assistRadius {
			continue
		}
		h.commandNPCEngage(candidate.ID, target.ID)
	}
}

func (h *Hub) commandNPC(targetID string, cmd npcCommand) (npcWorkerReply, bool) {
	if h.world == nil {
		return npcWorkerReply{}, false
	}
	h.ensureNPCWorkers()
	owner, ok := h.npcOwners[targetID]
	if !ok {
		return npcWorkerReply{}, false
	}
	w := h.npcWorkers[owner]
	if w == nil {
		return npcWorkerReply{}, false
	}
	cmd.TargetID = targetID
	reply, ok := w.call(cmd)
	if !ok {
		return npcWorkerReply{}, false
	}
	h.commitNPCCommand(reply)
	return reply, true
}

func (h *Hub) commitNPCCommand(reply npcWorkerReply) {
	if reply.NPC != nil {
		h.entities[reply.NPC.ID] = reply.NPC
		if owner, ok := h.npcOwners[reply.NPC.ID]; ok {
			reply.NPC.regionID = owner
		}
		h.entityDirty = true
	}
	for id, npc := range reply.NPCs {
		h.entities[id] = npc
		h.entityDirty = true
	}
	for id := range reply.Effects.playerCombat {
		h.markPlayerCombat(id)
	}
	for _, intent := range reply.Effects.engagements {
		h.propagateNPCEngagement(intent.NPCID, intent.TargetID, h.npcOwners[intent.NPCID])
	}
	for _, npcID := range reply.Effects.disengagements {
		if reply.NPC != nil && npcID == reply.NPC.ID {
			continue
		}
		h.commandNPCDisengage(npcID, false)
	}
	for _, ev := range reply.Effects.events {
		h.sendCombatEvent(ev.Event, ev.X, ev.Y)
	}
	for _, attack := range reply.Effects.attacks {
		src := h.ent(attack.SourceID)
		dst := h.ent(attack.TargetID)
		if src != nil && dst != nil {
			h.applyDamageMsg(src, dst, attack.Damage, attack.Event, attack.MessageFmt)
		}
	}
	for _, death := range reply.Effects.deaths {
		if death.Entity == nil {
			continue
		}
		if death.Captured {
			h.awardKillXPOnly(death.Entity)
		} else {
			h.awardKill(death.Entity)
		}
	}
}

func (h *Hub) commandNPCDamage(src, dst *entity, dmg int, ev protocol.CombatEventPayload, msgFmt string) int {
	reply, ok := h.commandNPC(dst.ID, npcCommand{
		Kind:       npcCmdDamage,
		Source:     cloneEntity(src, false),
		Damage:     dmg,
		Event:      ev,
		MessageFmt: msgFmt,
	})
	if !ok {
		return 0
	}
	return reply.Damage
}

func (h *Hub) commandNPCStatuses(src, dst *entity, defs []game.StatusEffectDef, shield int) {
	if len(defs) == 0 {
		return
	}
	h.commandNPC(dst.ID, npcCommand{Kind: npcCmdStatuses, Source: cloneEntity(src, false), Statuses: defs, Shield: shield})
}

func (h *Hub) commandNPCEngage(npcID, targetID string) {
	target := h.ent(targetID)
	if target == nil {
		return
	}
	h.commandNPC(npcID, npcCommand{Kind: npcCmdEngage, Source: cloneEntity(target, false)})
}

func (h *Hub) commandNPCDisengage(npcID string, leashed bool) {
	h.commandNPC(npcID, npcCommand{Kind: npcCmdDisengage, Captured: leashed})
}

func (h *Hub) broadcastNPCActorRemoved(id string) {
	if !h.npcWorkersActive() {
		return
	}
	for _, workerID := range h.npcWorkerOrder {
		if w := h.npcWorkers[workerID]; w != nil {
			if reply, ok := w.call(npcCommand{Kind: npcCmdRemoveActor, TargetID: id}); ok {
				h.commitNPCCommand(reply)
			}
		}
	}
}
