package server

import (
	"encoding/json"
	"math"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

// petSpeed is the maximum speed pets move toward their goal (px/s).
const petSpeed = 120.0

// petFollowDist is the resting distance behind the owner. When the pet is
// closer than this it decelerates; when farther it moves at full speed.
const petFollowDist = 40.0

// petStandoff is how close to the target a pet stands to attack (px).
const petStandoff = 30.0

func (h *Hub) handlePetSetFollow(c *Client, raw json.RawMessage) {
	var p protocol.PetIDPayload
	_ = json.Unmarshal(raw, &p)
	profile, errMsg := h.store.SetFollowPet(c.Name, p.PetID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendWelcome(c, profile)
	h.syncPetEntities()
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
	h.syncPetEntities()
	h.broadcastWorldState()
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
	h.syncPetEntities()
	h.broadcastWorldState()
}

// activePetIDs returns all pet record IDs that should be on the world for
// the given profile (follow pet and/or battle pet, deduplicated). Every
// active pet gets the full pet behaviour set (follow, chase, attack).
func activePetIDs(prof store.Profile) []string {
	var ids []string
	seen := ""
	if prof.FollowPetID != "" {
		ids = append(ids, prof.FollowPetID)
		seen = prof.FollowPetID
	}
	if prof.BattlePetID != "" && prof.BattlePetID != seen {
		ids = append(ids, prof.BattlePetID)
	}
	return ids
}

// syncPetEntities creates entities for newly active pets and removes those
// whose owner is gone or no longer has them slotted.
func (h *Hub) syncPetEntities() {
	want := map[string]bool{}
	h.eachEntity(kindPlayer, func(owner *entity) {
		c := h.clients[owner.ID]
		if c == nil || !c.Joined {
			return
		}
		prof, ok := h.store.Get(c.Name)
		if !ok {
			return
		}
		for _, petID := range activePetIDs(prof) {
			rec, ok := prof.FindPet(petID)
			if !ok {
				continue
			}
			want[petID] = true
			if e := h.entities[petID]; e != nil {
				e.OwnerID = owner.ID
				continue
			}
			h.entities[petID] = newPetEntity(rec, owner)
			h.entityDirty = true
		}
	})
	for id, e := range h.entities {
		if e.Kind == kindPet && !want[id] {
			h.clearTargeting(id)
			delete(h.entities, id)
			h.entityDirty = true
		}
	}
}

// awardPetXP gives XP to the owner's battle pet and persists the result.
// XP is scaled by the global rate like player XP.
func (h *Hub) awardPetXP(c *Client, baseXP int) {
	if c == nil {
		return
	}
	prof, ok := h.store.Get(c.Name)
	if !ok || prof.BattlePetID == "" {
		return
	}
	pet, ok := prof.FindPet(prof.BattlePetID)
	if !ok {
		return
	}
	xp := game.ScaleXP(baseXP)
	if xp < 1 {
		return
	}
	leveled := game.PetAwardXP(&pet, xp)
	h.store.UpdatePet(c.Name, pet)
	if leveled {
		// petLevelSync picks up the new level next tick; refresh the client.
		if updated, ok := h.store.Get(c.Name); ok {
			h.sendWelcome(c, updated)
		}
	}
}

func followOffset(x, y float64, facing float64) (float64, float64) {
	const dist = 32.0
	fx, fy := game.FacingDir(facing)
	return x - fx*dist, y - fy*dist + 4
}

// petAttackPos returns a position near the target, offset toward the owner
// so the pet appears to fight from the owner's side of the enemy.
func petAttackPos(ownerX, ownerY, npcX, npcY float64) (float64, float64) {
	dx := ownerX - npcX
	dy := ownerY - npcY
	d := math.Hypot(dx, dy)
	if d < 1 {
		return npcX + petStandoff, npcY
	}
	return npcX + dx/d*petStandoff, npcY + dy/d*petStandoff
}
