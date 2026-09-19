package server

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

// petSpeed is the normal speed pets move toward their goal (px/s).
const petSpeed = 120.0

// petFollowDist is the leash radius around the owner. Idle pets keep their
// current position inside it and move toward the owner only after crossing it.
const petFollowDist = 40.0

// Idle pets smoothly accelerate once they fall this far behind, reaching the
// maximum catch-up speed at petFollowCatchupMaxDist.
const (
	petFollowCatchupDist    = 120.0
	petFollowCatchupMaxDist = 320.0
	petFollowMaxSpeed       = 240.0
)

// petStandoff is how close to the target a pet stands to attack (px).
const petStandoff = 30.0

// petTeleportTicks is how long a pet may go without closing distance on its
// owner before snapping to them (~3s at the 50ms entity tick). Only applies
// while following — a pet never teleports toward a combat target.
const petTeleportTicks = 60

// petSyncInterval throttles the tick-driven reconcile in syncPetEntities:
// the entity set is rebuilt at most this often, while pet mutations set
// petSyncDirty so the next 50ms tick resyncs immediately.
const petSyncInterval = 250 * time.Millisecond

// petSyncDue reports whether this entity tick should reconcile pet entities:
// right away after a mutation (petSyncDirty), otherwise once per
// petSyncInterval. lastPetSync is stamped here, on the tick path only —
// direct syncPetEntities calls (join, disconnect, pet handlers, house exit)
// run immediately and do not reset the cadence.
func (h *Hub) petSyncDue(now time.Time) bool {
	if !h.petSyncDirty && now.Sub(h.lastPetSync) < petSyncInterval {
		return false
	}
	h.petSyncDirty = false
	h.lastPetSync = now
	return true
}

func (h *Hub) handlePetSetBattle(c *Client, raw json.RawMessage) {
	var p protocol.PetIDPayload
	_ = json.Unmarshal(raw, &p)
	profile, errMsg := h.store.SetBattlePet(c.Name, p.PetID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendProfileRefresh(c, profile)
	h.petSyncDirty = true
	h.syncPetEntities()
	h.broadcastWorldState()
}

func (h *Hub) handlePetSetMount(c *Client, raw json.RawMessage) {
	var p protocol.PetIDPayload
	_ = json.Unmarshal(raw, &p)
	profile, errMsg := h.store.SetMountPet(c.Name, p.PetID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendProfileRefresh(c, profile)
	h.broadcastWorldState()
}

// handleMountToggle stubs the mount keybind: it toggles a mounted flag so the
// feature can read state later, and reports the outcome via reward_notice.
// Mounting movement/visuals are not implemented yet.
func (h *Hub) handleMountToggle(c *Client, _ json.RawMessage) {
	prof, ok := h.store.Get(c.Name)
	if !ok {
		h.sendError(c, "Character not found.")
		return
	}
	pet, hasMount := prof.FindPet(prof.MountPetID)
	if !hasMount {
		h.sendError(c, "No mount selected — set one in the Pets window.")
		return
	}
	e := h.playerEnt(c.ID)
	cc := clientControlOf(e)
	if e == nil || cc == nil || e.hidden || cc.inHouse {
		h.sendError(c, "You can't mount right now.")
		return
	}
	cc.mounted = !cc.mounted
	if cc.mounted {
		h.send(c, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
			Message: fmt.Sprintf("You call %s to ride. (Riding isn't implemented yet.)", pet.Name),
		})
	} else {
		h.send(c, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
			Message: "You dismiss your mount.",
		})
	}
}

func (h *Hub) handlePetRelease(c *Client, raw json.RawMessage) {
	var p protocol.PetIDPayload
	_ = json.Unmarshal(raw, &p)
	profile, errMsg := h.store.ReleasePet(c.Name, p.PetID)
	if errMsg != "" {
		h.sendError(c, errMsg)
		return
	}
	h.sendProfileRefresh(c, profile)
	h.petSyncDirty = true
	h.syncPetEntities()
	h.broadcastWorldState()
}

