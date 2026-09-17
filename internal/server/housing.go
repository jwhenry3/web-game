package server

import (
	"encoding/json"
	"strings"
	"time"

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

// housePet is a pet that followed its owner into the house. It mirrors the
// world pet entity (same record ID) while the owner is inside.
type housePet struct {
	ID     string
	Name   string
	Sprite string // pet kind / enemy sprite key
	X, Y   float64
	Facing float64
}

type houseGuest struct {
	ClientID string
	Name     string
	X, Y     float64
	Facing   float64
	Pets     []*housePet
	petTick  time.Time // last time house pets were advanced
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

func (h *Hub) placeCamp(c *Client, e *entity) {
	cc := clientControlOf(e)
	if e == nil || cc == nil || cc.inCombat || cc.inHouse {
		h.sendError(c, "You cannot pitch a camp right now.")
		return
	}
	skin := h.store.CampSkinFor(c.Name)
	// Relocate: kick guests from previous camp if any.
	if _, ok := h.camps[c.Name]; ok {
		h.despawnCamp(c.Name, "Camp relocated.", false)
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
	if e := h.playerEnt(clientID); e != nil {
		if cc := clientControlOf(e); cc != nil {
			cc.inHouse = false
			cc.houseOwner = ""
		}
		e.hidden = false
		// Pets come back out at the owner's side.
		i := 0
		h.eachEntity(kindPet, func(pet *entity) {
			if pet.OwnerID != clientID {
				return
			}
			pet.targetID = ""
			pet.X, pet.Y = housePetSpot(e.X, e.Y, e.Facing, i)
			h.entityDirty = true
			i++
		})
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, h.entitySync(e)))
		h.syncPetEntities()
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
	e := h.playerEnt(c.ID)
	cc := clientControlOf(e)
	if e == nil || cc == nil || cc.inCombat || cc.inHouse {
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
	guest := &houseGuest{ClientID: c.ID, Name: c.Name, X: sx, Y: sy, Facing: e.Facing, petTick: time.Now()}
	// Active pets come inside: mirror each slotted pet record as a house pet
	// at the spawn point, and drop any fight the entity was in at the door.
	if prof, ok := h.store.Get(c.Name); ok {
		for i, petID := range activePetIDs(prof) {
			rec, ok := prof.FindPet(petID)
			if !ok {
				continue
			}
			px, py := housePetSpot(sx, sy, guest.Facing, i)
			px, py = game.ClampHousePos(px, py)
			guest.Pets = append(guest.Pets, &housePet{
				ID: rec.ID, Name: rec.Name, Sprite: rec.Kind,
				X: px, Y: py, Facing: guest.Facing,
			})
		}
	}
	e.engageID = ""
	h.eachEntity(kindPet, func(pe *entity) {
		if pe.OwnerID == c.ID {
			pe.targetID = ""
		}
	})
	room.Guests[c.ID] = guest
	cc.inHouse = true
	cc.houseOwner = owner
	e.hidden = true
	c.HouseOwner = owner
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, h.entitySync(e)))
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
		if e := h.playerEnt(c.ID); e != nil {
			e.X, e.Y = camp.X, camp.Y
			h.persistWorldLocation(c, e, true)
			h.refreshRegionOwnership(c, e)
			h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
				ID: c.ID, X: e.X, Y: e.Y, Facing: e.Facing,
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
		pets := make([]protocol.HousePet, 0, len(g.Pets))
		for _, p := range g.Pets {
			pets = append(pets, protocol.HousePet{
				ID: p.ID, Name: p.Name, Sprite: p.Sprite,
				X: p.X, Y: p.Y, Facing: p.Facing,
			})
		}
		players = append(players, protocol.HousePlayer{
			ID: g.ClientID, Name: g.Name, X: g.X, Y: g.Y, Facing: g.Facing,
			Owner: strings.EqualFold(g.Name, room.OwnerName),
			Pets:  pets,
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

func (h *Hub) moveInHouse(c *Client, e *entity, x, y float64, facing *float64) {
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
	_ = e
	h.stepHousePets(guest)
	h.sendHouseState(room)
}

// housePetSpot returns the follow position for the i-th house pet: behind the
// owner like the overworld followOffset, fanned out sideways so pets don't stack.
func housePetSpot(x, y, facing float64, i int) (float64, float64) {
	gx, gy := followOffset(x, y, facing)
	fx, fy := game.FacingDir(facing)
	side := float64((i%2)*2-1) * (1 + float64(i/2))
	return gx - fy*side*20, gy + fx*side*20
}

// stepHousePets advances each guest pet toward its follow spot on the move
// packet cadence, so they trail the owner around the room.
func (h *Hub) stepHousePets(guest *houseGuest) {
	if len(guest.Pets) == 0 {
		return
	}
	now := time.Now()
	dt := now.Sub(guest.petTick).Seconds()
	guest.petTick = now
	if dt > 0.25 {
		dt = 0.25
	}
	step := petSpeed * dt
	for i, p := range guest.Pets {
		gx, gy := housePetSpot(guest.X, guest.Y, guest.Facing, i)
		dx, dy := gx-p.X, gy-p.Y
		d := dist(p.X, p.Y, gx, gy)
		if d < 0.01 {
			continue
		}
		p.Facing = game.ResolveFacingYaw(dx, dy, 0, false, p.Facing)
		if d <= step {
			p.X, p.Y = gx, gy
		} else {
			p.X += dx / d * step
			p.Y += dy / d * step
		}
		p.X, p.Y = game.ClampHousePos(p.X, p.Y)
	}
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
