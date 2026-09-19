package server

import (
	"encoding/json"
	"sync/atomic"
	"testing"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// ---- bare combat events ----

// AoI members receive the bare combat_event (the 20Hz combat_tick stream
// keeps their snapshots current); a player in radius who is not yet tracked
// gets the snapshot-bearing variant so actor/target entities resolve at once.
func TestCombatEventEntitiesOnlyForNewEntrants(t *testing.T) {
	px, py := wildernessXY()
	h, cA, peA := testHubWithPlayer(t, px, py)
	cB, _ := addWorldClient(h, "client-2", "Lenna", px+30, py)

	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	npcEngageOf(n).engaged = true
	n.targetID = peA.ID

	// cA is an existing AoI member; cB is in radius but untracked.
	h.aoi = map[string]bool{cA.ID: true}
	drainClient(cA)
	drainClient(cB)

	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: n.ID, TargetID: cA.ID, ActionID: game.BasicAttack.ID, Message: "hit",
	}, n.X, n.Y)

	evsA := combatEvents(drainClient(cA))
	if len(evsA) != 1 {
		t.Fatalf("AoI member should get exactly one combat_event, got %d", len(evsA))
	}
	if len(evsA[0].Entities) != 0 {
		t.Fatalf("AoI member's combat_event should carry no snapshots, got %d", len(evsA[0].Entities))
	}

	evsB := combatEvents(drainClient(cB))
	if len(evsB) != 1 {
		t.Fatalf("new entrant should get exactly one combat_event, got %d", len(evsB))
	}
	if len(evsB[0].Entities) == 0 {
		t.Fatal("new entrant's combat_event should carry entity snapshots")
	}
	if !h.aoi[cB.ID] {
		t.Fatal("new entrant should be tracked in the AoI set")
	}
}

// ---- player_sync scoping ----

// player_sync carries vitals the party panel needs, so it reaches the owner
// and party members — but not unrelated clients.
func TestPlayerSyncReachesOwnerAndPartyOnly(t *testing.T) {
	px, py := wildernessXY()
	h, cA, eA := testHubWithPlayer(t, px, py)
	cB, _ := addWorldClient(h, "client-2", "Lenna", px+30, py)
	cC, _ := addWorldClient(h, "client-3", "Faris", px+60, py)

	party := &hubParty{ID: "p1", LeaderID: cA.ID, MemberIDs: []string{cA.ID, cB.ID}}
	h.parties[party.ID] = party
	h.clientParty[cA.ID] = party.ID
	h.clientParty[cB.ID] = party.ID

	drainClient(cA)
	drainClient(cB)
	drainClient(cC)

	h.sendPlayerSync(eA)

	if !hasFrameType(drainClient(cA), protocol.TypePlayerSync) {
		t.Fatal("owner should receive player_sync")
	}
	if !hasFrameType(drainClient(cB), protocol.TypePlayerSync) {
		t.Fatal("party member should receive player_sync")
	}
	if hasFrameType(drainClient(cC), protocol.TypePlayerSync) {
		t.Fatal("stranger must not receive another player's player_sync")
	}
}

// ---- far-sync batching ----

