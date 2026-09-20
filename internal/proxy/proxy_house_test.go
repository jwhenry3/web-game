package proxy

import (
	"encoding/json"
	"testing"
	"time"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/server"
)

// joinWorldSession attaches a session to the world node and drives its
// join_world, waiting for the welcome reply so the character name is set.
func joinWorldSession(t *testing.T, p *Proxy, id, name string) *session {
	t.Helper()
	acct, err := p.accounts.Register("acct_"+id, "password")
	if err != nil {
		t.Fatalf("register account: %v", err)
	}
	s := &session{id: id, send: make(chan []byte, 64), acctID: acct.ID}
	addSession(p, s)
	raw, _ := json.Marshal(protocol.JoinWorldPayload{
		PlayerName: name, Race: "humanus", MainJob: "VAN",
	})
	p.route(s, protocol.Envelope{Type: protocol.TypeJoinWorld, Payload: raw})
	waitForFrame(t, s, protocol.TypeWelcome)
	return s
}

// waitForFrame drains the session's forwarded frames until one carries the
// requested message type.
func waitForFrame(t *testing.T, s *session, mt protocol.MessageType) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case msg := <-s.send:
			var env protocol.Envelope
			if json.Unmarshal(msg, &env) == nil && env.Type == mt {
				return
			}
		case <-time.After(50 * time.Millisecond):
		}
	}
	t.Fatalf("no %q frame forwarded to session %s", mt, s.id)
}

func houseTransfer(id, owner string, spec *cluster.HouseSpec) cluster.TransferRequest {
	sx, sy := 0.0, 0.0
	if spec == nil {
		return cluster.TransferRequest{ClientID: id, DestMap: server.HouseMapID(owner)}
	}
	return cluster.TransferRequest{
		ClientID: id, DestMap: server.HouseMapID(owner),
		DestX: sx, DestY: sy, House: spec,
	}
}

// TestHouseInstanceLifecycle exercises the full dynamic-instance path:
// lazy node creation on first entry, shared occupancy, isolation from the
// world node, leave-as-transfer, and teardown once empty.
func TestHouseInstanceLifecycle(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)

	s1 := joinWorldSession(t, p, "s1", "Bartz")
	s2 := joinWorldSession(t, p, "s2", "Lenna")

	houseSpec := &cluster.HouseSpec{
		Owner: "Bartz", Skin: "basic",
		ReturnMap: n.Spec.ID, ReturnX: 64, ReturnY: 64,
	}
	p.handleTransfer(houseTransfer("s1", "Bartz", houseSpec))

	houseID := server.HouseMapID("Bartz")
	house := p.nodeFor(houseID)
	if house == nil || house.Instance == nil {
		t.Fatal("house instance node should be created on first entry")
	}
	if s1.mapID != houseID {
		t.Fatalf("s1 mapID = %q, want %q", s1.mapID, houseID)
	}
	// The instance join replays like any transfer and ends with house_state.
	waitForFrame(t, s1, protocol.TypeHouseState)

	// A guest joins the same instance.
	p.handleTransfer(houseTransfer("s2", "Bartz", houseSpec))
	waitForFrame(t, s2, protocol.TypeHouseState)
	if p.nodeFor(houseID) != house {
		t.Fatal("second entrant must reuse the running instance")
	}
	if got := len(house.SessionIDs()); got != 2 {
		t.Fatalf("house session count = %d, want 2", got)
	}
	if got := len(n.SessionIDs()); got != 0 {
		t.Fatalf("world node should hold no sessions while both are inside, got %d", got)
	}

	// Instance traffic routes to the house node: a move on the instance hub
	// pushes house_state back to the occupant.
	move, _ := json.Marshal(protocol.MovePayload{X: 1, Y: 1})
	p.route(s1, protocol.Envelope{Type: protocol.TypeMove, Payload: move})
	waitForFrame(t, s1, protocol.TypeHouseState)

	// Guest leaving returns to the world; the instance survives with the
	// owner still inside.
	p.handleTransfer(cluster.TransferRequest{
		ClientID: "s2", DestMap: n.Spec.ID,
		DestX: houseSpec.ReturnX, DestY: houseSpec.ReturnY,
	})
	if s2.mapID != n.Spec.ID {
		t.Fatalf("s2 mapID = %q, want world %q", s2.mapID, n.Spec.ID)
	}
	if p.nodeFor(houseID) != house {
		t.Fatal("instance must stay alive while occupied")
	}

	// Last occupant leaving tears the node down.
	p.handleTransfer(cluster.TransferRequest{
		ClientID: "s1", DestMap: n.Spec.ID,
		DestX: houseSpec.ReturnX, DestY: houseSpec.ReturnY,
	})
	if p.nodeFor(houseID) != nil {
		t.Fatal("empty instance should be removed from the map registry")
	}
	if !house.Closed() {
		t.Fatal("empty instance node should be closed")
	}

	// Re-entry lazily recreates a fresh instance.
	p.handleTransfer(houseTransfer("s1", "Bartz", houseSpec))
	recreated := p.nodeFor(houseID)
	if recreated == nil || recreated == house {
		t.Fatal("re-entry should create a new instance node")
	}
	waitForFrame(t, s1, protocol.TypeHouseState)
}

// TestHouseEvictOnCampDespawn verifies the camp-despawn cascade: despawning
// the owner's camp on the world hub evicts every occupant of the instance
// back to the return position and tears the node down.
func TestHouseEvictOnCampDespawn(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)

	s1 := joinWorldSession(t, p, "s1", "Bartz")
	s2 := joinWorldSession(t, p, "s2", "Lenna")

	houseSpec := &cluster.HouseSpec{
		Owner: "Bartz", Skin: "basic",
		ReturnMap: n.Spec.ID, ReturnX: 64, ReturnY: 64,
	}
	p.handleTransfer(houseTransfer("s1", "Bartz", houseSpec))
	p.handleTransfer(houseTransfer("s2", "Bartz", houseSpec))
	waitForFrame(t, s1, protocol.TypeHouseState)
	waitForFrame(t, s2, protocol.TypeHouseState)
	houseID := server.HouseMapID("Bartz")
	if p.nodeFor(houseID) == nil {
		t.Fatal("house instance should be running")
	}

	// DespawnCamp on the world hub cascades through OnCloseHouse.
	n.Hub.PostTask(func() { n.Hub.DespawnCamp("Bartz", "Camp packed up.") })

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if s1.mapID == n.Spec.ID && s2.mapID == n.Spec.ID && p.nodeFor(houseID) == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("eviction never completed: s1=%q s2=%q house=%v",
		s1.mapID, s2.mapID, p.nodeFor(houseID) != nil)
}

// TestHouseDisconnectDespawnsCamp mirrors the old in-house logout rule: a
// real disconnect inside an instance unpitches that character's camp on the
// world hub.
func TestHouseDisconnectDespawnsCamp(t *testing.T) {
	n, profiles, accounts := newTestNode(t)
	p := New(cluster.Config{}, "", nil, accounts, profiles, "")
	p.RegisterWorld(n)

	s1 := joinWorldSession(t, p, "s1", "Bartz")
	p.handleTransfer(houseTransfer("s1", "Bartz", &cluster.HouseSpec{
		Owner: "Bartz", ReturnMap: n.Spec.ID, ReturnX: 64, ReturnY: 64,
	}))
	waitForFrame(t, s1, protocol.TypeHouseState)

	// Real disconnect inside the instance.
	p.drop(s1)

	houseID := server.HouseMapID("Bartz")
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if p.nodeFor(houseID) == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("disconnect inside an instance should tear down the empty node")
}
