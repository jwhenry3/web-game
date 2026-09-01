package server

import (
	"encoding/json"
	"testing"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

func testSocialHub(t *testing.T) (*Hub, *Client, *Client) {
	t.Helper()
	h := NewHub(store.Load(""), nil, nil)
	h.initSocial()
	a := &Client{ID: "a", Name: "Alpha", Joined: true, Send: make(chan []byte, 64), Hub: h}
	b := &Client{ID: "b", Name: "Bravo", Joined: true, Send: make(chan []byte, 64), Hub: h}
	h.clients[a.ID] = a
	h.clients[b.ID] = b
	h.store.GetOrCreate("Alpha", game.JobWAR)
	h.store.GetOrCreate("Bravo", game.JobBLM)
	h.world[a.ID] = &protocol.WorldPlayer{ID: a.ID, Name: "Alpha", Level: 1, Weapon: "sword"}
	h.world[b.ID] = &protocol.WorldPlayer{ID: b.ID, Name: "Bravo", Level: 1, Weapon: "staff"}
	return h, a, b
}

func TestAddFriendPersists(t *testing.T) {
	h, a, _ := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handleAddFriend(a, raw)
	profile, _ := h.store.Get("Alpha")
	if len(profile.Friends) != 1 || profile.Friends[0] != "Bravo" {
		t.Fatalf("expected Bravo on friend list, got %v", profile.Friends)
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

func TestPromptPartyDoesNotAutoJoin(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)

	room := NewBattleRoom("battle-test", 1, h)
	h.battles[room.ID] = room
	h.world[a.ID].X, h.world[a.ID].Y = 500, 500
	h.world[b.ID].X, h.world[b.ID].Y = 520, 520 // within range

	h.promptPartyForBattle(a.ID, room, 500, 500)

	if h.world[b.ID].InBattle {
		t.Fatal("party mates must opt in, not auto-join")
	}
	if h.battleInvites[b.ID] == nil {
		t.Fatal("nearby party mate should receive a battle prompt")
	}
}

func TestPromptPartySkipsDistantMembers(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)

	room := NewBattleRoom("battle-test", 1, h)
	h.world[a.ID].X, h.world[a.ID].Y = 500, 500
	h.world[b.ID].X, h.world[b.ID].Y = 900, 900 // out of range

	h.promptPartyForBattle(a.ID, room, 500, 500)

	if h.battleInvites[b.ID] != nil {
		t.Fatal("distant party mates must not be prompted")
	}
	meta := h.battleMeta[room.ID]
	if meta != nil && meta.passiveEligible[b.ID] != "" {
		t.Fatal("distant party mates must not earn passive eligibility")
	}
}

func TestOnlyLeaderCanInvite(t *testing.T) {
	h, a, b := testSocialHub(t)
	c := &Client{ID: "c", Name: "Charlie", Joined: true, Send: make(chan []byte, 64), Hub: h}
	h.clients[c.ID] = c
	h.world[c.ID] = &protocol.WorldPlayer{ID: c.ID, Name: "Charlie", Level: 1}
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)
	raw2, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Charlie"})
	h.handlePartyInvite(b, raw2)
	if h.partyInvites[c.ID] != nil {
		t.Fatal("non-leader should not be able to invite")
	}
}
