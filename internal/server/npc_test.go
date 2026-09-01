package server

import (
	"encoding/json"
	"testing"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

func testHubWithPlayer(t *testing.T, x, y float64) (*Hub, *Client, *protocol.WorldPlayer) {
	t.Helper()
	h := NewHub(store.Load(""), nil, nil)
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
	if !withinEngageRange(100, 100, 100+engageRange, 100) {
		t.Fatal("edge of radius should engage")
	}
	if withinEngageRange(100, 100, 100+engageRange+1, 100) {
		t.Fatal("outside radius must not engage")
	}
}

func TestClampMoveRejectsTeleport(t *testing.T) {
	h := NewHub(store.Load(""), nil, nil)
	x, y := h.clampMove(200, 200, 800, 800)
	if dist(200, 200, x, y) > maxMoveStep+0.01 {
		t.Fatalf("teleport must be clamped, moved %f", dist(200, 200, x, y))
	}
}

func TestMoveOntoNPCStartsBattle(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: 410, Y: 400}
	raw, _ := json.Marshal(protocol.MovePayload{X: 408, Y: 400})
	h.handleMove(c, raw)
	if !wp.InBattle || wp.BattleID == "" {
		t.Fatalf("collision should lock the player into a battle, got %+v", wp)
	}
	if len(h.battles) != 1 {
		t.Fatalf("expected one room, got %d", len(h.battles))
	}
	npc := h.npcs["npc-1"]
	if !npc.InBattle || npc.BattleID != wp.BattleID {
		t.Fatalf("npc should be bound to the same room: %+v", npc)
	}
	if npc.onWorld() || hasWorldNPC(h, "npc-1") {
		t.Fatal("engaged npc must despawn from the world map")
	}
	if room := h.battles[wp.BattleID]; room != nil {
		room.Close()
	}
}

func TestMoveFarFromNPCDoesNotStartBattle(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: 700, Y: 700}
	raw, _ := json.Marshal(protocol.MovePayload{X: 420, Y: 400})
	h.handleMove(c, raw)
	if wp.InBattle {
		t.Fatal("distant npc must not start a battle")
	}
	if len(h.battles) != 0 {
		t.Fatal("no room should exist")
	}
}

func TestLockedPlayerDoesNotReengage(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	wp.InBattle = true
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: 400, Y: 400}
	raw, _ := json.Marshal(protocol.MovePayload{X: 402, Y: 400})
	h.handleMove(c, raw)
	if len(h.battles) != 0 {
		t.Fatal("combat-locked players cannot start another battle")
	}
}

func TestSeededNPCsStayInRegion(t *testing.T) {
	h := NewHub(store.Load(""), nil, nil)
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
	h, c, wp := testHubWithPlayer(t, 400, 400)
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

	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: 410, Y: 400}
	raw, _ := json.Marshal(protocol.MovePayload{X: 408, Y: 400})
	h.handleMove(c, raw)
	if wp.InBattle || len(h.battles) != 0 {
		t.Fatal("immune player must not start a battle by walking onto an npc")
	}
}

func TestExpiredImmunityAllowsBattle(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	wp.ImmuneUntil = time.Now().Add(-time.Second).UnixMilli()
	h.npcs["npc-1"] = &worldNPC{ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1, X: 410, Y: 400}
	raw, _ := json.Marshal(protocol.MovePayload{X: 408, Y: 400})
	h.handleMove(c, raw)
	if !wp.InBattle {
		t.Fatal("expired invul should not block collision")
	}
	if room := h.battles[wp.BattleID]; room != nil {
		room.Close()
	}
}

func TestReturnToWorldRefreshesImmunity(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	wp.ImmuneUntil = time.Now().Add(-time.Second).UnixMilli()
	h.handleLeaveBattle(c)
	if !battleImmune(wp) {
		t.Fatal("Return to World after a finished fight should refresh invul")
	}
}

func TestNPCTickSkipsImmunePlayer(t *testing.T) {
	h, _, wp := testHubWithPlayer(t, 500, 500)
	wp.ImmuneUntil = time.Now().Add(5 * time.Second).UnixMilli()
	h.npcs["npc-1"] = &worldNPC{
		ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1,
		X: 500 + engageRange - 4, Y: 500,
		path: []game.Vec2{{X: 500, Y: 500}},
	}
	h.tickNPCs()
	if wp.InBattle {
		t.Fatal("an npc walking onto an immune player must not start a battle")
	}
}

func TestNPCDespawnsUntilSpawnWindow(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	h.npcs["g1"] = &worldNPC{
		ID: "g1", Name: "Goblin", Kind: "goblin", Level: 1,
		X: 410, Y: 400,
		patrol: game.NPCPatrols[0],
	}
	raw, _ := json.Marshal(protocol.MovePayload{X: 408, Y: 400})
	h.handleMove(c, raw)
	if !wp.InBattle {
		t.Fatal("expected a battle")
	}
	if hasWorldNPC(h, "g1") {
		t.Fatal("npc should vanish from the map when the fight starts")
	}

	room := h.battles[wp.BattleID]
	h.releaseNPCs(wp.BattleID)
	if room != nil {
		room.Close()
	}
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
	home := game.TileCenter(game.NPCPatrols[0].Loop[0])
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
	h, _, wp := testHubWithPlayer(t, 500, 500)
	h.npcs["npc-1"] = &worldNPC{
		ID: "npc-1", Name: "Goblin", Kind: "goblin", Level: 1,
		X: 500 + engageRange - 4, Y: 500,
		path: []game.Vec2{{X: 500, Y: 500}},
	}
	h.tickNPCs()
	if !wp.InBattle {
		t.Fatal("an npc walking onto a player should start a battle")
	}
	if room := h.battles[wp.BattleID]; room != nil {
		room.Close()
	}
}
