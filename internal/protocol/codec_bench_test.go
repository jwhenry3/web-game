package protocol_test

import (
	"testing"

	"clara-mundi/internal/protocol"
)

// Representative outbound frame: a combat tick with several entities.
func benchCombatTickFrame() []byte {
	return protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{
		Entities: []protocol.WorldEntity{
			{ID: "p1", Name: "Hero", Kind: "player", X: 100.5, Y: 200.25, HP: 450, MaxHP: 500, MP: 80, MaxMP: 100, Alive: true, Engaged: true, TargetID: "n1", SkillATB: 0.6},
			{ID: "p2", Name: "Mage", Kind: "player", X: 110.5, Y: 210.25, HP: 300, MaxHP: 320, MP: 200, MaxMP: 240, Alive: true, Engaged: true, TargetID: "n1", SkillATB: 0.2},
			{ID: "n1", Name: "Goblin", Kind: "npc", Sprite: "goblin", X: 105.0, Y: 205.0, HP: 120, MaxHP: 180, Alive: true, Engaged: true, TargetID: "p1"},
			{ID: "n2", Name: "Slime", Kind: "npc", Sprite: "slime", X: 95.0, Y: 198.0, HP: 0, MaxHP: 60, Alive: false},
			{ID: "pet1", Name: "Whelp", Kind: "pet", OwnerID: "p1", X: 102.0, Y: 202.0, HP: 90, MaxHP: 90, Alive: true, Engaged: true, TargetID: "n2"},
		},
	})
}

func benchWorldStateFrame() []byte {
	return protocol.Encode(protocol.TypeWorldState, protocol.WorldStatePayload{
		Entities: []protocol.WorldEntity{
			{ID: "p1", Name: "Hero", Kind: "player", X: 100.5, Y: 200.25, HP: 450, MaxHP: 500, Alive: true},
			{ID: "n1", Name: "Goblin", Kind: "npc", Sprite: "goblin", X: 105.0, Y: 205.0, HP: 120, MaxHP: 180, Alive: true},
		},
		SavePoints:  []protocol.SavePoint{{ID: "sp1", Name: "Town", X: 10, Y: 20}},
		JobChangers: []protocol.JobChanger{{ID: "jc1", Name: "Guild", X: 30, Y: 40}},
		Map:         protocol.OverworldMap{Tile: 32, Cols: 4, Rows: 4, Cells: "................"},
	})
}

func BenchmarkEncodeFrameProtobufCombatTick(b *testing.B) {
	frame := benchCombatTickFrame()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkEncodeFrameProtobufWorldState(b *testing.B) {
	frame := benchWorldStateFrame()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := protocol.EncodeFrame(protocol.CodecProtobuf, frame); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeProtobufCombatTick(b *testing.B) {
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, benchCombatTickFrame())
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeProtobufEmptyAck(b *testing.B) {
	bin, err := protocol.EncodeFrame(protocol.CodecProtobuf, []byte(`{"type":"dodge"}`))
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := protocol.DecodeFrame(protocol.CodecProtobuf, bin); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkEncodeFrameJSON guards the passthrough fast path.
func BenchmarkEncodeFrameJSON(b *testing.B) {
	frame := benchCombatTickFrame()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := protocol.EncodeFrame(protocol.CodecJSON, frame); err != nil {
			b.Fatal(err)
		}
	}
}
