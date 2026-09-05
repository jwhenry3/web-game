package server

import (
	"encoding/json"
	"strings"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

const campInteractRange = 80.0

type worldCamp struct {
	OwnerName     string
	OwnerClientID string
	X, Y          float64
	Skin          string
}

type houseGuest struct {
	ClientID string
	Name     string
	X, Y     float64
	Facing   float64
}

type houseRoom struct {
	OwnerName     string
	OwnerClientID string
	CampX, CampY  float64
	Skin          string
	Guests        map[string]*houseGuest // clientID -> guest (includes owner)
}

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

func (h *Hub) placeCamp(c *Client, wp *protocol.WorldPlayer) {
	if wp == nil || wp.InBattle || wp.InHouse {
		h.sendError(c, "You cannot pitch a camp right now.")
		return
	}
	skin := h.store.CampSkinFor(c.Name)
	// Relocate: kick guests from previous camp if any.
	if _, ok := h.camps[c.Name]; ok {
		h.despawnCamp(c.Name, "Camp relocated.", false)
	}
	// Offset south of the caster so the tent isn't buried under their sprite.
	campX, campY := wp.X, wp.Y+float64(game.HouseTileSize)+8
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

func (h *Hub) despawnCamp(ownerName, reason string, broadcastWorld bool) {
	ownerName = strings.TrimSpace(ownerName)
	if ownerName == "" {
		return
	}
	h.closeHouse(ownerName, reason)
	if _, ok := h.camps[ownerName]; ok {
		delete(h.camps, ownerName)
		h.broadcastCamps()
	}
	_ = broadcastWorld
}

func (h *Hub) closeHouse(ownerName, reason string) {
	room, ok := h.houses[ownerName]
	if !ok {
		return
	}
	guests := make([]*houseGuest, 0, len(room.Guests))
	for _, g := range room.Guests {
		guests = append(guests, g)
	}
	delete(h.houses, ownerName)
	for _, g := range guests {
		h.releaseFromHouse(g.ClientID, reason)
	}
}

func (h *Hub) releaseFromHouse(clientID, reason string) {
	c := h.clients[clientID]
	wp := h.world[clientID]
	if wp != nil {
		wp.InHouse = false
		wp.HouseOwner = ""
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
	}
	if c != nil {
		c.HouseOwner = ""
		h.send(c, protocol.TypeHouseReturn, protocol.HouseReturnPayload{Reason: reason})
	}
}

func (h *Hub) handleEnterHouse(c *Client, raw json.RawMessage) {
	var p protocol.EnterHousePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	wp, ok := h.world[c.ID]
	if !ok || wp.InBattle || wp.InHouse {
		h.sendError(c, "You cannot enter a house right now.")
		return
	}
	owner := strings.TrimSpace(p.OwnerName)
	camp, ok := h.camps[owner]
	if !ok {
		h.sendError(c, "That camp is not pitched.")
		return
	}
	if dist(wp.X, wp.Y, camp.X, camp.Y) > campInteractRange {
		h.sendError(c, "Move closer to the camp.")
		return
	}
	room := h.houses[owner]
	if room == nil {
		room = &houseRoom{
			OwnerName:     owner,
			OwnerClientID: camp.OwnerClientID,
			CampX:         camp.X,
			CampY:         camp.Y,
			Skin:          camp.Skin,
			Guests:        map[string]*houseGuest{},
		}
		h.houses[owner] = room
	}
	sx, sy := game.HouseSpawnCenter()
	guest := &houseGuest{ClientID: c.ID, Name: c.Name, X: sx, Y: sy, Facing: wp.Facing}
	room.Guests[c.ID] = guest
	wp.InHouse = true
	wp.HouseOwner = owner
	c.HouseOwner = owner
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
	h.sendHouseState(room)
}

func (h *Hub) handleLeaveHouse(c *Client) {
	if c.HouseOwner == "" {
		return
	}
	owner := c.HouseOwner
	room := h.houses[owner]
	if room != nil {
		delete(room.Guests, c.ID)
		if len(room.Guests) == 0 {
			delete(h.houses, owner)
		} else {
			h.sendHouseState(room)
		}
	}
	// Return near camp on overworld.
	if camp, ok := h.camps[owner]; ok {
		if wp := h.world[c.ID]; wp != nil {
			wp.X, wp.Y = camp.X, camp.Y
			h.persistWorldLocation(c, wp, true)
			h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
				ID: c.ID, X: wp.X, Y: wp.Y, Facing: wp.Facing,
			}))
		}
	}
	h.releaseFromHouse(c.ID, "Left the house.")
}

func (h *Hub) handleHouseInteract(c *Client, raw json.RawMessage) {
	var p protocol.HouseInteractPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	room := h.houses[c.HouseOwner]
	if room == nil {
		h.sendError(c, "You are not inside a house.")
		return
	}
	guest := room.Guests[c.ID]
	if guest == nil {
		return
	}
	switch strings.ToLower(strings.TrimSpace(p.Target)) {
	case "door":
		dc, dr := game.HouseDoorTile()
		dx := (float64(dc) + 0.5) * game.HouseTileSize
		dy := (float64(dr) + 0.5) * game.HouseTileSize
		if dist(guest.X, guest.Y, dx, dy) > campInteractRange {
			h.sendError(c, "Move closer to the door.")
			return
		}
		h.handleLeaveHouse(c)
	case "storage":
		if !strings.EqualFold(c.Name, room.OwnerName) {
			h.sendError(c, "Only the house owner can use storage.")
			return
		}
		sc, sr := game.HouseStorageTile()
		sx := (float64(sc) + 0.5) * game.HouseTileSize
		sy := (float64(sr) + 0.5) * game.HouseTileSize
		if dist(guest.X, guest.Y, sx, sy) > campInteractRange {
			h.sendError(c, "Move closer to the storage chest.")
			return
		}
		h.sendHouseState(room) // refresh storage for owner UI
	default:
		h.sendError(c, "Unknown house interact target.")
	}
}

