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

	store    *store.Store
	accounts *store.AccountStore
	tokens   *auth.TokenIssuer

	// Run-goroutine owned:
	world        map[string]*protocol.WorldPlayer // clientID -> world presence
	npcs         map[string]*worldNPC
	combatants   map[string]*combatant // clientID -> combat state
	aoi          map[string]bool       // clientIDs currently receiving combat ticks
	rng          *rand.Rand
	parties      map[string]*hubParty
	clientParty  map[string]string
	partyInvites map[string]*partyInvite
	partySeq     int
	camps        map[string]*worldCamp // owner character name -> camp
	houses       map[string]*houseRoom // owner character name -> instance

	overworld  *game.Overworld
	mapID      string
	mapName    string
	OnTransfer func(clientID, destMap string, destX, destY float64, facing float64)

	quit     chan struct{}
	done     chan struct{}
	stopOnce sync.Once
}

func NewHub(profiles *store.Store, accounts *store.AccountStore, tokens *auth.TokenIssuer) (*Hub, error) {
	if err := game.ReloadLootCatalogs(); err != nil {
		log.Printf("warning: loot catalogs: %v", err)
	}
	h := &Hub{
		clients:      make(map[string]*Client),
		register:     make(chan *Client, 16),
		unregister:   make(chan *Client, 16),
		events:       make(chan Event, 256),
		tasks:        make(chan func(), 256),
		store:        profiles,
		accounts:     accounts,
		tokens:       tokens,
		world:        make(map[string]*protocol.WorldPlayer),
		npcs:         make(map[string]*worldNPC),
		combatants:   make(map[string]*combatant),
		rng:          rand.New(rand.NewSource(time.Now().UnixNano())),
		parties:      make(map[string]*hubParty),
		clientParty:  make(map[string]string),
		partyInvites: make(map[string]*partyInvite),
		camps:        make(map[string]*worldCamp),
		houses:       make(map[string]*houseRoom),
		overworld:    game.Loaded(),
		quit:         make(chan struct{}),
		done:         make(chan struct{}),
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
		Players:     h.worldPlayers(),
		NPCs:        h.worldNPCs(),
		Camps:       h.campList(),
		Pets:        h.worldPets(),
		SavePoints:  h.worldSavePoints(),
		JobChangers: h.worldJobChangers(),
		Map:         protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
	}))
}

func (h *Hub) MapID() string { return h.mapID }

// MapSnapshot returns the current map configuration for clients (REST + welcome).
func (h *Hub) MapSnapshot() *protocol.MapSnapshot {
	return h.mapSnapshot()
}

