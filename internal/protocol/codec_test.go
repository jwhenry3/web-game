package protocol_test

import (
	"encoding/json"
	"testing"

	"ffv-web-game/internal/protocol"
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
	frame := protocol.Encode(protocol.TypeLeaveBattle, struct{}{})
	// Encode with empty object
	if frame == nil {
		frame = []byte(`{"type":"leave_battle"}`)
	}
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeLeaveBattle {
		t.Fatalf("type %s", env.Type)
	}
}

func TestProtobufRoundTripWelcome(t *testing.T) {
	frame := protocol.Encode(protocol.TypeWelcome, protocol.WelcomePayload{
		PlayerID: "p1",
		Profile: protocol.ProfileInfo{
			Name:    "Hero",
			MainJob: "WAR",
			Level:   5,
		},
		Map: &protocol.MapSnapshot{
			ID:     "greenwood",
			Name:   "Greenwood",
			Combat: "combat.realtime",
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
