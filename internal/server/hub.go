package server

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"clara-mundi/internal/auth"
	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

// World bounds for the open-world layer (matches the client's map size).
const (
	// Maximum players per party.
	maxPartySize = 4

	// Grace after join, defeat, or transfer so a player cannot instantly re-aggro.
	battleImmunity = 5 * time.Second

	worldPosSaveInterval = 5 * time.Second
	worldSkillCooldown   = 2 * time.Second

	// nearSyncDist is the radius (px) at which movement streams in real time;
	// entities beyond it are batched into the far-sync digest.
	nearSyncDist    = 900.0
	farSyncInterval = time.Second
)

type Event struct {
	Type    protocol.MessageType
	Payload json.RawMessage
	Sender  *Client
}

// Hub is the central orchestrator: it routes client messages and owns the
// persistent open-world layer including realtime combat. Player/pet state is
// owned by the Run goroutine; in singular-world mode each NPC is owned by one
// region worker and mirrored here only as an immutable projection.
type Hub struct {
	mu      sync.RWMutex // guards clients map (read by senders outside Run)
	clients map[string]*Client

	register   chan *Client
	unregister chan *Client
	events     chan Event
	tasks      chan func()
	routes     *routeRegistry

	store    *store.Store
	accounts *store.AccountStore
	tokens   *auth.TokenIssuer

	// Run-goroutine owned:
	entities    map[string]*entity // unified world entities (players, NPCs, pets)
	entityDirty bool               // set when a server-driven entity moved/changed; broadcasts entity_state
	aoi         map[string]bool    // clientIDs currently receiving combat ticks
	projector   *projector         // canonical entity -> protocol.WorldEntity projection

	// Pet reconcile cadence: tickEntities runs syncPetEntities when
	// petSyncDirty (a mutation needs an immediate resync) or once per
	// petSyncInterval. lastPetSync is stamped by the tick path only, so the
	// direct syncPetEntities calls in the join/disconnect/pet/house handlers
	// stay immediate. See pets.go.
	petSyncDirty bool
	lastPetSync  time.Time

	// spatial indexes entity positions for the hot radius queries (aggro,
	// near-sync, combat AoI, NPC separation). Rebuilt lazily when spatialDirty
	// is set — at the top of every Run pass, after hub-driven position writes,
	// and at the start of the post-tick broadcast passes. See spatial.go.
	spatial      spatialGrid
	spatialDirty bool

	// Far-sync: clients with no nearby entity activity get position updates on
	// a 1s digest instead of the real-time stream.
	farEntityClients map[string]bool // joined clientIDs owed a digest entity_state
	movedPlayers     map[string]bool // player entity IDs moved since last digest

	// Send-buffer drop accounting (observability only — sendRawLocked still
	// drops rather than block). dropTotal counts every dropped frame;
	// dropCounts keeps a per-client tally so one slow consumer stands out.
	// Atomic/sync.Map because senders can run outside the Run goroutine.
	dropTotal    atomic.Uint64
	dropCounts   sync.Map // clientID -> *atomic.Uint64
	rng          *rand.Rand
	parties      map[string]*hubParty
	clientParty  map[string]string
	partyInvites map[string]*partyInvite
	partySeq     int
	camps        map[string]*worldCamp // owner character name -> camp

	overworld  *game.Overworld
	world      *game.WorldDefinition // non-nil selects singular-world ownership mode
	mapID      string
	mapName    string
	OnTransfer func(clientID string, dest TransferDest)

	// houseCtx is non-nil when this hub is a dynamic house instance: house
	// routes resolve against it and occupants return to its camp position.
	houseCtx *HouseContext
	// OnCloseHouse fires when the world hub despawns a camp whose house
	// instance lives on another node; the proxy evacuates + tears it down.
	OnCloseHouse func(owner, reason string)
	// OnCampSkinChanged fires when the owner changes the tent skin from
	// inside their house; the proxy forwards it to the return-map hub so the
	// overworld tent restyles while the instance lives elsewhere.
	OnCampSkinChanged func(owner, skin string)

	// Singular-world NPC workers own mutable NPC entities. Hub.entities keeps
	// projection copies for targeting and wire output. npcEffects is non-nil
	// only on the private simulation façade used inside a worker goroutine.
	npcWorkers     map[string]*npcWorker
	npcWorkerOrder []string
	npcOwners      map[string]string
	npcWorkerSeq   uint64
	npcEffects     *npcSimEffects

	// World-space placement of this map inside the border-graph layout, sent
	// in map_snapshot so clients can overlay neighbors in one scene.
	worldOriginX float64
	worldOriginY float64
	neighbors    []protocol.MapNeighbor

	quit     chan struct{}
	done     chan struct{}
	stopOnce sync.Once
}