// A far client receives one batched entity_state carrying every far mover's
// player snapshot plus the server-entity set — never per-mover player_moved
// frames.
func TestFlushFarSyncBatchesMoversIntoEntityState(t *testing.T) {
	px, py := wildernessXY()
	h, cA, eA := testHubWithPlayer(t, px, py)
	cB, eB := addWorldClient(h, "client-2", "Lenna", px+50, py)
	fx, fy := farCorner(h, px, py)
	if dist(px, py, fx, fy) <= nearSyncDist {
		t.Skip("map too small for far-sync test")
	}
	cC, _ := addWorldClient(h, "client-3", "Faris", fx, fy)

	h.movedPlayers[eA.ID] = true
	h.movedPlayers[eB.ID] = true
	drainClient(cA)
	drainClient(cB)
	drainClient(cC)

	h.flushFarSync()

	frames := drainClient(cC)
	var states []protocol.EntityStatePayload
	for _, f := range frames {
		if f.Type != protocol.TypeEntityState {
			continue
		}
		var p protocol.EntityStatePayload
		if err := json.Unmarshal(f.Payload, &p); err == nil {
			states = append(states, p)
		}
	}
	if len(states) != 1 {
		t.Fatalf("far client should get one batched entity_state, got %d", len(states))
	}
	got := map[string]bool{}
	playerCount := 0
	for _, e := range states[0].Entities {
		got[e.ID] = true
		if e.Kind == string(kindPlayer) {
			playerCount++
		}
	}
	for _, id := range []string{eA.ID, eB.ID} {
		if !got[id] {
			t.Fatalf("batched entity_state should carry moved player %s", id)
		}
	}
	if playerCount != 2 {
		t.Fatalf("expected exactly the 2 far movers as players in the digest, got %d", playerCount)
	}
	if hasFrameType(frames, protocol.TypePlayerMoved) {
		t.Fatal("far movers should not be sent as individual player_moved frames")
	}

	// Movers within nearSyncDist of each other owe each other nothing — their
	// positions already stream in real time via broadcastPlayerMoved.
	if hasFrameType(drainClient(cA), protocol.TypeEntityState) {
		t.Fatal("near mover should not receive a far-sync digest")
	}
}

// The digest portion must keep carrying the full server-entity set even when
// player movers are batched in — the client treats entity_state as
// authoritative for non-player entities.
func TestFlushFarSyncDigestStillCarriesServerEntities(t *testing.T) {
	px, py := wildernessXY()
	h, cA, eA := testHubWithPlayer(t, px, py)
	nearA := hostileNPC(h, "npc-1", px+40, py)
	fx, fy := farCorner(h, px, py)
	if dist(px, py, fx, fy) <= entitySyncRadius {
		t.Skip("map too small for far-sync test")
	}
	cB, _ := addWorldClient(h, "client-2", "Lenna", fx, fy)
	nearB := hostileNPC(h, "npc-2", fx+40, fy)

	h.farEntityClients[cB.ID] = true
	h.movedPlayers[eA.ID] = true
	drainClient(cA)
	drainClient(cB)

	h.flushFarSync()

	var found *protocol.EntityStatePayload
	for _, f := range drainClient(cB) {
		if f.Type != protocol.TypeEntityState {
			continue
		}
		var p protocol.EntityStatePayload
		if err := json.Unmarshal(f.Payload, &p); err == nil {
			cp := p
			found = &cp
		}
	}
	if found == nil {
		t.Fatal("far client should receive an entity_state digest")
	}
	ids := map[string]bool{}
	for _, e := range found.Entities {
		ids[e.ID] = true
	}
	if !ids[nearB.ID] {
		t.Fatal("digest must carry server-driven entities inside the client's scope")
	}
	if ids[nearA.ID] {
		t.Fatal("digest must not carry server entities outside the client's scope")
	}
	if !ids[eA.ID] {
		t.Fatal("digest should carry the far mover's player snapshot")
	}
}

// ---- drop metrics ----

func TestSendRawDropAccounting(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	for i := 0; i < cap(c.Send); i++ {
		c.Send <- []byte("fill")
	}
	before := h.dropTotal.Load()
	h.sendRaw(c, protocol.Encode(protocol.TypeChatMsg, protocol.ChatMessagePayload{Message: "x"}))
	if h.dropTotal.Load() != before+1 {
		t.Fatal("dropped message should increment dropTotal")
	}
	v, ok := h.dropCounts.Load(c.ID)
	if !ok {
		t.Fatal("per-client drop count should exist after a drop")
	}
	if n := v.(*atomic.Uint64).Load(); n != 1 {
		t.Fatalf("per-client drop count should be 1, got %d", n)
	}
}
