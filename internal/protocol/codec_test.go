package protocol_test

import (
	"encoding/json"
	"testing"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

func TestProtobufRoundTripMove(t *testing.T) {
	frame := protocol.Encode(protocol.TypeMove, protocol.MovePayload{X: 12.5, Y: 40})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeMove {
		t.Fatalf("type %s", env.Type)
	}
	var mv protocol.MovePayload
	if err := json.Unmarshal(env.Payload, &mv); err != nil {
		t.Fatal(err)
	}
	if mv.X != 12.5 || mv.Y != 40 {
		t.Fatalf("got %+v", mv)
	}
}

func TestProtobufRoundTripEmpty(t *testing.T) {
	frame := protocol.Encode(protocol.TypeDodge, struct{}{})
	// Encode with empty object
	if frame == nil {
		frame = []byte(`{"type":"dodge"}`)
	}
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeDodge {
		t.Fatalf("type %s", env.Type)
	}
}

func TestProtobufRoundTripWelcome(t *testing.T) {
	frame := protocol.Encode(protocol.TypeWelcome, protocol.WelcomePayload{
		PlayerID: "p1",
		Profile: protocol.ProfileInfo{
			Name:    "Hero",
			MainJob: "VAN",
			Level:   5,
		},
		Map: &protocol.MapSnapshot{
			ID:   "greenwood",
			Name: "Greenwood",
			Overworld: protocol.OverworldMap{
				Tile: 32, Cols: 2, Rows: 2, Cells: "....",
			},
		},
	})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	var welcome protocol.WelcomePayload
	if err := json.Unmarshal(env.Payload, &welcome); err != nil {
		t.Fatal(err)
	}
	if welcome.PlayerID != "p1" || welcome.Profile.Name != "Hero" {
		t.Fatalf("got %+v", welcome)
	}
	if welcome.Map == nil || welcome.Map.Overworld.Cells != "...." {
		t.Fatalf("map %+v", welcome.Map)
	}
}

func TestProtobufRoundTripRewardNoticeDefeat(t *testing.T) {
	frame := protocol.Encode(protocol.TypeRewardNotice, protocol.RewardNoticePayload{
		Victory: false,
		Message: "You were defeated.",
	})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeRewardNotice {
		t.Fatalf("type %s", env.Type)
	}
	if len(env.Payload) == 0 {
		t.Fatal("reward_notice must keep a payload (victory=false is meaningful)")
	}
	var rn protocol.RewardNoticePayload
	if err := json.Unmarshal(env.Payload, &rn); err != nil {
		t.Fatal(err)
	}
	if rn.Victory {
		t.Fatal("expected victory=false")
	}
}

func TestProtobufRoundTripCombatEntityZeroHP(t *testing.T) {
	frame := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{
		Entities: []protocol.WorldEntity{{
			ID: "p1", HP: 0, MP: 10, SkillATB: 0, Alive: false, Kind: "player",
		}},
	})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	// protojson encodes int64 as strings; inspect the entity map directly so we
	// assert what the JS client actually sees.
	var raw map[string]any
	if err := json.Unmarshal(env.Payload, &raw); err != nil {
		t.Fatal(err)
	}
	ents, _ := raw["entities"].([]any)
	if len(ents) != 1 {
		t.Fatalf("entities %d", len(ents))
	}
	ent, _ := ents[0].(map[string]any)
	if hp, ok := ent["hp"].(float64); !ok || hp != 0 {
		t.Fatalf("hp key missing or non-zero: %#v", ent["hp"])
	}
	if alive, ok := ent["alive"].(bool); !ok || alive {
		t.Fatalf("alive must be false, got %#v", ent["alive"])
	}
}

func TestProtobufRoundTripCampState(t *testing.T) {
	frame := protocol.Encode(protocol.TypeCampState, protocol.CampStatePayload{
		Camps: []protocol.WorldCamp{{
			OwnerName: "Hero",
			OwnerID:   "c1",
			X:         100,
			Y:         200,
			Skin:      "basic",
		}},
	})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeCampState {
		t.Fatalf("type %s", env.Type)
	}
	var p protocol.CampStatePayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		t.Fatal(err)
	}
	if len(p.Camps) != 1 || p.Camps[0].OwnerName != "Hero" || p.Camps[0].X != 100 {
		t.Fatalf("camps stripped or wrong: %+v", p.Camps)
	}
}

func TestProtobufRoundTripEnterHouse(t *testing.T) {
	frame := protocol.Encode(protocol.TypeEnterHouse, protocol.EnterHousePayload{OwnerName: "Hero"})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	var p protocol.EnterHousePayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		t.Fatal(err)
	}
	if p.OwnerName != "Hero" {
		t.Fatalf("owner_name stripped: %+v", p)
	}
}

func TestProtobufRoundTripWelcomePets(t *testing.T) {
	frame := protocol.Encode(protocol.TypeWelcome, protocol.WelcomePayload{
		PlayerID: "c1",
		Profile: protocol.ProfileInfo{
			Name:        "Hero",
			FollowPetID: "pet-1",
			BattlePetID: "pet-1",
			Pets: []game.PetRecord{
				{ID: "pet-1", Kind: "goblin", Name: "Goblin", Level: 3},
			},
		},
	})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	var welcome protocol.WelcomePayload
	if err := json.Unmarshal(env.Payload, &welcome); err != nil {
		t.Fatal(err)
	}
	if len(welcome.Profile.Pets) != 1 || welcome.Profile.Pets[0].Kind != "goblin" {
		t.Fatalf("pets stripped from welcome: %+v", welcome.Profile)
	}
	if welcome.Profile.FollowPetID != "pet-1" || welcome.Profile.BattlePetID != "pet-1" {
		t.Fatalf("pet slots stripped: %+v", welcome.Profile)
	}
}

func TestProtobufRoundTripPetID(t *testing.T) {
	frame := protocol.Encode(protocol.TypePetSetFollow, protocol.PetIDPayload{PetID: "pet-9"})
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	var p protocol.PetIDPayload
	if err := json.Unmarshal(env.Payload, &p); err != nil {
		t.Fatal(err)
	}
	if p.PetID != "pet-9" {
		t.Fatalf("pet_id stripped: %+v", p)
	}
}

func TestJSONCodecPassthrough(t *testing.T) {
	frame := protocol.Encode(protocol.TypeChat, protocol.ChatPayload{Message: "hi"})
	out, err := protocol.EncodeFrame(protocol.CodecJSON, frame)
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != string(frame) {
		t.Fatal("json codec should pass through")
	}
}

func TestAllTypesHaveProto(t *testing.T) {
	for _, typ := range protocol.KnownMessageTypes() {
		_ = protocol.AssertPayloadType(typ)
	}
}