// TransferDest is where a leaving client should re-attach: absolute
// (Map + X/Y — save-point travel, interior portals) or edge-derived
// (Map + Edge + EdgeT — the destination map computes the mirrored landing
// on its own rim). Plain struct keeps the server cluster-agnostic.
type TransferDest struct {
	Map    string
	X, Y   float64
	Facing float64
	// Edge is the edge on the DESTINATION map the player enters through
	// ("north"|"south"|"east"|"west"); EdgeT is the 0..1 fraction along it.
	Edge  game.BorderEdge
	EdgeT float64
	// House carries instance context when Map is a dynamic house id
	// (house:<owner>); the proxy lazily creates the instance node from it.
	House *HouseSpec
}

// HouseSpec describes a dynamic house instance for the transfer layer:
// which camp owns it and where occupants return when they leave or are
// evicted.
type HouseSpec struct {
	Owner     string
	Skin      string
	ReturnMap string
	ReturnX   float64
	ReturnY   float64
}

// HouseContext marks a hub as a dynamic house instance. Set once at node
// construction; the hub behaves like a normal map hub but scopes house
// routes/state to HouseSpec.Owner and returns occupants to the camp.
type HouseContext struct {
	Owner     string
	Skin      string
	ReturnMap string
	ReturnX   float64
	ReturnY   float64
}

func NewHub(profiles *store.Store, accounts *store.AccountStore, tokens *auth.TokenIssuer) (*Hub, error) {
	if err := game.ReloadLootCatalogs(); err != nil {
		log.Printf("warning: loot catalogs: %v", err)
	}
	h := &Hub{
		clients:          make(map[string]*Client),
		register:         make(chan *Client, 16),
		unregister:       make(chan *Client, 16),
		events:           make(chan Event, 256),
		tasks:            make(chan func(), 256),
		routes:           newRouteRegistry(),
		store:            profiles,
		accounts:         accounts,
		tokens:           tokens,
		entities:         make(map[string]*entity),
		rng:              rand.New(rand.NewSource(time.Now().UnixNano())),
		parties:          make(map[string]*hubParty),
		clientParty:      make(map[string]string),
		partyInvites:     make(map[string]*partyInvite),
		camps:            make(map[string]*worldCamp),
		farEntityClients: make(map[string]bool),
		movedPlayers:     make(map[string]bool),
		overworld:        game.Loaded(),
		projector:        newProjector(),
		quit:             make(chan struct{}),
		done:             make(chan struct{}),
	}
	// Feature modules register their routes and disconnect hooks here, in a
	// fixed order, so dispatch is deterministic and the duplicate-route
	// guard catches any overlap at construction time.
	for _, registerModule := range []func() error{
		h.registerSocialModule,
		h.registerCombatModule,
		h.registerLoadoutModule,
		h.registerHousingModule,
		h.registerPetsModule,
		h.registerWorldModule,
	} {
		if err := registerModule(); err != nil {
			return nil, err
		}
	}
	return h, nil
}

// PostTask queues fn on the hub loop; safe from any goroutine. No-op once
// the hub is stopped.
func (h *Hub) PostTask(fn func()) {
	select {
	case h.tasks <- fn:
	case <-h.done:
	}
}

func (h *Hub) Register(c *Client) { h.register <- c }

func (h *Hub) Unregister(c *Client) { h.unregister <- c }

func (h *Hub) PushEvent(ev Event) { h.events <- ev }

func (h *Hub) SetMap(id, name string, ow *game.Overworld) {
	if h.npcWorkers != nil {
		h.stopNPCWorkers()
	}
	h.world = nil
	h.mapID = id
	h.mapName = name
	if ow != nil {
		h.overworld = ow
		game.RegisterSavePoints(id, name, ow.SavePoints)
	}
}

// SetWorld configures a hub to simulate one continuous world. Unlike SetMap,
// region boundaries only change authoritative ownership; they never transfer a
// client to another hub.
func (h *Hub) SetWorld(id, name string, world *game.WorldDefinition) {
	if h.npcWorkers != nil {
		h.stopNPCWorkers()
	}
	h.world = world
	h.mapID = id
	h.mapName = name
	if world != nil {
		h.overworld = world.Overworld
		game.RegisterSavePoints(id, name, world.SavePoints)
	}
}

