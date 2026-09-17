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

// testHubWithPlayer builds a hub with one joined client whose player entity
// stands at (x, y). The returned entity replaces the old *protocol.WorldPlayer.
func testHubWithPlayer(t *testing.T, x, y float64) (*Hub, *Client, *entity) {
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
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	e := h.ensurePlayer(c)
	if e == nil {
		t.Fatal("ensurePlayer returned nil for a joined client")
	}
	e.X, e.Y = x, y
	h.applyProfilePresence(e, profile)
	return h, c, e
}

// wanderOf returns the entity's wander plugin, or nil.
func wanderOf(e *entity) *wander {
	var w *wander
	if e != nil && e.plugin(&w) {
		return w
	}
	return nil
}

// hostileNPC registers a combat-capable overworld foe at (x, y), parked on a
// long idle so wander can't interfere with the test.
func hostileNPC(h *Hub, id string, x, y float64) *entity {
	home := game.WorldToTile(x, y)
	if h.overworld != nil {
		home = h.overworld.WorldToTile(x, y)
	}
	p := game.Patrol{ID: id, Name: "Goblin", Kind: "goblin", Level: 1, Home: home}
	n := newNPCEntity(p, game.Region{}, h.overworld)
	n.X, n.Y = x, y
	n.hp, n.maxHP = 50, 50
	n.Faction = factionHostile
	if w := wanderOf(n); w != nil {
		w.idleUntil = time.Now().Add(time.Hour)
	}
	h.entities[n.ID] = n
	return n
}

// npcSetHome moves a foe's patrol home (respawn point and leash fallback).
func npcSetHome(h *Hub, n *entity, x, y float64) {
	w := wanderOf(n)
	if w == nil {
		return
	}
	if h.overworld != nil {
		w.patrol.Home = h.overworld.WorldToTile(x, y)
	} else {
		w.patrol.Home = game.WorldToTile(x, y)
	}
}

// npcEngaged reports the wire Engaged flag for a foe.
func npcEngaged(n *entity) bool {
	ng := npcEngageOf(n)
	return ng != nil && ng.engaged
}

// hasWorldNPC reports whether an on-world NPC with the given ID exists.
func hasWorldNPC(h *Hub, id string) bool {
	e := h.ent(id)
	return e != nil && e.Kind == kindNPC && e.onWorld()
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
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+aggroRadius-10, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if !npcEngaged(n) {
		t.Fatal("walking into aggro range should engage the npc")
	}
	if n.targetID != c.ID {
		t.Fatalf("npc should target the player, got %q", n.targetID)
	}
	if !clientControlOf(pe).inCombat {
		t.Fatal("player should be flagged in combat")
	}
}

func TestMoveFarFromNPCDoesNotAggro(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+300, py+300)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 20, Y: py})
	h.handleMove(c, raw)
	if npcEngaged(n) || clientControlOf(pe).inCombat {
		t.Fatal("distant npc must not engage")
	}
}

func TestEngagedNPCPullsNearbyAllies(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	n1 := hostileNPC(h, "npc-1", px+50, py)
	n2 := hostileNPC(h, "npc-2", px+50+assistRadius-10, py)
	n3 := hostileNPC(h, "npc-3", px+50+assistRadius+80, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 4, Y: py})
	h.handleMove(c, raw)
	if !npcEngaged(n1) {
		t.Fatal("primary npc should engage")
	}
	if !npcEngaged(n2) {
		t.Fatal("nearby ally should assist")
	}
	if npcEngaged(n3) {
		t.Fatal("distant npc must not assist")
	}
}

func TestAttackAggroEngagesNPC(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	// Attack via the action handler (basic attack, in range).
	raw, _ := json.Marshal(protocol.ActionPayload{
		ActionID: game.BasicAttack.ID, TargetID: n.ID,
	})
	h.handleAction(c, raw)
	if !npcEngaged(n) {
		t.Fatal("attacking an npc should engage it")
	}
	if n.hp >= n.maxHP {
		t.Fatal("attack should have dealt damage")
	}
	if n.contributors[c.ID] <= 0 {
		t.Fatal("attacker should be a damage contributor")
	}
	if !clientControlOf(pe).inCombat {
		t.Fatal("attacker should be flagged in combat")
	}
}

