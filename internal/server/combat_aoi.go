package server

import (
	"time"

	"clara-mundi/internal/protocol"
)

// Area-of-interest replication: combat ticks and action events go only to
// clients near a fight (or already tracked), and the tracked set is used to
// send one empty tick when a client leaves so its combat UI clears.

// ---- AoI broadcast ----

// playerActive: the player is actively fighting (target, GCD, cast, statuses,
// or engaged) — not just the inCombat flag.
func (h *Hub) playerActive(e *entity, now time.Time) bool {
	cc := clientControlOf(e)
	return (cc != nil && cc.inCombat) || e.targetID != "" || e.casting != nil ||
		len(e.statuses) > 0 || !e.gcdReady(now)
}

// combatSourceEntities selects the entities for AoI clients: engaged NPCs,
// fighting players, and their pets. Callers project them to WorldEntity.
func (h *Hub) combatSourceEntities(now time.Time) []*entity {
	out := []*entity{}
	activeOwners := map[string]bool{}
	for _, e := range h.entities {
		switch e.Kind {
		case kindNPC:
			if !engagedNPC(e) {
				continue
			}
			out = append(out, e)
		case kindPlayer:
			if e.hidden || !h.playerActive(e, now) {
				continue
			}
			activeOwners[e.ID] = true
			out = append(out, e)
		}
	}
	h.eachEntity(kindPet, func(e *entity) {
		if e.hidden || !activeOwners[e.OwnerID] {
			return
		}
		out = append(out, e)
	})
	return out
}

// combatSnapshots builds the entity list for AoI clients: engaged NPCs,
// fighting players, and their pets.
func (h *Hub) combatSnapshots(now time.Time) []protocol.WorldEntity {
	srcs := h.combatSourceEntities(now)
	out := make([]protocol.WorldEntity, 0, len(srcs))
	for _, e := range srcs {
		out = append(out, h.projector.project(e, now))
	}
	return out
}

// broadcastCombatTick sends snapshots only to clients whose AoI overlaps a
// fight; clients leaving the AoI get one empty tick so their HUD clears.
func (h *Hub) broadcastCombatTick() {
	// Post-tick pass: entity positions moved during the tick, so re-index
	// before resolving the AoI recipient set.
	h.spatialInvalidate()
	now := time.Now()
	srcs := h.combatSourceEntities(now)
	if len(srcs) == 0 {
		h.clearAoI()
		return
	}
	entities := make([]protocol.WorldEntity, 0, len(srcs))
	for _, e := range srcs {
		entities = append(entities, h.projector.project(e, now))
	}
	newAoI := map[string]bool{}
	msg := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{Entities: entities})
	// Recipient set: players within combatAoIDist of ANY combat entity. One
	// grid query per combat entity replaces the per-player x per-entity scan.
	nearAoI := map[string]bool{}
	for _, e := range srcs {
		for id := range h.spatialPlayerIDs(e.X, e.Y, combatAoIDist) {
			nearAoI[id] = true
		}
	}
	h.eachEntity(kindPlayer, func(p *entity) {
		if p.hidden {
			return
		}
		in := h.playerActive(p, now) || nearAoI[p.ID]
		if !in {
			return
		}
		newAoI[p.ID] = true
		h.mu.RLock()
		c := h.clients[p.ID]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, msg)
		}
	})
	// Clients that left the AoI get one empty tick so their combat UI clears.
	if len(h.aoi) > 0 {
		var empty []byte
		for id := range h.aoi {
			if newAoI[id] {
				continue
			}
			if empty == nil {
				empty = protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{})
			}
			h.mu.RLock()
			c := h.clients[id]
			h.mu.RUnlock()
			if c != nil && c.Joined {
				h.sendRaw(c, empty)
			}
		}
	}
	h.aoi = newAoI
}

func (h *Hub) clearAoI() {
	if len(h.aoi) == 0 {
		return
	}
	empty := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{})
	for id := range h.aoi {
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, empty)
		}
	}
	h.aoi = nil
}

// sendCombatEvent delivers an action event to every client in the AoI (set)
// plus anyone within radius of the event origin who isn't tracked yet. Every
// recipient is tracked so a later empty tick can clear combat overlays even if
// the event was the client's only combat message.
//
// Two wire variants: AoI members get the bare event — the 20Hz combat_tick
// stream already keeps their entity snapshots current. First-time entrants
// (in radius but untracked) get the snapshot-bearing variant so their client
// can resolve actor/target entities immediately instead of a tick later.
func (h *Hub) sendCombatEvent(ev protocol.CombatEventPayload, x, y float64) {
	if h.npcEffects != nil {
		h.npcEffects.events = append(h.npcEffects.events, npcCombatEvent{Event: ev, X: x, Y: y})
		return
	}
	bare := protocol.Encode(protocol.TypeCombatEvent, ev)
	var full []byte // encoded lazily, only when a new entrant needs it
	// Tracked AoI members always receive the event; everyone else must be
	// within combatAoIDist of the origin — one radius query, then lookups.
	near := h.spatialPlayerIDs(x, y, combatAoIDist)
	h.eachEntity(kindPlayer, func(p *entity) {
		if p.hidden {
			return
		}
		member := h.aoi[p.ID]
		if !member && !near[p.ID] {
			return
		}
		h.mu.RLock()
		c := h.clients[p.ID]
		h.mu.RUnlock()
		if c == nil || !c.Joined {
			return
		}
		msg := bare
		if !member {
			if full == nil {
				ev.Entities = h.combatSnapshots(time.Now())
				full = protocol.Encode(protocol.TypeCombatEvent, ev)
			}
			msg = full
		}
		h.sendRaw(c, msg)
		if h.aoi == nil {
			h.aoi = map[string]bool{}
		}
		h.aoi[p.ID] = true
	})
}
