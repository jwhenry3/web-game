package server

import (
	"encoding/json"
	"testing"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

// wildernessXY is a walkable point outside any sanctuary on the loaded map.
func wildernessXY() (float64, float64) {
	ow := game.Loaded()
	if ow == nil {
		return 2000, 700
	}
	for r := 10; r < ow.Rows-10; r++ {
		for c := int(float64(ow.Cols) * 0.55); c < ow.Cols-10; c++ {
			if ow.WalkableTile(c, r) && !ow.SanctuaryAt(c, r) {
				center := ow.TileCenter(game.Tile{C: c, R: r})
				return center.X, center.Y
			}
		}
	}
	return 2000, 700
}

func testHubWithPlayer(t *testing.T, x, y float64) (*Hub, *Client, *protocol.WorldPlayer) {
	t.Helper()
	h := mustTestHub()
	c := &Client{
		ID:     "client-1",
		Name:   "Bartz",
		Joined: true,
		Send:   make(chan []byte, 256),
		Hub:    h,
	}
	h.clients[c.ID] = c
	h.store.GetOrCreate("Bartz", game.JobWAR)
	wp := &protocol.WorldPlayer{ID: c.ID, Name: "Bartz", Level: 1, X: x, Y: y}
	h.world[c.ID] = wp
	return h, c, wp
}

func TestWithinEngageRange(t *testing.T) {
	if !withinEngageRange(100, 100, 100+engageRangePx(), 100) {
		t.Fatal("edge of radius should engage")
	}
	if withinEngageRange(100, 100, 100+engageRangePx()+1, 100) {
		t.Fatal("outside radius must not engage")
	}
}

func TestClampMoveRejectsTeleport(t *testing.T) {
	h := mustTestHub()
	x0, y0 := wildernessXY()
	x, y := h.clampMove(x0, y0, x0+800, y0+800)
	if dist(x0, y0, x, y) > maxMoveStep+0.01 {
		t.Fatalf("teleport must be clamped, moved %f", dist(x0, y0, x, y))
	}
}

func TestMoveOntoNPCStartsBattle(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: px + 10, Y: py}
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if !wp.InBattle || wp.BattleID == "" {
		t.Fatalf("collision should lock the player into a battle, got %+v", wp)
	}
	if !h.combat.RoomExists(wp.BattleID) {
		t.Fatal("expected combat room")
	}
	npc := h.npcs["npc-1"]
	if !npc.InBattle || npc.BattleID != wp.BattleID {
		t.Fatalf("npc should be bound to the same room: %+v", npc)
	}
	if npc.onWorld() || hasWorldNPC(h, "npc-1") {
		t.Fatal("engaged npc must despawn from the world map")
	}
	h.combat.CloseRoom(wp.BattleID)
}

func TestMoveFarFromNPCDoesNotStartBattle(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: px + 300, Y: py + 300}
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 20, Y: py})
	h.handleMove(c, raw)
	if wp.InBattle {
		t.Fatal("distant npc must not start a battle")
	}
	if wp.BattleID != "" {
		t.Fatal("no room should exist")
	}
}

func TestLockedPlayerDoesNotReengage(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	wp.InBattle = true
	wp.BattleID = "existing-battle"
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: px, Y: py}
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 2, Y: py})
	h.handleMove(c, raw)
	if wp.BattleID != "existing-battle" {
		t.Fatal("combat-locked players cannot start another battle")
	}
}

func TestSeededNPCsStayInRegion(t *testing.T) {
	h := mustTestHub()
	h.seedNPCs(12)
	if len(h.npcs) != 12 {
		t.Fatalf("expected 12 patrolling npcs, got %d", len(h.npcs))
	}
	for i := 0; i < 80; i++ {
		h.tickNPCs()
	}
	for _, n := range h.npcs {
		tile := game.WorldToTile(n.X, n.Y)
		if !n.region.Contains(tile.C, tile.R) {
			t.Errorf("%s left region %s at %v", n.ID, n.region.ID, tile)
		}
		if !game.WalkableAt(n.X, n.Y) {
			t.Errorf("%s stood on blocked terrain at %v", n.ID, tile)
		}
	}
}

func TestReleaseFromBattleGrantsImmunity(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	c.BattleID = "battle-1"
	wp.InBattle = true
	wp.BattleID = "battle-1"
	h.releaseFromBattle(c.ID)
	if wp.InBattle {
		t.Fatal("player should be unlocked")
	}
	if !battleImmune(wp) {
		t.Fatal("win/defeat/leave must grant a short invul window")
	}
	if wp.ImmuneUntil < time.Now().Add(4*time.Second).UnixMilli() {
		t.Fatalf("immunity should last about 5s, until %d", wp.ImmuneUntil)
	}

	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: px + 10, Y: py}
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if wp.InBattle || wp.BattleID != "" {
		t.Fatal("immune player must not start a battle by walking onto an npc")
	}
}

