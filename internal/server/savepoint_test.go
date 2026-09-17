package server

import (
	"encoding/json"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

func TestSetSavePointRequiresProximity(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 400, 400)
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

	pe.X, pe.Y = center.X, center.Y
	h.handleSetSavePoint(c, raw)
	profile, ok := h.store.Get(c.Name)
	if !ok || profile.SavePointID != sp.ID {
		t.Fatalf("expected save point %s, got %+v", sp.ID, profile)
	}
}

func TestDefeatRespawnsAtSavePoint(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 500, 500)
	if len(game.SavePoints) == 0 {
		t.Fatal("expected save points")
	}
	sp := game.SavePoints[0]
	profile, _ := h.store.Get(c.Name)
	profile.SavePointID = sp.ID
	h.store.SetSavePoint(c.Name, sp.ID)

	h.respawnAtSavePoint(c.ID)
	wantX, wantY := game.SpawnPosition(sp.ID)
	if dist(pe.X, pe.Y, wantX, wantY) > 1 {
		t.Fatalf("respawn at save point, got %f,%f want %f,%f", pe.X, pe.Y, wantX, wantY)
	}
}

func TestDefeatWithoutSavePointUsesDefaultSpawn(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 500, 500)
	if len(game.SavePoints) == 0 {
		t.Fatal("expected save points")
	}
	h.respawnAtSavePoint(c.ID)
	// Unattuned defeat respawns at the map's first save point (haven crystal).
	wantX, wantY := game.SpawnPosition(game.SavePoints[0].ID)
	if dist(pe.X, pe.Y, wantX, wantY) > 1 {
		t.Fatalf("default respawn expected haven spawn, got %f,%f", pe.X, pe.Y)
	}
}

func TestJoinWorldSpawnsAtSavePoint(t *testing.T) {
	h := mustTestHub()
	if len(game.SavePoints) == 0 {
		t.Fatal("expected save points")
	}
	sp := game.SavePoints[0]
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	h.store.SetSavePoint(profile.Name, sp.ID)

	c := &Client{ID: "client-1", Name: "Bartz", Joined: false, Send: make(chan []byte, 8), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleJoinWorld(c, raw)

	pe := h.playerEnt(c.ID)
	if pe == nil {
		t.Fatal("expected world player after join")
	}
	wantX, wantY := game.SpawnPosition(sp.ID)
	if dist(pe.X, pe.Y, wantX, wantY) > 1 {
		t.Fatalf("join spawn at save point, got %f,%f want %f,%f", pe.X, pe.Y, wantX, wantY)
	}
}

func TestJoinWorldRestoresLastPosition(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	h.store.SetSavePoint(profile.Name, game.SavePoints[0].ID)
	h.store.SetWorldLocation(profile.Name, "greenwood", 500, 500, game.FacingYawWest, true)

	c := &Client{ID: "client-1", Send: make(chan []byte, 8), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleJoinWorld(c, raw)

	pe := h.playerEnt(c.ID)
	if pe == nil {
		t.Fatal("expected world player")
	}
	if dist(pe.X, pe.Y, 500, 500) > 1 {
		t.Fatalf("resume last position, got %f,%f", pe.X, pe.Y)
	}
	if pe.Facing != game.FacingYawWest {
		t.Fatalf("facing %v", pe.Facing)
	}
}

func TestDisconnectPersistsPosition(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 480, 520)
	h.SetMap("north", "Northern Wastes", game.Loaded())
	pe.Facing = game.FacingYawEast
	h.handleDisconnect(c)

	profile, ok := h.store.Get("Bartz")
	if !ok || !profile.HasWorldPos {
		t.Fatal("expected persisted world position")
	}
	if profile.MapID != "north" {
		t.Fatalf("map %q", profile.MapID)
	}
	if dist(profile.WorldX, profile.WorldY, 480, 520) > 1 {
		t.Fatalf("pos %f,%f", profile.WorldX, profile.WorldY)
	}
	if profile.Facing.Radians() != game.FacingYawEast {
		t.Fatalf("facing %v", profile.Facing)
	}
}

func TestJoinWorldUnwalkableLastPosUsesSavePoint(t *testing.T) {
	h := mustTestHub()
	if len(game.SavePoints) == 0 {
		t.Fatal("expected save points")
	}
	sp := game.SavePoints[0]
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	h.store.SetSavePoint(profile.Name, sp.ID)
	h.store.SetWorldLocation(profile.Name, "greenwood", 10, 10, game.FacingYawEast, true)

	c := &Client{ID: "client-1", Send: make(chan []byte, 8), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleJoinWorld(c, raw)

	pe := h.playerEnt(c.ID)
	if pe == nil {
		t.Fatal("expected world player")
	}
	wantX, wantY := game.SpawnPosition(sp.ID)
	if dist(pe.X, pe.Y, wantX, wantY) > 1 {
		t.Fatalf("expected save-point fallback, got %f,%f want %f,%f", pe.X, pe.Y, wantX, wantY)
	}
}

func TestSetSavePointRecordsVisit(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 400, 400)
	sp := game.SavePoints[0]
	center := game.TileCenter(sp.Tile)
	pe.X, pe.Y = center.X, center.Y
	raw, _ := json.Marshal(protocol.SetSavePointPayload{SavePointID: sp.ID})
	h.handleSetSavePoint(c, raw)
	profile, ok := h.store.Get(c.Name)
	if !ok || !profile.HasVisitedSavePoint(sp.ID) {
		t.Fatal("expected save point to be visited after attune")
	}
}

func TestReturnWarpsToSavePoint(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 400, 400)
	cc := clientControlOf(pe)
	sp := game.SavePoints[0]
	center := game.TileCenter(sp.Tile)
	pe.X, pe.Y = center.X, center.Y
	raw, _ := json.Marshal(protocol.SetSavePointPayload{SavePointID: sp.ID})
	h.handleSetSavePoint(c, raw)
	pe.X, pe.Y = 500, 500
	raw, _ = json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDReturn})
	h.handleUseWorldSkill(c, raw)
	if dist(pe.X, pe.Y, 500, 500) > 1 {
		t.Fatalf("return should wait for cast, got %f,%f", pe.X, pe.Y)
	}
	if cc.fieldCastSkillID != game.SkillIDReturn {
		t.Fatalf("expected return cast, got %q", cc.fieldCastSkillID)
	}
	if cc.fieldCastTimeMs != game.TeleportCastTimeMs {
		t.Fatalf("return cast time %d, want %d", cc.fieldCastTimeMs, game.TeleportCastTimeMs)
	}
	h.finishDueWorldCasts(time.Now().Add(3 * time.Second))
	if dist(pe.X, pe.Y, center.X, center.Y) > 1 {
		t.Fatalf("return landed at %f,%f want %f,%f", pe.X, pe.Y, center.X, center.Y)
	}
}

