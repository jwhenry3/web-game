package protocol

import (
	"bytes"
	"encoding/json"
	"testing"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol/pb"

	"google.golang.org/protobuf/proto"
)

// Registered payload types take the encoding/json fast path unless a field
// needs protojson-only decoding (enum, oneof, well-known type). MapSnapshot
// embeds google.protobuf.Struct (MapTileOverrides.layers, scene3d), so
// welcome, map_config, and house_state — which carries a MapSnapshot for the
// interior — must stay on protojson; everything else should be direct.
func TestAllPayloadTypesJSONDirect(t *testing.T) {
	wantFallback := map[MessageType]bool{
		TypeWelcome:    true,
		TypeMapConfig:  true,
		TypeHouseState: true,
	}
	for mt := range payloadRegistry {
		name := AssertPayloadType(mt)
		if jsonDirectTypes[name] == wantFallback[mt] {
			t.Errorf("%s (%s): jsonDirect=%v, want fallback=%v", mt, name, jsonDirectTypes[name], wantFallback[mt])
		}
	}
}

// encoding/json into generated structs must produce protos equivalent to
// protojson for hub-shaped JSON (proto field names, numbers for ints).
func TestJSONDirectParity(t *testing.T) {
	corpus := map[MessageType]any{
		TypeMove:   MovePayload{X: 1.5, Y: -2, Facing: ptr(3.14)},
		TypeAction: ActionPayload{ActionID: "use_item", TargetID: "n1", ItemID: "i9", ActorID: "pet-1"},
		TypeJoinWorld: JoinWorldPayload{
			PlayerName: "Hero", Race: "human", MainJob: "VAN", SubJob: "THF",
			Appearance: &CharacterAppearance{Skin: "s1", Face: "f1", Hair: "h1", HairColor: "hc", Cloth: "c", ClothColor: "cc", Weapon: "w", WeaponColor: "wc"},
		},
		TypeCombatTick: CombatTickPayload{Entities: []WorldEntity{{
			ID: "p1", Name: "Hero", Kind: "player", X: 1, Y: 2, HP: 0, MaxHP: 100, Alive: false,
			Engaged: true, Statuses: []game.StatusSnapshot{{Kind: "poison", Potency: 1.5, Remaining: 3, ShieldHP: 10}},
			Appearance: CharacterAppearance{Skin: "s"}, CastingSkillID: "cure", CastEndsAt: 999999999999,
		}}},
		TypeWorldState: WorldStatePayload{
			Entities:    []WorldEntity{{ID: "n1", Kind: "npc", HP: 10, MaxHP: 10, Alive: true}},
			Camps:       []WorldCamp{{OwnerName: "Hero", OwnerID: "c1", X: 1, Y: 2, Skin: "basic"}},
			SavePoints:  []SavePoint{{ID: "sp1", Name: "Town", X: 1, Y: 2}},
			JobChangers: []JobChanger{{ID: "jc", Name: "Guild", X: 3, Y: 4}},
			Map:         OverworldMap{Tile: 32, Cols: 1, Rows: 1, Cells: "."},
		},
		TypeSocialState: SocialStatePayload{
			Friends:                []FriendInfo{{Name: "Bob", Online: true, Level: 3, Weapon: "sword", InCombat: true}},
			Party:                  &PartyInfo{ID: "pty", LeaderID: "p1", Members: []PartyMember{{ID: "p1", Name: "Hero", Level: 5, Weapon: "sword", Leader: true, InCombat: true}}},
			PendingInvite:          &PartyInvitePayload{FromID: "p2", FromName: "Mage", PartyID: "pty"},
			PendingFriendRequests:  []FriendRequestPayload{{FromID: "p3", FromName: "X"}},
			OutgoingFriendRequests: []string{"Y"},
		},
		TypeSetKeybinds: SetKeybindsPayload{Keybinds: map[string]string{"move_up": "W", "act_1": "1"}},
		TypeCombatEvent: CombatEventPayload{
			AttackerID: "p1", TargetID: "n1", Damage: 42, Hit: true, Success: true,
			ActionID: "slash", Entities: []WorldEntity{{ID: "n1", HP: 58, MaxHP: 100, Alive: true}},
		},
		TypeHouseState: HouseStatePayload{
			OwnerName: "Hero", Skin: "basic", MapCols: 4, MapRows: 4, IsOwner: true,
			Players:   []HousePlayer{{ID: "p1", Name: "Hero", X: 1, Y: 2, Owner: true, Pets: []HousePet{{ID: "pet1", Name: "Gob", Sprite: "goblin"}}}},
			Furniture: []game.HouseFurniture{{ID: "f1", Col: 1, Row: 2, Owner: "Hero", Item: game.Item{ID: "i1", Name: "Chair"}}},
			POIs:      []HousePOI{{ID: "door", Kind: "door", Name: "Door", X: 0, Y: 0}},
			Storage:   []game.Item{{ID: "i2", Name: "Ore", Qty: 5}}, StorageCapacity: 20,
		},
		TypeRewardNotice: RewardNoticePayload{XP: 100, Passive: true, Victory: false, Message: "defeat"},
	}

	for typ, payload := range corpus {
		raw, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("%s marshal: %v", typ, err)
		}
		direct := newPayloadMessage(typ)
		if err := json.Unmarshal(raw, direct); err != nil {
			t.Fatalf("%s encoding/json: %v", typ, err)
		}
		viaPJ := newPayloadMessage(typ)
		if err := protoUnmarshal.Unmarshal(raw, viaPJ); err != nil {
			t.Fatalf("%s protojson: %v", typ, err)
		}
		if !proto.Equal(direct, viaPJ) {
			bDirect, _ := proto.Marshal(direct)
			bPJ, _ := proto.Marshal(viaPJ)
			t.Errorf("%s: json-direct and protojson produced different payloads\ndirect: %x\nprotoj: %x", typ, bDirect, bPJ)
		}
	}
}

// marshalWireEnvelope must emit bytes identical to proto.Marshal(WireEnvelope),
// and unmarshalWireEnvelope must accept whatever proto.Marshal produced.
func TestWireEnvelopeParity(t *testing.T) {
	for _, tc := range []struct {
		typ     MessageType
		payload []byte
	}{
		{TypeChat, []byte{0x0A, 0x02, 'h', 'i'}},
		{TypeDodge, nil},
		{"", nil},
		{TypeWorldState, bytes.Repeat([]byte{0xAB}, 300)}, // multi-byte varint length
	} {
		want, err := proto.Marshal(&pb.WireEnvelope{Type: string(tc.typ), Payload: tc.payload})
		if err != nil {
			t.Fatal(err)
		}
		got := marshalWireEnvelope(tc.typ, tc.payload)
		if !bytes.Equal(got, want) {
			t.Fatalf("type %q: got %x want %x", tc.typ, got, want)
		}
		rtType, rtPayload, err := unmarshalWireEnvelope(want)
		if err != nil {
			t.Fatalf("type %q decode: %v", tc.typ, err)
		}
		if rtType != tc.typ || !bytes.Equal(rtPayload, tc.payload) {
			t.Fatalf("type %q round-trip: (%q, %x)", tc.typ, rtType, rtPayload)
		}
		// And a real WireEnvelope must parse identically.
		var w pb.WireEnvelope
		if err := proto.Unmarshal(got, &w); err != nil {
			t.Fatal(err)
		}
		if w.GetType() != string(tc.typ) {
			t.Fatalf("proto.Unmarshal type %q", w.GetType())
		}
	}
}

func ptr(f float64) *float64 { return &f }