func TestSeededNPCsStayInRegion(t *testing.T) {
	h := mustTestHub()
	h.seedNPCs(12)
	count := 0
	h.eachEntity(kindNPC, func(*entity) { count++ })
	if count != 12 {
		t.Fatalf("expected 12 patrolling npcs, got %d", count)
	}
	// Force a wander step per call: dt=npcTickSec trips the accumulator, and a
	// past idle deadline keeps step() moving instead of waiting out the idle.
	for i := 0; i < 80; i++ {
		h.eachEntity(kindNPC, func(e *entity) {
			w := wanderOf(e)
			if w == nil {
				return
			}
			w.idleUntil = time.Now().Add(-time.Second)
			w.Tick(h, e, time.Now(), npcTickSec)
		})
	}
	h.eachEntity(kindNPC, func(e *entity) {
		w := wanderOf(e)
		if w == nil {
			return
		}
		tile := game.WorldToTile(e.X, e.Y)
		if h.overworld != nil {
			tile = h.overworld.WorldToTile(e.X, e.Y)
		}
		if !w.region.Contains(tile.C, tile.R) {
			t.Errorf("%s left region %s at %v", e.ID, w.region.ID, tile)
		}
		if !h.walkableAt(e.X, e.Y) {
			t.Errorf("%s stood on blocked terrain at %v", e.ID, tile)
		}
	})
}

func TestBattleImmunityBlocksAggro(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)
	h.grantBattleImmunity(pe)
	if !battleImmuneEnt(pe) {
		t.Fatal("join/defeat/transfer must grant a short invul window")
	}
	if cc.immuneUntil < time.Now().Add(4*time.Second).UnixMilli() {
		t.Fatalf("immunity should last about 5s, until %d", cc.immuneUntil)
	}
	n := hostileNPC(h, "npc-1", px+10, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if npcEngaged(n) || cc.inCombat {
		t.Fatal("immune player must not pull aggro")
	}
}

func TestExpiredImmunityAllowsAggro(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	clientControlOf(pe).immuneUntil = time.Now().Add(-time.Second).UnixMilli()
	n := hostileNPC(h, "npc-1", px+10, py)
	raw, _ := json.Marshal(protocol.MovePayload{X: px + 8, Y: py})
	h.handleMove(c, raw)
	if !npcEngaged(n) {
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
	e := h.playerEnt(c.ID)
	if e == nil {
		t.Fatal("expected world player after transfer join")
	}
	if !battleImmuneEnt(e) {
		t.Fatal("map transfer should grant 5s invulnerability")
	}
}

func TestNPCTickSkipsImmunePlayer(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)
	cc.immuneUntil = time.Now().Add(5 * time.Second).UnixMilli()
	n := hostileNPC(h, "npc-1", px+aggroRadius-4, py)
	// Run long enough for the proximity-aggro scan (npcTickSec cadence) to fire.
	for i := 0; i < 6; i++ {
		h.tickEntities(time.Now())
	}
	if npcEngaged(n) || cc.inCombat {
		t.Fatal("an npc near an immune player must not engage")
	}
}

func TestNPCTickSkipsInHousePlayer(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)
	// In-house players are hidden from the world; set both so the flag holds
	// regardless of which entity the tick visits first.
	cc.inHouse = true
	pe.hidden = true
	n := hostileNPC(h, "npc-1", px+aggroRadius-4, py)
	for i := 0; i < 6; i++ {
		h.tickEntities(time.Now())
	}
	if npcEngaged(n) || cc.inCombat {
		t.Fatal("npcs must not engage players who are inside a house")
	}
}

func TestKillNPCDespawnsUntilSpawnWindow(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "g1", px+10, py)
	npcSetHome(h, n, px, py)

	h.engage(n, h.playerEnt(c.ID))
	n.hp = 0
	h.kill(n, h.playerEnt(c.ID))

	if n.onWorld() || hasWorldNPC(h, "g1") {
		t.Fatal("dead npc must vanish from the map")
	}
	if npcEngaged(n) {
		t.Fatal("dead npc must disengage")
	}
	r := respawnOf(n)
	if r == nil || r.respawnAt.IsZero() {
		t.Fatal("kill should schedule a respawn")
	}

	h.tickEntities(time.Now())
	if n.onWorld() {
		t.Fatal("should not respawn before the window")
	}

	r.respawnAt = time.Now().Add(-time.Millisecond)
	h.tickEntities(time.Now())
	if !n.onWorld() || !hasWorldNPC(h, "g1") {
		t.Fatal("npc should return to the map after the spawn window")
	}
	home := game.TileCenter(wanderOf(n).patrol.Home)
	if dist(n.X, n.Y, home.X, home.Y) > 1 {
		t.Fatalf("respawn should start at patrol home, got %f,%f", n.X, n.Y)
	}
	if n.hp != n.maxHP {
		t.Fatal("respawned npc should be at full hp")
	}
}

func TestNPCNearPlayerEngages(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+aggroRadius-4, py)
	// Proximity aggro scans on the legacy npcTickSec cadence (~5 entity ticks).
	for i := 0; i < 6 && !npcEngaged(n); i++ {
		h.tickEntities(time.Now())
	}
	if !npcEngaged(n) || !clientControlOf(pe).inCombat {
		t.Fatal("an npc next to a player should engage on the npc tick")
	}
}
