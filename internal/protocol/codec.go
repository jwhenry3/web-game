package protocol

import (
	"encoding/json"
	"fmt"

	"clara-mundi/internal/protocol/pb"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

// Codec identifies the WebSocket frame encoding for a session.
type Codec string

const (
	CodecJSON     Codec = "json"
	CodecProtobuf Codec = "protobuf"
)

// SubprotocolProtobuf is the Sec-WebSocket-Protocol value for binary frames.
const SubprotocolProtobuf = "fantasy.protobuf"

func ParseCodec(s string) Codec {
	if s == string(CodecProtobuf) || s == SubprotocolProtobuf {
		return CodecProtobuf
	}
	return CodecJSON
}

var (
	// EmitUnpopulated is required: proto3 omits zeros on the wire, and without
	// re-emitting them as JSON the React client treats missing hp/alive/victory
	// as undefined (NaN HP bars, silent defeat screens).
	protoMarshal = protojson.MarshalOptions{
		UseProtoNames:   true,
		EmitUnpopulated: true,
	}
	protoUnmarshal = protojson.UnmarshalOptions{
		DiscardUnknown: true,
	}
)

// payloadRegistry is the single message-type table: each entry maps a
// MessageType to a constructor for its protobuf payload. Adding a wire type is
// a one-line change here; KnownMessageTypes and payload decoding derive from
// it. Types absent from the map decode as EmptyPayload.
var payloadRegistry = map[MessageType]func() proto.Message{
	TypeJoinWorld:            func() proto.Message { return &pb.JoinWorldPayload{} },
	TypeMove:                 func() proto.Message { return &pb.MovePayload{} },
	TypeChat:                 func() proto.Message { return &pb.ChatPayload{} },
	TypeEquip:                func() proto.Message { return &pb.EquipPayload{} },
	TypeUnequip:              func() proto.Message { return &pb.UnequipPayload{} },
	TypeSetJobs:              func() proto.Message { return &pb.SetJobsPayload{} },
	TypeSetHotbar:            func() proto.Message { return &pb.SetHotbarPayload{} },
	TypeSetKeybinds:          func() proto.Message { return &pb.SetKeybindsPayload{} },
	TypeAddFriend:            func() proto.Message { return &pb.PlayerNamePayload{} },
	TypeAcceptFriend:         func() proto.Message { return &pb.PlayerNamePayload{} },
	TypeDeclineFriend:        func() proto.Message { return &pb.PlayerNamePayload{} },
	TypeRemoveFriend:         func() proto.Message { return &pb.PlayerNamePayload{} },
	TypePartyInvite:          func() proto.Message { return &pb.PlayerNamePayload{} },
	TypePartyKick:            func() proto.Message { return &pb.PartyKickPayload{} },
	TypePartyAccept:          func() proto.Message { return &pb.EmptyPayload{} },
	TypePartyDecline:         func() proto.Message { return &pb.EmptyPayload{} },
	TypePartyLeave:           func() proto.Message { return &pb.EmptyPayload{} },
	TypeLeaveHouse:           func() proto.Message { return &pb.EmptyPayload{} },
	TypeDodge:                func() proto.Message { return &pb.EmptyPayload{} },
	TypeEnterHouse:           func() proto.Message { return &pb.EnterHousePayload{} },
	TypeHouseInteract:        func() proto.Message { return &pb.HouseInteractPayload{} },
	TypeHouseStorageDeposit:  func() proto.Message { return &pb.HouseStorageMovePayload{} },
	TypeHouseStorageWithdraw: func() proto.Message { return &pb.HouseStorageMovePayload{} },
	TypeHousePlaceFurniture:  func() proto.Message { return &pb.HousePlaceFurniturePayload{} },
	TypeHousePickFurniture:   func() proto.Message { return &pb.HousePickFurniturePayload{} },
	TypeSetCampSkin:          func() proto.Message { return &pb.SetCampSkinPayload{} },
	TypePetSetFollow:         func() proto.Message { return &pb.PetIDPayload{} },
	TypePetSetBattle:         func() proto.Message { return &pb.PetIDPayload{} },
	TypePetRelease:           func() proto.Message { return &pb.PetIDPayload{} },
	TypePetCommand:           func() proto.Message { return &pb.PetCommandPayload{} },
	TypeCampState:            func() proto.Message { return &pb.CampStatePayload{} },
	TypeHouseState:           func() proto.Message { return &pb.HouseStatePayload{} },
	TypeHouseReturn:          func() proto.Message { return &pb.HouseReturnPayload{} },
	TypeAction:               func() proto.Message { return &pb.ActionPayload{} },
	TypeSetTarget:            func() proto.Message { return &pb.SetTargetPayload{} },
	TypeSetSavePoint:         func() proto.Message { return &pb.SetSavePointPayload{} },
	TypeUseWorldSkill:        func() proto.Message { return &pb.UseWorldSkillPayload{} },
	TypeWelcome:              func() proto.Message { return &pb.WelcomePayload{} },
	TypeMapConfig:            func() proto.Message { return &pb.MapConfigPayload{} },
	TypeWorldState:           func() proto.Message { return &pb.WorldStatePayload{} },
	TypePlayerJoin:           func() proto.Message { return &pb.WorldEntity{} },
	TypePlayerSync:           func() proto.Message { return &pb.WorldEntity{} },
	TypePlayerLeft:           func() proto.Message { return &pb.PlayerLeftPayload{} },
	TypePlayerMoved:          func() proto.Message { return &pb.PlayerMovedPayload{} },
	TypeChatMsg:              func() proto.Message { return &pb.ChatMessagePayload{} },
	TypeEntityState:          func() proto.Message { return &pb.EntityStatePayload{} },
	TypeSocialState:          func() proto.Message { return &pb.SocialStatePayload{} },
	TypePartyInviteMsg:       func() proto.Message { return &pb.PartyInvitePayload{} },
	TypeFriendRequestMsg:     func() proto.Message { return &pb.FriendRequestPayload{} },
	TypeRewardNotice:         func() proto.Message { return &pb.RewardNoticePayload{} },
	TypeCombatTick:           func() proto.Message { return &pb.CombatTickPayload{} },
	TypeCombatEvent:          func() proto.Message { return &pb.CombatEventPayload{} },
	TypeError:                func() proto.Message { return &pb.ErrorPayload{} },
}

func newPayloadMessage(t MessageType) proto.Message {
	if make, ok := payloadRegistry[t]; ok {
		return make()
	}
	return &pb.EmptyPayload{}
}

// DecodeFrame parses a WebSocket frame into an Envelope for the hub.
func DecodeFrame(codec Codec, data []byte) (Envelope, error) {
	if codec == CodecProtobuf {
		return decodeProtobuf(data)
	}
	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return Envelope{}, err
	}
	return env, nil
}

