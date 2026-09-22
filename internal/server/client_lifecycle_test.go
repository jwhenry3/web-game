package server

import (
	"encoding/json"
	"testing"

	"clara-mundi/internal/protocol"
)

func TestQueuedEventAfterDisconnectDoesNotSendOnClosedChannel(t *testing.T) {
	h := mustTestHub()
	c := &Client{ID: "gone", Send: make(chan []byte, 1), Hub: h}
	h.mu.Lock()
	h.clients[c.ID] = c
	h.mu.Unlock()

	h.handleDisconnect(c)

	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleEvent(Event{Type: protocol.TypeJoinWorld, Payload: raw, Sender: c})
	if len(c.Send) != 0 {
		t.Fatal("stale queued event reached a disconnected client")
	}
}

// Reconnecting on a fresh socket before the old conn times out must
// supersede the stale session — not lock the hero out with "already online".
func TestRejoinSameNameSupersedesStaleSession(t *testing.T) {
	h := mustWorldHub(t)
	old := joinWorldClient(h, "client-1", "Bartz")
	if !old.Joined {
		t.Fatal("first join failed")
	}
	fresh := joinWorldClient(h, "client-2", "Bartz")
	if !fresh.Joined {
		t.Fatal("rejoin should supersede the stale session, not be rejected")
	}
	h.mu.RLock()
	_, oldStillMember := h.clients[old.ID]
	h.mu.RUnlock()
	if oldStillMember {
		t.Fatal("stale session should be disconnected on rejoin")
	}
	if h.playerEnt(old.ID) != nil {
		t.Fatal("stale player entity should be removed on rejoin")
	}
	if h.playerEnt(fresh.ID) == nil {
		t.Fatal("fresh session should have a player entity")
	}
}

func TestSendRawDropsStaleClientAfterReconnect(t *testing.T) {
	h := mustTestHub()
	old := &Client{ID: "client", Send: make(chan []byte, 1), Hub: h}
	replacement := &Client{ID: old.ID, Send: make(chan []byte, 1), Hub: h}
	h.mu.Lock()
	h.clients[old.ID] = replacement
	h.mu.Unlock()

	h.sendRaw(old, []byte(`{"type":"error"}`))
	if len(old.Send) != 0 || len(replacement.Send) != 0 {
		t.Fatal("stale client send must not reach either old or replacement channel")
	}
}
