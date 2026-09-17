package server

import (
	"encoding/json"
	"strings"
	"testing"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

func testSocialHub(t *testing.T) (*Hub, *Client, *Client) {
	t.Helper()
	h := mustTestHub()
	h.initSocial()
	a := &Client{ID: "a", Name: "Alpha", Joined: true, Send: make(chan []byte, 64), Hub: h}
	b := &Client{ID: "b", Name: "Bravo", Joined: true, Send: make(chan []byte, 64), Hub: h}
	h.clients[a.ID] = a
	h.clients[b.ID] = b
	pa := h.store.GetOrCreate("Alpha", game.JobVAN)
	pb := h.store.GetOrCreate("Bravo", game.JobHEX)
	ea := h.ensurePlayer(a)
	h.applyProfilePresence(ea, pa)
	if cc := clientControlOf(ea); cc != nil {
		cc.weaponName = "sword"
	}
	eb := h.ensurePlayer(b)
	h.applyProfilePresence(eb, pb)
	if cc := clientControlOf(eb); cc != nil {
		cc.weaponName = "staff"
	}
	return h, a, b
}

func TestFriendRequestAndAccept(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handleAddFriend(a, raw)
	bravo, _ := h.store.Get("Bravo")
	if len(bravo.IncomingFriendRequests) != 1 || !strings.EqualFold(bravo.IncomingFriendRequests[0], "Alpha") {
		t.Fatalf("Bravo should have incoming request, got %v", bravo.IncomingFriendRequests)
	}
	alpha, _ := h.store.Get("Alpha")
	if len(alpha.OutgoingFriendRequests) != 1 {
		t.Fatalf("Alpha should have outgoing request, got %v", alpha.OutgoingFriendRequests)
	}
	if len(alpha.Friends) != 0 {
		t.Fatalf("Alpha should not be friends yet, got %v", alpha.Friends)
	}

	acceptRaw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Alpha"})
	h.handleAcceptFriend(b, acceptRaw)
	alpha, _ = h.store.Get("Alpha")
	bravo, _ = h.store.Get("Bravo")
	if len(alpha.Friends) != 1 || len(bravo.Friends) != 1 {
		t.Fatalf("both should be friends: alpha=%v bravo=%v", alpha.Friends, bravo.Friends)
	}
	if len(bravo.IncomingFriendRequests) != 0 || len(alpha.OutgoingFriendRequests) != 0 {
		t.Fatal("pending requests should be cleared")
	}
}

func TestFriendRequestMutualAutoAccept(t *testing.T) {
	h, a, b := testSocialHub(t)
	rawAB, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handleAddFriend(a, rawAB)
	rawBA, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Alpha"})
	h.handleAddFriend(b, rawBA)
	alpha, _ := h.store.Get("Alpha")
	bravo, _ := h.store.Get("Bravo")
	if len(alpha.Friends) != 1 || len(bravo.Friends) != 1 {
		t.Fatalf("mutual requests should auto-friend: alpha=%v bravo=%v", alpha.Friends, bravo.Friends)
	}
}

func TestPartyInviteAndAccept(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	if h.partyInvites[b.ID] == nil {
		t.Fatal("Bravo should have a pending invite")
	}
	h.handlePartyAccept(b)
	if h.clientParty[a.ID] == "" || h.clientParty[b.ID] != h.clientParty[a.ID] {
		t.Fatal("both players should share a party")
	}
	party := h.parties[h.clientParty[a.ID]]
	if party.LeaderID != a.ID || len(party.MemberIDs) != 2 {
		t.Fatalf("unexpected party: %+v", party)
	}
}

func TestPartyLeavePromotesLeader(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)
	h.removeFromParty(a.ID, false)
	party := h.parties[h.clientParty[b.ID]]
	if party == nil || party.LeaderID != b.ID {
		t.Fatalf("Bravo should lead after Alpha leaves, got %+v", party)
	}
}

func TestPartyCombatShareShowsInCombat(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)

	// Overworld combat: a party member fighting an engaged NPC is flagged
	// in_combat for the party UI — no room join required.
	if cc := clientControlOf(h.playerEnt(a.ID)); cc != nil {
		cc.inCombat = true
	}
	party := h.parties[h.clientParty[a.ID]]
	info := h.buildPartyInfo(party)
	if info == nil || len(info.Members) != 2 {
		t.Fatalf("party info: %+v", info)
	}
	var alphaInCombat bool
	for _, m := range info.Members {
		if m.ID == a.ID {
			alphaInCombat = m.InCombat
		}
	}
	if !alphaInCombat {
		t.Fatal("party member in combat should report in_combat")
	}
}

func TestOnlyLeaderCanInvite(t *testing.T) {
	h, a, b := testSocialHub(t)
	c := &Client{ID: "c", Name: "Charlie", Joined: true, Send: make(chan []byte, 64), Hub: h}
	h.clients[c.ID] = c
	ec := h.ensurePlayer(c)
	ec.Level = 1
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)
	raw2, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Charlie"})
	h.handlePartyInvite(b, raw2)
	if h.partyInvites[c.ID] != nil {
		t.Fatal("non-leader should not be able to invite")
	}
}