// BroadcastMapConfig notifies connected clients that map terrain/collision changed.
func (h *Hub) BroadcastMapConfig() {
	snap := h.mapSnapshot()
	if snap == nil {
		return
	}
	h.broadcastAll(protocol.Encode(protocol.TypeMapConfig, protocol.MapConfigPayload{Map: snap}))
}

// ApplyOverworldReload installs a freshly loaded overworld on this map hub and
// streams map_config + world_state to connected clients. Safe to call from any
// goroutine; work runs on the hub loop.
func (h *Hub) ApplyOverworldReload(id, name string, ow *game.Overworld) {
	done := make(chan struct{})
	task := func() {
		defer close(done)
		h.reloadOverworld(id, name, ow)
	}
	select {
	case h.tasks <- task:
		select {
		case <-done:
		case <-h.done:
		}
	case <-h.done:
	}
}

func (h *Hub) reloadOverworld(id, name string, ow *game.Overworld) {
	if h.world != nil {
		world, err := game.NewWorldDefinition(ow, h.world.SimulationRegions)
		if err != nil {
			log.Printf("world %s reload rejected: %v", id, err)
			return
		}
		h.SetWorld(id, name, world)
	} else {
		h.SetMap(id, name, ow)
	}
	h.reseedNPCsPreservingCombat(h.npcPatrolCount())
	h.BroadcastMapConfig()
	h.broadcastWorldState()
	nClients := 0
	h.mu.RLock()
	for _, c := range h.clients {
		if c.Joined {
			nClients++
		}
	}
	h.mu.RUnlock()
	log.Printf("map %s (%s) reloaded; streamed to %d client(s)", id, name, nClients)
}

func (h *Hub) MapID() string { return h.mapID }

// SetWorldOrigin records this map's position in the world layout plus the
// border-adjacent maps' origins. Called once at node startup.
func (h *Hub) SetWorldOrigin(x, y float64, neighbors []protocol.MapNeighbor) {
	h.worldOriginX, h.worldOriginY = x, y
	h.neighbors = append([]protocol.MapNeighbor(nil), neighbors...)
}

func (h *Hub) KickByCharacterName(name string) {
	h.tasks <- func() {
		h.mu.RLock()
		var target *Client
		for _, c := range h.clients {
			if c.Joined && strings.EqualFold(c.Name, name) {
				target = c
				break
			}
		}
		h.mu.RUnlock()
		if target != nil {
			if target.Conn != nil {
				target.Conn.Close()
			} else if target.CloseFn != nil {
				target.CloseFn()
			}
		}
	}
}

func (h *Hub) Run() {
	defer close(h.done)
	defer h.stopNPCWorkers()
	h.initSocial()
	h.ensureNPCWorkers()
	h.seedNPCs(h.npcPatrolCount())
	ticker := time.NewTicker(time.Duration(npcTickSec * float64(time.Second)))
	defer ticker.Stop()
	castTicker := time.NewTicker(50 * time.Millisecond)
	defer castTicker.Stop()
	farTicker := time.NewTicker(farSyncInterval)
	defer farTicker.Stop()
	for {
		// Every pass may move/spawn/remove entities (event handlers, entity
		// ticks, tasks); the first spatial query of the pass rebuilds once.
		h.spatialInvalidate()
		// Membership changes are drained before queued work so events and
		// tasks always see a consistent roster: a transfer's attach
		// (register) lands before the join replay that follows it, and a
		// detach lands before any task enumerating clients. Registers run
		// before unregisters because an attach always precedes its detach.
		for {
			select {
			case client := <-h.register:
				h.mu.Lock()
				h.clients[client.ID] = client
				h.mu.Unlock()
				log.Printf("client %s connected", client.ID)
				continue
			default:
			}
			break
		}
		for {
			select {
			case client := <-h.unregister:
				h.handleDisconnect(client)
				continue
			default:
			}
			break
		}
		select {
		case <-h.quit:
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("client %s connected", client.ID)

		case client := <-h.unregister:
			h.handleDisconnect(client)

		case event := <-h.events:
			h.handleEvent(event)

		case task := <-h.tasks:
			task()

		case <-ticker.C:
			h.outOfCombatRegen()

		case <-castTicker.C:
			h.finishDueWorldCasts(time.Now())
			h.tickEntities(time.Now())

		case <-farTicker.C:
			h.flushFarSync()
		}
	}
}

