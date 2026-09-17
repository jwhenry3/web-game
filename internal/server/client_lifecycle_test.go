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
