package server

import (
	"encoding/json"
	"strings"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

const campInteractRange = 80.0

// houseMapIDPrefix prefixes dynamic house instance ids so they can never
// collide with a configured map id.
const houseMapIDPrefix = "house:"

// HouseMapID returns the dynamic instance id for a player's house.
func HouseMapID(owner string) string { return houseMapIDPrefix + owner }

// ParseHouseMapID extracts the owner name from a dynamic house instance id.
func ParseHouseMapID(id string) (owner string, ok bool) {
	if strings.HasPrefix(id, houseMapIDPrefix) && len(id) > len(houseMapIDPrefix) {
		return id[len(houseMapIDPrefix):], true
	}
	return "", false
}

type worldCamp struct {
	OwnerName     string
	OwnerClientID string
	X, Y          float64
	Skin          string
}

// SetHouseContext marks this hub as a dynamic house instance. Called once by
// the map node at construction; nil keeps the hub a normal map hub.
func (h *Hub) SetHouseContext(ctx *HouseContext) { h.houseCtx = ctx }

// InHouse reports whether this hub is a dynamic house instance.
func (h *Hub) InHouse() bool { return h.houseCtx != nil }

func (h *Hub) campList() []protocol.WorldCamp {
	out := make([]protocol.WorldCamp, 0, len(h.camps))
	for _, c := range h.camps {
		out = append(out, protocol.WorldCamp{
			OwnerName: c.OwnerName,
			OwnerID:   c.OwnerClientID,
			X:         c.X,
			Y:         c.Y,
			Skin:      c.Skin,
		})
	}
	return out
}

func (h *Hub) broadcastCamps() {
	h.broadcastAll(protocol.Encode(protocol.TypeCampState, protocol.CampStatePayload{Camps: h.campList()}))
}

func (h *Hub) placeCamp(c *Client, e *entity) {
	cc := clientControlOf(e)
	if e == nil || cc == nil || cc.inCombat || h.houseCtx != nil {
		h.sendError(c, "You cannot pitch a camp right now.")
		return
	}
	skin := h.store.CampSkinFor(c.Name)
	// Relocate: kick guests from previous camp if any.
	if _, ok := h.camps[c.Name]; ok {
		h.DespawnCamp(c.Name, "Camp relocated.")
	}
	// Offset south of the caster so the tent isn't buried under their sprite.
	campX, campY := e.X, e.Y+float64(game.HouseTileSize)+8
	camp := &worldCamp{
		OwnerName:     c.Name,
		OwnerClientID: c.ID,
		X:             campX,
		Y:             campY,
		Skin:          skin,
	}
	h.camps[c.Name] = camp
	h.broadcastCamps()
	h.send(c, protocol.TypeChatMsg, protocol.ChatMessagePayload{
		FromName: "System", Message: "Camp pitched. Interact with the tent to enter your house.",
	})
}

// DespawnCamp removes a player's pitched camp and evicts + tears down its
// live house instance (a no-op when nobody is inside). Safe to call for any
// character name; safe from any goroutine only via PostTask.
func (h *Hub) DespawnCamp(ownerName, reason string) {
	ownerName = strings.TrimSpace(ownerName)
	if ownerName == "" {
		return
	}
	if _, ok := h.camps[ownerName]; ok {
		delete(h.camps, ownerName)
		h.broadcastCamps()
	}
	// Evict + tear down the live instance (no-op when nobody is inside).
	if h.OnCloseHouse != nil {
		h.OnCloseHouse(ownerName, reason)
	}
}

func (h *Hub) handleEnterHouse(c *Client, raw json.RawMessage) {
	var p protocol.EnterHousePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	e := h.playerEnt(c.ID)
	cc := clientControlOf(e)
	if e == nil || cc == nil || cc.inCombat || h.houseCtx != nil || h.OnTransfer == nil {
		h.sendError(c, "You cannot enter a house right now.")
		return
	}
	owner := strings.TrimSpace(p.OwnerName)
	camp, ok := h.camps[owner]
	if !ok {
		h.sendError(c, "That camp is not pitched.")
		return
	}
	if dist(e.X, e.Y, camp.X, camp.Y) > campInteractRange {
		h.sendError(c, "Move closer to the camp.")
		return
	}
	sx, sy := game.HouseSpawnCenter()
	// Drop any fight at the door; pets despawn with the entity and respawn
	// inside the instance on join via syncPetEntities.
	e.engageID = ""
	h.eachEntity(kindPet, func(pe *entity) {
		if pe.OwnerID == c.ID {
			pe.targetID = ""
		}
	})
	// Transferring marks the detach as a house-ward transfer so the world
	// hub's disconnect path keeps the camp pitched.
	c.Transferring = true
	h.OnTransfer(c.ID, TransferDest{
		Map:    HouseMapID(owner),
		X:      sx,
		Y:      sy,
		Facing: e.Facing,
		House: &HouseSpec{
			Owner:     owner,
			Skin:      camp.Skin,
			ReturnMap: h.mapID,
			ReturnX:   camp.X,
			ReturnY:   camp.Y,
		},
	})
}

func (h *Hub) handleLeaveHouse(c *Client) {
	h.leaveHouse(c, "Left the house.")
}

// leaveHouse returns an occupant to the camp position on the world map.
func (h *Hub) leaveHouse(c *Client, reason string) {
	ctx := h.houseCtx
	if ctx == nil || h.OnTransfer == nil {
		return
	}
	facing := c.SpawnFacing
	if e := h.playerEnt(c.ID); e != nil {
		facing = e.Facing
	}
	c.Transferring = true
	h.send(c, protocol.TypeHouseReturn, protocol.HouseReturnPayload{Reason: reason})
	h.OnTransfer(c.ID, TransferDest{
		Map:    ctx.ReturnMap,
		X:      ctx.ReturnX,
		Y:      ctx.ReturnY,
		Facing: facing,
	})
}

// EvictHouse transfers every occupant back to the camp position. Called when
// the owning camp despawns (relocate or owner logout).
func (h *Hub) EvictHouse(reason string) {
	ctx := h.houseCtx
	if ctx == nil {
		return
	}
	guests := make([]*Client, 0, len(h.clients))
	for _, c := range h.clients {
		guests = append(guests, c)
	}
	for _, c := range guests {
		h.leaveHouse(c, reason)
	}
}

func (h *Hub) handleHouseInteract(c *Client, raw json.RawMessage) {
	var p protocol.HouseInteractPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	ctx := h.houseCtx
	e := h.playerEnt(c.ID)
	if ctx == nil || e == nil {
		h.sendError(c, "You are not inside a house.")
		return
	}
	switch strings.ToLower(strings.TrimSpace(p.Target)) {
	case "door":
		dc, dr := game.HouseDoorTile()
		dx := (float64(dc) + 0.5) * game.HouseTileSize
		dy := (float64(dr) + 0.5) * game.HouseTileSize
		if dist(e.X, e.Y, dx, dy) > campInteractRange {
			h.sendError(c, "Move closer to the door.")
			return
		}
		h.leaveHouse(c, "Left the house.")
	case "storage":
		if !strings.EqualFold(c.Name, ctx.Owner) {
			h.sendError(c, "Only the house owner can use storage.")
			return
		}
		sc, sr := game.HouseStorageTile()
		sx := (float64(sc) + 0.5) * game.HouseTileSize
		sy := (float64(sr) + 0.5) * game.HouseTileSize
		if dist(e.X, e.Y, sx, sy) > campInteractRange {
			h.sendError(c, "Move closer to the storage chest.")
			return
		}
		h.sendHouseState() // refresh storage for owner UI
	default:
		h.sendError(c, "Unknown house interact target.")
	}
}

// houseOwnerOnly reports whether c is the owner of this house instance.
func (h *Hub) houseOwnerOnly(c *Client) bool {
	return h.houseCtx != nil && strings.EqualFold(c.Name, h.houseCtx.Owner)
}

func (h *Hub) handleHouseStorageDeposit(c *Client, raw json.RawMessage) {
	if !h.houseOwnerOnly(c) {
		h.sendError(c, "Only the house owner can deposit items.")
		return
	}
	var p protocol.HouseStorageMovePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, errMsg := h.store.DepositHouseStorage(c.Name, p.ItemID, p.Qty)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendProfileRefresh(c, profile)
	h.sendHouseState()
}

func (h *Hub) handleHouseStorageWithdraw(c *Client, raw json.RawMessage) {
	if !h.houseOwnerOnly(c) {
		h.sendError(c, "Only the house owner can withdraw items.")
		return
	}
	var p protocol.HouseStorageMovePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, errMsg := h.store.WithdrawHouseStorage(c.Name, p.ItemID, p.Qty)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendProfileRefresh(c, profile)
	h.sendHouseState()
}

func (h *Hub) handleHousePlaceFurniture(c *Client, raw json.RawMessage) {
	if !h.houseOwnerOnly(c) {
		h.sendError(c, "Only the house owner can place furniture.")
		return
	}
	var p protocol.HousePlaceFurniturePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, _, errMsg := h.store.PlaceHouseFurniture(c.Name, p.ItemID, p.Col, p.Row)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendProfileRefresh(c, profile)
	h.sendHouseState()
}

func (h *Hub) handleHousePickFurniture(c *Client, raw json.RawMessage) {
	if !h.houseOwnerOnly(c) {
		h.sendError(c, "Only the house owner can pick up furniture.")
		return
	}
	var p protocol.HousePickFurniturePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, errMsg := h.store.PickHouseFurniture(c.Name, p.FurnitureID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendProfileRefresh(c, profile)
	h.sendHouseState()
}

func (h *Hub) handleSetCampSkin(c *Client, raw json.RawMessage) {
	var p protocol.SetCampSkinPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		h.sendError(c, "Malformed camp skin request.")
		return
	}
	ctx := h.houseCtx
	if ctx == nil || !strings.EqualFold(c.Name, ctx.Owner) {
		h.sendError(c, "Only the owner can change the tent skin inside their house.")
		return
	}
	profile, errMsg := h.store.SetCampSkin(c.Name, p.Skin)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	ctx.Skin = game.NormalizeCampSkin(profile.CampSkin)
	if h.OnCampSkinChanged != nil {
		h.OnCampSkinChanged(ctx.Owner, ctx.Skin)
	}
	h.sendProfileRefresh(c, profile)
	h.sendHouseState()
}

// UpdateCampSkin restyles a pitched camp's overworld tent. Runs on the hub
// that owns the camp (the instance's return map).
func (h *Hub) UpdateCampSkin(owner, skin string) {
	if camp, ok := h.camps[owner]; ok {
		camp.Skin = game.NormalizeCampSkin(skin)
		h.broadcastCamps()
	}
}

// sendHouseState broadcasts the instance payload to every occupant. Players
// and pets are synthesized from the hub's entity map — the house is a normal
// entity space — while furniture/POIs/storage stay owner-scoped per client.
func (h *Hub) sendHouseState() {
	h.sendHouseStateTo(nil)
}

// sendHouseStateTo is sendHouseState plus an explicit extra recipient: a
// join replay can run before the client's register channel drains, leaving
// them out of h.clients when the broadcast iterates it.
func (h *Hub) sendHouseStateTo(extra *Client) {
	ctx := h.houseCtx
	if ctx == nil {
		return
	}
	// Furniture is authored into the instance scene before producing either
	// the map snapshot or its physics world, so guests see and collide with
	// the exact same objects.
	furniture := h.store.HouseFurnitureSnapshot(ctx.Owner)
	h.overworld.SetHouseFurniture3D(furniture)
	h.overworld.Scene3D.Map = h.mapID
	col0, row0 := game.HouseWalkOrigin()
	dc, dr := game.HouseDoorTile()
	sc, sr := game.HouseStorageTile()
	petsByOwner := map[string][]protocol.HousePet{}
	h.eachEntity(kindPet, func(p *entity) {
		if p.hidden {
			return
		}
		petsByOwner[p.OwnerID] = append(petsByOwner[p.OwnerID], protocol.HousePet{
			ID: p.ID, Name: p.Name, Sprite: p.Sprite,
			X: p.X, Y: p.Y, Z: p.Z, Grounded: p.grounded, Facing: p.Facing,
		})
	})
	players := make([]protocol.HousePlayer, 0, len(h.clients))
	h.eachEntity(kindPlayer, func(pe *entity) {
		if pe.hidden {
			return
		}
		players = append(players, protocol.HousePlayer{
			ID: pe.ID, Name: pe.Name, X: pe.X, Y: pe.Y, Z: pe.Z, Grounded: pe.grounded, Facing: pe.Facing,
			Owner: strings.EqualFold(pe.Name, ctx.Owner),
			Pets:  petsByOwner[pe.ID],
		})
	})
	pois := []protocol.HousePOI{
		{ID: "door", Kind: "door", Name: "Door", X: (float64(dc) + 0.5) * game.HouseTileSize, Y: (float64(dr) + 0.5) * game.HouseTileSize},
		{ID: "storage", Kind: "storage", Name: "Storage", X: (float64(sc) + 0.5) * game.HouseTileSize, Y: (float64(sr) + 0.5) * game.HouseTileSize},
	}
	base := protocol.HouseStatePayload{
		Map:           h.mapSnapshot(),
		OwnerName:     ctx.Owner,
		Skin:          ctx.Skin,
		MapCols:       game.HouseMapCols,
		MapRows:       game.HouseMapRows,
		WalkCols:      game.HouseWalkCols,
		WalkRows:      game.HouseWalkRows,
		WalkOriginCol: col0,
		WalkOriginRow: row0,
		TileSize:      game.HouseTileSize,
		Players:       players,
		Furniture:     furniture,
		POIs:          pois,
	}
	payloadFor := func(cl *Client) protocol.HouseStatePayload {
		payload := base
		// The scene snapshot is multi-MB; embed it only for the joining
		// client — occupants keep the copy from their own join broadcast.
		if extra != nil && cl.ID == extra.ID {
			payload.Map = h.mapSnapshot()
		}
		payload.IsOwner = strings.EqualFold(cl.Name, ctx.Owner)
		if payload.IsOwner {
			if prof, ok := h.store.Get(ctx.Owner); ok {
				payload.Storage = append([]game.Item(nil), prof.HouseStorage...)
				payload.StorageCapacity = game.DefaultHouseStorageCapacity
			}
		}
		return payload
	}
	for _, cl := range h.clients {
		h.send(cl, protocol.TypeHouseState, payloadFor(cl))
	}
	if extra != nil {
		if _, ok := h.clients[extra.ID]; !ok {
			// The joiner may not be in h.clients yet; h.send drops
			// non-members, so write the frame straight to the channel.
			// Called only on the hub goroutine — c.Send cannot close here.
			select {
			case extra.Send <- protocol.Encode(protocol.TypeHouseState, payloadFor(extra)):
			default:
				h.noteDrop(extra.ID)
			}
		}
	}
}

func (h *Hub) onHousingDisconnect(c *Client) {
	if c == nil {
		return
	}
	// Transferring out (enter/leave/evict): keep the camp pitched. The proxy
	// posts the despawn itself when a session inside an instance truly drops.
	if c.Transferring || h.houseCtx != nil {
		return
	}
	// Owner logout in the world: despawn camp and evict its house instance.
	h.DespawnCamp(c.Name, "The camp was packed up.")
}

// ensure profileToInfo gets house storage — called from existing path.
func attachHouseStorage(info *protocol.ProfileInfo, p store.Profile) {
	info.HouseStorage = append([]game.Item(nil), p.HouseStorage...)
	info.HouseStorageCap = game.DefaultHouseStorageCapacity
}