// Stop signals the hub loop to exit and waits for it to finish.
func (h *Hub) Stop() {
	h.stopOnce.Do(func() {
		close(h.quit)
	})
	<-h.done
}

// ---- hub-goroutine internals ----

func (h *Hub) handleDisconnect(client *Client) {
	h.mu.Lock()
	if _, ok := h.clients[client.ID]; !ok {
		h.mu.Unlock()
		return
	}
	delete(h.clients, client.ID)
	close(client.Send)
	h.mu.Unlock()

	joined := false
	if e := h.playerEnt(client.ID); e != nil {
		joined = true
		h.persistWorldLocation(client, e, true)
		h.flushSkillUsage(e)
		h.clearTargeting(client.ID) // engaged NPCs retarget next tick
		h.eachEntity(kindNPC, func(n *entity) { delete(n.contributors, client.ID) })
	}
	delete(h.aoi, client.ID)
	delete(h.farEntityClients, client.ID)
	h.dropCounts.Delete(client.ID)
	if joined {
		h.petSyncDirty = true
		delete(h.entities, client.ID)
		h.syncPetEntities()
		h.broadcastAll(protocol.Encode(protocol.TypePlayerLeft, protocol.PlayerLeftPayload{ID: client.ID}))
	}
	// Module disconnect hooks (social party cleanup, housing teardown) run
	// after the entity is gone: their sends to the departed client are
	// dropped by the h.clients membership check in sendRawLocked.
	h.routes.disconnect(client)
	log.Printf("client %s disconnected", client.ID)
}

func (h *Hub) handleEvent(ev Event) {
	c := ev.Sender

	// join_world is special-cased: it gates c.Joined, so it must run before
	// the join check and the module registry.
	if ev.Type == protocol.TypeJoinWorld {
		h.handleJoinWorld(c, ev.Payload)
		return
	}
	if !c.Joined {
		h.sendError(c, "Join the world first.")
		return
	}
	if h.routes.handle(c, ev.Type, ev.Payload) {
		return
	}

	// Core routes only: move is the hot path (one message per input frame)
	// and chat is the other generic session message. Everything
	// feature-scoped lives in the module registry above.
	switch ev.Type {
	case protocol.TypeMove:
		h.handleMove(c, ev.Payload)
	case protocol.TypeChat:
		h.handleChat(c, ev.Payload)
	default:
		h.sendError(c, fmt.Sprintf("Unknown message type %q.", ev.Type))
	}
}

func (h *Hub) handleJoinWorld(c *Client, raw json.RawMessage) {
	if c.Joined {
		return
	}
	// A queued join can outlive its session: the client's unregister is
	// always processed first, so a non-member here is already gone.
	h.mu.RLock()
	member := h.clients[c.ID] == c
	h.mu.RUnlock()
	if !member {
		return
	}
	var p protocol.JoinWorldPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		h.sendError(c, "Malformed join request.")
		return
	}

	name := strings.TrimSpace(p.PlayerName)
	if name == "" || len(name) > 24 {
		h.sendError(c, "Name must be 1-24 characters.")
		return
	}

	var profile store.Profile
	var errMsg string

	if h.accounts != nil {
		if c.AccountID == "" {
			h.sendError(c, "Authentication required.")
			return
		}
		if existing, ok := h.store.GetByAccountName(c.AccountID, name); ok {
			profile = existing
		} else {
			race := game.RaceID(strings.ToLower(strings.TrimSpace(p.Race)))
			mainJob := game.JobID(strings.ToUpper(strings.TrimSpace(p.MainJob)))
			subJob := game.JobID(strings.ToUpper(strings.TrimSpace(p.SubJob)))
			if mainJob == "" && p.Job != "" {
				mainJob = game.JobID(strings.ToUpper(strings.TrimSpace(p.Job)))
			}
			if race == "" || mainJob == "" {
				h.sendError(c, "Character not found. Create a new hero with race and main job.")
				return
			}
			appearance := storeAppearanceFromPayload(p.Appearance)
			profile, errMsg = h.store.CreateCharacter(c.AccountID, name, race, mainJob, subJob, appearance)
			if errMsg != "" {
				h.sendError(c, errMsg)
				return
			}
		}
	} else {
		// Legacy/test path without accounts.
		job := game.JobID(strings.ToUpper(strings.TrimSpace(p.Job)))
		if job == "" && p.Weapon != "" {
			job = game.WeaponDefaultJob(game.WeaponType(p.Weapon))
		}
		if job == "" {
			job = game.JobVAN
		}
		profile = h.store.GetOrCreate(name, job)
	}

	name = profile.Name
	dup := false
	h.eachEntity(kindPlayer, func(o *entity) {
		if strings.EqualFold(o.Name, name) {
			dup = true
		}
	})
	if dup {
		h.sendError(c, "That hero is already online.")
		return
	}

	c.Name = name
	c.Joined = true

	spawnX, spawnY, facing := h.resumeSpawn(c, profile)
	e := h.ensurePlayer(c)
	e.Name = profile.Name
	e.Sprite = profile.Race
	e.X, e.Y, e.Facing = spawnX, spawnY, facing
	h.applyProfilePresence(e, profile)
	// Zone transfers attach with UseSpawn — grant the same invuln window.
	if c.UseSpawn {
		h.grantBattleImmunity(e)
	}
	h.persistWorldLocation(c, e, true)
	h.refreshRegionOwnership(c, e)
	h.petSyncDirty = true
	h.syncPetEntities()

	h.sendWelcome(c, profile)
	tile, cols, rows, cells := h.mapCells()
	h.send(c, protocol.TypeWorldState, protocol.WorldStatePayload{
		Entities:    h.worldEntities(time.Now()),
		Camps:       h.campList(),
		SavePoints:  h.worldSavePoints(),
		JobChangers: h.worldJobChangers(),
		Map:         protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
	})
	h.broadcastAll(protocol.Encode(protocol.TypePlayerJoin, h.entitySync(e)))
	h.sendSocialState(c)
	h.refreshFriendsSocial(c.Name)
	// Instance joins finish with house_state so the client flips to the
	// house screen after world_state. The joiner is passed explicitly — its
	// register may still be queued behind this join event.
	if h.houseCtx != nil {
		h.sendHouseStateTo(c)
	}
	log.Printf("%s joined the world as %s/%s (lv %d)", name, profile.MainJob, profile.SubJob, profile.MainJobLevel())
}