func decodeProtobuf(data []byte) (Envelope, error) {
	var wire pb.WireEnvelope
	if err := proto.Unmarshal(data, &wire); err != nil {
		return Envelope{}, fmt.Errorf("wire envelope: %w", err)
	}
	t := MessageType(wire.GetType())
	msg := newPayloadMessage(t)
	if len(wire.GetPayload()) > 0 {
		if err := proto.Unmarshal(wire.GetPayload(), msg); err != nil {
			return Envelope{}, fmt.Errorf("payload %s: %w", t, err)
		}
	}
	raw, err := protoMarshal.Marshal(msg)
	if err != nil {
		return Envelope{}, err
	}
	// Truly empty client acks may omit payload.
	if isEmptyProto(msg) {
		return Envelope{Type: t}, nil
	}
	return Envelope{Type: t, Payload: raw}, nil
}

func isEmptyProto(msg proto.Message) bool {
	return proto.Size(msg) == 0
}

// EncodeFrame encodes a hub JSON frame (from Encode) for the client codec.
func EncodeFrame(codec Codec, jsonFrame []byte) ([]byte, error) {
	if codec != CodecProtobuf {
		return jsonFrame, nil
	}
	var env Envelope
	if err := json.Unmarshal(jsonFrame, &env); err != nil {
		return nil, err
	}
	msg := newPayloadMessage(env.Type)
	if len(env.Payload) > 0 && string(env.Payload) != "null" {
		if err := protoUnmarshal.Unmarshal(env.Payload, msg); err != nil {
			return nil, fmt.Errorf("payload %s: %w", env.Type, err)
		}
	}
	payload, err := proto.Marshal(msg)
	if err != nil {
		return nil, err
	}
	return proto.Marshal(&pb.WireEnvelope{
		Type:    string(env.Type),
		Payload: payload,
	})
}

// EncodeProtobuf marshals a typed payload directly to a binary WireEnvelope.
func EncodeProtobuf(t MessageType, payload any) ([]byte, error) {
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	msg := newPayloadMessage(t)
	if err := protoUnmarshal.Unmarshal(jsonPayload, msg); err != nil {
		return nil, err
	}
	raw, err := proto.Marshal(msg)
	if err != nil {
		return nil, err
	}
	return proto.Marshal(&pb.WireEnvelope{Type: string(t), Payload: raw})
}

// KnownMessageTypes lists every MessageType for contract tests / docs.
func KnownMessageTypes() []MessageType {
	out := make([]MessageType, 0, len(payloadRegistry))
	for t := range payloadRegistry {
		out = append(out, t)
	}
	return out
}

// AssertPayloadType ensures the registry can construct a message for t.
func AssertPayloadType(t MessageType) protoreflect.FullName {
	return newPayloadMessage(t).ProtoReflect().Descriptor().FullName()
}