func (h *Hub) mapSnapshot() *protocol.MapSnapshot {
	if h.mapID == "" || h.overworld == nil {
		return nil
	}
	tile, cols, rows, cells := h.overworld.MapPayload()
	portals := make([]protocol.MapPortal, 0, len(h.overworld.Exits))
	ts := float64(h.overworld.TileSizePx())
	for _, e := range h.overworld.Exits {
		portals = append(portals, protocol.MapPortal{
			X: float64(e.MinC) * ts,
			Y: float64(e.MinR) * ts,
			W: float64(e.MaxC-e.MinC+1) * ts,
			H: float64(e.MaxR-e.MinR+1) * ts,
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
			h.tickNPCs()
			h.outOfCombatRegen()

		case <-castTicker.C:
			h.finishDueWorldCasts(time.Now())
			h.tickCombat(time.Now())
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

	if wp, ok := h.world[client.ID]; ok {
		h.persistWorldLocation(client, wp, true)
	}
	if pc := h.combatants[client.ID]; pc != nil {
		h.flushSkillUsage(pc)
		for _, n := range h.npcs {
			if n.Engaged && n.targetID == client.ID {
				n.targetID = "" // retarget next tick
			}
			delete(n.contributors, client.ID)
		}
		delete(h.combatants, client.ID)
	}
	delete(h.aoi, client.ID)
	h.onHousingDisconnect(client)
	if _, ok := h.world[client.ID]; ok {
		delete(h.world, client.ID)
		h.broadcastAll(protocol.Encode(protocol.TypePlayerLeft, protocol.PlayerLeftPayload{ID: client.ID}))
	}
	h.onClientDisconnectSocial(client.ID)
	h.refreshFriendsSocial(client.Name)
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
	case protocol.TypeAddFriend:
		h.handleAddFriend(c, ev.Payload)
	case protocol.TypeAcceptFriend:
		h.handleAcceptFriend(c, ev.Payload)
	case protocol.TypeDeclineFriend:
		h.handleDeclineFriend(c, ev.Payload)
	case protocol.TypeRemoveFriend:
		h.handleRemoveFriend(c, ev.Payload)
	case protocol.TypePartyInvite:
		h.handlePartyInvite(c, ev.Payload)
	case protocol.TypePartyAccept:
		h.handlePartyAccept(c)
	case protocol.TypePartyDecline:
		h.handlePartyDecline(c)
	case protocol.TypePartyLeave:
		h.handlePartyLeave(c)
	case protocol.TypePartyKick:
		h.handlePartyKick(c, ev.Payload)
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
	for _, wp := range h.world {
		if strings.EqualFold(wp.Name, name) {
			h.sendError(c, "That hero is already online.")
			return
		}
	}

	c.Name = name
	c.Joined = true

	app := appearanceProto(profile)
	spawnX, spawnY, facing := h.resumeSpawn(c, profile)
	wp := &protocol.WorldPlayer{
		ID:         c.ID,
		Name:       profile.Name,
		Weapon:     string(profile.WeaponType()),
		Race:       profile.Race,
		MainJob:    profile.MainJob,
		SubJob:     profile.SubJob,
		Level:      profile.MainJobLevel(),
		Appearance: app,
		X:          spawnX,
		Y:          spawnY,
		Facing:     facing,
	}
	// Zone transfers attach with UseSpawn — grant the same invuln window.
	if c.UseSpawn {
		h.grantBattleImmunity(wp)
	}
	pc := h.ensureCombatant(c)
	h.syncWorldPlayer(wp, pc)
	h.world[c.ID] = wp
	h.persistWorldLocation(c, wp, true)

	h.sendWelcome(c, profile)
	tile, cols, rows, cells := h.mapCells()
	h.send(c, protocol.TypeWorldState, protocol.WorldStatePayload{
		Players:     h.worldPlayers(),
		NPCs:        h.worldNPCs(),
		Camps:       h.campList(),
		Pets:        h.worldPets(),
		SavePoints:  h.worldSavePoints(),
		JobChangers: h.worldJobChangers(),
		Map:         protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
	})
	h.broadcastAll(protocol.Encode(protocol.TypePlayerJoin, *wp))
	h.sendSocialState(c)
	h.refreshFriendsSocial(c.Name)
	log.Printf("%s joined the world as %s/%s (lv %d)", name, profile.MainJob, profile.SubJob, profile.MainJobLevel())
}

func (h *Hub) resumeSpawn(c *Client, profile store.Profile) (x, y float64, facing float64) {
	if c.UseSpawn {
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

func (h *Hub) persistWorldLocation(c *Client, wp *protocol.WorldPlayer, flush bool) {
	if c == nil || wp == nil || c.Name == "" {
		return
	}
	doFlush := flush || time.Since(c.lastWorldSave) >= worldPosSaveInterval
	h.store.SetWorldLocation(c.Name, h.mapID, wp.X, wp.Y, wp.Facing, doFlush)
	if doFlush {
		c.lastWorldSave = time.Now()
	}
}

func (h *Hub) handleMove(c *Client, raw json.RawMessage) {
	wp, ok := h.world[c.ID]
	if !ok {
		return
	}
	var p protocol.MovePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	if wp.InHouse {
		h.moveInHouse(c, wp, p.X, p.Y, p.Facing)
		return
	}
	prevX, prevY := wp.X, wp.Y
	pc := h.combatants[c.ID]
	maxStep := maxMoveStep
	if pc != nil && time.Since(pc.dodgedAt) < dodgeLandingWindow {
		maxStep += dodgeDashDist
	}
	wp.X, wp.Y = h.clampMoveStep(wp.X, wp.Y, p.X, p.Y, maxStep)
	wp.Facing = game.ResolveFacingYaw(wp.X-prevX, wp.Y-prevY, derefFacing(p.Facing), p.Facing != nil, wp.Facing)
	h.interruptWorldCastOnMove(c, wp)
	// Combat: movement while casting a battle skill interrupts it past the
	// cancel threshold, and real displacement keeps the dodge window alive.
	if pc != nil {
		moved := math.Hypot(wp.X-prevX, wp.Y-prevY)
		if moved > 0.5 {
			pc.lastMoveAt = time.Now()
			pc.lastMoveDX = wp.X - prevX
			pc.lastMoveDY = wp.Y - prevY
		}
		if pc.casting != nil && dist(wp.X, wp.Y, pc.castX, pc.castY) >= castMoveCancel {
			h.interruptCast(pc)
		}
	}
	h.persistWorldLocation(c, wp, false)
	if h.OnTransfer != nil && h.overworld != nil {
		if exit, ok := h.overworld.ExitAt(wp.X, wp.Y); ok && exit.DestMap != h.mapID {
			h.OnTransfer(c.ID, exit.DestMap, exit.DestX, exit.DestY, wp.Facing)
			return
		}
	}
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: c.ID, X: wp.X, Y: wp.Y, Facing: wp.Facing,
	}))
	h.checkAggroAt(c.ID, wp.X, wp.Y)
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
	wp, ok := h.world[c.ID]
	if !ok {
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
	wp.Weapon = string(profile.WeaponType())
	if pc := h.combatants[c.ID]; pc != nil {
		h.refreshCombatStats(c, pc)
		h.syncWorldPlayer(wp, pc)
	}
	h.sendWelcome(c, profile)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
}

func (h *Hub) handleUnequip(c *Client, raw json.RawMessage) {
	wp, ok := h.world[c.ID]
	if !ok {
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
	wp.Weapon = string(profile.WeaponType())
	if pc := h.combatants[c.ID]; pc != nil {
		h.refreshCombatStats(c, pc)
		h.syncWorldPlayer(wp, pc)
	}
	h.sendWelcome(c, profile)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
}

func (h *Hub) handleSetJobs(c *Client, raw json.RawMessage) {
	wp, ok := h.world[c.ID]
	if !ok {
		return
	}
	if wp.InCombat {
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
	if !h.nearJobChanger(wp.X, wp.Y, p.JobChangerID) {
		h.sendError(c, "Move closer to the Job Master.")
		return
	}
	profile, errMsg := h.store.SetJobs(c.Name, game.JobID(p.MainJob), game.JobID(p.SubJob))
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	wp.Weapon = string(profile.WeaponType())
	wp.MainJob = profile.MainJob
	wp.SubJob = profile.SubJob
	wp.Level = profile.MainJobLevel()
	h.sendWelcome(c, profile)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
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

func (h *Hub) worldPlayers() []protocol.WorldPlayer {
	out := make([]protocol.WorldPlayer, 0, len(h.world))
	for _, wp := range h.world {
		out = append(out, *wp)
	}
	return out
}

func (h *Hub) grantBattleImmunity(wp *protocol.WorldPlayer) {
	if wp == nil {
		return
	}
	wp.ImmuneUntil = time.Now().Add(battleImmunity).UnixMilli()
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
