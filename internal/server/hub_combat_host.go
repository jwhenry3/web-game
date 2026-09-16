package server

import (
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

// Shared send helpers used across the hub's subsystems. All callers must hold
// no locks; these take the read lock themselves.
func (h *Hub) SendToClient(clientID string, msg []byte) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if ok && c.Joined {
		h.sendRaw(c, msg)
	}
}

func (h *Hub) Broadcast(msg []byte) { h.broadcastAll(msg) }

func (h *Hub) SendProfileUpdate(clientID string, profile store.Profile) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	h.sendWelcome(c, profile)
}

func (h *Hub) SendError(clientID, message string) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if ok {
		h.sendError(c, message)
	}
}

func (h *Hub) ProfileFor(clientID string) (store.Profile, bool) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		return store.Profile{}, false
	}
	p, ok := h.store.Get(c.Name)
	return p, ok
}

func (h *Hub) ClientName(clientID string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if c, ok := h.clients[clientID]; ok {
		return c.Name
	}
	return ""
}

func (h *Hub) WorldPlayer(clientID string) *protocol.WorldPlayer {
	return h.world[clientID]
}