// applyProfilePresence copies profile-visible fields (race, jobs, weapon,
// appearance) onto the player entity's clientControl plugin.
func (h *Hub) applyProfilePresence(e *entity, profile store.Profile) {
	cc := clientControlOf(e)
	if cc == nil {
		return
	}
	cc.weaponName = string(profile.EquippedWeaponType())
	cc.subWeaponName = string(profile.EquippedSubWeaponType())
	cc.race = profile.Race
	cc.mainJobName = profile.MainJob
	cc.subJobName = profile.SubJob
	cc.appearance = appearanceProto(profile)
	e.Name = profile.Name
	e.Sprite = profile.Race
	e.Level = profile.MainJobLevel()
}

func (h *Hub) handleMove(c *Client, raw json.RawMessage) {
	e := h.playerEnt(c.ID)
	if e == nil {
		return
	}
	var p protocol.MovePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	cc := clientControlOf(e)
	if cc == nil {
		return
	}
	prevX, prevY := e.X, e.Y
	maxStep := maxMoveStep
	if cc.mounted {
		maxStep *= mountMoveMult
	}
	if time.Since(cc.dodgedAt) < dodgeLandingWindow {
		maxStep += dodgeDashDist
	}
	e.X, e.Y = h.clampMoveStep(e.X, e.Y, p.X, p.Y, maxStep)
	h.spatialInvalidate()
	e.Facing = game.ResolveFacingYaw(e.X-prevX, e.Y-prevY, derefFacing(p.Facing), p.Facing != nil, e.Facing)
	h.interruptWorldCastOnMove(c, e)
	// Combat: movement while casting a battle skill interrupts it past the
	// cancel threshold, and real displacement keeps the dodge window alive.
	moved := math.Hypot(e.X-prevX, e.Y-prevY)
	if moved > 0.5 {
		cc.lastMoveAt = time.Now()
		cc.lastMoveDX = e.X - prevX
		cc.lastMoveDY = e.Y - prevY
	}
	if e.casting != nil && dist(e.X, e.Y, e.castX, e.castY) >= castMoveCancel {
		h.interruptCast(e)
	}
	h.persistWorldLocation(c, e, false)
	h.refreshRegionOwnership(c, e)
	if h.world == nil && h.OnTransfer != nil && h.overworld != nil {
		if destMap, edge, t, ok := h.overworld.BorderCrossingAt(e.X, e.Y); ok && destMap != h.mapID {
			h.OnTransfer(c.ID, TransferDest{
				Map: destMap, Edge: edge.Opposite(), EdgeT: t, Facing: e.Facing,
			})
			return
		}
		if exit, ok := h.overworld.ExitAt(e.X, e.Y); ok && exit.DestMap != h.mapID {
			h.OnTransfer(c.ID, TransferDest{
				Map: exit.DestMap, X: exit.DestX, Y: exit.DestY, Facing: e.Facing,
			})
			return
		}
	}
	h.broadcastPlayerMoved(c.ID, e)
	h.checkAggroAt(c.ID, e.X, e.Y)
	// House instances drive HouseScene positions from house_state, so each
	// accepted move also pushes the occupant roster (same cadence as the
	// former guest-table path).
	if h.houseCtx != nil {
		h.sendHouseState()
	}
}

