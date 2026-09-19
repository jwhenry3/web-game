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

// ---- singular-world scoping ----

// mustWorldHub builds a hub in singular-world ownership mode over the loaded
// overworld, mirroring mapnode.StartWorld.
func mustWorldHub(t *testing.T) *Hub {
	t.Helper()
	world, err := game.NewWorldDefinition(game.Loaded(), nil)
	if err != nil {
		t.Fatal(err)
	}
	h := mustTestHub()
	h.SetWorld("world", "World", world)
	return h
}

// boundsWalkableXY finds a point passing the player's bounds-walkability check
// that is far from the default spawn, so resume-vs-fallback is observable.
func boundsWalkableXY(t *testing.T, ow *game.Overworld) (float64, float64) {
	t.Helper()
	ts := float64(ow.TileSizePx())
	sx, sy := ow.SpawnPosition("")
	for r := ow.Rows - 2; r >= 2; r-- {
		for c := ow.Cols - 2; c >= 2; c-- {
			x, y := (float64(c)+0.5)*ts, (float64(r)+0.5)*ts
			if dist(x, y, sx, sy) < 4 {
				continue
			}
			if ow.CircleWalkableAt(x, y, game.PlayerCollisionRadius) {
				return x, y
			}
		}
	}
	t.Fatal("no walkable point away from spawn")
	return 0, 0
}

// joinWorldClient runs the join handshake for an existing profile.
func joinWorldClient(h *Hub, id, name string) *Client {
	c := &Client{ID: id, Send: make(chan []byte, 64), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: name})
	h.handleJoinWorld(c, raw)
	return c
}

func TestWorldModeSavePointWarpNeverTransfers(t *testing.T) {
	h := mustWorldHub(t)
	if len(h.overworld.SavePoints) == 0 {
		t.Fatal("world has no save points")
	}
	sp := h.overworld.SavePoints[0]
	// Simulate the cluster registry mapping the crystal to another map — the
	// local world copy must still win.
	game.RegisterSavePoints("elsewhere", "Elsewhere", h.overworld.SavePoints)
	defer game.RegisterSavePoints("world", "World", h.overworld.SavePoints)

	c, pe := addWorldClient(h, "client-1", "Bartz", 400, 400)
	transfers := 0
	h.OnTransfer = func(string, TransferDest) { transfers++ }

	if !h.warpToSavePoint(c, pe, sp.ID, "") {
		t.Fatal("warpToSavePoint failed")
	}
	if transfers != 0 {
		t.Fatalf("world-mode save point triggered %d transfers", transfers)
	}
	center := game.TileCenter(sp.Tile)
	if dist(pe.X, pe.Y, center.X, center.Y) > 1 {
		t.Fatalf("warp landed at %f,%f want %f,%f", pe.X, pe.Y, center.X, center.Y)
	}
}

func TestWorldModeForeignSavePointRejected(t *testing.T) {
	h := mustWorldHub(t)
	// A crystal that only exists in the cluster registry under another map is
	// not a valid destination in singular-world mode — save points are
	// world-scoped, so it must not transfer.
	game.RegisterSavePoints("far", "Far Away", []game.SavePoint{{ID: "far-crystal", Name: "Far", Tile: game.Tile{C: 2, R: 2}}})
	defer game.UnregisterSavePointsForMap("far")

	c, pe := addWorldClient(h, "client-1", "Bartz", 400, 400)
	transfers := 0
	h.OnTransfer = func(string, TransferDest) { transfers++ }

	if h.warpToSavePoint(c, pe, "far-crystal", "") {
		t.Fatal("foreign save point should not resolve in world mode")
	}
	if transfers != 0 {
		t.Fatalf("world mode invoked %d transfers", transfers)
	}
	if dist(pe.X, pe.Y, 400, 400) > 1 {
		t.Fatalf("entity moved to %f,%f", pe.X, pe.Y)
	}
}

func TestLegacyMapSavePointTransferViaRegistry(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	game.RegisterSavePoints("far", "Far Away", []game.SavePoint{{ID: "far-crystal", Name: "Far", Tile: game.Tile{C: 2, R: 2}}})
	defer game.UnregisterSavePointsForMap("far")

	c, pe := addWorldClient(h, "client-1", "Bartz", 400, 400)
	transfers := 0
	var dest TransferDest
	h.OnTransfer = func(_ string, d TransferDest) { transfers++; dest = d }

	if !h.warpToSavePoint(c, pe, "far-crystal", "") {
		t.Fatal("registered foreign save point should resolve")
	}
	if transfers != 1 {
		t.Fatalf("expected 1 transfer, got %d", transfers)
	}
	if dest.Map != "far" {
		t.Fatalf("transfer dest = %q, want far", dest.Map)
	}
	want := game.TileCenter(game.Tile{C: 2, R: 2})
	if dest.X != want.X || dest.Y != want.Y {
		t.Fatalf("transfer coords = %f,%f want %f,%f", dest.X, dest.Y, want.X, want.Y)
	}
}

