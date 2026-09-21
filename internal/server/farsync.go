package server

import (
	"time"

	"clara-mundi/internal/protocol"
)

// ---- far-sync digest ----
//
// Movement streams in real time to clients inside nearSyncDist; movers out of
// a client's range are batched into an entity_state digest on farSyncInterval.
// broadcastEntityState already streams per-client scoped NPC/pet snapshots
// every tick, so flushFarSync only tracks movedPlayers now.

// broadcastPlayerMoved streams a move update to the mover and clients within
// nearSyncDist immediately; distant clients pick the position up on the
// once-a-second far-sync digest instead.
func (h *Hub) broadcastPlayerMoved(moverID string, e *entity) {
	msg := protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: moverID, X: e.X, Y: e.Y, Z:e.Z, Grounded:e.grounded, Facing: e.Facing,
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

// flushFarSync runs on farSyncInterval: players that moved while out of a
// client's near range ride along in a batched entity_state digest as full
// snapshots — one message per client instead of one player_moved per mover.
//
// The digest carries the client's scoped server-entity set as well: the
// client's entity_state handler rebuilds its non-player entities from the
// message, so a movers-only payload would evict every NPC and pet in view.
// Far movers travel as full player projections; the handler's by-id merge
// replaces the record wholesale, exactly like a player_sync update.
func (h *Hub) flushFarSync() {
	if len(h.movedPlayers) == 0 {
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
		if len(movers) == 0 {
			continue
		}
		p := h.entities[c.ID]
		if p == nil {
			continue
		}
		snapshots := h.serverEntitySnapshotsNear(p.X, p.Y, entitySyncRadius)
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
