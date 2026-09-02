package server

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"ffv-web-game/internal/auth"
	"ffv-web-game/internal/game"
	"ffv-web-game/internal/plugins"
	"ffv-web-game/internal/plugins/combatatb"
	"ffv-web-game/internal/plugins/contracts"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

// World bounds for the open-world layer (matches the client's map size).
const (
	worldWidth  = 1600.0
	worldHeight = 1200.0

	// Maximum players per battle instance.
	maxPartySize = 4

	// Grace after win, defeat, or leave so the next collision cannot instantly re-aggro.
	battleImmunity = 5 * time.Second
)

type Event struct {
	Type    protocol.MessageType
	Payload json.RawMessage
	Sender  *Client
}

// Hub is the central orchestrator: it routes client messages, owns the
// persistent Open World layer, and manages BattleRoom lifecycles. All world
// state is owned by the Run goroutine; battle rooms run their own loops and
// call back into the hub via the tasks channel.
type Hub struct {
	mu      sync.RWMutex // guards clients map (accessed from battle goroutines)
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
	battleSeq    int
	combat       contracts.CombatPlugin
	modCfg       plugins.Config
	parties      map[string]*hubParty
	clientParty  map[string]string
	partyInvites map[string]*partyInvite
	partySeq     int
	battleInvites map[string]*battleInvite
	battleMeta    map[string]*battleMeta

	tickWindow  time.Duration
	battleSpeed float64
}

func NewHub(profiles *store.Store, accounts *store.AccountStore, tokens *auth.TokenIssuer, battleSpeed float64, modCfg plugins.Config) (*Hub, error) {
	if battleSpeed <= 0 {
		battleSpeed = combatatb.DefaultBattleSpeed
	}
	h := &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
		events:     make(chan Event, 256),
		tasks:      make(chan func(), 256),
		store:      profiles,
		accounts:   accounts,
		tokens:     tokens,
		world:        make(map[string]*protocol.WorldPlayer),
		npcs:         make(map[string]*worldNPC),
		parties:      make(map[string]*hubParty),
		clientParty:  make(map[string]string),
		partyInvites: make(map[string]*partyInvite),
		battleInvites: make(map[string]*battleInvite),
		battleMeta:    make(map[string]*battleMeta),
		tickWindow:   combatatb.BattleTickWindow(battleSpeed),
		battleSpeed:  battleSpeed,
		modCfg:       modCfg,
	}
	combat, err := plugins.NewCombatPlugin(modCfg, h)
	if err != nil {
		return nil, err
	}
	h.combat = combat
	return h, nil
}

func (h *Hub) Register(c *Client) { h.register <- c }

func (h *Hub) BattleSpeed() float64 { return h.battleSpeed }

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
			target.Conn.Close()
		}
	}
}

func (h *Hub) Run() {
	h.initSocial()
	h.seedNPCs(npcCount)
	ticker := time.NewTicker(time.Duration(npcTickSec * float64(time.Second)))
	defer ticker.Stop()
	for {
		select {
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
		}
	}
}

// ---- roomHost implementation (safe to call from battle goroutines) ----

func (h *Hub) SendToClients(ids []string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, id := range ids {
		if c, ok := h.clients[id]; ok {
			h.sendRaw(c, msg)
		}
	}
}

func (h *Hub) Profiles() *store.Store { return h.store }

