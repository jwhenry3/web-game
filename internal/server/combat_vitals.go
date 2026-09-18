package server

import (
	"math"
	"time"

	"clara-mundi/internal/protocol"
)

// Player combat vitals: the in_combat flag lifecycle, the sync path that
// pushes a player's wire snapshot to its owner and party, and the slow
// out-of-combat hp/mp/stamina regen.

// ---- combat flags ----

// engagedPlayers returns the IDs of players involved in a live fight: an
// engaged NPC is targeting them, credits them with damage, or is targeting
// one of their pets. updateCombatFlags builds it in one pass so the
// per-player check is an O(1) lookup instead of an entity scan.
func (h *Hub) engagedPlayers() map[string]bool {
	set := map[string]bool{}
	for _, n := range h.entities {
		if !engagedNPC(n) {
			continue
		}
		if t := h.ent(n.targetID); t != nil {
			if t.Kind == kindPet {
				set[t.OwnerID] = true
			} else {
				set[t.ID] = true
			}
		}
		for id, dmg := range n.contributors {
			if dmg > 0 {
				set[id] = true
			}
		}
	}
	return set
}

// updateCombatFlags recomputes in_combat per player and broadcasts
// player_sync on transitions.
func (h *Hub) updateCombatFlags(now time.Time) {
	engagedBy := h.engagedPlayers()
	h.eachEntity(kindPlayer, func(e *entity) {
		cc := clientControlOf(e)
		if cc == nil {
			return
		}
		engaged := e.casting != nil || engagedBy[e.ID]
		if !e.alive {
			engaged = false
		}
		if engaged == cc.inCombat {
			return
		}
		cc.inCombat = engaged
		if !engaged {
			h.flushSkillUsage(e)
			h.fireLeaveCombat(e)
			h.eachEntity(kindPet, func(pet *entity) {
				if pet.OwnerID == e.ID {
					h.fireLeaveCombat(pet)
				}
			})
		}
		h.sendPlayerSync(e)
		if partyID, ok := h.clientParty[e.ID]; ok {
			h.broadcastPartySocial(h.parties[partyID])
		}
	})
}

func (h *Hub) fireLeaveCombat(e *entity) {
	for _, system := range e.pipeline {
		if hook, ok := system.(leaveCombatHook); ok {
			hook.OnLeaveCombat(h, e)
		}
	}
}

// markPlayerCombat recomputes a player's combat stats on first engagement.
func (h *Hub) markPlayerCombat(clientID string) {
	if h.npcEffects != nil {
		h.npcEffects.playerCombat[clientID] = true
		return
	}
	h.mu.RLock()
	c := h.clients[clientID]
	h.mu.RUnlock()
	if c == nil || !c.Joined {
		return
	}
	e := h.ensurePlayer(c)
	cc := clientControlOf(e)
	if cc != nil && !cc.inCombat {
		h.refreshCombatStats(c, e)
		cc.inCombat = true
		h.sendPlayerSync(e)
	}
}

// ---- player sync ----

// entitySync adapts a player entity to the wire WorldEntity for join/sync.
func (h *Hub) entitySync(e *entity) protocol.WorldEntity {
	return h.projector.project(e, time.Now())
}

// sendPlayerSync pushes a player's wire snapshot to its owner and party
// members. The party panel reads member vitals out of the shared client-side
// entity map (protocol.PartyMember carries no hp/mp), so party members stay
// on the feed; everyone else converges through combat_tick, entity_state
// far-sync digests, and world_state.
func (h *Hub) sendPlayerSync(e *entity) {
	if e == nil {
		return
	}
	msg := protocol.Encode(protocol.TypePlayerSync, h.entitySync(e))
	h.mu.RLock()
	defer h.mu.RUnlock()
	if c := h.clients[e.ID]; c != nil && c.Joined {
		h.sendRawLocked(c, msg)
	}
	partyID, ok := h.clientParty[e.ID]
	if !ok {
		return
	}
	if party := h.parties[partyID]; party != nil {
		for _, id := range party.MemberIDs {
			if id == e.ID {
				continue
			}
			if c := h.clients[id]; c != nil && c.Joined {
				h.sendRawLocked(c, msg)
			}
		}
	}
}

// outOfCombatRegen slowly restores hp/mp/stamina for players not fighting.
// Runs on the 250ms tick so idle players don't need the combat tick.
func (h *Hub) outOfCombatRegen() {
	now := time.Now()
	h.eachEntity(kindPlayer, func(e *entity) {
		cc := clientControlOf(e)
		if cc == nil || e.hidden {
			return
		}
		changed := false
		prev := cc.stamina
		stam := cc.staminaNow(now)
		if math.Abs(stam-prev) >= 0.5 {
			changed = true
		}
		sanctuary := h.inSanctuary(e)
		rate := regenPerSec
		if sanctuary {
			rate = regenPerSecSanctuary
		}
		// Sanctuary regen applies even while the inCombat flag is still
		// cooling down — that's the point of retreating to a crystal.
		if e.alive && (e.hp < e.maxHP || e.mp < e.maxMP) && (!cc.inCombat || sanctuary) {
			cc.regenAcc += npcTickSec * rate
			if pts := int(cc.regenAcc); pts >= 1 {
				cc.regenAcc -= float64(pts)
				e.hp = min(e.maxHP, e.hp+pts)
				e.mp = min(e.maxMP, e.mp+pts)
				changed = true
			}
		}
		if changed || now.Sub(cc.lastResourceSync) >= resourceSyncInterval {
			h.mu.RLock()
			c := h.clients[e.ID]
			h.mu.RUnlock()
			if c != nil && c.Joined {
				h.send(c, protocol.TypePlayerSync, h.entitySync(e))
				cc.lastResourceSync = now
			}
		}
	})
}
