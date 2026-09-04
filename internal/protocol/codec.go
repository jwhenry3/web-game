package protocol

import (
	"encoding/json"
	"fmt"

	"ffv-web-game/internal/protocol/pb"

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
	protoMarshal = protojson.MarshalOptions{
		UseProtoNames:   true,
		EmitUnpopulated: false,
	}
	protoUnmarshal = protojson.UnmarshalOptions{
		DiscardUnknown: true,
	}
)

func newPayloadMessage(t MessageType) proto.Message {
	switch t {
	case TypeJoinWorld:
		return &pb.JoinWorldPayload{}
	case TypeMove:
		return &pb.MovePayload{}
	case TypeChat:
		return &pb.ChatPayload{}
	case TypeEquip:
		return &pb.EquipPayload{}
	case TypeUnequip:
		return &pb.UnequipPayload{}
	case TypeSetJobs:
		return &pb.SetJobsPayload{}
	case TypeSetHotbar:
		return &pb.SetHotbarPayload{}
	case TypeSetKeybinds:
		return &pb.SetKeybindsPayload{}
	case TypeAddFriend, TypeAcceptFriend, TypeDeclineFriend, TypeRemoveFriend, TypePartyInvite:
		return &pb.PlayerNamePayload{}
	case TypePartyKick:
		return &pb.PartyKickPayload{}
	case TypePartyAccept, TypePartyDecline, TypePartyLeave, TypeDeclineBattleInvite, TypeLeaveBattle, TypeBattleReturn:
		return &pb.EmptyPayload{}
	case TypeJoinBattle:
		return &pb.JoinBattlePayload{}
	case TypeAction:
		return &pb.ActionPayload{}
	case TypeSetTarget:
		return &pb.SetTargetPayload{}
	case TypeSetSavePoint:
		return &pb.SetSavePointPayload{}
	case TypeUseWorldSkill:
		return &pb.UseWorldSkillPayload{}
	case TypeRTMove:
		return &pb.RTMovePayload{}
	case TypeRTAttack:
		return &pb.RTAttackPayload{}
	case TypeWelcome:
		return &pb.WelcomePayload{}
	case TypeMapConfig:
		return &pb.MapConfigPayload{}
	case TypeWorldState:
		return &pb.WorldStatePayload{}
	case TypePlayerJoin, TypePlayerSync:
		return &pb.WorldPlayer{}
	case TypePlayerLeft:
		return &pb.PlayerLeftPayload{}
	case TypePlayerMoved:
		return &pb.PlayerMovedPayload{}
	case TypeChatMsg:
		return &pb.ChatMessagePayload{}
	case TypeNPCState:
		return &pb.NPCStatePayload{}
	case TypeSocialState:
		return &pb.SocialStatePayload{}
	case TypePartyInviteMsg:
		return &pb.PartyInvitePayload{}
	case TypeBattleInviteMsg:
		return &pb.BattleInvitePayload{}
	case TypeFriendRequestMsg:
		return &pb.FriendRequestPayload{}
	case TypeRewardNotice:
		return &pb.RewardNoticePayload{}
	case TypeBattleList:
		return &pb.BattleListPayload{}
	case TypeBattleState:
		return &pb.BattleStatePayload{}
	case TypeBattleEvent:
		return &pb.BattleEventPayload{}
	case TypeBattleTick:
		return &pb.BattleTickPayload{}
	case TypeBattleEnd:
		return &pb.BattleEndPayload{}
	case TypeError:
		return &pb.ErrorPayload{}
	case TypeRTBattleState:
		return &pb.RTBattleStatePayload{}
	case TypeRTBattleTick:
		return &pb.RTBattleTickPayload{}
	case TypeRTBattleEvent:
		return &pb.RTBattleEventPayload{}
	case TypeRTBattleEnd:
		return &pb.RTBattleEndPayload{}
	default:
		return &pb.EmptyPayload{}
	}
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
	// Empty message → omit payload (match JSON omitempty).
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
	out := make([]MessageType, 0, 64)
	for t := range messageTypeSet {
		out = append(out, t)
	}
	return out
}

var messageTypeSet = map[MessageType]struct{}{
	TypeJoinWorld: {}, TypeMove: {}, TypeChat: {}, TypeEquip: {}, TypeUnequip: {},
	TypeSetJobs: {}, TypeSetHotbar: {}, TypeSetKeybinds: {},
	TypeAddFriend: {}, TypeAcceptFriend: {}, TypeDeclineFriend: {}, TypeRemoveFriend: {},
	TypePartyInvite: {}, TypePartyAccept: {}, TypePartyDecline: {}, TypePartyLeave: {}, TypePartyKick: {},
	TypeDeclineBattleInvite: {}, TypeJoinBattle: {}, TypeLeaveBattle: {},
	TypeAction: {}, TypeSetTarget: {}, TypeSetSavePoint: {}, TypeUseWorldSkill: {},
	TypeRTMove: {}, TypeRTAttack: {},
	TypeWelcome: {}, TypeWorldState: {}, TypePlayerJoin: {}, TypePlayerLeft: {}, TypePlayerMoved: {},
	TypePlayerSync: {}, TypeChatMsg: {}, TypeNPCState: {}, TypeSocialState: {},
	TypePartyInviteMsg: {}, TypeBattleInviteMsg: {}, TypeFriendRequestMsg: {}, TypeRewardNotice: {},
	TypeBattleList: {}, TypeBattleState: {}, TypeBattleEvent: {}, TypeBattleTick: {}, TypeBattleEnd: {},
	TypeBattleReturn: {}, TypeError: {}, TypeMapConfig: {},
	TypeRTBattleState: {}, TypeRTBattleTick: {}, TypeRTBattleEvent: {}, TypeRTBattleEnd: {},
}

// AssertPayloadType ensures the registry can construct a message for t.
func AssertPayloadType(t MessageType) protoreflect.FullName {
	return newPayloadMessage(t).ProtoReflect().Descriptor().FullName()
}
