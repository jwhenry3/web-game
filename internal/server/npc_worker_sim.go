package server

import (
	"math"
	"sort"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// This file holds the worker-side simulation half of the NPC worker: the
// per-tick pipeline, mailbox command handlers, and the fingerprint used to
// diff NPC projections. Everything here runs on the worker goroutine.

func (w *npcWorker) rebuildEntities() {
	w.sim.entities = make(map[string]*entity, len(w.actors)+len(w.npcs))
	for id, e := range w.actors {
		w.sim.entities[id] = e
	}
	for id, e := range w.npcs {
		w.sim.entities[id] = e
	}
	// Membership was swapped wholesale: the next spatial query rebuilds once,
	// and every query in this pass then shares the grid. Entities that move
	// mid-tick stay correct via live re-resolution inside the slack window.
	w.sim.spatialInvalidate()
}

func (w *npcWorker) tick(req npcTickRequest) npcTickResult {
	w.actors = req.Actors
	w.fx = npcSimEffects{playerCombat: map[string]bool{}}
	w.sim.entityDirty = false
	w.rebuildEntities()

	// Queued fire-and-forget commands run before the fingerprint baseline.
	// Their side effects accumulate into w.fx (committed with this tick), and
	// their reply clones are force-merged into the result so changes the
	// fingerprint can't see (enmity/contributor tables) still reach the hub.
	var forced map[string]*entity
	for _, cmd := range req.Commands {
		reply := w.runCommand(cmd)
		if reply.NPC != nil {
			if forced == nil {
				forced = map[string]*entity{}
			}
			forced[reply.NPC.ID] = reply.NPC
		}
		for id, n := range reply.NPCs {
			if forced == nil {
				forced = map[string]*entity{}
			}
			forced[id] = n
		}
	}
	if len(req.Commands) > 0 {
		w.rebuildEntities()
	}

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
		w.sim.tickEntity(e, req.Now, req.DT)
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
	var transferred map[string]bool
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
			if transferred == nil {
				transferred = map[string]bool{}
			}
			transferred[id] = true
			continue
		}
		// Only NPCs whose observable state changed ship a fresh projection;
		// the hub keeps the prior snapshot for unchanged entries.
		if req.FullSnapshot || npcFingerprint(e) != before[id] {
			result.NPCs[id] = cloneEntity(e, false)
		}
	}
	for id, n := range forced {
		// A transferred NPC is now owned by another worker; its queued-command
		// clone must not overwrite the destination worker's projection/owner.
		if transferred[id] {
			continue
		}
		result.NPCs[id] = n
	}
	w.rebuildEntities()
	return result
}

// command is the synchronous mailbox path: it resets the effect accumulator,
// runs the command, and attaches the effects to the reply.
func (w *npcWorker) command(cmd npcCommand) npcWorkerReply {
	w.fx = npcSimEffects{playerCombat: map[string]bool{}}
	w.sim.entityDirty = false
	reply := w.runCommand(cmd)
	reply.Effects = w.fx
	return reply
}

// bindSource resolves the command's source entity and installs a fresh clone
// into w.actors when an inline Source was supplied (matching the legacy
// snapshot-refresh behavior of damage/engage commands). Commands that only
// carry SourceID reuse the per-tick actor snapshot the worker already holds.
func (w *npcWorker) bindSource(cmd npcCommand) *entity {
	if cmd.Source != nil {
		src := cloneEntity(cmd.Source, false)
		w.actors[src.ID] = src
		return src
	}
	if cmd.SourceID != "" {
		return w.actors[cmd.SourceID]
	}
	return nil
}

// peekSource resolves the command's source entity without installing it into
// w.actors (matching commands that never refreshed the actor snapshot).
func (w *npcWorker) peekSource(cmd npcCommand) *entity {
	if cmd.Source != nil {
		return cmd.Source
	}
	if cmd.SourceID != "" {
		return w.actors[cmd.SourceID]
	}
	return nil
}

// runCommand executes one mailbox command without touching the effect
// accumulator; callers either attach w.fx themselves (command) or let the
// effects ride out on the tick result (queued commands inside tick).
func (w *npcWorker) runCommand(cmd npcCommand) npcWorkerReply {
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
		src := w.bindSource(cmd)
		w.rebuildEntities()
		reply.Damage = w.sim.applyDamageMsgClass(src, dst, cmd.Damage, cmd.Event, cmd.MessageFmt, cmd.Class)
		reply.OK = true
		reply.NPC = cloneEntity(dst, false)
	case npcCmdStatuses:
		dst := w.npcs[cmd.TargetID]
		src := w.peekSource(cmd)
		if dst == nil || src == nil {
			return reply
		}
		for _, def := range cmd.Statuses {
			shield := 0
			if def.Kind == game.StatusShield {
				shield = cmd.Shield
			}
			game.ApplyStatus(&dst.statuses, def, src.ID, shield)
		}
		reply.OK = true
		reply.NPC = cloneEntity(dst, false)
	case npcCmdEnmity:
		dst := w.npcs[cmd.TargetID]
		src := w.peekSource(cmd)
		if dst == nil || src == nil {
			return reply
		}
		w.rebuildEntities()
		w.sim.addEnmity(dst, src, cmd.Enmity)
		reply.OK = true
		reply.NPC = cloneEntity(dst, false)
	case npcCmdEngage:
		n := w.npcs[cmd.TargetID]
		if n == nil {
			return reply
		}
		src := w.bindSource(cmd)
		if src == nil {
			return reply
		}
		w.rebuildEntities()
		w.sim.engage(n, src)
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
		w.sim.kill(n, w.peekSource(cmd))
		reply.OK = true
		reply.NPC = cloneEntity(n, false)
	}

	return reply
}

type npcStateFingerprint struct {
	x, y, z, facing float64
	hp, maxHP    int
	mp, maxMP    int
	alive        bool
	hidden       bool
	targetID     string
	engaged      bool
	capturable   bool
	statusCount  int
	// statusHash folds Remaining/ShieldHP so in-place status decay (DoT ticks,
	// shield absorption) still counts as a change even when the count is
	// unchanged; castID/castProgress cover the wire-visible cast bar.
	statusHash   int
	castID       string
	castProgress int
}

func npcFingerprint(e *entity) npcStateFingerprint {
	fp := npcStateFingerprint{}
	if e == nil {
		return fp
	}
	fp.x, fp.y, fp.z, fp.facing = e.X, e.Y, e.Z, e.Facing
	fp.hp, fp.maxHP, fp.mp, fp.maxMP = e.hp, e.maxHP, e.mp, e.maxMP
	fp.alive, fp.hidden, fp.targetID = e.alive, e.hidden, e.targetID
	fp.statusCount = len(e.statuses)
	for _, s := range e.statuses {
		fp.statusHash = fp.statusHash*31 + len(s.Kind) +
			s.Remaining*7 + s.ShieldHP*3 + int(s.Potency*1024)
	}
	if e.casting != nil {
		fp.castID = e.casting.SkillID
		fp.castProgress = int(e.casting.Progress)
	}
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

// Effect accumulator methods: worker-side simulation code (combat, entity
// plugins) records intents through the sim Hub's npcEffects pointer; the hub
// replays them in npc_commit.go.

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
