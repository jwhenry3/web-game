package server

import (
	"log"
	"sync/atomic"

	"clara-mundi/internal/protocol"
)

// ---- outbound plumbing ----
//
// Senders may run outside the Run goroutine (module handlers, tasks, NPC
// workers), so every send funnels through h.mu + the non-blocking c.Send
// write in sendRawLocked. A full client buffer drops the frame rather than
// blocking the hub; noteDrop keeps that observable.

func (h *Hub) sendRaw(c *Client, msg []byte) {
	if c == nil || msg == nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	h.sendRawLocked(c, msg)
}

// sendRawLocked sends while clients membership is protected by h.mu. Holding
// the read lock across the non-blocking send prevents handleDisconnect from
// closing c.Send between the membership check and the channel operation.
func (h *Hub) sendRawLocked(c *Client, msg []byte) {
	if h.clients[c.ID] != c {
		return
	}
	select {
	case c.Send <- msg:
	default:
		h.noteDrop(c.ID)
	}
}

// noteDrop records a dropped outbound frame and logs sparsely — the first
// drop per client, then every 100th — so a flooded client is observable
// without a log line per lost message.
func (h *Hub) noteDrop(clientID string) {
	total := h.dropTotal.Add(1)
	v, ok := h.dropCounts.Load(clientID)
	if !ok {
		v, _ = h.dropCounts.LoadOrStore(clientID, &atomic.Uint64{})
	}
	n := v.(*atomic.Uint64).Add(1)
	if n == 1 || n%100 == 0 {
		log.Printf("client %s send buffer full, dropping message (client drops: %d, hub total: %d)", clientID, n, total)
	}
}

func (h *Hub) send(c *Client, t protocol.MessageType, payload any) {
	h.sendRaw(c, protocol.Encode(t, payload))
}

func (h *Hub) sendError(c *Client, msg string) {
	h.send(c, protocol.TypeError, protocol.ErrorPayload{Message: msg})
}

func (h *Hub) broadcastAll(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		if c.Joined {
			h.sendRawLocked(c, msg)
		}
	}
}
