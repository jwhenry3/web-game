package proxy

import (
	"testing"

	"clara-mundi/internal/protocol"
)

// Broadcasts hand the identical frame slice to every protobuf session; the
// single-entry cache must convert it once and hand back identical bytes.
func TestConvertFrameDeduplicatesBroadcast(t *testing.T) {
	p := &Proxy{}
	frame := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{
		Entities: []protocol.WorldEntity{{ID: "p1", HP: 10, MaxHP: 10, Alive: true}},
	})

	first, err := p.convertFrame(frame)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		got, err := p.convertFrame(frame)
		if err != nil {
			t.Fatal(err)
		}
		if &got[0] != &first[0] {
			t.Fatal("cached conversion did not return the same output slice")
		}
	}

	// A different frame must miss and convert independently.
	other := protocol.Encode(protocol.TypeChat, protocol.ChatPayload{Message: "hi"})
	out, err := p.convertFrame(other)
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeFrame(protocol.CodecProtobuf, out)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeChat {
		t.Fatalf("type %s", env.Type)
	}

	// Fresh slice with identical contents is a miss but still correct.
	dup := append([]byte(nil), frame...)
	got, err := p.convertFrame(dup)
	if err != nil {
		t.Fatal(err)
	}
	env, err = protocol.DecodeFrame(protocol.CodecProtobuf, got)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeCombatTick {
		t.Fatalf("type %s", env.Type)
	}
}

func TestConvertFrameBadJSON(t *testing.T) {
	p := &Proxy{}
	if _, err := p.convertFrame([]byte("{nope")); err == nil {
		t.Fatal("expected error")
	}
}