func TestLegacyMapLocalSavePointBeatsRegistry(t *testing.T) {
	h := mustTestHub()
	ow := game.Loaded()
	h.SetMap("greenwood", "Greenwood", ow)
	if len(ow.SavePoints) == 0 {
		t.Fatal("no save points")
	}
	sp := ow.SavePoints[0]
	// Registry claims this crystal belongs to another map; the crystal on this
	// map must still resolve locally.
	game.RegisterSavePoints("far", "Far Away", ow.SavePoints)
	defer game.RegisterSavePoints("greenwood", "Greenwood", ow.SavePoints)

	c, pe := addWorldClient(h, "client-1", "Bartz", 400, 400)
	transfers := 0
	h.OnTransfer = func(string, TransferDest) { transfers++ }

	if !h.warpToSavePoint(c, pe, sp.ID, "") {
		t.Fatal("warpToSavePoint failed")
	}
	if transfers != 0 {
		t.Fatalf("local save point triggered %d transfers", transfers)
	}
	center := game.TileCenter(sp.Tile)
	if dist(pe.X, pe.Y, center.X, center.Y) > 1 {
		t.Fatalf("warp landed at %f,%f want %f,%f", pe.X, pe.Y, center.X, center.Y)
	}
}

func TestWorldModeDisconnectPersistsWorldID(t *testing.T) {
	h := mustWorldHub(t)
	c, pe := addWorldClient(h, "client-1", "Bartz", 480, 520)
	pe.Facing = game.FacingYawEast
	h.handleDisconnect(c)

	profile, ok := h.store.Get("Bartz")
	if !ok || !profile.HasWorldPos {
		t.Fatal("expected persisted world position")
	}
	if profile.WorldID != "world" {
		t.Fatalf("WorldID = %q, want world", profile.WorldID)
	}
	if profile.MapID != "" || profile.PrevMapID != "" {
		t.Fatalf("world mode churned map fields: MapID=%q PrevMapID=%q", profile.MapID, profile.PrevMapID)
	}
	if dist(profile.WorldX, profile.WorldY, 480, 520) > 1 {
		t.Fatalf("pos %f,%f", profile.WorldX, profile.WorldY)
	}
}

func TestWorldModeJoinResumesByWorldID(t *testing.T) {
	h := mustWorldHub(t)
	wx, wy := boundsWalkableXY(t, h.overworld)
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	if _, ok := h.store.SetWorldLocationInWorld(profile.Name, "world", wx, wy, game.FacingYawWest, true); !ok {
		t.Fatal("SetWorldLocationInWorld failed")
	}
	// A stale legacy map id must not veto resuming inside the world.
	if _, ok := h.store.SetMapID(profile.Name, "greenwood"); !ok {
		t.Fatal("SetMapID failed")
	}

	c := joinWorldClient(h, "client-1", "Bartz")
	pe := h.playerEnt(c.ID)
	if pe == nil {
		t.Fatal("expected world player")
	}
	if dist(pe.X, pe.Y, wx, wy) > 1 {
		t.Fatalf("resumed at %f,%f want %f,%f", pe.X, pe.Y, wx, wy)
	}
}

func TestWorldModeJoinIgnoresForeignWorldPos(t *testing.T) {
	h := mustWorldHub(t)
	wx, wy := boundsWalkableXY(t, h.overworld)
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	if _, ok := h.store.SetWorldLocationInWorld(profile.Name, "other-world", wx, wy, 0, true); !ok {
		t.Fatal("SetWorldLocationInWorld failed")
	}

	c := joinWorldClient(h, "client-1", "Bartz")
	pe := h.playerEnt(c.ID)
	if pe == nil {
		t.Fatal("expected world player")
	}
	if dist(pe.X, pe.Y, wx, wy) <= 1 {
		t.Fatalf("resumed foreign-world position %f,%f", pe.X, pe.Y)
	}
}

func TestWorldModeJoinResumesLegacyMapIDPos(t *testing.T) {
	h := mustWorldHub(t)
	wx, wy := boundsWalkableXY(t, h.overworld)
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	// Pre-WorldID world-mode profiles stored the world id in MapID.
	if _, ok := h.store.SetWorldLocation(profile.Name, "world", wx, wy, 0, true); !ok {
		t.Fatal("SetWorldLocation failed")
	}

	c := joinWorldClient(h, "client-1", "Bartz")
	pe := h.playerEnt(c.ID)
	if pe == nil {
		t.Fatal("expected world player")
	}
	if dist(pe.X, pe.Y, wx, wy) > 1 {
		t.Fatalf("resumed at %f,%f want %f,%f", pe.X, pe.Y, wx, wy)
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