// handlePetCommand drives the pet hotbar: "attack" sends every active pet at
// the owner's focus target (and re-arms auto-assist), "heel" calls them back
// to a passive follow until the next attack command.
func (h *Hub) handlePetCommand(c *Client, raw json.RawMessage) {
	var p protocol.PetCommandPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		h.sendError(c, "Malformed pet command.")
		return
	}
	e := h.playerEnt(c.ID)
	cc := clientControlOf(e)
	if e == nil || cc == nil || e.hidden || cc.inHouse {
		h.sendError(c, "Your pet can't do that right now.")
		return
	}
	pets := 0
	countPets := func(fn func(pet *entity)) {
		h.eachEntity(kindPet, func(pet *entity) {
			if pet.OwnerID != c.ID {
				return
			}
			pets++
			fn(pet)
		})
	}
	switch strings.ToLower(strings.TrimSpace(p.Command)) {
	case "attack":
		t := h.validTarget(e)
		if t == nil {
			h.sendError(c, "Target an enemy first.")
			return
		}
		e.engageID = t.ID // siccing the pet declares the owner's fight
		h.petSyncDirty = true
		countPets(func(pet *entity) {
			pet.petHold = false
			if h.canAttack(pet, t) {
				pet.targetID = t.ID
			}
			h.entityDirty = true
		})
		if pets == 0 {
			h.sendError(c, "You have no pet out.")
		}
	case "heel":
		h.petSyncDirty = true
		countPets(func(pet *entity) {
			pet.petHold = true
			pet.targetID = ""
			h.entityDirty = true
		})
		if pets == 0 {
			h.sendError(c, "You have no pet out.")
		}
	default:
		h.sendError(c, "Unknown pet command.")
	}
}

// activePetIDs returns the pet record IDs that should exist in the world for
// the given profile. One active pet slot (BattlePetID) spawns a companion
// with the full pet behaviour set (follow, chase, attack); the mount pet is
// not a spawned companion — it's ridden, once mounting is implemented.
func activePetIDs(prof store.Profile) []string {
	if prof.BattlePetID == "" {
		return nil
	}
	return []string{prof.BattlePetID}
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
				h.refreshRegionOwnership(nil, e)
				continue
			}
			h.entities[petID] = newPetEntity(rec, owner)
			h.refreshRegionOwnership(nil, h.entities[petID])
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
			h.sendProfileRefresh(c, updated)
		}
	}
}

func petFollowSpeed(distance float64) float64 {
	if distance <= petFollowCatchupDist {
		return petSpeed
	}
	t := math.Min(1, (distance-petFollowCatchupDist)/(petFollowCatchupMaxDist-petFollowCatchupDist))
	return petSpeed + (petFollowMaxSpeed-petSpeed)*t
}

func followOffset(x, y float64, facing float64) (float64, float64) {
	const dist = 32.0
	fx, fy := game.FacingDir(facing)
	return x - fx*dist, y - fy*dist + 4
}

// petTeleportTo snaps an unreachable pet to a walkable spot at its owner —
// the last resort when even pathfinding can't reach them (sealed pocket,
// across a one-way ledge). Prefers the usual trailing spot behind the owner,
// then the owner's own tile, then a small ring around them.
func (h *Hub) petTeleportTo(e, owner *entity) {
	fx, fy := followOffset(owner.X, owner.Y, owner.Facing)
	if h.walkableAt(fx, fy) {
		e.X, e.Y = fx, fy
		return
	}
	if h.walkableAt(owner.X, owner.Y) {
		e.X, e.Y = owner.X, owner.Y
		return
	}
	for r := 4.0; r <= 24.0; r += 4 {
		for a := 0.0; a < 2*math.Pi; a += math.Pi / 6 {
			nx, ny := owner.X+math.Cos(a)*r, owner.Y+math.Sin(a)*r
			if h.walkableAt(nx, ny) {
				e.X, e.Y = nx, ny
				return
			}
		}
	}
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
