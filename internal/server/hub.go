package server

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"strings"
	"sync"
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
// persistent open-world layer including realtime combat. All world state is
// owned by the Run goroutine — there are no separate battle rooms or locks on
// entity state.
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

	// Far-sync: clients with no nearby entity activity get position updates on
	// a 1s digest instead of the real-time stream.
	farEntityClients map[string]bool // joined clientIDs owed a digest entity_state
	movedPlayers     map[string]bool // player entity IDs moved since last digest
	rng              *rand.Rand
	parties          map[string]*hubParty
	clientParty      map[string]string
	partyInvites     map[string]*partyInvite
	partySeq         int
	camps            map[string]*worldCamp // owner character name -> camp
	houses           map[string]*houseRoom // owner character name -> instance

	overworld  *game.Overworld
	mapID      string
	mapName    string
	OnTransfer func(clientID string, dest TransferDest)

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
		houses:           make(map[string]*houseRoom),
		farEntityClients: make(map[string]bool),
		movedPlayers:     make(map[string]bool),
		overworld:        game.Loaded(),
		projector:        newProjector(),
		quit:             make(chan struct{}),
		done:             make(chan struct{}),
	}
	if err := h.registerSocialModule(); err != nil {
		return nil, err
	}
	return h, nil
}

func (h *Hub) Register(c *Client) { h.register <- c }

func (h *Hub) Unregister(c *Client) { h.unregister <- c }

func (h *Hub) PushEvent(ev Event) { h.events <- ev }

