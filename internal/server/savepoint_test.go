package server

import (
	"encoding/json"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
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
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
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

func TestJoinWorldRestoresLastPosition(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	h.store.SetSavePoint(profile.Name, game.SavePoints[0].ID)
	h.store.SetWorldLocation(profile.Name, "greenwood", 500, 500, game.FacingLeft, true)

	c := &Client{ID: "client-1", Send: make(chan []byte, 8), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleJoinWorld(c, raw)

	wp := h.world[c.ID]
	if wp == nil {
		t.Fatal("expected world player")
	}
	if dist(wp.X, wp.Y, 500, 500) > 1 {
		t.Fatalf("resume last position, got %f,%f", wp.X, wp.Y)
	}
	if wp.Facing != game.FacingLeft {
		t.Fatalf("facing %q", wp.Facing)
	}
}

func TestDisconnectPersistsPosition(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 480, 520)
	h.SetMap("north", "Northern Wastes", game.Loaded())
	wp.Facing = game.FacingRight
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
	if profile.Facing != game.FacingRight {
		t.Fatalf("facing %q", profile.Facing)
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
	h.store.SetWorldLocation(profile.Name, "greenwood", 10, 10, game.FacingRight, true)

	c := &Client{ID: "client-1", Send: make(chan []byte, 8), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleJoinWorld(c, raw)

	wp := h.world[c.ID]
	wantX, wantY := game.SpawnPosition(sp.ID)
	if dist(wp.X, wp.Y, wantX, wantY) > 1 {
		t.Fatalf("expected save-point fallback, got %f,%f want %f,%f", wp.X, wp.Y, wantX, wantY)
	}
}

func TestSetSavePointRecordsVisit(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	sp := game.SavePoints[0]
	center := game.TileCenter(sp.Tile)
	wp.X, wp.Y = center.X, center.Y
	raw, _ := json.Marshal(protocol.SetSavePointPayload{SavePointID: sp.ID})
	h.handleSetSavePoint(c, raw)
	profile, ok := h.store.Get(c.Name)
	if !ok || !profile.HasVisitedSavePoint(sp.ID) {
		t.Fatal("expected save point to be visited after attune")
	}
}

func TestReturnWarpsToSavePoint(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	sp := game.SavePoints[0]
	center := game.TileCenter(sp.Tile)
	wp.X, wp.Y = center.X, center.Y
	raw, _ := json.Marshal(protocol.SetSavePointPayload{SavePointID: sp.ID})
	h.handleSetSavePoint(c, raw)
	wp.X, wp.Y = 500, 500
	raw, _ = json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDReturn})
	h.handleUseWorldSkill(c, raw)
	if dist(wp.X, wp.Y, 500, 500) > 1 {
		t.Fatalf("return should wait for cast, got %f,%f", wp.X, wp.Y)
	}
	if wp.CastingSkillID != game.SkillIDReturn {
		t.Fatalf("expected return cast, got %q", wp.CastingSkillID)
	}
	if wp.CastTimeMs != game.TeleportCastTimeMs {
		t.Fatalf("return cast time %d, want %d", wp.CastTimeMs, game.TeleportCastTimeMs)
	}
	h.finishDueWorldCasts(time.Now().Add(3 * time.Second))
	if dist(wp.X, wp.Y, center.X, center.Y) > 1 {
		t.Fatalf("return landed at %f,%f want %f,%f", wp.X, wp.Y, center.X, center.Y)
	}
}

func TestTeleportRequiresVisit(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 500, 500)
	sp := game.SavePoints[0]
	fromX, fromY := wp.X, wp.Y
	raw, _ := json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDPort, SavePointID: sp.ID})
	h.handleUseWorldSkill(c, raw)
	if dist(wp.X, wp.Y, fromX, fromY) > 1 {
		t.Fatalf("teleport without visit should not move, got %f,%f", wp.X, wp.Y)
	}
}

func attuneAndStand(t *testing.T, h *Hub, c *Client, wp *protocol.WorldPlayer) (game.SavePoint, game.Vec2) {
	t.Helper()
	sp := game.SavePoints[0]
	center := game.TileCenter(sp.Tile)
	wp.X, wp.Y = center.X, center.Y
	raw, _ := json.Marshal(protocol.SetSavePointPayload{SavePointID: sp.ID})
	h.handleSetSavePoint(c, raw)
	wp.X, wp.Y = 500, 500
	c.lastWorldSkill = time.Time{}
	return sp, center
}

func TestTeleportToVisitedSavePoint(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	sp, center := attuneAndStand(t, h, c, wp)
	raw, _ := json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDPort, SavePointID: sp.ID})
	h.handleUseWorldSkill(c, raw)
	if dist(wp.X, wp.Y, 500, 500) > 1 {
		t.Fatalf("teleport should wait for cast, got %f,%f", wp.X, wp.Y)
	}
	if wp.CastingSkillID != game.SkillIDPort {
		t.Fatalf("expected teleport cast, got %q", wp.CastingSkillID)
	}
	h.finishDueWorldCasts(time.Now())
	if dist(wp.X, wp.Y, 500, 500) > 1 {
		t.Fatalf("teleport should not finish early, got %f,%f", wp.X, wp.Y)
	}
	h.finishDueWorldCasts(time.Now().Add(3 * time.Second))
	if dist(wp.X, wp.Y, center.X, center.Y) > 1 {
		t.Fatalf("teleport landed at %f,%f want %f,%f", wp.X, wp.Y, center.X, center.Y)
	}
	if wp.CastingSkillID != "" {
		t.Fatalf("cast should clear after warp, got %q", wp.CastingSkillID)
	}
}

func TestTeleportCancelledByMove(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	sp, center := attuneAndStand(t, h, c, wp)
	raw, _ := json.Marshal(protocol.UseWorldSkillPayload{SkillID: game.SkillIDPort, SavePointID: sp.ID})
	h.handleUseWorldSkill(c, raw)
	move, _ := json.Marshal(protocol.MovePayload{X: 540, Y: 500})
	h.handleMove(c, move)
	if wp.CastingSkillID != "" {
		t.Fatalf("move should cancel teleport, still casting %q", wp.CastingSkillID)
	}
	h.finishDueWorldCasts(time.Now().Add(3 * time.Second))
	if dist(wp.X, wp.Y, center.X, center.Y) < 20 {
		t.Fatalf("cancelled teleport should not warp, got %f,%f", wp.X, wp.Y)
	}
}