// FinishBattle marshals room teardown onto the hub goroutine: participants
// are released from the combat-locked state and the room is removed.
func (h *Hub) FinishBattle(roomID string, participantIDs []string, victory bool) {
	h.tasks <- func() {
		if !h.combat.RoomExists(roomID) {
			return
		}
		delete(h.battleMeta, roomID)
		h.combat.CloseRoom(roomID)
		for _, id := range participantIDs {
			if !victory {
				h.respawnAtSavePoint(id)
			}
			h.releaseFromBattle(id)
		}
		h.releaseNPCs(roomID)
		h.broadcastBattleList()
		log.Printf("battle %s finished", roomID)
	}
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

	if client.BattleID != "" {
		h.combat.OnDisconnect(client.ID)
	}
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
	case protocol.TypeAddFriend:
		h.handleAddFriend(c, ev.Payload)
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
	case protocol.TypeDeclineBattleInvite, protocol.TypeJoinBattle,
		protocol.TypeLeaveBattle, protocol.TypeAction, protocol.TypeSetTarget,
		protocol.TypeRTMove, protocol.TypeRTAttack:
		if ev.Type == protocol.TypeLeaveBattle && c.BattleID == "" {
			h.handleLeaveBattleReleased(c)
			break
		}
		if h.combat != nil {
			h.combat.HandleMessage(c.ID, ev.Type, ev.Payload)
		}
	case protocol.TypeSetSavePoint:
		h.handleSetSavePoint(c, ev.Payload)
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
			job = game.JobWAR
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
	spawnX, spawnY := game.SpawnPosition(profile.SavePointID)
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
	}
	h.world[c.ID] = wp

	h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{
		PlayerID: c.ID,
		Profile:  profileInfo(profile),
	})
	tile, cols, rows, cells := game.OverworldMapPayload()
	h.send(c, protocol.TypeWorldState, protocol.WorldStatePayload{
		Players:    h.worldPlayers(),
		NPCs:       h.worldNPCs(),
		Battles:    h.battleInfos(),
		SavePoints: worldSavePoints(),
		Map:        protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
	})
	h.broadcastAll(protocol.Encode(protocol.TypePlayerJoin, *wp))
	h.sendSocialState(c)
	h.refreshFriendsSocial(c.Name)
	log.Printf("%s joined the world as %s/%s (lv %d)", name, profile.MainJob, profile.SubJob, profile.MainJobLevel())
}

func (h *Hub) handleMove(c *Client, raw json.RawMessage) {
	wp, ok := h.world[c.ID]
	if !ok || wp.InBattle {
		return // combat-locked players cannot move in the world
	}
	var p protocol.MovePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	wp.X, wp.Y = h.clampMove(wp.X, wp.Y, p.X, p.Y)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: c.ID, X: wp.X, Y: wp.Y,
	}))
	if !h.engageFirstNPCAt(c, wp, wp.X, wp.Y) {
		h.engagePartyMemberAt(c, wp, wp.X, wp.Y)
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
	wp, ok := h.world[c.ID]
	if !ok {
		return
	}
	if wp.InBattle {
		h.sendError(c, "Cannot change equipment while combat-locked.")
		return
	}
	var p protocol.EquipPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, ok := h.store.Equip(c.Name, p.ItemID, p.Slot)
	if !ok {
		h.sendError(c, "You do not own that item.")
		return
	}
	wp.Weapon = string(profile.WeaponType())
	h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{PlayerID: c.ID, Profile: profileInfo(profile)})
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
}

func (h *Hub) handleUnequip(c *Client, raw json.RawMessage) {
	wp, ok := h.world[c.ID]
	if !ok {
		return
	}
	if wp.InBattle {
		h.sendError(c, "Cannot change equipment while combat-locked.")
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
	h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{PlayerID: c.ID, Profile: profileInfo(profile)})
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
}

func (h *Hub) handleSetJobs(c *Client, raw json.RawMessage) {
	wp, ok := h.world[c.ID]
	if !ok {
		return
	}
	if wp.InBattle {
		h.sendError(c, "Cannot change jobs while combat-locked.")
		return
	}
	var p protocol.SetJobsPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		h.sendError(c, "Malformed job request.")
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
	h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{PlayerID: c.ID, Profile: profileInfo(profile)})
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
	h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{PlayerID: c.ID, Profile: profileInfo(profile)})
}

func (h *Hub) handleLeaveBattleReleased(c *Client) {
	if wp, ok := h.world[c.ID]; ok && !wp.InBattle {
		h.grantBattleImmunity(wp)
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
	}
}

