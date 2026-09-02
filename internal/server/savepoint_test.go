package server

import (
	"encoding/json"
	"testing"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

func TestSetSavePointRequiresProximity(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	if len(game.SavePoints) == 0 {
		t.Fatal("expected save points from overworld data")
	}
	sp := game.SavePoints[0]
	center := game.TileCenter(sp.Tile)

	raw, _ := json.Marshal(protocol.SetSavePointPayload{SavePointID: sp.ID})
	h.handleSetSavePoint(c, raw)
	if profile, ok := h.store.Get(c.Name); ok && profile.SavePointID != "" {
		t.Fatal("should not set save point from far away")
	}

	wp.X, wp.Y = center.X, center.Y
	h.handleSetSavePoint(c, raw)
	profile, ok := h.store.Get(c.Name)
	if !ok || profile.SavePointID != sp.ID {
		t.Fatalf("expected save point %s, got %+v", sp.ID, profile)
	}
}

func TestDefeatRespawnsAtSavePoint(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 500, 500)
	if len(game.SavePoints) == 0 {
		t.Fatal("expected save points")
	}
	sp := game.SavePoints[0]
	profile, _ := h.store.Get(c.Name)
	profile.SavePointID = sp.ID
	h.store.SetSavePoint(c.Name, sp.ID)

	h.respawnAtSavePoint(c.ID)
	wantX, wantY := game.SpawnPosition(sp.ID)
	if dist(wp.X, wp.Y, wantX, wantY) > 1 {
		t.Fatalf("respawn at save point, got %f,%f want %f,%f", wp.X, wp.Y, wantX, wantY)
	}
}

func TestDefeatWithoutSavePointUsesDefaultSpawn(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 500, 500)
	h.respawnAtSavePoint(c.ID)
	if dist(wp.X, wp.Y, game.DefaultSpawnX, game.DefaultSpawnY) > 1 {
		t.Fatalf("default respawn expected haven spawn, got %f,%f", wp.X, wp.Y)
	}
}

func TestJoinWorldSpawnsAtSavePoint(t *testing.T) {
	h := mustTestHub()
	if len(game.SavePoints) == 0 {
		t.Fatal("expected save points")
	}
	sp := game.SavePoints[0]
	profile := h.store.GetOrCreate("Bartz", game.JobWAR)
	h.store.SetSavePoint(profile.Name, sp.ID)

	c := &Client{ID: "client-1", Name: "Bartz", Joined: false, Send: make(chan []byte, 8), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleJoinWorld(c, raw)

	wp := h.world[c.ID]
	wantX, wantY := game.SpawnPosition(sp.ID)
	if dist(wp.X, wp.Y, wantX, wantY) > 1 {
		t.Fatalf("join spawn at save point, got %f,%f want %f,%f", wp.X, wp.Y, wantX, wantY)
	}
}
