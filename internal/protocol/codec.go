package protocol

import (
	"encoding/json"
	"fmt"

	"clara-mundi/internal/protocol/pb"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
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
	TypePetSetBattle:         func() proto.Message { return &pb.PetIDPayload{} },
	TypePetSetMount:          func() proto.Message { return &pb.PetIDPayload{} },
	TypePetRelease:           func() proto.Message { return &pb.PetIDPayload{} },
	TypePetCommand:           func() proto.Message { return &pb.PetCommandPayload{} },
	TypeMountToggle:          func() proto.Message { return &pb.EmptyPayload{} },
	TypeCampState:            func() proto.Message { return &pb.CampStatePayload{} },
	TypeHouseState:           func() proto.Message { return &pb.HouseStatePayload{} },
	TypeHouseReturn:          func() proto.Message { return &pb.HouseReturnPayload{} },
	TypeRegionChanged:        func() proto.Message { return &pb.RegionChangedPayload{} },
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

// jsonDirectTypes lists payload message descriptors that can be populated by
// encoding/json instead of protojson. Generated pb structs carry
// json:"proto_field_name" tags, and hub frames (protocol.Encode) always emit
// proto field names, so plain JSON decoding is equivalent — and roughly 2x
// faster with a fraction of the allocations — for messages whose fields use
// only plain scalar/message/map encodings. Types needing protojson-specific
// handling (enums, oneofs, well-known types, extensions, fields from other
// proto packages) fall back to protoUnmarshal.
var jsonDirectTypes = func() map[protoreflect.FullName]bool {
	out := make(map[protoreflect.FullName]bool, len(payloadRegistry))
	for _, makeFn := range payloadRegistry {
		md := makeFn().ProtoReflect().Descriptor()
		if jsonDirectOK(md, map[protoreflect.FullName]bool{}) {
			out[md.FullName()] = true
		}
	}
	return out
}()

func jsonDirectOK(md protoreflect.MessageDescriptor, seen map[protoreflect.FullName]bool) bool {
	if seen[md.FullName()] {
		return true
	}
	seen[md.FullName()] = true
	fields := md.Fields()
	for i := 0; i < fields.Len(); i++ {
		fd := fields.Get(i)
		// Synthetic oneofs are just proto3 `optional` scalars — generated as
		// plain *T fields that encoding/json handles. Real oneofs are
		// interface-typed and need protojson.
		if od := fd.ContainingOneof(); od != nil && !od.IsSynthetic() {
			return false
		}
		if fd.IsExtension() {
			return false
		}
		switch fd.Kind() {
		case protoreflect.EnumKind, protoreflect.GroupKind:
			return false
		case protoreflect.MessageKind:
			sub := fd.Message()
			// Only our own messages take the fast path; well-known types
			// (Timestamp, Struct, Any, ...) have bespoke protojson encodings.
			if sub.ParentFile().Package() != "fantasy.v1" {
				return false
			}
			if !jsonDirectOK(sub, seen) {
				return false
			}
		}
	}
	return true
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
	t, payload, err := unmarshalWireEnvelope(data)
	if err != nil {
		return Envelope{}, fmt.Errorf("wire envelope: %w", err)
	}
	// Truly empty client acks may omit payload; skip the proto/json hops.
	if len(payload) == 0 {
		return Envelope{Type: t}, nil
	}
	msg := newPayloadMessage(t)
	if err := proto.Unmarshal(payload, msg); err != nil {
		return Envelope{}, fmt.Errorf("payload %s: %w", t, err)
	}
	raw, err := protoMarshal.Marshal(msg)
	if err != nil {
		return Envelope{}, err
	}
	if isEmptyProto(msg) {
		return Envelope{Type: t}, nil
	}
	return Envelope{Type: t, Payload: raw}, nil
}

func isEmptyProto(msg proto.Message) bool {
	return proto.Size(msg) == 0
}

// unmarshalWireEnvelope extracts type (field 1) and payload (field 2) from a
// WireEnvelope without allocating the generated message. The returned payload
// aliases data; last-wins semantics on duplicates match proto.Unmarshal.
func unmarshalWireEnvelope(data []byte) (MessageType, []byte, error) {
	var (
		t       MessageType
		payload []byte
	)
	for len(data) > 0 {
		num, typ, n := protowire.ConsumeTag(data)
		if n < 0 {
			return "", nil, protowire.ParseError(n)
		}
		data = data[n:]
		switch num {
		case 1:
			if typ != protowire.BytesType {
				return "", nil, fmt.Errorf("field 1: unexpected wire type %d", typ)
			}
			v, n := protowire.ConsumeString(data)
			if n < 0 {
				return "", nil, protowire.ParseError(n)
			}
			t = MessageType(v)
			data = data[n:]
		case 2:
			if typ != protowire.BytesType {
				return "", nil, fmt.Errorf("field 2: unexpected wire type %d", typ)
			}
			v, n := protowire.ConsumeBytes(data)
			if n < 0 {
				return "", nil, protowire.ParseError(n)
			}
			payload = v
			data = data[n:]
		default:
			n := protowire.ConsumeFieldValue(num, typ, data)
			if n < 0 {
				return "", nil, protowire.ParseError(n)
			}
			data = data[n:]
		}
	}
	return t, payload, nil
}

// marshalWireEnvelope emits WireEnvelope wire format directly: identical bytes
// to proto.Marshal(&pb.WireEnvelope{...}) — field 1 then field 2, proto3 empty
// values omitted — without the generated-message alloc and reflection pass.
func marshalWireEnvelope(t MessageType, payload []byte) []byte {
	n := 0
	if len(t) > 0 {
		n += 1 + protowire.SizeVarint(uint64(len(t))) + len(t)
	}
	if len(payload) > 0 {
		n += 1 + protowire.SizeVarint(uint64(len(payload))) + len(payload)
	}
	out := make([]byte, 0, n)
	if len(t) > 0 {
		out = protowire.AppendTag(out, 1, protowire.BytesType)
		out = protowire.AppendString(out, string(t))
	}
	if len(payload) > 0 {
		out = protowire.AppendTag(out, 2, protowire.BytesType)
		out = protowire.AppendBytes(out, payload)
	}
	return out
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
	return encodeProtobufFrame(env.Type, env.Payload)
}

// EncodeFramePayload encodes a hub message for the client codec when the
// caller already holds the type and serialized payload, skipping the JSON
// envelope round-trip EncodeFrame performs.
func EncodeFramePayload(codec Codec, t MessageType, payloadJSON []byte) ([]byte, error) {
	if codec != CodecProtobuf {
		return json.Marshal(Envelope{Type: t, Payload: payloadJSON})
	}
	return encodeProtobufFrame(t, payloadJSON)
}

func encodeProtobufFrame(t MessageType, payloadJSON []byte) ([]byte, error) {
	msg := newPayloadMessage(t)
	if len(payloadJSON) > 0 && string(payloadJSON) != "null" {
		var err error
		if jsonDirectTypes[msg.ProtoReflect().Descriptor().FullName()] {
			err = json.Unmarshal(payloadJSON, msg)
		} else {
			err = protoUnmarshal.Unmarshal(payloadJSON, msg)
		}
		if err != nil {
			return nil, fmt.Errorf("payload %s: %w", t, err)
		}
	}
	payload, err := proto.Marshal(msg)
	if err != nil {
		return nil, err
	}
	return marshalWireEnvelope(t, payload), nil
}

// EncodeProtobuf marshals a typed payload directly to a binary WireEnvelope.
func EncodeProtobuf(t MessageType, payload any) ([]byte, error) {
	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return encodeProtobufFrame(t, jsonPayload)
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