// releaseFromBattle clears the combat-locked state for one player and syncs
// their (possibly leveled-up) world presence.
func (h *Hub) releaseFromBattle(clientID string) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if ok {
		c.BattleID = ""
	}
	wp, ok := h.world[clientID]
	if !ok {
		return
	}
	wp.InBattle = false
	wp.BattleID = ""
	h.grantBattleImmunity(wp)
	if c != nil {
		if profile, ok := h.store.Get(c.Name); ok {
			wp.Level = profile.MainJobLevel()
			wp.MainJob = profile.MainJob
			wp.SubJob = profile.SubJob
			wp.Weapon = string(profile.WeaponType())
			// Push the authoritative post-battle profile (XP, loot,
			// proficiency gains, and any newly unlocked skills).
			h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{
				PlayerID: c.ID,
				Profile:  profileInfo(profile),
			})
		}
	}
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
	if partyID, ok := h.clientParty[clientID]; ok {
		h.broadcastPartySocial(h.parties[partyID])
	}
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

func (h *Hub) battleInfos() []protocol.BattleInfo {
	counts := map[string]int{}
	for _, wp := range h.world {
		if wp.InBattle {
			counts[wp.BattleID]++
		}
	}
	if h.combat == nil {
		return nil
	}
	return h.combat.BattleInfos(counts)
}

func (h *Hub) broadcastBattleList() {
	h.broadcastAll(protocol.Encode(protocol.TypeBattleList, protocol.BattleListPayload{
		Battles: h.battleInfos(),
	}))
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
		unlocked := s.ID == game.BasicAttack.ID || lvl > 0
		return protocol.SkillInfo{
			ID: s.ID, Name: s.Name, MPCost: s.MPCost, Heals: s.Heals, Buffs: s.Buffs,
			Description: s.Description, Category: string(s.Category),
			Job: string(s.Job),
			Prereq: game.SkillPrereq(s.ID),
			WeaponReq: string(s.WeaponReq), Unlocked: unlocked,
			Level: lvl, MaxLevel: game.SkillMaxLevel,
			UnlockLevel: game.SkillUnlockLevel(s.ID),
			Usage:       loadout.SkillUsage[s.ID],
			UsageToNext: game.SkillUsesToNextLevel(lvl),
			CastTimeMs:  game.SkillCastTime(s),
		}
	}
	skills := []protocol.SkillInfo{toInfo(game.BasicAttack)}
	for _, s := range game.Catalog {
		if jobActive(s.Job) {
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

	jobs := make([]protocol.JobProgressInfo, 0, len(game.AllJobs()))
	for _, def := range game.AllJobs() {
		prog := p.Jobs[string(def.ID)]
		if prog.Level < 1 {
			prog.Level = 1
		}
		jobs = append(jobs, protocol.JobProgressInfo{
			ID: string(def.ID), Name: def.Name, Abbr: def.Abbr,
			Category: string(def.Category),
			Level: prog.Level, XP: prog.XP, MaxXP: game.XPToNext(prog.Level),
		})
	}

	mainXP := 0
	if prog, ok := p.Jobs[p.MainJob]; ok {
		mainXP = prog.XP
	}

	return protocol.ProfileInfo{
		Name:         p.Name,
		Race:         p.Race,
		Level:        mainLvl,
		XP:           mainXP,
		MaxXP:        game.XPToNext(mainLvl),
		MainJob:      p.MainJob,
		SubJob:       p.SubJob,
		SubjobUnlock: game.SubjobUnlockLevel,
		Appearance:   appearanceProto(p),
		Jobs:         jobs,
		Stats:        protocol.StatBlock{HP: hp, MP: mp, Str: str, Mag: mag, Agi: agi},
		Inventory:    p.Inventory,
		Equipped:     equipped,
		Hotbar:       hotbar,
		Skills:       skills,
		Friends:      append([]string(nil), p.Friends...),
		SavePointID:  p.SavePointID,
		SavePointName: savePointName(p.SavePointID),
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
