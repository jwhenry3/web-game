package server

import (
	"encoding/json"
	"testing"
	"time"

	"clara-mundi/internal/protocol"
)

// Reproduction: player targets an NPC (engaged and not), then clears via
// set_target "". The target must stay cleared across subsequent ticks.
func TestUntargetStaysClearedWhileEngaged(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+20, py)
	npcSetHome(h, n, px, py)
	h.engage(n, pe)

	raw, _ := json.Marshal(protocol.SetTargetPayload{TargetID: n.ID})
	h.handleSetTarget(c, raw)
	if pe.targetID != n.ID {
		t.Fatalf("target not set, got %q", pe.targetID)
	}

	raw, _ = json.Marshal(protocol.SetTargetPayload{TargetID: ""})
	h.handleSetTarget(c, raw)
	if pe.targetID != "" {
		t.Fatalf("target not cleared, got %q", pe.targetID)
	}

	for i := 0; i < 30; i++ {
		h.tickEntities(time.Now())
		if pe.targetID != "" {
			t.Fatalf("tick %d resurrected target %q", i, pe.targetID)
		}
	}
}

func TestUntargetStaysClearedWhileIdle(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-2", px+400, py)
	npcSetHome(h, n, px+400, py)

	raw, _ := json.Marshal(protocol.SetTargetPayload{TargetID: n.ID})
	h.handleSetTarget(c, raw)
	raw, _ = json.Marshal(protocol.SetTargetPayload{TargetID: ""})
	h.handleSetTarget(c, raw)

	for i := 0; i < 30; i++ {
		h.tickEntities(time.Now())
		if pe.targetID != "" {
			t.Fatalf("tick %d resurrected target %q", i, pe.targetID)
		}
	}
}

// Dropping focus releases the committed attack (engageID) so pets heel off the
// target, and echoes the authoritative (empty) target back to the client.
func TestUntargetReleasesCommitAndEchoes(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-3", px+20, py)
	npcSetHome(h, n, px, py)

	pe.targetID = n.ID
	pe.engageID = n.ID // simulates a committed attack

	drainClient(c)
	raw, _ := json.Marshal(protocol.SetTargetPayload{TargetID: ""})
	h.handleSetTarget(c, raw)

	if pe.targetID != "" || pe.engageID != "" {
		t.Fatalf("untarget should clear target/engage, got %q/%q", pe.targetID, pe.engageID)
	}
	frame, ok := lastFrame(drainClient(c), protocol.TypeSetTarget)
	if !ok {
		t.Fatal("untarget should echo a set_target confirmation")
	}
	var p protocol.SetTargetPayload
	if err := json.Unmarshal(frame.Payload, &p); err != nil {
		t.Fatal(err)
	}
	if p.TargetID != "" {
		t.Fatalf("echo should carry the empty target, got %q", p.TargetID)
	}
}

// The Wails client speaks protobuf. An empty target_id marshals to a zero-size
// proto payload, so the decoded envelope arrives here with no JSON payload;
// that is still an explicit untarget request.
func TestUntargetThroughProtobufFrame(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-4", px+20, py)
	npcSetHome(h, n, px, py)

	pe.targetID = n.ID
	pe.engageID = n.ID

	frame, err := protocol.EncodeProtobuf(protocol.TypeSetTarget, protocol.SetTargetPayload{TargetID: ""})
	if err != nil {
		t.Fatal(err)
	}
	env, err := protocol.DecodeRequestFrame(protocol.CodecProtobuf, frame)
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != protocol.TypeSetTarget {
		t.Fatalf("decoded type %q", env.Type)
	}

	drainClient(c)
	h.handleSetTarget(c, env.Payload)

	if pe.targetID != "" || pe.engageID != "" {
		t.Fatalf("protobuf untarget should clear target/engage, got %q/%q", pe.targetID, pe.engageID)
	}
	frameMsg, ok := lastFrame(drainClient(c), protocol.TypeSetTarget)
	if !ok {
		t.Fatal("protobuf untarget should echo a set_target confirmation")
	}
	var p protocol.SetTargetPayload
	if err := json.Unmarshal(frameMsg.Payload, &p); err != nil {
		t.Fatal(err)
	}
	if p.TargetID != "" {
		t.Fatalf("protobuf untarget echo should carry the empty target, got %q", p.TargetID)
	}
}
