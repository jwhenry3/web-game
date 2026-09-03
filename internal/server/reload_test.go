package server

import (
	"encoding/json"
	"testing"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

func TestApplyOverworldReloadStreamsMapAndWorld(t *testing.T) {
	h := mustTestHub()
	go h.Run()

	c := &Client{
		ID:     "reload-client",
		Name:   "Reloader",
		Joined: true,
		Send:   make(chan []byte, 16),
		Hub:    h,
	}
	h.Register(c)
	// Allow register to process.
	time.Sleep(20 * time.Millisecond)

	ow := game.Loaded()
	if ow == nil {
		t.Fatal("expected loaded overworld")
	}
	h.ApplyOverworldReload("greenwood", "Greenwood", ow)

	var sawMapConfig, sawWorldState bool
	deadline := time.After(500 * time.Millisecond)
	for !sawMapConfig || !sawWorldState {
		select {
		case raw := <-c.Send:
			var env protocol.Envelope
			if err := json.Unmarshal(raw, &env); err != nil {
				t.Fatalf("decode envelope: %v", err)
			}
			switch env.Type {
			case protocol.TypeMapConfig:
				sawMapConfig = true
				var p protocol.MapConfigPayload
				if err := json.Unmarshal(env.Payload, &p); err != nil {
					t.Fatalf("map_config payload: %v", err)
				}
				if p.Map == nil || p.Map.ID != "greenwood" {
					t.Fatalf("unexpected map_config: %+v", p.Map)
				}
				if p.Map.TerrainLayers == nil || len(p.Map.TerrainLayers.Ground) == 0 {
					t.Fatal("map_config missing terrain layers")
				}
			case protocol.TypeWorldState:
				sawWorldState = true
				var p protocol.WorldStatePayload
				if err := json.Unmarshal(env.Payload, &p); err != nil {
					t.Fatalf("world_state payload: %v", err)
				}
				if len(p.SavePoints) == 0 {
					t.Fatal("world_state missing save points after reload")
				}
			}
		case <-deadline:
			t.Fatalf("timed out waiting for streams (map_config=%v world_state=%v)", sawMapConfig, sawWorldState)
		}
	}
}

func TestReseedNPCsPreservesInBattle(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	h.seedNPCs(npcCount)
	if len(h.npcs) == 0 {
		t.Fatal("expected seeded npcs")
	}
	var id string
	for k := range h.npcs {
		id = k
		break
	}
	h.npcs[id].InBattle = true
	h.npcs[id].BattleID = "battle-1"
	h.npcs[id].X = 111
	h.npcs[id].Y = 222

	h.reseedNPCsPreservingBattles(npcCount)
	n := h.npcs[id]
	if n == nil {
		t.Fatal("npc missing after reseed")
	}
	if !n.InBattle || n.BattleID != "battle-1" || n.X != 111 || n.Y != 222 {
		t.Fatalf("battle state not preserved: %+v", n)
	}
}
