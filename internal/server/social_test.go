package server

import (
	"encoding/json"
	"strings"
	"testing"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

func testSocialHub(t *testing.T) (*Hub, *Client, *Client) {
	t.Helper()
	h := mustTestHub()
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

func TestPromptPartyDoesNotAutoJoin(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)

	h.world[a.ID].InBattle = true
	h.world[a.ID].BattleID = "battle-test"
	h.world[a.ID].X, h.world[a.ID].Y = 500, 500
	h.world[b.ID].X, h.world[b.ID].Y = 520, 520 // within range

	h.promptPartyForBattle(a.ID, "battle-test", 500, 500)

	if h.world[b.ID].InBattle {
		t.Fatal("party mates must opt in, not auto-join")
	}
	if h.battleInvites[b.ID] == nil {
		t.Fatal("nearby party mate should receive a battle prompt")
	}
}

func TestMoveIntoPartyMemberJoinsBattle(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)

	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: 510, Y: 500}
	h.world[a.ID].X, h.world[a.ID].Y = 500, 500
	h.world[b.ID].X, h.world[b.ID].Y = 400, 500
	h.startBattleFromNPC(a, h.world[a.ID], h.npcs["npc-1"])
	battleID := h.world[a.ID].BattleID

	move, _ := json.Marshal(protocol.MovePayload{X: 500, Y: 500})
	h.handleMove(b, move)

	if !h.world[b.ID].InBattle || h.world[b.ID].BattleID != battleID {
		t.Fatalf("party mate should join by collision, got %+v", h.world[b.ID])
	}
}

func TestMoveIntoNonPartyMemberDoesNotJoin(t *testing.T) {
	h, a, b := testSocialHub(t)
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: 510, Y: 500}
	h.world[a.ID].X, h.world[a.ID].Y = 500, 500
	h.world[b.ID].X, h.world[b.ID].Y = 400, 500
	h.startBattleFromNPC(a, h.world[a.ID], h.npcs["npc-1"])

	move, _ := json.Marshal(protocol.MovePayload{X: 500, Y: 500})
	h.handleMove(b, move)

	if h.world[b.ID].InBattle {
		t.Fatal("non-party members must not auto-join by collision")
	}
}

func TestPromptPartySkipsDistantMembers(t *testing.T) {
	h, a, b := testSocialHub(t)
	raw, _ := json.Marshal(protocol.PlayerNamePayload{PlayerName: "Bravo"})
	h.handlePartyInvite(a, raw)
	h.handlePartyAccept(b)

	h.world[a.ID].InBattle = true
	h.world[a.ID].BattleID = "battle-test"
	h.world[a.ID].X, h.world[a.ID].Y = 500, 500
	h.world[b.ID].X, h.world[b.ID].Y = 900, 900 // out of range

	h.promptPartyForBattle(a.ID, "battle-test", 500, 500)

	if h.battleInvites[b.ID] != nil {
		t.Fatal("distant party mates must not be prompted")
	}
	meta := h.battleMeta["battle-test"]
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