func TestExpiredImmunityAllowsBattle(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	wp.ImmuneUntil = time.Now().Add(-time.Second).UnixMilli()
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: px + 10, Y: py}
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if !wp.InBattle {
		t.Fatal("expired invul should not block collision")
	}
	h.combat.CloseRoom(wp.BattleID)
}

func TestReturnToWorldRefreshesImmunity(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	wp.ImmuneUntil = time.Now().Add(-time.Second).UnixMilli()
	h.handleLeaveBattleReleased(c)
	if !battleImmune(wp) {
		t.Fatal("Return to World after a finished fight should refresh invul")
	}
}

func TestMapTransferGrantsImmunity(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	h.store.GetOrCreate("Bartz", game.JobWAR)
	px, py := wildernessXY()
	c := &Client{
		ID:          "xfer-1",
		Send:        make(chan []byte, 16),
		Hub:         h,
		UseSpawn:    true,
		SpawnX:      px,
		SpawnY:      py,
		SpawnFacing: "right",
	}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Bartz"})
	h.handleJoinWorld(c, raw)
	wp := h.world[c.ID]
	if wp == nil {
		t.Fatal("expected world player after transfer join")
	}
	if !battleImmune(wp) {
		t.Fatal("map transfer should grant 5s invulnerability")
	}
}

func TestNPCTickSkipsImmunePlayer(t *testing.T) {
	px, py := wildernessXY()
	h, _, wp := testHubWithPlayer(t, px, py)
	wp.ImmuneUntil = time.Now().Add(5 * time.Second).UnixMilli()
	h.npcs["npc-1"] = &worldNPC{
		ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1,
		X: px + engageRangePx() - 4, Y: py,
		path: []game.Vec2{{X: px, Y: py}},
	}
	h.tickNPCs()
	if wp.InBattle {
		t.Fatal("an npc walking onto an immune player must not start a battle")
	}
}

func TestNPCDespawnsUntilSpawnWindow(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	h.npcs["g1"] = &worldNPC{
		ID: "g1", Name: "Goblin", Kind: "goblin", Level: 1,
		X: px + 10, Y: py,
		patrol: game.NPCPatrols[0],
	}
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if !wp.InBattle {
		t.Fatal("expected a battle")
	}
	if hasWorldNPC(h, "g1") {
		t.Fatal("npc should vanish from the map when the fight starts")
	}

	h.combat.CloseRoom(wp.BattleID)
	h.releaseNPCs(wp.BattleID)
	n := h.npcs["g1"]
	if n.onWorld() || hasWorldNPC(h, "g1") {
		t.Fatal("npc must stay hidden after the fight until its spawn window")
	}
	if n.respawnAt.IsZero() {
		t.Fatal("release should schedule a respawn from SpawnWindows")
	}
	want := time.Now().Add(game.DefaultRespawn)
	if n.respawnAt.Before(want.Add(-time.Second)) || n.respawnAt.After(want.Add(time.Second)) {
		t.Fatalf("respawn window should be ~60s, got %s from now", time.Until(n.respawnAt))
	}

	h.tickNPCs()
	if n.onWorld() {
		t.Fatal("should not respawn before the window")
	}

	n.respawnAt = time.Now().Add(-time.Millisecond)
	h.tickNPCs()
	if !n.onWorld() || !hasWorldNPC(h, "g1") {
		t.Fatal("npc should return to the map after the spawn window")
	}
	home := game.TileCenter(game.NPCPatrols[0].Home)
	if dist(n.X, n.Y, home.X, home.Y) > 1 {
		t.Fatalf("respawn should start at patrol home, got %f,%f", n.X, n.Y)
	}
}

func hasWorldNPC(h *Hub, id string) bool {
	for _, n := range h.worldNPCs() {
		if n.ID == id {
			return true
		}
	}
	return false
}

func TestNPCTickWalksIntoPlayer(t *testing.T) {
	px, py := wildernessXY()
	h, _, wp := testHubWithPlayer(t, px, py)
	h.npcs["npc-1"] = &worldNPC{
		ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1,
		X: px + engageRangePx() - 4, Y: py,
		path: []game.Vec2{{X: px, Y: py}},
	}
	h.tickNPCs()
	if !wp.InBattle {
		t.Fatal("an npc walking onto a player should start a battle")
	}
	h.combat.CloseRoom(wp.BattleID)
}
