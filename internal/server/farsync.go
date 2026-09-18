package server

import (
	"time"

	"clara-mundi/internal/protocol"
)

// ---- far-sync digest ----
//
// Movement streams in real time to clients inside nearSyncDist; clients with
// no nearby entity activity instead receive a batched entity_state digest on
// farSyncInterval. farEntityClients / movedPlayers (Hub fields, hub.go) are
// the bookkeeping: npc.go's tick marks farEntityClients, broadcastPlayerMoved
// accumulates movedPlayers, and flushFarSync drains both.

// broadcastPlayerMoved streams a move update to the mover and clients within
// nearSyncDist immediately; distant clients pick the position up on the
// once-a-second far-sync digest instead.
func (h *Hub) broadcastPlayerMoved(moverID string, e *entity) {
	msg := protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: moverID, X: e.X, Y: e.Y, Facing: e.Facing,
	})
	// One radius query finds every player entity in near range; the client
	// loop then only does a set lookup per joined client.
	near := h.spatialPlayerIDs(e.X, e.Y, nearSyncDist)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if !c.Joined {
			continue
		}
		if c.ID == moverID || near[c.ID] {
			h.sendRawLocked(c, msg)
		} else {
			h.movedPlayers[moverID] = true
		}
	}
}

// nearServerEntity reports whether any server-driven entity (NPC/pet) is
// within nearSyncDist of the player entity.
func (h *Hub) nearServerEntity(p *entity) bool {
	return h.spatialAny(p.X, p.Y, nearSyncDist, func(e *entity) bool {
		return e.Kind != kindPlayer && !e.hidden
	})
}

// flushFarSync runs on farSyncInterval: clients with no nearby server entity
// get a full entity_state digest, and players that moved while out of a
// client's near range ride along in that digest as full snapshots — one
// batched message per client instead of one player_moved per mover.
//
// The payload always carries the complete server-entity set: the client's
// entity_state handler rebuilds its non-player entities from the message, so
// a movers-only digest would evict every NPC and pet. Far movers travel as
// full player projections; the handler's by-id merge replaces the record
// wholesale, exactly like a player_sync update.
func (h *Hub) flushFarSync() {
	if len(h.farEntityClients) == 0 && len(h.movedPlayers) == 0 {
		return
	}
	h.spatialInvalidate() // batch pass: re-index the settled positions once
	// Precompute, per moved player, the player entities inside nearSyncDist —
	// one grid query per mover instead of a distance check per (client, mover).
	near := map[string]map[string]bool{}
	for id := range h.movedPlayers {
		if e := h.entities[id]; e != nil && !e.hidden {
			near[id] = h.spatialPlayerIDs(e.X, e.Y, nearSyncDist)
		}
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	var snapshots []protocol.WorldEntity
	var digestMsg []byte // shared encode for clients with no far movers
	now := time.Now()
	for _, c := range h.clients {
		if !c.Joined {
			continue
		}
		var movers []protocol.WorldEntity
		for id := range h.movedPlayers {
			if id == c.ID {
				continue
			}
			e := h.entities[id]
			if e == nil || e.hidden {
				continue
			}
			if near[id][c.ID] {
				continue // near clients already stream these in real time
			}
			movers = append(movers, h.projector.project(e, now))
		}
		if len(movers) == 0 && !h.farEntityClients[c.ID] {
			continue
		}
		if snapshots == nil {
			snapshots = h.serverEntitySnapshots()
		}
		if len(movers) == 0 {
			if digestMsg == nil {
				digestMsg = protocol.Encode(protocol.TypeEntityState, protocol.EntityStatePayload{
					Entities: snapshots,
				})
			}
			h.sendRawLocked(c, digestMsg)
			continue
		}
		entities := make([]protocol.WorldEntity, 0, len(snapshots)+len(movers))
		entities = append(entities, snapshots...)
		entities = append(entities, movers...)
		h.sendRawLocked(c, protocol.Encode(protocol.TypeEntityState, protocol.EntityStatePayload{
			Entities: entities,
		}))
	}
	clear(h.farEntityClients)
	clear(h.movedPlayers)
}