func (h *Hub) handleChat(c *Client, raw json.RawMessage) {
	var p protocol.ChatPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	msg := strings.TrimSpace(p.Message)
	if msg == "" || len(msg) > 300 {
		return
	}
	h.broadcastAll(protocol.Encode(protocol.TypeChatMsg, protocol.ChatMessagePayload{
		FromID: c.ID, FromName: c.Name, Message: msg,
	}))
}

func (h *Hub) handleEquip(c *Client, raw json.RawMessage) {
	e := h.playerEnt(c.ID)
	if e == nil {
		return
	}
	var p protocol.EquipPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, errMsg := h.store.Equip(c.Name, p.ItemID, p.Slot)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.refreshCombatStats(c, e)
	if cc := clientControlOf(e); cc != nil {
		cc.weaponName = string(profile.EquippedWeaponType())
		cc.subWeaponName = string(profile.EquippedSubWeaponType())
	}
	h.sendProfileRefresh(c, profile)
	h.sendPlayerSync(e)
}

func (h *Hub) handleUnequip(c *Client, raw json.RawMessage) {
	e := h.playerEnt(c.ID)
	if e == nil {
		return
	}
	var p protocol.UnequipPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, ok := h.store.Unequip(c.Name, p.Slot)
	if !ok {
		return
	}
	h.refreshCombatStats(c, e)
	if cc := clientControlOf(e); cc != nil {
		cc.weaponName = string(profile.EquippedWeaponType())
		cc.subWeaponName = string(profile.EquippedSubWeaponType())
	}
	h.sendProfileRefresh(c, profile)
	h.sendPlayerSync(e)
}

func (h *Hub) handleSetJobs(c *Client, raw json.RawMessage) {
	e := h.playerEnt(c.ID)
	if e == nil {
		return
	}
	if cc := clientControlOf(e); cc != nil && cc.inCombat {
		h.sendError(c, "Cannot change jobs while in combat.")
		return
	}
	var p protocol.SetJobsPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		h.sendError(c, "Malformed job request.")
		return
	}
	if p.JobChangerID == "" {
		h.sendError(c, "Visit a Job Master to change jobs.")
		return
	}
	if !h.nearJobChanger(e.X, e.Y, p.JobChangerID) {
		h.sendError(c, "Move closer to the Job Master.")
		return
	}
	profile, errMsg := h.store.SetJobs(c.Name, game.JobID(p.MainJob), game.JobID(p.SubJob))
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.applyProfilePresence(e, profile)
	h.sendProfileRefresh(c, profile)
	h.sendPlayerSync(e)
}

func (h *Hub) handleSetHotbar(c *Client, raw json.RawMessage) {
	var p protocol.SetHotbarPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, ok := h.store.SetHotbar(c.Name, p.Slot, p.Kind, p.ID)
	if !ok {
		h.sendError(c, "Invalid hotbar slot.")
		return
	}
	h.sendProfileRefresh(c, profile)
}

func (h *Hub) handleSetKeybinds(c *Client, raw json.RawMessage) {
	var p protocol.SetKeybindsPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, ok := h.store.SetKeybinds(c.Name, p.Keybinds)
	if !ok {
		h.sendError(c, "Invalid keybinds.")
		return
	}
	h.sendProfileRefresh(c, profile)
}

func (h *Hub) grantBattleImmunity(e *entity) {
	cc := clientControlOf(e)
	if cc == nil {
		return
	}
	cc.immuneUntil = time.Now().Add(battleImmunity).UnixMilli()
}

// StatusCounts returns online player count and engaged NPC count for this map.
// Safe to call from any goroutine; does not expose world state.
func (h *Hub) StatusCounts() (players, engaged int) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	players = len(h.clients)
	return
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func derefFacing(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}
