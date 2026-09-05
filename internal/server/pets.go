package server

import (
	"encoding/json"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

func (h *Hub) handlePetSetFollow(c *Client, raw json.RawMessage) {
	var p protocol.PetIDPayload
	_ = json.Unmarshal(raw, &p)
	profile, errMsg := h.store.SetFollowPet(c.Name, p.PetID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendWelcome(c, profile)
	h.broadcastWorldState()
}

func (h *Hub) handlePetSetBattle(c *Client, raw json.RawMessage) {
	var p protocol.PetIDPayload
	_ = json.Unmarshal(raw, &p)
	profile, errMsg := h.store.SetBattlePet(c.Name, p.PetID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendWelcome(c, profile)
}

func (h *Hub) handlePetRelease(c *Client, raw json.RawMessage) {
	var p protocol.PetIDPayload
	_ = json.Unmarshal(raw, &p)
	profile, errMsg := h.store.ReleasePet(c.Name, p.PetID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendWelcome(c, profile)
	h.broadcastWorldState()
}

// worldPets builds follower snapshots for all online players with a follow pet.
func (h *Hub) worldPets() []protocol.WorldPet {
	out := make([]protocol.WorldPet, 0)
	for id, wp := range h.world {
		if wp == nil || wp.InBattle || wp.InHouse {
			continue
		}
		c := h.clients[id]
		if c == nil || !c.Joined {
			continue
		}
		prof, ok := h.store.Get(c.Name)
		if !ok || prof.FollowPetID == "" {
			continue
		}
		pet, ok := prof.FindPet(prof.FollowPetID)
		if !ok {
			continue
		}
		x, y := followOffset(wp.X, wp.Y, wp.Facing)
		out = append(out, protocol.WorldPet{
			ID:      pet.ID,
			OwnerID: id,
			Kind:    pet.Kind,
			Name:    pet.Name,
			Level:   pet.Level,
			X:       x,
			Y:       y,
			Facing:  wp.Facing,
		})
	}
	return out
}

func followOffset(x, y float64, facing float64) (float64, float64) {
	const dist = 32.0
	fx, fy := game.FacingDir(facing)
	return x - fx*dist, y - fy*dist + 4
}
