package server

import (
	"encoding/json"
	"strings"
	"testing"

	"clara-mundi/internal/protocol"
)

// Every client->server message type except the core routes (join_world, move,
// chat) must be claimed by a feature module at hub construction.
func TestModuleRegistryClaimsFeatureRoutes(t *testing.T) {
	h := mustTestHub()
	registered := []protocol.MessageType{
		// social
		protocol.TypeAddFriend, protocol.TypeAcceptFriend, protocol.TypeDeclineFriend,
		protocol.TypeRemoveFriend, protocol.TypePartyInvite, protocol.TypePartyAccept,
		protocol.TypePartyDecline, protocol.TypePartyLeave, protocol.TypePartyKick,
		// combat
		protocol.TypeAction, protocol.TypeSetTarget, protocol.TypeDodge,
		// loadout
		protocol.TypeEquip, protocol.TypeUnequip, protocol.TypeSetJobs,
		protocol.TypeSetHotbar, protocol.TypeSetKeybinds,
		// housing
		protocol.TypeEnterHouse, protocol.TypeLeaveHouse, protocol.TypeHouseInteract,
		protocol.TypeHouseStorageDeposit, protocol.TypeHouseStorageWithdraw,
		protocol.TypeHousePlaceFurniture, protocol.TypeHousePickFurniture,
		protocol.TypeSetCampSkin,
		// pets
		protocol.TypePetSetBattle, protocol.TypePetSetMount,
		protocol.TypePetRelease, protocol.TypePetCommand, protocol.TypeMountToggle,
		// world
		protocol.TypeSetSavePoint, protocol.TypeUseWorldSkill,
	}
	for _, mt := range registered {
		if _, ok := h.routes.routes[mt]; !ok {
			t.Errorf("expected %q to be registered by a module", mt)
		}
	}
	// Core dispatch keeps join_world (pre-join gate), move and chat in the
	// switch — they must not also live in the registry.
	for _, mt := range []protocol.MessageType{protocol.TypeJoinWorld, protocol.TypeMove, protocol.TypeChat} {
		if _, ok := h.routes.routes[mt]; ok {
			t.Errorf("core route %q should stay out of the module registry", mt)
		}
	}
}

func TestUnknownMessageTypeStillErrors(t *testing.T) {
	h, c, _ := testHubWithPlayer(t, 400, 400)
	drainClient(c)
	h.handleEvent(Event{Type: "bogus_type", Payload: json.RawMessage(`{}`), Sender: c})
	found := false
	for _, f := range drainClient(c) {
		if f.Type != protocol.TypeError {
			continue
		}
		var p protocol.ErrorPayload
		if json.Unmarshal(f.Payload, &p) == nil && strings.Contains(p.Message, "Unknown message type") {
			found = true
		}
	}
	if !found {
		t.Fatal("unregistered message type should produce an Unknown message type error")
	}
}

// Module routes sit behind the same join gate as the old switch: an unjoined
// client must not reach them.
func TestModuleRoutesRequireJoin(t *testing.T) {
	h := mustTestHub()
	c := &Client{ID: "unjoined", Send: make(chan []byte, 8), Hub: h}
	h.clients[c.ID] = c
	h.handleEvent(Event{Type: protocol.TypePetSetBattle, Payload: json.RawMessage(`{}`), Sender: c})
	found := false
	for _, f := range drainClient(c) {
		if f.Type != protocol.TypeError {
			continue
		}
		var p protocol.ErrorPayload
		if json.Unmarshal(f.Payload, &p) == nil && strings.Contains(p.Message, "Join the world first") {
			found = true
		}
	}
	if !found {
		t.Fatal("module route should be gated behind join_world")
	}
}
