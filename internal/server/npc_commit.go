package server

import (
	"log"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// This file holds the hub side of the NPC worker boundary: worker lifecycle
// management, tick fan-out/collection, and the commit path that replays
// worker-produced results (projections, transfers, effects) onto hub state.
// Everything here runs on the hub goroutine.

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
	reply  chan npcWorkerReply // this round's reply channel
	seq    uint64              // Seq the reply must carry
	// late is a reply drained this round that belongs to a previously skipped
	// tick; its effects/transfers are still committed but its entity snapshots
	// are stale and dropped (the next tick resyncs them fully).
	late *npcWorkerReply
}

func (h *Hub) startNPCWorkerTicks(now time.Time, dt float64) []npcPendingTick {
	if h.world == nil {
		return nil
	}
	h.ensureNPCWorkers()
	h.adoptUnownedNPCs()
	h.npcWorkerSeq++
	// Collect the actor list once per tick; each worker then clones only the
	// actors inside its own region scope (see npcWorker.actorMinX et al).
	actors := make([]*entity, 0, len(h.entities))
	for _, e := range h.entities {
		if e.Kind == kindPlayer || e.Kind == kindPet {
			actors = append(actors, e)
		}
	}
	pending := make([]npcPendingTick, 0, len(h.npcWorkerOrder))
	for _, id := range h.npcWorkerOrder {
		w := h.npcWorkers[id]
		if w == nil {
			continue
		}
		p := npcPendingTick{worker: w, seq: h.npcWorkerSeq}
		if w.inFlight != nil {
			// The previous tick's reply never arrived inside its budget. Give
			// it one non-blocking chance; if it is still absent, skip this
			// round rather than piling mailbox work behind a stalled worker.
			select {
			case rep, ok := <-w.inFlight:
				w.inFlight = nil
				if ok && rep.Result.Seq == w.inFlightSeq {
					late := rep
					p.late = &late
				}
				w.ackActors()
				w.needFullSnapshot = true
			default:
				continue
			}
		}
		snap := workerActorSnapshot(w, actors)
		sentIDs := make(map[string]bool, len(snap))
		for id := range snap {
			sentIDs[id] = true
		}
		req := npcTickRequest{
			Seq:          h.npcWorkerSeq,
			Now:          now,
			DT:           dt,
			Actors:       snap,
			Commands:     w.drainCommands(),
			FullSnapshot: w.needFullSnapshot,
		}
		w.needFullSnapshot = false
		w.sentActors = sentIDs
		p.reply = w.tickAsync(req)
		w.inFlight = p.reply
		w.inFlightSeq = req.Seq
		pending = append(pending, p)
	}
	return pending
}

// workerActorSnapshot clones actor (player/pet) projections for a single
// worker, scoped to the worker's region bounds plus npcActorScopeMargin.
func workerActorSnapshot(w *npcWorker, actors []*entity) map[string]*entity {
	out := map[string]*entity{}
	for _, e := range actors {
		if !w.coversActor(e) {
			continue
		}
		out[e.ID] = cloneEntity(e, false)
	}
	return out
}

