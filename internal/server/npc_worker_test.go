package server

import (
	"testing"
	"time"

	"clara-mundi/internal/game"
)

func adjacentRegionWorld(t *testing.T) (world *game.WorldDefinition, x, y, tileSize float64) {
	t.Helper()
	ow := game.Loaded()
	tileSize = float64(ow.TileSizePx())
	var col, row int
	found := false
	for r := 1; r < ow.Rows-1 && !found; r++ {
		for c := 1; c < ow.Cols-1; c++ {
			x, y = (float64(c)+0.5)*tileSize, (float64(r)+0.5)*tileSize
			if ow.BoundsWalkableAt(x, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH) {
				col, row, found = c, r, true
				break
			}
		}
	}
	if !found {
		t.Fatal("test map has no adjacent walkable tiles")
	}
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "west", MinC: col, MaxC: col, MinR: row, MaxR: row},
		{ID: "east", MinC: col + 1, MaxC: col + 1, MinR: row, MaxR: row},
	})
	if err != nil {
		t.Fatal(err)
	}
	return world, x, y, tileSize
}

func singleRegionWorld(t *testing.T) *game.WorldDefinition {
	t.Helper()
	ow := game.Loaded()
	world, err := game.NewWorldDefinition(ow, []game.Region{{
		ID: "all", MinC: 0, MaxC: ow.Cols - 1, MinR: 0, MaxR: ow.Rows - 1,
	}})
	if err != nil {
		t.Fatal(err)
	}
	return world
}

func TestWorldNPCWorkerOwnsNPCProjection(t *testing.T) {
	h := mustTestHub()
	h.SetWorld("world", "World", singleRegionWorld(t))
	t.Cleanup(h.stopNPCWorkers)

	n := hostileNPC(h, "worker-owned", 500, 500)
	h.tickEntities(time.Now())

	projection := h.entities[n.ID]
	ownerID, owned := h.npcOwners[n.ID]
	if !owned {
		t.Fatal("NPC was not assigned to a region worker")
	}
	if projection == nil || projection == n {
		t.Fatal("hub must retain an NPC projection, not the worker-owned entity")
	}
	worker := h.npcWorkers[ownerID]
	if worker == nil || worker.npcs[n.ID] != n {
		t.Fatal("worker does not own the canonical NPC entity")
	}
}

func TestWorldNPCDamageCommandMutatesWorkerState(t *testing.T) {
	px, py := wildernessXY()
	h, _, player := testHubWithPlayer(t, px, py)
	h.SetWorld("world", "World", singleRegionWorld(t))
	t.Cleanup(h.stopNPCWorkers)

	n := hostileNPC(h, "worker-damage", player.X+10, player.Y)
	before := n.hp
	dealt := h.applyDamage(player, n, 20, basicAttackEvent())
	if dealt <= 0 {
		t.Fatal("worker damage command returned no damage")
	}
	projection := h.entities[n.ID]
	if projection == n {
		t.Fatal("hub stored the worker-owned NPC instead of a projection")
	}
	if projection.hp != before-dealt || n.hp != before-dealt {
		t.Fatalf("npc hp projection=%d worker=%d, want %d", projection.hp, n.hp, before-dealt)
	}
}

func TestWorldNPCStatusCommandMutatesWorkerState(t *testing.T) {
	px, py := wildernessXY()
	h, _, player := testHubWithPlayer(t, px, py)
	h.SetWorld("world", "World", singleRegionWorld(t))
	t.Cleanup(h.stopNPCWorkers)

	n := hostileNPC(h, "worker-status", player.X+10, player.Y)
	h.applyStatuses(player, n, game.Skill{}, game.StatusEffectDef{
		Kind: game.StatusPoison, Duration: 10, Potency: 0.5,
	})
	projection := h.entities[n.ID]
	if len(n.statuses) != 1 || len(projection.statuses) != 1 {
		t.Fatalf("worker/projection statuses = %d/%d, want 1/1", len(n.statuses), len(projection.statuses))
	}
}