func (h *Hub) SetMap(id, name string, ow *game.Overworld) {
	h.mapID = id
	h.mapName = name
	if ow != nil {
		h.overworld = ow
		game.RegisterSavePoints(id, name, ow.SavePoints)
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
	h.SetMap(id, name, ow)
	h.reseedNPCsPreservingCombat(npcCount)
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

func (h *Hub) broadcastWorldState() {
	tile, cols, rows, cells := h.mapCells()
	h.broadcastAll(protocol.Encode(protocol.TypeWorldState, protocol.WorldStatePayload{
		Entities:    h.worldEntities(time.Now()),
		Camps:       h.campList(),
		SavePoints:  h.worldSavePoints(),
		JobChangers: h.worldJobChangers(),
		Map:         protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
	}))
}

func (h *Hub) MapID() string { return h.mapID }

// SetWorldOrigin records this map's position in the world layout plus the
// border-adjacent maps' origins. Called once at node startup.
func (h *Hub) SetWorldOrigin(x, y float64, neighbors []protocol.MapNeighbor) {
	h.worldOriginX, h.worldOriginY = x, y
	h.neighbors = append([]protocol.MapNeighbor(nil), neighbors...)
}

// MapSnapshot returns the current map configuration for clients (REST + welcome).
func (h *Hub) MapSnapshot() *protocol.MapSnapshot {
	return h.mapSnapshot()
}

func (h *Hub) mapSnapshot() *protocol.MapSnapshot {
	if h.mapID == "" || h.overworld == nil {
		return nil
	}
	tile, cols, rows, cells := h.overworld.MapPayload()
	ts := float64(h.overworld.TileSizePx())
	portals := make([]protocol.MapPortal, 0, len(h.overworld.Exits)+len(h.overworld.Borders))
	for _, e := range h.overworld.Exits {
		portals = append(portals, protocol.MapPortal{
			X: float64(e.MinC) * ts,
			Y: float64(e.MinR) * ts,
			W: float64(e.MaxC-e.MinC+1) * ts,
			H: float64(e.MaxR-e.MinR+1) * ts,
		})
	}
	// Border crossings get their walkable band strips as portal rects.
	for _, r := range h.overworld.BorderPortalRects() {
		portals = append(portals, protocol.MapPortal{
			X: float64(r[0]) * ts,
			Y: float64(r[1]) * ts,
			W: float64(r[2]-r[0]+1) * ts,
			H: float64(r[3]-r[1]+1) * ts,
		})
	}
	return &protocol.MapSnapshot{
		ID:            h.mapID,
		Name:          h.mapName,
		Overworld:     protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
		TiledMap:      "",
		Portals:       portals,
		TileOverrides: tileOverridesPayload(h.overworld.TileOverrides),
		TerrainLayers: terrainLayersPayload(h.overworld),
		OriginX:       h.worldOriginX,
		OriginY:       h.worldOriginY,
		Neighbors:     append([]protocol.MapNeighbor(nil), h.neighbors...),
	}
}

func terrainLayersPayload(ow *game.Overworld) *protocol.MapTerrainLayers {
	if ow == nil || len(ow.Ground) == 0 || len(ow.Collision) == 0 {
		return nil
	}
	return &protocol.MapTerrainLayers{
		Ground:    ow.Ground,
		Collision: ow.Collision,
	}
}

func tileOverridesPayload(o *game.MapTileOverrides) *protocol.MapTileOverrides {
	if o == nil || len(o.Layers) == 0 {
		return nil
	}
	return &protocol.MapTileOverrides{
		MapID:     o.MapID,
		Layers:    o.Layers,
		UpdatedAt: o.UpdatedAt,
	}
}

func (h *Hub) welcomePayload(c *Client, profile store.Profile) protocol.WelcomePayload {
	return protocol.WelcomePayload{
		PlayerID: c.ID,
		Profile:  profileInfo(profile),
		Map:      h.mapSnapshot(),
	}
}

func (h *Hub) sendWelcome(c *Client, profile store.Profile) {
	h.send(c, protocol.TypeWelcome, h.welcomePayload(c, profile))
}

func (h *Hub) mapCells() (tile, cols, rows int, cells string) {
	if h.overworld != nil {
		return h.overworld.MapPayload()
	}
	return game.OverworldMapPayload()
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
	h.initSocial()
	h.seedNPCs(npcCount)
	ticker := time.NewTicker(time.Duration(npcTickSec * float64(time.Second)))
	defer ticker.Stop()
	castTicker := time.NewTicker(50 * time.Millisecond)
	defer castTicker.Stop()
	farTicker := time.NewTicker(farSyncInterval)
	defer farTicker.Stop()
	for {
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

func (h *Hub) sendRaw(c *Client, msg []byte) {
	if msg == nil {
		return
	}
	select {
	case c.Send <- msg:
	default:
		log.Printf("client %s send buffer full, dropping message", c.ID)
	}
}

func (h *Hub) send(c *Client, t protocol.MessageType, payload any) {
	h.sendRaw(c, protocol.Encode(t, payload))
}

func (h *Hub) sendError(c *Client, msg string) {
	h.send(c, protocol.TypeError, protocol.ErrorPayload{Message: msg})
}

func (h *Hub) broadcastAll(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if c.Joined {
			h.sendRaw(c, msg)
		}
	}
}

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
	h.onHousingDisconnect(client)
	if joined {
		delete(h.entities, client.ID)
		h.syncPetEntities()
		h.broadcastAll(protocol.Encode(protocol.TypePlayerLeft, protocol.PlayerLeftPayload{ID: client.ID}))
	}
	h.routes.disconnect(client)
	log.Printf("client %s disconnected", client.ID)
}

func (h *Hub) handleEvent(ev Event) {
	c := ev.Sender

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

	switch ev.Type {
	case protocol.TypeMove:
		h.handleMove(c, ev.Payload)
	case protocol.TypeChat:
		h.handleChat(c, ev.Payload)
	case protocol.TypeEquip:
		h.handleEquip(c, ev.Payload)
	case protocol.TypeUnequip:
		h.handleUnequip(c, ev.Payload)
	case protocol.TypeSetJobs:
		h.handleSetJobs(c, ev.Payload)
	case protocol.TypeSetHotbar:
		h.handleSetHotbar(c, ev.Payload)
	case protocol.TypeSetKeybinds:
		h.handleSetKeybinds(c, ev.Payload)
	case protocol.TypeAction:
		h.handleAction(c, ev.Payload)
	case protocol.TypeSetTarget:
		h.handleSetTarget(c, ev.Payload)
	case protocol.TypeDodge:
		h.handleDodge(c)
	case protocol.TypeSetSavePoint:
		h.handleSetSavePoint(c, ev.Payload)
	case protocol.TypeUseWorldSkill:
		h.handleUseWorldSkill(c, ev.Payload)
	case protocol.TypeEnterHouse:
		h.handleEnterHouse(c, ev.Payload)
	case protocol.TypeLeaveHouse:
		h.handleLeaveHouse(c)
	case protocol.TypeHouseInteract:
		h.handleHouseInteract(c, ev.Payload)
	case protocol.TypeHouseStorageDeposit:
		h.handleHouseStorageDeposit(c, ev.Payload)
	case protocol.TypeHouseStorageWithdraw:
		h.handleHouseStorageWithdraw(c, ev.Payload)
	case protocol.TypeHousePlaceFurniture:
		h.handleHousePlaceFurniture(c, ev.Payload)
	case protocol.TypeHousePickFurniture:
		h.handleHousePickFurniture(c, ev.Payload)
	case protocol.TypeSetCampSkin:
		h.handleSetCampSkin(c, ev.Payload)
	case protocol.TypePetSetFollow:
		h.handlePetSetFollow(c, ev.Payload)
	case protocol.TypePetSetBattle:
		h.handlePetSetBattle(c, ev.Payload)
	case protocol.TypePetRelease:
		h.handlePetRelease(c, ev.Payload)
	case protocol.TypePetCommand:
		h.handlePetCommand(c, ev.Payload)
	default:
		h.sendError(c, fmt.Sprintf("Unknown message type %q.", ev.Type))
	}
}

func (h *Hub) handleJoinWorld(c *Client, raw json.RawMessage) {
	if c.Joined {
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
	log.Printf("%s joined the world as %s/%s (lv %d)", name, profile.MainJob, profile.SubJob, profile.MainJobLevel())
}

// applyProfilePresence copies profile-visible fields (race, jobs, weapon,
// appearance) onto the player entity's clientControl plugin.
func (h *Hub) applyProfilePresence(e *entity, profile store.Profile) {
	cc := clientControlOf(e)
	if cc == nil {
		return
	}
	cc.weaponName = string(profile.WeaponType())
	cc.race = profile.Race
	cc.mainJobName = profile.MainJob
	cc.subJobName = profile.SubJob
	cc.appearance = appearanceProto(profile)
	e.Name = profile.Name
	e.Sprite = profile.Race
	e.Level = profile.MainJobLevel()
}

func (h *Hub) resumeSpawn(c *Client, profile store.Profile) (x, y float64, facing float64) {
	if c.UseSpawn {
		if c.SpawnEdge != "" && h.overworld != nil {
			// EntryPoint already falls back to the map spawn when no
			// walkable landing exists on that edge.
			x, y = h.overworld.EntryPoint(c.SpawnEdge, c.SpawnEdgeT)
			return x, y, c.SpawnFacing
		}
		return c.SpawnX, c.SpawnY, c.SpawnFacing
	}
	if profile.HasWorldPos && h.canResumeAt(profile.WorldX, profile.WorldY) {
		return profile.WorldX, profile.WorldY, profile.Facing.Radians()
	}
	if h.overworld != nil {
		x, y = h.overworld.SpawnPosition(profile.SavePointID)
	} else {
		x, y = game.SpawnPosition(profile.SavePointID)
	}
	return x, y, game.FacingYawDefault
}

func (h *Hub) canResumeAt(x, y float64) bool {
	if h.overworld != nil {
		return h.overworld.BoundsWalkableAt(x, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH)
	}
	return game.BoundsWalkableAt(x, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH)
}

func (h *Hub) persistWorldLocation(c *Client, e *entity, flush bool) {
	if c == nil || e == nil || c.Name == "" {
		return
	}
	doFlush := flush || time.Since(c.lastWorldSave) >= worldPosSaveInterval
	h.store.SetWorldLocation(c.Name, h.mapID, e.X, e.Y, e.Facing, doFlush)
	if doFlush {
		c.lastWorldSave = time.Now()
	}
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
	if cc.inHouse {
		h.moveInHouse(c, e, p.X, p.Y, p.Facing)
		return
	}
	prevX, prevY := e.X, e.Y
	maxStep := maxMoveStep
	if time.Since(cc.dodgedAt) < dodgeLandingWindow {
		maxStep += dodgeDashDist
	}
	e.X, e.Y = h.clampMoveStep(e.X, e.Y, p.X, p.Y, maxStep)
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
	if h.OnTransfer != nil && h.overworld != nil {
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
}

// broadcastPlayerMoved streams a move update to the mover and clients within
// nearSyncDist immediately; distant clients pick the position up on the
// once-a-second far-sync digest instead.
func (h *Hub) broadcastPlayerMoved(moverID string, e *entity) {
	msg := protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: moverID, X: e.X, Y: e.Y, Facing: e.Facing,
	})
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if !c.Joined {
			continue
		}
		p := h.entities[c.ID]
		if c.ID == moverID || (p != nil && dist(p.X, p.Y, e.X, e.Y) <= nearSyncDist) {
			h.sendRaw(c, msg)
		} else {
			h.movedPlayers[moverID] = true
		}
	}
}

// nearServerEntity reports whether any server-driven entity (NPC/pet) is
// within nearSyncDist of the player entity.
func (h *Hub) nearServerEntity(p *entity) bool {
	for _, e := range h.entities {
		if e.Kind == kindPlayer || e.hidden {
			continue
		}
		if dist(p.X, p.Y, e.X, e.Y) <= nearSyncDist {
			return true
		}
	}
	return false
}

// flushFarSync runs on farSyncInterval: clients with no nearby server entity
// get a full entity_state digest, and players that moved while out of a
// client's near range get their latest position pushed as player_moved.
func (h *Hub) flushFarSync() {
	if len(h.farEntityClients) == 0 && len(h.movedPlayers) == 0 {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	if len(h.farEntityClients) > 0 {
		var msg []byte
		for id := range h.farEntityClients {
			c := h.clients[id]
			if c == nil || !c.Joined {
				continue
			}
			if msg == nil {
				msg = protocol.Encode(protocol.TypeEntityState, protocol.EntityStatePayload{
					Entities: h.serverEntitySnapshots(),
				})
			}
			h.sendRaw(c, msg)
		}
		clear(h.farEntityClients)
	}
	if len(h.movedPlayers) == 0 {
		return
	}
	for _, c := range h.clients {
		if !c.Joined {
			continue
		}
		p := h.entities[c.ID]
		for id := range h.movedPlayers {
			if id == c.ID {
				continue
			}
			e := h.entities[id]
			if e == nil || e.hidden {
				continue
			}
			if p != nil && dist(p.X, p.Y, e.X, e.Y) <= nearSyncDist {
				continue // near clients already stream these in real time
			}
			h.sendRaw(c, protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
				ID: id, X: e.X, Y: e.Y, Facing: e.Facing,
			}))
		}
	}
	clear(h.movedPlayers)
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
		cc.weaponName = string(profile.WeaponType())
	}
	h.sendWelcome(c, profile)
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
		cc.weaponName = string(profile.WeaponType())
	}
	h.sendWelcome(c, profile)
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
	h.sendWelcome(c, profile)
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
	h.sendWelcome(c, profile)
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
	h.sendWelcome(c, profile)
}

