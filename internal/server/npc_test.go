package server

import (
	"encoding/json"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
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
	h.store.GetOrCreate("Bartz", game.JobVAN)
	wp := &protocol.WorldPlayer{ID: c.ID, Name: "Bartz", Level: 1, X: x, Y: y}
	h.world[c.ID] = wp
	return h, c, wp
}

// hostileNPC returns a combat-capable overworld foe.
func hostileNPC(id string, x, y float64) *worldNPC {
	return &worldNPC{
		ID: id, Name: "Goblin", Kind: "goblin", Level: 1,
		X: x, Y: y, hp: 50, maxHP: 50,
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

func TestMoveNearNPCPullsAggro(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	h.npcs["npc-1"] = hostileNPC("npc-1", px+aggroRadius-10, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if !h.npcs["npc-1"].Engaged {
		t.Fatal("walking into aggro range should engage the npc")
	}
	if h.npcs["npc-1"].targetID != c.ID {
		t.Fatalf("npc should target the player, got %q", h.npcs["npc-1"].targetID)
	}
	if !wp.InCombat {
		t.Fatal("player should be flagged in combat")
	}
}

func TestMoveFarFromNPCDoesNotAggro(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	h.npcs["npc-1"] = hostileNPC("npc-1", px+300, py+300)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 20, Y: py})
	h.handleMove(c, raw)
	if h.npcs["npc-1"].Engaged || wp.InCombat {
		t.Fatal("distant npc must not engage")
	}
}

func TestEngagedNPCPullsNearbyAllies(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	h.npcs["npc-1"] = hostileNPC("npc-1", px+50, py)
	h.npcs["npc-2"] = hostileNPC("npc-2", px+50+assistRadius-10, py)
	h.npcs["npc-3"] = hostileNPC("npc-3", px+50+assistRadius+80, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 4, Y: py})
	h.handleMove(c, raw)
	if !h.npcs["npc-1"].Engaged {
		t.Fatal("primary npc should engage")
	}
	if !h.npcs["npc-2"].Engaged {
		t.Fatal("nearby ally should assist")
	}
	if h.npcs["npc-3"].Engaged {
		t.Fatal("distant npc must not assist")
	}
}

func TestAttackAggroEngagesNPC(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	n := hostileNPC("npc-1", px+40, py)
	n.patrol.Home = game.WorldToTile(px, py)
	h.npcs[n.ID] = n
	// Attack via the action handler (basic attack, in range).
	raw, _ := json.Marshal(protocol.ActionPayload{
		ActionID: game.BasicAttack.ID, TargetID: n.ID,
	})
	h.handleAction(c, raw)
	if !n.Engaged {
		t.Fatal("attacking an npc should engage it")
	}
	if n.hp >= n.maxHP {
		t.Fatal("attack should have dealt damage")
	}
	if n.contributors[c.ID] <= 0 {
		t.Fatal("attacker should be a damage contributor")
	}
	if !wp.InCombat {
		t.Fatal("attacker should be flagged in combat")
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

func TestBattleImmunityBlocksAggro(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	h.grantBattleImmunity(wp)
	if !battleImmune(wp) {
		t.Fatal("join/defeat/transfer must grant a short invul window")
	}
	if wp.ImmuneUntil < time.Now().Add(4*time.Second).UnixMilli() {
		t.Fatalf("immunity should last about 5s, until %d", wp.ImmuneUntil)
	}
	h.npcs["npc-1"] = hostileNPC("npc-1", px+10, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if h.npcs["npc-1"].Engaged || wp.InCombat {
		t.Fatal("immune player must not pull aggro")
	}
}

func TestExpiredImmunityAllowsAggro(t *testing.T) {
	px, py := wildernessXY()
	h, c, wp := testHubWithPlayer(t, px, py)
	wp.ImmuneUntil = time.Now().Add(-time.Second).UnixMilli()
	h.npcs["npc-1"] = hostileNPC("npc-1", px+10, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if !h.npcs["npc-1"].Engaged {
		t.Fatal("expired invul should not block aggro")
	}
}

func TestMapTransferGrantsImmunity(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	h.store.GetOrCreate("Bartz", game.JobVAN)
	px, py := wildernessXY()
	c := &Client{
		ID:          "xfer-1",
		Send:        make(chan []byte, 16),
		Hub:         h,
		UseSpawn:    true,
		SpawnX:      px,
		SpawnY:      py,
		SpawnFacing: game.FacingYawEast,
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
	h.npcs["npc-1"] = hostileNPC("npc-1", px+aggroRadius-4, py)
	h.tickNPCs()
	if h.npcs["npc-1"].Engaged || wp.InCombat {
		t.Fatal("an npc near an immune player must not engage")
	}
}

func TestNPCTickSkipsInHousePlayer(t *testing.T) {
	px, py := wildernessXY()
	h, _, wp := testHubWithPlayer(t, px, py)
	wp.InHouse = true
	h.npcs["npc-1"] = hostileNPC("npc-1", px+aggroRadius-4, py)
	h.tickNPCs()
	if h.npcs["npc-1"].Engaged || wp.InCombat {
		t.Fatal("npcs must not engage players who are inside a house")
	}
}

func TestKillNPCDespawnsUntilSpawnWindow(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	n := hostileNPC("g1", px+10, py)
	n.patrol = game.NPCPatrols[0]
	n.patrol.Home = game.WorldToTile(px, py)
	h.npcs[n.ID] = n

	h.engageNPC(n, c.ID)
	n.hp = 0
	h.killNPC(n, c.ID)

	if n.onWorld() || hasWorldNPC(h, "g1") {
		t.Fatal("dead npc must vanish from the map")
	}
	if n.Engaged {
		t.Fatal("dead npc must disengage")
	}
	if n.respawnAt.IsZero() {
		t.Fatal("kill should schedule a respawn")
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
	home := game.TileCenter(n.patrol.Home)
	if dist(n.X, n.Y, home.X, home.Y) > 1 {
		t.Fatalf("respawn should start at patrol home, got %f,%f", n.X, n.Y)
	}
	if n.hp != n.maxHP {
		t.Fatal("respawned npc should be at full hp")
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

func TestNPCNearPlayerEngages(t *testing.T) {
	px, py := wildernessXY()
	h, _, wp := testHubWithPlayer(t, px, py)
	h.npcs["npc-1"] = hostileNPC("npc-1", px+aggroRadius-4, py)
	h.tickNPCs()
	if !h.npcs["npc-1"].Engaged || !wp.InCombat {
		t.Fatal("an npc next to a player should engage on the npc tick")
	}
}