func TestTeleportRequiresVisit(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 500, 500)
	sp := game.SavePoints[0]
	fromX, fromY := pe.X, pe.Y
	raw, _ := json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDPort, SavePointID: sp.ID})
	h.handleUseWorldSkill(c, raw)
	if dist(pe.X, pe.Y, fromX, fromY) > 1 {
		t.Fatalf("teleport without visit should not move, got %f,%f", pe.X, pe.Y)
	}
}

func attuneAndStand(t *testing.T, h *Hub, c *Client, pe *entity) (game.SavePoint, game.Vec2) {
	t.Helper()
	sp := game.SavePoints[0]
	center := game.TileCenter(sp.Tile)
	pe.X, pe.Y = center.X, center.Y
	raw, _ := json.Marshal(protocol.SetSavePointPayload{SavePointID: sp.ID})
	h.handleSetSavePoint(c, raw)
	pe.X, pe.Y = 500, 500
	c.lastWorldSkill = time.Time{}
	return sp, center
}

func TestTeleportToVisitedSavePoint(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 400, 400)
	cc := clientControlOf(pe)
	sp, center := attuneAndStand(t, h, c, pe)
	raw, _ := json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDPort, SavePointID: sp.ID})
	h.handleUseWorldSkill(c, raw)
	if dist(pe.X, pe.Y, 500, 500) > 1 {
		t.Fatalf("teleport should wait for cast, got %f,%f", pe.X, pe.Y)
	}
	if cc.fieldCastSkillID != game.SkillIDPort {
		t.Fatalf("expected teleport cast, got %q", cc.fieldCastSkillID)
	}
	h.finishDueWorldCasts(time.Now())
	if dist(pe.X, pe.Y, 500, 500) > 1 {
		t.Fatalf("teleport should not finish early, got %f,%f", pe.X, pe.Y)
	}
	h.finishDueWorldCasts(time.Now().Add(3 * time.Second))
	if dist(pe.X, pe.Y, center.X, center.Y) > 1 {
		t.Fatalf("teleport landed at %f,%f want %f,%f", pe.X, pe.Y, center.X, center.Y)
	}
	if cc.fieldCastSkillID != "" {
		t.Fatalf("cast should clear after warp, got %q", cc.fieldCastSkillID)
	}
}

func TestTeleportCancelledByMove(t *testing.T) {
	h, c, pe := testHubWithPlayer(t, 400, 400)
	cc := clientControlOf(pe)
	sp, center := attuneAndStand(t, h, c, pe)
	raw, _ := json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDPort, SavePointID: sp.ID})
	h.handleUseWorldSkill(c, raw)
	move, _ := json.Marshal(protocol.MovePayload{X: 540, Y: 500})
	h.handleMove(c, move)
	if cc.fieldCastSkillID != "" {
		t.Fatalf("move should cancel teleport, still casting %q", cc.fieldCastSkillID)
	}
	h.finishDueWorldCasts(time.Now().Add(3 * time.Second))
	if dist(pe.X, pe.Y, center.X, center.Y) < 20 {
		t.Fatalf("cancelled teleport should not warp, got %f,%f", pe.X, pe.Y)
	}
}