// worldEntities snapshots every world inhabitant for world_state. Players are
// always listed (in_house flag tells clients to hide them); NPCs and pets are
// omitted while hidden (despawned / owner off-world).
func (h *Hub) worldEntities(now time.Time) []protocol.WorldEntity {
	out := make([]protocol.WorldEntity, 0, len(h.entities))
	for _, e := range h.entities {
		if e.Kind != kindPlayer && e.hidden {
			continue
		}
		out = append(out, h.projector.project(e, now))
	}
	return out
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

func profileInfo(p store.Profile) protocol.ProfileInfo {
	loadout := p.ActiveLoadout()
	activeJobs := p.ActiveJobIDs()
	jobActive := func(job game.JobID) bool {
		for _, j := range activeJobs {
			if j == job {
				return true
			}
		}
		return false
	}
	toInfo := func(s game.Skill) protocol.SkillInfo {
		lvl := loadout.SkillLevels[s.ID]
		unlocked := game.SkillAlwaysUnlocked(s.ID) || lvl > 0
		return protocol.SkillInfo{
			ID: s.ID, Name: s.Name, MPCost: s.MPCost, Heals: s.Heals, Buffs: s.Buffs,
			Description: s.Description, Category: string(s.Category),
			Job:       string(s.Job),
			Prereq:    game.SkillPrereq(s.ID),
			WeaponReq: string(s.WeaponReq), Unlocked: unlocked,
			Level: lvl, MaxLevel: game.SkillMaxLevel,
			UnlockLevel: game.SkillUnlockLevel(s.ID),
			Usage:       loadout.SkillUsage[s.ID],
			UsageToNext: game.SkillUsesToNextLevel(lvl),
			CastTimeMs:  game.SkillCastTime(s),
			WorldOnly:   s.WorldOnly,
		}
	}
	skills := []protocol.SkillInfo{toInfo(game.BasicAttack), toInfo(game.SkillCapture), toInfo(game.SkillDodge)}
	for _, s := range game.Catalog {
		if s.WorldOnly || jobActive(s.Job) {
			skills = append(skills, toInfo(s))
		}
	}

	equipped := loadout.Equipped
	if equipped == nil {
		equipped = map[string]string{}
	}
	hotbar := map[string]protocol.HotbarBinding{}
	for slot, b := range loadout.Hotbar {
		hotbar[slot] = protocol.HotbarBinding{Kind: b.Kind, ID: b.ID}
	}
	mainLvl := p.MainJobLevel()
	subLvl := p.SubJobEffectiveLevel()
	hp, mp, str, mag, agi := game.ComputeJobStats(
		game.JobID(p.MainJob), mainLvl,
		game.JobID(p.SubJob), subLvl,
		p.EquippedItems(),
	)

	unlocked := append([]string(nil), p.UnlockedJobs...)
	if len(unlocked) == 0 {
		for _, j := range game.StartingJobs {
			unlocked = append(unlocked, string(j))
		}
	}

	jobs := make([]protocol.JobProgressInfo, 0, len(game.AllJobs()))
	for _, def := range game.AllJobs() {
		prog := p.Jobs[string(def.ID)]
		if prog.Level < 1 {
			prog.Level = 1
		}
		jobs = append(jobs, protocol.JobProgressInfo{
			ID: string(def.ID), Name: def.Name, Abbr: def.Abbr,
			Category: string(def.Category),
			Level:    prog.Level, XP: prog.XP, MaxXP: game.XPToNext(prog.Level),
		})
	}

	mainXP := 0
	if prog, ok := p.Jobs[p.MainJob]; ok {
		mainXP = prog.XP
	}

	return protocol.ProfileInfo{
		Name:              p.Name,
		Race:              p.Race,
		Level:             mainLvl,
		XP:                mainXP,
		MaxXP:             game.XPToNext(mainLvl),
		MainJob:           p.MainJob,
		SubJob:            p.SubJob,
		SubjobUnlock:      game.CurrentSubjobUnlockLevel(),
		UnlockedJobs:      unlocked,
		Appearance:        appearanceProto(p),
		Jobs:              jobs,
		Stats:             protocol.StatBlock{HP: hp, MP: mp, Str: str, Mag: mag, Agi: agi},
		Inventory:         p.Inventory,
		HouseStorage:      append([]game.Item(nil), p.HouseStorage...),
		HouseStorageCap:   game.DefaultHouseStorageCapacity,
		CampSkin:          game.NormalizeCampSkin(p.CampSkin),
		Equipped:          equipped,
		Hotbar:            hotbar,
		Skills:            skills,
		Friends:           append([]string(nil), p.Friends...),
		SavePointID:       p.SavePointID,
		SavePointName:     savePointName(p.SavePointID),
		VisitedSavePoints: visitedSavePoints(p),
		Keybinds:          p.KeybindMap(),
		Pets:              append([]game.PetRecord(nil), p.Pets...),
		FollowPetID:       p.FollowPetID,
		BattlePetID:       p.BattlePetID,
	}
}

func appearanceProto(p store.Profile) protocol.CharacterAppearance {
	a := p.Appearance
	if a.IsZero() {
		a = store.DefaultAppearanceForRace(p.Race)
	} else {
		a = store.NormalizeAppearance(p.Race, a)
	}
	return protocol.CharacterAppearance{
		Skin: a.Skin, Face: a.Face, Hair: a.Hair, HairColor: a.HairColor,
		Cloth: a.Cloth, ClothColor: a.ClothColor, Weapon: a.Weapon, WeaponColor: a.WeaponColor,
	}
}

func storeAppearanceFromPayload(p *protocol.CharacterAppearance) store.Appearance {
	if p == nil {
		return store.Appearance{}
	}
	return store.Appearance{
		Skin: p.Skin, Face: p.Face, Hair: p.Hair, HairColor: p.HairColor,
		Cloth: p.Cloth, ClothColor: p.ClothColor, Weapon: p.Weapon, WeaponColor: p.WeaponColor,
	}
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
