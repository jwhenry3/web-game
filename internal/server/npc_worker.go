package server

import (
	"math/rand"
	"sync"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// This file holds the NPC worker's lifecycle and mailbox plumbing: the
// worker goroutine, the call/reply protocol types that cross the boundary,
// and the tick-deadline bookkeeping the hub maintains per worker. Worker-side
// simulation lives in npc_worker_sim.go; hub-side commit lives in
// npc_commit.go.

// npcActorScopeMargin bounds how far outside its region a worker still
// receives actor snapshots. dropRange is the maximum distance at which a
// worker-owned NPC can interact with an actor (beyond it the NPC disengages),
// so actors outside region+margin are provably unreachable.
const npcActorScopeMargin = dropRange

// npcWorkerReplyTimeout caps how long the hub waits for a worker's tick reply
// before skipping it for the round; the worker's next result resyncs fully.
const npcWorkerReplyTimeout = combatTickInterval

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

	// Actor snapshot scope in world px: only players/pets inside the region
	// bounds inflated by npcActorScopeMargin are cloned into w.actors each
	// tick. Snapshots are deliberately per-worker copies — never shared —
	// because worker-side code mutates them (clearTargeting rewrites
	// target/engage/enmity on every entity in w.sim.entities, and damage /
	// engage commands refresh w.actors entries). actorAll marks the ""
	// fallback worker, whose NPCs may sit anywhere on the map.
	actorMinX, actorMinY, actorMaxX, actorMaxY float64
	actorAll                                   bool

	// pendingCmds holds fire-and-forget commands posted via enqueueCommand;
	// they are drained into the next tick request and processed at the top of
	// tick(), so their effects/projections ride back on the tick result
	// instead of a synchronous mailbox round-trip.
	cmdMu       sync.Mutex
	pendingCmds []npcCommand

	// Tick-deadline bookkeeping, owned by the hub goroutine only.
	inFlight         chan npcWorkerReply // reply channel of the unanswered tick
	inFlightSeq      uint64              // Seq of the unanswered tick
	sentActors       map[string]bool     // actor ids sent with the in-flight tick
	lastActors       map[string]bool     // actor ids in the last acked snapshot
	needFullSnapshot bool                // a skipped/dropped result must resync
}

type npcWorkerCall struct {
	tick     *npcTickRequest
	command  *npcCommand
	commands []npcCommand        // batched commands, one round-trip
	reply    chan npcWorkerReply // single/tick reply
	replies  chan []npcWorkerReply
}

type npcTickRequest struct {
	Seq    uint64
	Now    time.Time
	DT     float64
	Actors map[string]*entity
	// Commands are fire-and-forget commands drained from the worker's pending
	// queue; they run at the top of tick() and their replies fold into the
	// result instead of blocking the hub on a separate round-trip.
	Commands []npcCommand
	// FullSnapshot asks the worker to send every NPC projection regardless of
	// fingerprint diffs (set after a result was skipped or dropped).
	FullSnapshot bool
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
	Kind   npcCommandKind
	NPC    *entity
	Source *entity
	// SourceID lets the worker resolve the source from its actor snapshot
	// (w.actors) instead of receiving a per-command clone; Source remains the
	// fallback for actors outside the worker's snapshot scope.
	SourceID   string
	TargetID   string
	Damage     int
	Event      protocol.CombatEventPayload
	MessageFmt string
	// Class is the damage class ("physical"/"elemental"/"true") — the worker
	// mitigates with the target's vit or md accordingly.
	Class    string
	Statuses []game.StatusEffectDef
	Shield   int
	Enmity   int
	Captured bool
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
	if region, ok := world.SimulationRegionByID(id); ok {
		ts := float64(world.TileSizePx())
		w.actorMinX = float64(region.MinC)*ts - npcActorScopeMargin
		w.actorMinY = float64(region.MinR)*ts - npcActorScopeMargin
		w.actorMaxX = float64(region.MaxC+1)*ts + npcActorScopeMargin
		w.actorMaxY = float64(region.MaxR+1)*ts + npcActorScopeMargin
	} else {
		// The "" fallback worker owns NPCs outside every declared region; its
		// actor scope is the whole map.
		w.actorAll = true
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
		switch {
		case call.tick != nil:
			if call.reply != nil {
				call.reply <- npcWorkerReply{Result: w.tick(*call.tick)}
			}
		case call.command != nil:
			reply := w.command(*call.command)
			if call.reply != nil {
				call.reply <- reply
			}
		case call.commands != nil:
			replies := make([]npcWorkerReply, len(call.commands))
			for i, cmd := range call.commands {
				replies[i] = w.command(cmd)
			}
			if call.replies != nil {
				call.replies <- replies
			}
		}
	}
}

func (w *npcWorker) stop() {
	close(w.inbox)
	<-w.done
}

// send posts a command and returns its reply channel without waiting, so a
// caller can fan out to several workers before collecting any replies.
func (w *npcWorker) send(cmd npcCommand) chan npcWorkerReply {
	reply := make(chan npcWorkerReply, 1)
	select {
	case w.inbox <- npcWorkerCall{command: &cmd, reply: reply}:
	case <-w.done:
		close(reply)
	}
	return reply
}

func (w *npcWorker) call(cmd npcCommand) (npcWorkerReply, bool) {
	reply := w.send(cmd)
	select {
	case res := <-reply:
		return res, true
	case <-w.done:
		return npcWorkerReply{}, false
	}
}

// callAll runs a batch of commands in one mailbox round-trip; replies come
// back in command order.
func (w *npcWorker) callAll(cmds []npcCommand) ([]npcWorkerReply, bool) {
	if len(cmds) == 0 {
		return nil, true
	}
	replies := make(chan []npcWorkerReply, 1)
	select {
	case w.inbox <- npcWorkerCall{commands: cmds, replies: replies}:
	case <-w.done:
		return nil, false
	}
	select {
	case res := <-replies:
		return res, true
	case <-w.done:
		return nil, false
	}
}

// enqueueCommand queues a fire-and-forget command for the next tick. Safe to
// call from the hub goroutine while the worker is mid-tick.
func (w *npcWorker) enqueueCommand(cmd npcCommand) {
	w.cmdMu.Lock()
	w.pendingCmds = append(w.pendingCmds, cmd)
	w.cmdMu.Unlock()
}

// drainCommands returns (and clears) the queued commands for the next tick.
func (w *npcWorker) drainCommands() []npcCommand {
	w.cmdMu.Lock()
	cmds := w.pendingCmds
	w.pendingCmds = nil
	w.cmdMu.Unlock()
	return cmds
}

// coversActor reports whether a player/pet at its current position falls
// inside this worker's actor snapshot scope (region bounds + margin).
func (w *npcWorker) coversActor(e *entity) bool {
	if e == nil {
		return false
	}
	if w.actorAll {
		return true
	}
	return e.X >= w.actorMinX && e.X <= w.actorMaxX &&
		e.Y >= w.actorMinY && e.Y <= w.actorMaxY
}

// clearInFlight releases the tracked in-flight tick reply, if it is still the
// one being tracked.
func (w *npcWorker) clearInFlight(ch chan npcWorkerReply) {
	if w.inFlight == ch {
		w.inFlight = nil
	}
}

// ackActors promotes the actor set sent with the just-answered tick to the
// last-acked baseline that bindCommandSource consults.
func (w *npcWorker) ackActors() {
	w.lastActors = w.sentActors
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
		ccp.profLevels = cloneIntMap(cc.profLevels)
		ccp.pendingProfGrowth = cloneIntMap(cc.pendingProfGrowth)
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