func (h *Hub) finishNPCWorkerTicks(pending []npcPendingTick) {
	results := make([]npcTickResult, 0, len(pending))
	// One shared deadline for the whole round: a stalled worker forfeits this
	// tick instead of stalling the hub. Skipped replies stay tracked on the
	// worker (w.inFlight) and are drained — or skipped again — next round.
	timer := time.NewTimer(npcWorkerReplyTimeout)
	defer timer.Stop()
	expired := false
	for _, p := range pending {
		if p.late != nil {
			p.worker.needFullSnapshot = true
			stale := p.late.Result
			stale.NPCs = nil
			results = append(results, stale)
		}
		if p.reply == nil {
			continue
		}
		var (
			rep npcWorkerReply
			ok  bool
		)
		if expired {
			// Past the shared deadline: still collect replies that have
			// already arrived, but never block again.
			select {
			case rep, ok = <-p.reply:
			default:
			}
		} else {
			select {
			case rep, ok = <-p.reply:
			case <-timer.C:
				expired = true
			}
		}
		switch {
		case ok && rep.Result.Seq == p.seq:
			p.worker.clearInFlight(p.reply)
			p.worker.ackActors()
			results = append(results, rep.Result)
		case ok:
			// Stale/mismatched reply: drop it and resync next round.
			p.worker.clearInFlight(p.reply)
			p.worker.needFullSnapshot = true
		default:
			// Timed out or closed: leave w.inFlight on p.reply so the next
			// round drains the late reply instead of queuing another tick.
			p.worker.needFullSnapshot = true
			logThrottled("npc-skip "+p.worker.id,
				"[slow] npc worker "+p.worker.id+" tick reply missed the deadline (round skipped)")
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
	// Adopts are batched per destination worker: one mailbox round-trip per
	// worker instead of one per transferred NPC.
	groups := map[*npcWorker][]npcCommand{}
	order := make([]*npcWorker, 0, 2)
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
		if _, ok := groups[target]; !ok {
			order = append(order, target)
		}
		groups[target] = append(groups[target], npcCommand{Kind: npcCmdAdopt, NPC: transfer.NPC})
	}
	for _, target := range order {
		cmds := groups[target]
		replies, ok := target.callAll(cmds)
		for i, rep := range replies {
			id := cmds[i].NPC.ID
			if ok && rep.NPC != nil {
				h.entities[id] = rep.NPC
				h.npcOwners[id] = target.id
			}
		}
	}
	// Tick projections reassign ownership to the producing region and skip
	// entityDirty: dirtiness for the whole batch flows through result.Dirty
	// in commitNPCTickEffects, unlike the per-command merge below.
	for id, snapshot := range result.NPCs {
		h.entities[id] = snapshot
		h.npcOwners[id] = result.RegionID
	}
}

func (h *Hub) commitNPCTickEffects(result npcTickResult) {
	h.applyNPCEffects(result.Effects,
		func(string) string { return result.RegionID },
		func(npcID string) bool { return h.npcOwners[npcID] == result.RegionID },
	)
	if result.Dirty {
		h.entityDirty = true
	}
}

// applyNPCEffects replays one worker-produced effect batch onto hub state in
// a fixed order: player combat flags, pack-assist propagation, cross-worker
// disengagements, combat events, attack intents, then kill awards. Both
// commit paths (tick results and synchronous command replies) historically
// duplicated this replay; they differ only in two decisions, passed here as
// parameters:
//
//   - engagementRegion resolves the region an engagement propagated from.
//     Tick commits know it statically (result.RegionID); command replies
//     look up the intent NPC's current owner, which may differ from the
//     replying worker when ownership moved between command and commit.
//   - skipDisengage drops disengagement intents the producing worker already
//     applied itself, so they are not redundantly re-queued. Tick commits
//     skip NPCs still owned by the producing region; command replies skip
//     the command's own target NPC (reply.NPC).
func (h *Hub) applyNPCEffects(fx npcSimEffects, engagementRegion func(npcID string) string, skipDisengage func(npcID string) bool) {
	for id := range fx.playerCombat {
		h.markPlayerCombat(id)
	}
	for _, intent := range fx.engagements {
		h.propagateNPCEngagement(intent.NPCID, intent.TargetID, engagementRegion(intent.NPCID))
	}
	for _, npcID := range fx.disengagements {
		if skipDisengage(npcID) {
			continue
		}
		// Cross-region disengage propagation does not need a synchronous
		// answer; queue it onto the owning worker's next tick.
		h.queueNPCCommand(npcID, npcCommand{Kind: npcCmdDisengage})
	}
	for _, ev := range fx.events {
		h.sendCombatEvent(ev.Event, ev.X, ev.Y)
	}
	for _, attack := range fx.attacks {
		src := h.ent(attack.SourceID)
		dst := h.ent(attack.TargetID)
		if src == nil || dst == nil {
			continue
		}
		h.applyDamageMsg(src, dst, attack.Damage, attack.Event, attack.MessageFmt)
	}
	for _, death := range fx.deaths {
		if death.Entity == nil {
			continue
		}
		// The sim's clearTargeting only touches worker-side clones; drop the
		// dead NPC from every canonical target/engage/enmity reference (and
		// echo the release to players) so a respawn can't resurface as a
		// still-selected target.
		h.clearTargeting(death.Entity.ID)
		if death.Captured {
			h.awardKillXPOnly(death.Entity)
		} else {
			h.awardKill(death.Entity)
		}
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
	h.spatialEach(source.X, source.Y, assistRadius, func(candidate *entity) bool {
		if candidate.Kind != kindNPC || candidate.ID == npcID {
			return false
		}
		owner, owned := h.npcOwners[candidate.ID]
		if !owned || owner == sourceRegion {
			return false
		}
		return !engagedNPC(candidate) && h.canAttack(candidate, target)
	}, func(candidate *entity) {
		h.commandNPCEngage(candidate.ID, target.ID)
	})
}

// queueNPCCommand enqueues a fire-and-forget command on the owning worker's
// pending list; it runs at the top of the worker's next tick and its effects
// and NPC projections ride back on that tick's result. Use only where the
// caller does not need the command applied synchronously — commands whose
// outcome callers observe immediately must keep using commandNPC.
func (h *Hub) queueNPCCommand(targetID string, cmd npcCommand) {
	if h.world == nil {
		return
	}
	h.ensureNPCWorkers()
	owner, ok := h.npcOwners[targetID]
	if !ok {
		return
	}
	if w := h.npcWorkers[owner]; w != nil {
		cmd.TargetID = targetID
		w.enqueueCommand(cmd)
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
	// Command replies keep the NPC's recorded owner (the tick path reassigns
	// ownership instead — see commitNPCTickState) and mark entityDirty per
	// merged projection, since a reply carries no batch-level Dirty flag.
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
	h.applyNPCEffects(reply.Effects,
		func(npcID string) string { return h.npcOwners[npcID] },
		func(npcID string) bool { return reply.NPC != nil && npcID == reply.NPC.ID },
	)
}

// bindCommandSource attaches src to cmd as cheaply as the owning worker
// allows: when the worker's last acknowledged actor snapshot already contains
// src, only the ID travels and the worker resolves it from w.actors; otherwise
// a clone rides along as fallback (NPC sources, out-of-scope actors, or a
// worker that has not ticked yet).
func (h *Hub) bindCommandSource(cmd *npcCommand, src *entity, targetID string) {
	if src == nil {
		return
	}
	cmd.SourceID = src.ID
	w := h.npcWorkers[h.npcOwners[targetID]]
	if w != nil && w.lastActors[src.ID] {
		return // resolvable from the worker's actor snapshot — skip the clone
	}
	cmd.Source = cloneEntity(src, false)
	if w != nil {
		// The worker installs this clone into w.actors — record it so the
		// removal fan-out reaches the worker even though the actor never
		// rode a tick snapshot (and so isn't in lastActors/sentActors).
		w.boundActors[src.ID] = true
	}
}

// commandNPCDamage stays synchronous: callers use the returned damage
// immediately (combat resolution, reflect chains), so it cannot ride the tick
// batch without changing call-site semantics.
func (h *Hub) commandNPCDamage(src, dst *entity, dmg int, ev protocol.CombatEventPayload, msgFmt, class string) int {
	cmd := npcCommand{
		Kind:       npcCmdDamage,
		Damage:     dmg,
		Event:      ev,
		MessageFmt: msgFmt,
		Class:      class,
	}
	h.bindCommandSource(&cmd, src, dst.ID)
	reply, ok := h.commandNPC(dst.ID, cmd)
	if !ok {
		return 0
	}
	return reply.Damage
}

// commandNPCStatuses stays synchronous: callers observe the worker-owned
// NPC's status list immediately after this returns (skill resolution and
// tests assert on it without an intervening tick).
func (h *Hub) commandNPCStatuses(src, dst *entity, defs []game.StatusEffectDef, shield int) {
	if len(defs) == 0 {
		return
	}
	cmd := npcCommand{Kind: npcCmdStatuses, Statuses: defs, Shield: shield}
	h.bindCommandSource(&cmd, src, dst.ID)
	h.commandNPC(dst.ID, cmd)
}

// commandNPCEngage stays synchronous: engagement must be visible on the hub
// projection as soon as it returns (pack-assist propagation chains off it).
func (h *Hub) commandNPCEngage(npcID, targetID string) {
	target := h.ent(targetID)
	if target == nil {
		return
	}
	cmd := npcCommand{Kind: npcCmdEngage}
	h.bindCommandSource(&cmd, target, npcID)
	h.commandNPC(npcID, cmd)
}

func (h *Hub) commandNPCDisengage(npcID string, leashed bool) {
	h.commandNPC(npcID, npcCommand{Kind: npcCmdDisengage, Captured: leashed})
}

func (h *Hub) broadcastNPCActorRemoved(id string) {
	if !h.npcWorkersActive() {
		return
	}
	// A worker's NPCs can only reference entities inside its own sim — its
	// owned NPCs plus the actor snapshot. Workers that never had `id` in
	// scope hold no target/enmity/contributor entries for it, so skip them;
	// an actor that left scope a tick ago self-cleans through validTarget.
	// Fan the removal out to the remaining workers before collecting any
	// reply: the round-trips overlap instead of serializing, but the call
	// still returns only after every relevant worker applied it — callers
	// rely on the worker state being cleared synchronously (e.g. NPC targets
	// cleared on disconnect).
	pending := make([]chan npcWorkerReply, 0, len(h.npcWorkerOrder))
	for _, workerID := range h.npcWorkerOrder {
		w := h.npcWorkers[workerID]
		if w == nil {
			continue
		}
		if h.npcOwners[id] != workerID && !w.lastActors[id] && !w.sentActors[id] && !w.boundActors[id] {
			continue
		}
		pending = append(pending, w.send(npcCommand{Kind: npcCmdRemoveActor, TargetID: id}))
	}
	t0 := time.Now()
	for _, ch := range pending {
		if reply, ok := <-ch; ok {
			h.commitNPCCommand(reply)
		}
	}
	logSlow("npc-removeActor", time.Since(t0), 50*time.Millisecond)
}