func (h *Hub) handleHouseStorageDeposit(c *Client, raw json.RawMessage) {
	room := h.houses[c.HouseOwner]
	if room == nil || !strings.EqualFold(c.Name, room.OwnerName) {
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
	h.sendWelcome(c, profile)
	h.sendHouseState(room)
}

func (h *Hub) handleHouseStorageWithdraw(c *Client, raw json.RawMessage) {
	room := h.houses[c.HouseOwner]
	if room == nil || !strings.EqualFold(c.Name, room.OwnerName) {
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
	h.sendWelcome(c, profile)
	h.sendHouseState(room)
}

func (h *Hub) handleHousePlaceFurniture(c *Client, raw json.RawMessage) {
	room := h.houses[c.HouseOwner]
	if room == nil || !strings.EqualFold(c.Name, room.OwnerName) {
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
	h.sendWelcome(c, profile)
	h.sendHouseState(room)
}

func (h *Hub) handleHousePickFurniture(c *Client, raw json.RawMessage) {
	room := h.houses[c.HouseOwner]
	if room == nil || !strings.EqualFold(c.Name, room.OwnerName) {
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
	h.sendWelcome(c, profile)
	h.sendHouseState(room)
}

func (h *Hub) handleSetCampSkin(c *Client, raw json.RawMessage) {
	var p protocol.SetCampSkinPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		h.sendError(c, "Malformed camp skin request.")
		return
	}
	room := h.houses[c.HouseOwner]
	if room == nil || !strings.EqualFold(c.Name, room.OwnerName) {
		h.sendError(c, "Only the owner can change the tent skin inside their house.")
		return
	}
	profile, errMsg := h.store.SetCampSkin(c.Name, p.Skin)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	skin := game.NormalizeCampSkin(profile.CampSkin)
	room.Skin = skin
	if camp := h.camps[room.OwnerName]; camp != nil {
		camp.Skin = skin
		h.broadcastCamps()
	}
	h.sendWelcome(c, profile)
	h.sendHouseState(room)
}

func (h *Hub) sendHouseState(room *houseRoom) {
	if room == nil {
		return
	}
	col0, row0 := game.HouseWalkOrigin()
	dc, dr := game.HouseDoorTile()
	sc, sr := game.HouseStorageTile()
	players := make([]protocol.HousePlayer, 0, len(room.Guests))
	for _, g := range room.Guests {
		players = append(players, protocol.HousePlayer{
			ID: g.ClientID, Name: g.Name, X: g.X, Y: g.Y, Facing: g.Facing,
			Owner: strings.EqualFold(g.Name, room.OwnerName),
		})
	}
	furniture := h.store.HouseFurnitureSnapshot(room.OwnerName)
	pois := []protocol.HousePOI{
		{ID: "door", Kind: "door", Name: "Door", X: (float64(dc) + 0.5) * game.HouseTileSize, Y: (float64(dr) + 0.5) * game.HouseTileSize},
		{ID: "storage", Kind: "storage", Name: "Storage", X: (float64(sc) + 0.5) * game.HouseTileSize, Y: (float64(sr) + 0.5) * game.HouseTileSize},
	}
	base := protocol.HouseStatePayload{
		OwnerName:     room.OwnerName,
		Skin:          room.Skin,
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
	for _, g := range room.Guests {
		cl := h.clients[g.ClientID]
		if cl == nil {
			continue
		}
		payload := base
		payload.IsOwner = strings.EqualFold(g.Name, room.OwnerName)
		if payload.IsOwner {
			if prof, ok := h.store.Get(room.OwnerName); ok {
				payload.Storage = append([]game.Item(nil), prof.HouseStorage...)
				payload.StorageCapacity = game.DefaultHouseStorageCapacity
			}
		}
		h.send(cl, protocol.TypeHouseState, payload)
	}
}

func (h *Hub) moveInHouse(c *Client, wp *protocol.WorldPlayer, x, y float64, facing *float64) {
	room := h.houses[c.HouseOwner]
	if room == nil {
		return
	}
	guest := room.Guests[c.ID]
	if guest == nil {
		return
	}
	nx, ny := game.SlideMoveHousePlayer(guest.X, guest.Y, x, y)
	nx, ny = game.ClampHousePos(nx, ny)
	guest.Facing = game.ResolveFacingYaw(nx-guest.X, ny-guest.Y, derefFacing(facing), facing != nil, guest.Facing)
	guest.X, guest.Y = nx, ny
	_ = wp
	h.sendHouseState(room)
}

func (h *Hub) onHousingDisconnect(c *Client) {
	if c == nil {
		return
	}
	// Owner logout: despawn camp and kick everyone.
	if _, ok := h.camps[c.Name]; ok {
		h.despawnCamp(c.Name, "The camp was packed up.", true)
		return
	}
	// Guest leave only.
	if c.HouseOwner != "" {
		owner := c.HouseOwner
		if room := h.houses[owner]; room != nil {
			delete(room.Guests, c.ID)
			if len(room.Guests) == 0 {
				delete(h.houses, owner)
			} else {
				h.sendHouseState(room)
			}
		}
		c.HouseOwner = ""
	}
}

// ensure profileToInfo gets house storage — called from existing path.
func attachHouseStorage(info *protocol.ProfileInfo, p store.Profile) {
	info.HouseStorage = append([]game.Item(nil), p.HouseStorage...)
	info.HouseStorageCap = game.DefaultHouseStorageCapacity
}