func TestWorldNPCDeathAndRewardsAreCommittedByHub(t *testing.T) {
	px, py := wildernessXY()
	h, c, player := testHubWithPlayer(t, px, py)
	h.SetWorld("world", "World", singleRegionWorld(t))
	t.Cleanup(h.stopNPCWorkers)

	n := hostileNPC(h, "worker-death", player.X+10, player.Y)
	if r := respawnOf(n); r != nil {
		r.dropPoolID = ""
	}
	dealt := h.applyDamage(player, n, n.hp+100, basicAttackEvent())
	if dealt <= 0 {
		t.Fatal("fatal worker damage command returned no damage")
	}
	projection := h.entities[n.ID]
	if n.alive || projection.alive || !projection.hidden {
		t.Fatal("worker-owned NPC was not committed as dead and hidden")
	}
	if _, ok := h.npcOwners[n.ID]; !ok {
		t.Fatal("dead NPC lost its worker ownership record")
	}
	if c == nil {
		t.Fatal("test setup did not produce a client")
	}
}

func TestWorldNPCAttackIntentMutatesCanonicalPlayer(t *testing.T) {
	px, py := wildernessXY()
	h, _, player := testHubWithPlayer(t, px, py)
	h.SetWorld("world", "World", singleRegionWorld(t))
	t.Cleanup(h.stopNPCWorkers)

	n := hostileNPC(h, "worker-attack", px+1, py)
	h.engage(n, player)
	if !engagedNPC(n) || !engagedNPC(h.entities[n.ID]) {
		t.Fatal("engage command did not engage the worker-owned NPC")
	}
	n.attackCD = time.Now().Add(-time.Second)
	before := player.hp
	h.tickEntities(time.Now())
	if player.hp >= before {
		t.Fatalf("player hp = %d, want less than %d after NPC attack", player.hp, before)
	}
}

func TestWorldNPCHandoffTransfersCanonicalState(t *testing.T) {
	ow := game.Loaded()
	ts := float64(ow.TileSizePx())
	var col, row int
	found := false
	for r := 1; r < ow.Rows-1 && !found; r++ {
		for c := 1; c < ow.Cols-1; c++ {
			x, y := (float64(c)+0.5)*ts, (float64(r)+0.5)*ts
			if ow.BoundsWalkableAt(x, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH) {
				col, row, found = c, r, true
				break
			}
		}
	}
	if !found {
		t.Fatal("test map has no walkable tile")
	}
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "west", MinC: col, MaxC: col, MinR: row, MaxR: row},
		{ID: "east", MinC: col + 1, MaxC: col + 1, MinR: row, MaxR: row},
	})
	if err != nil {
		t.Fatal(err)
	}
	h := mustTestHub()
	h.SetWorld("world", "World", world)
	t.Cleanup(h.stopNPCWorkers)

	x, y := (float64(col)+0.5)*ts, (float64(row)+0.5)*ts
	home := game.WorldToTile(x, y)
	if h.overworld != nil {
		home = h.overworld.WorldToTile(x, y)
	}
	n := newNPCEntity(game.Patrol{ID: "handoff", Name: "Handoff", Kind: "goblin", Level: 1, Home: home}, game.Region{}, h.overworld)
	n.X, n.Y = x, y
	n.pipeline = []entitySystem{&testRegionMover{targetX: x + ts, targetY: y}}
	h.entities[n.ID] = n
	h.tickEntities(time.Now())

	if h.npcOwners[n.ID] != "east" {
		t.Fatalf("owner after handoff = %q, want east", h.npcOwners[n.ID])
	}
	if h.npcWorkers["west"].npcs[n.ID] != nil {
		t.Fatal("source worker retained NPC after handoff")
	}
	if h.npcWorkers["east"].npcs[n.ID] == nil || h.npcWorkers["east"].npcs[n.ID] == h.entities[n.ID] {
		t.Fatal("destination worker did not receive canonical NPC state")
	}
	if h.entities[n.ID].regionID != "east" {
		t.Fatalf("projection region = %q, want east", h.entities[n.ID].regionID)
	}
}

func TestWorldNPCPackAssistCrossesWorkerBoundary(t *testing.T) {
	world, x, y, ts := adjacentRegionWorld(t)
	h, _, player := testHubWithPlayer(t, x, y)
	h.SetWorld("world", "World", world)
	t.Cleanup(h.stopNPCWorkers)

	west := hostileNPC(h, "west-pack", x, y)
	east := hostileNPC(h, "east-pack", x+ts, y)
	h.tickEntities(time.Now()) // adopt both NPCs into their owning workers
	h.engage(h.ent(west.ID), player)

	if h.npcOwners[west.ID] != "west" || h.npcOwners[east.ID] != "east" {
		t.Fatalf("unexpected owners: west=%q east=%q", h.npcOwners[west.ID], h.npcOwners[east.ID])
	}
	if !engagedNPC(h.ent(east.ID)) {
		t.Fatal("cross-region pack-mate was not engaged through the hub")
	}
	if h.npcWorkers["east"].npcs[east.ID] == nil || !engagedNPC(h.npcWorkers["east"].npcs[east.ID]) {
		t.Fatal("east worker did not own the engaged NPC state")
	}
}

func TestWorldNPCActorRemovalClearsWorkerTarget(t *testing.T) {
	px, py := wildernessXY()
	h, c, player := testHubWithPlayer(t, px, py)
	h.SetWorld("world", "World", singleRegionWorld(t))
	t.Cleanup(h.stopNPCWorkers)

	n := hostileNPC(h, "worker-target", px+1, py)
	h.engage(n, player)
	if n.targetID != player.ID {
		t.Fatal("worker NPC did not acquire the player target")
	}
	h.clearTargeting(c.ID)
	if n.targetID != "" || h.entities[n.ID].targetID != "" {
		t.Fatal("actor removal did not clear worker and projection targets")
	}
}

func TestWorldNPCReseedPreservesWorkerCombatState(t *testing.T) {
	px, py := wildernessXY()
	h, _, player := testHubWithPlayer(t, px, py)
	h.SetWorld("world", "World", singleRegionWorld(t))
	t.Cleanup(h.stopNPCWorkers)
	h.seedNPCs(1)

	var id string
	h.eachEntity(kindNPC, func(e *entity) { id = e.ID })
	if id == "" {
		t.Fatal("no seeded NPC")
	}
	n := h.ent(id)
	h.engage(n, player)
	if dealt := h.applyDamage(player, n, 10, basicAttackEvent()); dealt <= 0 {
		t.Fatal("seeded worker NPC did not take damage")
	}
	oldHP := h.ent(id).hp
	h.reseedNPCsPreservingCombat(1)

	reseeded := h.ent(id)
	if reseeded == nil || !engagedNPC(reseeded) || reseeded.targetID != player.ID || reseeded.hp != oldHP {
		t.Fatalf("worker NPC combat state not preserved: %+v", reseeded)
	}
	ownerID := h.npcOwners[id]
	if h.npcWorkers[ownerID] == nil || h.npcWorkers[ownerID].npcs[id] == nil {
		t.Fatal("reseeded NPC is missing from its worker")
	}
}

func TestNPCWorkerStopIsClean(t *testing.T) {
	h := mustTestHub()
	h.SetWorld("world", "World", singleRegionWorld(t))
	h.ensureNPCWorkers()
	if len(h.npcWorkers) == 0 {
		t.Fatal("world hub did not start NPC workers")
	}
	h.stopNPCWorkers()
	if len(h.npcWorkers) != 0 || len(h.npcOwners) != 0 {
		t.Fatal("worker shutdown left ownership state behind")
	}
}
