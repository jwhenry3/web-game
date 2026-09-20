package server

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// houseHubForTest builds a hub running the generated house instance for a
// transfer spec, sharing the world hub's profile store.
func houseHubForTest(t *testing.T, src *Hub, spec *HouseSpec) *Hub {
	t.Helper()
	hh := mustTestHub()
	hh.store = src.store
	hh.SetMap(HouseMapID(spec.Owner), "House", game.NewHouseOverworld())
	hh.SetHouseContext(&HouseContext{
		Owner:     spec.Owner,
		Skin:      spec.Skin,
		ReturnMap: spec.ReturnMap,
		ReturnX:   spec.ReturnX,
		ReturnY:   spec.ReturnY,
	})
	return hh
}

// joinHouseClient simulates the proxy's attach + join_world replay onto a
// house instance hub.
func joinHouseClient(t *testing.T, hh *Hub, clientID, name string, dest TransferDest) *Client {
	t.Helper()
	hc := &Client{
		ID: clientID, Send: make(chan []byte, 256), Hub: hh,
		UseSpawn: true, SpawnX: dest.X, SpawnY: dest.Y, SpawnFacing: dest.Facing,
	}
	hh.clients[hc.ID] = hc
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: name})
	hh.handleJoinWorld(hc, raw)
	if !hc.Joined {
		t.Fatalf("house join failed for %s", name)
	}
	return hc
}

// slotBattlePet adds a pet record to Bartz's profile and slots it as the
// battle pet so syncPetEntities keeps its entity on the world.
func slotBattlePet(t *testing.T, h *Hub, kind, name string, level int) game.PetRecord {
	t.Helper()
	_, rec, errMsg := h.store.AddPet("Bartz", kind, name, level)
	if errMsg != "" {
		t.Fatalf("AddPet: %s", errMsg)
	}
	if _, errMsg := h.store.SetBattlePet("Bartz", rec.ID); errMsg != "" {
		t.Fatalf("SetBattlePet: %s", errMsg)
	}
	return rec
}

func TestEntityFactionGates(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)

	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "Gob", Level: 1}, pe)
	h.entities[pet.ID] = pet
	hostile := hostileNPC(h, "npc-h", px+50, py)
	neutral := newNPCEntity(game.Patrol{ID: "npc-n", Name: "Merchant"}, game.Region{}, h.overworld)
	neutral.Faction = factionNeutral
	h.entities[neutral.ID] = neutral

	if h.canAttack(pe, pet) {
		t.Fatal("player must not attack their own pet (same faction)")
	}
	if !h.canAttack(hostile, pet) {
		t.Fatal("hostile npc should be able to attack an ally pet")
	}
	if h.canAttack(neutral, pe) {
		t.Fatal("neutral npc must never attack")
	}
	if h.canAttack(pe, neutral) {
		t.Fatal("neutral npc must not be targetable")
	}

	// A second player's pet is still an ally: assistable.
	_, peB := addWorldClient(h, "client-2", "Lenna", px+10, py)
	petB := newPetEntity(game.PetRecord{ID: "pet-2", Kind: "dire_wolf", Name: "Wolf", Level: 1}, peB)
	h.entities[petB.ID] = petB
	if !h.canAssist(pe, petB) {
		t.Fatal("player should be able to assist another player's pet")
	}
	if h.canAttack(pe, petB) {
		t.Fatal("player must not attack another player's pet")
	}

	// Battle immunity makes a player unattackable.
	clientControlOf(peB).immuneUntil = time.Now().Add(5 * time.Second).UnixMilli()
	if h.canAttack(hostile, peB) {
		t.Fatal("immune player must not be attackable")
	}
}

func TestNPCRetargetsToPetAfterPlayerDeath(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)
	h.tickEntities(time.Now())
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity on the world")
	}

	n := hostileNPC(h, "npc-1", px+30, py)
	npcSetHome(h, n, px, py)
	pet.X, pet.Y = px+20, py
	npcEngageOf(n).engaged = true
	n.targetID = pe.ID
	// Hold the attack until the retarget is verified.
	n.attackCD = time.Now().Add(time.Hour)

	h.kill(pe, n)
	if n.targetID == pe.ID {
		t.Fatal("npc should drop the dead player's target")
	}

	// The kill respawns the (now immune) player at the save point; over the
	// next ticks the engaged npc must fall back to the pet standing beside it.
	for i := 0; i < 6; i++ {
		h.tickEntities(time.Now())
		if n.targetID == pet.ID {
			break
		}
	}
	if n.targetID != pet.ID {
		t.Fatalf("npc should retarget the pet, got %q", n.targetID)
	}

	// Off cooldown, the npc hits its new target.
	h.rng = alwaysHitRNG()
	n.attackCD = time.Now().Add(-time.Millisecond)
	hpBefore := pet.hp
	h.tickEntities(time.Now())
	if pet.hp >= hpBefore {
		t.Fatal("npc should damage the pet after retargeting")
	}
	_ = c
}

func TestPetDeathAndRecovery(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)
	h.tickEntities(time.Now())
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity on the world")
	}
	pet.X, pet.Y = px+20, py

	n := hostileNPC(h, "npc-1", px+30, py)
	npcSetHome(h, n, px, py)
	npcEngageOf(n).engaged = true
	n.targetID = pet.ID

	h.applyDamage(n, pet, 9999, basicAttackEvent())
	if pet.alive {
		t.Fatal("lethal damage should kill the pet")
	}
	if n.targetID == pet.ID {
		t.Fatal("npc should drop the dead pet as a target")
	}

	// The pet stays down while its owner is still fighting; once the owner's
	// combat flag clears, OnLeaveCombat revives it at full health.
	cc := clientControlOf(pe)
	cc.inCombat = true
	h.updateCombatFlags(time.Now())
	if !pet.alive {
		t.Fatal("pet should revive when the owner leaves combat")
	}
	if pet.hp != pet.maxHP {
		t.Fatalf("revived pet should be at full hp, got %d/%d", pet.hp, pet.maxHP)
	}
	if pet.targetID != "" {
		t.Fatal("revived pet should start untargeted")
	}
	_ = c
}

func TestPetLevelCap(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	pe.Level = 3
	rec := slotBattlePet(t, h, "goblin", "Gobby", 10)

	h.tickEntities(time.Now())
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity on the world")
	}
	if pet.Level != 3 {
		t.Fatalf("pet level should cap at owner level 3, got %d", pet.Level)
	}
	tpl := petTemplate("goblin")
	wantHP, _, _ := game.PetCombatStats(tpl.hp, tpl.str, tpl.dex, 3)
	if pet.maxHP != wantHP {
		t.Fatalf("pet maxHP should match level-3 stats: got %d, want %d", pet.maxHP, wantHP)
	}
}

func TestKillClearsTargets(t *testing.T) {
	px, py := wildernessXY()
	h, cA, peA := testHubWithPlayer(t, px, py)
	cB, peB := addWorldClient(h, "client-2", "Lenna", px+10, py)
	n := hostileNPC(h, "npc-1", px+30, py)
	peA.targetID = n.ID
	peB.targetID = n.ID
	drainClient(cA)
	drainClient(cB)

	h.kill(n, nil)

	if peA.targetID != "" || peB.targetID != "" {
		t.Fatalf("killing the npc should clear player targets, got %q %q", peA.targetID, peB.targetID)
	}
	for _, c := range []*Client{cA, cB} {
		found := false
		for _, f := range drainClient(c) {
			if f.Type != protocol.TypeSetTarget {
				continue
			}
			var p protocol.SetTargetPayload
			if json.Unmarshal(f.Payload, &p) == nil && p.TargetID == "" {
				found = true
			}
		}
		if !found {
			t.Fatalf("client %s should receive a set_target release", c.ID)
		}
	}
}

// Deaths that happen inside a worker sim arrive as effects — they must drop
// canonical target/engage/enmity references too, or the NPC resurfaces as a
// still-selected target when it respawns.
func TestWorkerReportedDeathClearsTargeting(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-dead", px+30, py)
	pe.targetID = n.ID
	pe.engageID = n.ID
	pe.enmity = map[string]int{n.ID: 5}
	drainClient(c)

	h.applyNPCEffects(
		npcSimEffects{deaths: []npcDeath{{Entity: cloneEntity(n, false)}}},
		func(string) string { return "" },
		func(string) bool { return false },
	)

	if pe.targetID != "" || pe.engageID != "" {
		t.Fatalf("worker-reported death should clear player targeting, got target=%q engage=%q", pe.targetID, pe.engageID)
	}
	if _, ok := pe.enmity[n.ID]; ok {
		t.Fatal("worker-reported death should clear the player's enmity entry")
	}
	found := false
	for _, f := range drainClient(c) {
		if f.Type != protocol.TypeSetTarget {
			continue
		}
		var p protocol.SetTargetPayload
		if json.Unmarshal(f.Payload, &p) == nil && p.TargetID == "" {
			found = true
		}
	}
	if !found {
		t.Fatal("client should receive a set_target release on worker-reported death")
	}
}

func TestPetFollowLeashRadius(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "Gob", Level: 1}, pe)
	h.entities[pet.ID] = pet
	fo := pet.components.followOwner
	if fo == nil {
		t.Fatal("pet should carry a followOwner component")
	}
	dt := combatTickInterval.Seconds()

	// Inside the leash radius, the pet only ambles toward a wander spot —
	// at most one wander step, never straying beyond the leash.
	pet.X, pet.Y = pe.X-petFollowDist/2, pe.Y
	bx, by := pet.X, pet.Y
	fo.Tick(h, pet, time.Now(), dt)
	if moved := dist(bx, by, pet.X, pet.Y); moved > petWanderSpeed*dt+1e-9 {
		t.Fatalf("near pet should only amble, moved %v", moved)
	}
	if got := dist(pet.X, pet.Y, pe.X, pe.Y); got > petWanderDist+0.5 {
		t.Fatalf("wandering pet left the wander radius, dist %v", got)
	}

	// Just outside the wander overlap, the pet closes one follow step
	// toward the owner instead of converging on a fixed destination.
	pet.X, pet.Y = pe.X-petWanderDist-2, pe.Y
	fo.Tick(h, pet, time.Now(), dt)
	if got := dist(pet.X, pet.Y, pe.X, pe.Y); math.Abs(got-(petWanderDist+2-petSpeed*dt)) > 1e-6 {
		t.Fatalf("pet should close one follow step, got %v", got)
	}

	// Far away, the pet smoothly accelerates above its normal speed.
	pet.X, pet.Y = pe.X-petFollowDist*5, pe.Y
	bx, by = pet.X, pet.Y
	before := dist(pet.X, pet.Y, pe.X, pe.Y)
	fo.Tick(h, pet, time.Now(), dt)
	moved := dist(bx, by, pet.X, pet.Y)
	want := petFollowSpeed(before) * dt
	if math.Abs(moved-want) > 1e-6 {
		t.Fatalf("far pet should move a damped catch-up step of %v, got %v", want, moved)
	}
	if moved <= petSpeed*dt {
		t.Fatalf("far pet should catch up faster than normal speed, got %v", moved)
	}
}

func TestPetFollowSpeedDamping(t *testing.T) {
	if got := petFollowSpeed(petFollowCatchupDist); got != petSpeed {
		t.Fatalf("speed at catch-up threshold = %v, want %v", got, petSpeed)
	}
	midDist := (petFollowCatchupDist + petFollowCatchupMaxDist) / 2
	midSpeed := (petSpeed + petFollowMaxSpeed) / 2
	if got := petFollowSpeed(midDist); math.Abs(got-midSpeed) > 1e-6 {
		t.Fatalf("speed midway through damping range = %v, want %v", got, midSpeed)
	}
	if got := petFollowSpeed(petFollowCatchupMaxDist * 2); got != petFollowMaxSpeed {
		t.Fatalf("speed beyond catch-up range = %v, want cap %v", got, petFollowMaxSpeed)
	}
}

func TestPetEngagesOnOwnerAttack(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)

	// Selecting the foe must not pull the pet in.
	raw, _ := json.Marshal(protocol.SetTargetPayload{TargetID: n.ID})
	h.handleSetTarget(c, raw)
	if pe.targetID != n.ID {
		t.Fatal("owner target not set")
	}

	h.tickEntities(time.Now()) // creates the pet and runs its plugins
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity on the world")
	}
	if pet.targetID != "" {
		t.Fatalf("target selection alone must not engage the pet, got %q", pet.targetID)
	}

	// Attacking the foe (even an attempt) marks the owner's engage — the pet
	// joins the fight on the next tick.
	raw, _ = json.Marshal(protocol.ActionPayload{ActionID: game.BasicAttack.ID, TargetID: n.ID})
	h.handleAction(c, raw)
	if pe.engageID != n.ID {
		t.Fatal("attack should record the owner's engage target")
	}
	h.tickEntities(time.Now())
	if pet.targetID != n.ID {
		t.Fatalf("pet should engage the owner's attack target, got %q", pet.targetID)
	}

	// On the following tick the pet chases toward its attack position.
	gx, gy := petAttackPos(pe.X, pe.Y, n.X, n.Y)
	before := dist(pet.X, pet.Y, gx, gy)
	h.tickEntities(time.Now())
	after := dist(pet.X, pet.Y, gx, gy)
	if after >= before {
		t.Fatalf("pet should close on petAttackPos (before %.1f, after %.1f)", before, after)
	}
}

func TestPetCommandAttackHeel(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)
	n := hostileNPC(h, "npc-1", px+200, py)

	h.tickEntities(time.Now()) // creates the pet entity
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity on the world")
	}

	// Heel first: the pet goes passive and stops inheriting the owner's target.
	raw, _ := json.Marshal(protocol.PetCommandPayload{Command: "heel"})
	h.handlePetCommand(c, raw)
	if !pet.petHold {
		t.Fatal("heel should put the pet on hold")
	}
	raw, _ = json.Marshal(protocol.SetTargetPayload{TargetID: n.ID})
	h.handleSetTarget(c, raw)
	if pe.targetID != n.ID {
		t.Fatal("owner target not set")
	}
	h.tickEntities(time.Now())
	if pet.targetID != "" {
		t.Fatalf("heeled pet must not acquire a target, got %q", pet.targetID)
	}

	// Attack: the hold releases and the pet goes for the owner's focus target.
	raw, _ = json.Marshal(protocol.PetCommandPayload{Command: "attack"})
	h.handlePetCommand(c, raw)
	if pet.petHold {
		t.Fatal("attack should release the hold")
	}
	if pet.targetID != n.ID {
		t.Fatalf("pet should target the owner's focus, got %q", pet.targetID)
	}

	// Heel mid-fight: the pet drops its target and stays dropped.
	raw, _ = json.Marshal(protocol.PetCommandPayload{Command: "heel"})
	h.handlePetCommand(c, raw)
	if pet.targetID != "" {
		t.Fatalf("heel should clear the pet target, got %q", pet.targetID)
	}
	h.tickEntities(time.Now())
	if pet.targetID != "" {
		t.Fatalf("heeled pet must not re-acquire the owner's target, got %q", pet.targetID)
	}
}

func TestPetFollowsOwnerIntoCamp(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)
	h.tickEntities(time.Now())
	if h.ent(rec.ID) == nil {
		t.Fatal("expected pet entity on the world")
	}

	h.placeCamp(c, pe)
	var dest TransferDest
	h.OnTransfer = func(_ string, d TransferDest) { dest = d }
	raw, _ := json.Marshal(protocol.EnterHousePayload{OwnerName: "Bartz"})
	h.handleEnterHouse(c, raw)

	// Entry is a transfer into a lazily created house instance.
	if dest.House == nil || dest.Map != HouseMapID("Bartz") {
		t.Fatalf("enter_house should transfer to the house instance, got %+v", dest)
	}
	sx, sy := game.HouseSpawnCenter()
	if dest.X != sx || dest.Y != sy {
		t.Fatalf("house spawn mismatch: got (%.0f,%.0f)", dest.X, dest.Y)
	}
	if !c.Transferring {
		t.Fatal("enter transfer should mark the client as transferring")
	}
	// The detach is a transfer, not a logout: the camp stays pitched and the
	// owner's world entities despawn with them.
	h.handleDisconnect(c)
	if _, ok := h.camps["Bartz"]; !ok {
		t.Fatal("camp must stay pitched while the owner is inside the instance")
	}
	if h.ent(rec.ID) != nil {
		t.Fatal("world pet should despawn when the owner leaves the world hub")
	}

	// On the instance side the join replays like any map transfer and the
	// slotted pet respawns inside the walkable island.
	hh := houseHubForTest(t, h, dest.House)
	hc := joinHouseClient(t, hh, c.ID, "Bartz", dest)
	if e := hh.playerEnt(hc.ID); e == nil || e.X != sx || e.Y != sy {
		t.Fatalf("expected owner at the house spawn, got %+v", e)
	}
	housePet := hh.ent(rec.ID)
	if housePet == nil {
		t.Fatal("pet should spawn inside the house instance")
	}
	if !hh.overworld.CircleWalkableAt(housePet.X, housePet.Y, game.PlayerCollisionRadius) {
		t.Fatalf("pet spawned off the walkable island at (%.1f,%.1f)", housePet.X, housePet.Y)
	}

	// Leaving transfers back to the camp position on the world map.
	var back TransferDest
	hh.OnTransfer = func(_ string, d TransferDest) { back = d }
	hh.handleLeaveHouse(hc)
	if back.Map != dest.House.ReturnMap || back.X != dest.House.ReturnX || back.Y != dest.House.ReturnY {
		t.Fatalf("leave should return to the camp on %q, got %+v", dest.House.ReturnMap, back)
	}
}

// Pets path around terrain like NPCs: a pet following or chasing across a
// wall must never occupy an unwalkable tile — the straight-line step is
// gated by walkableAt and falls back to A* (or holds) instead of clipping.
func TestPetMovementRespectsWalls(t *testing.T) {
	ow := game.Loaded()
	ts := float64(ow.TileSizePx())
	// Find a walkable tile adjacent to an unwalkable one.
	var px, py, dx, dy float64
	found := false
	for r := 1; r < ow.Rows-1 && !found; r++ {
		for c := 1; c < ow.Cols-1 && !found; c++ {
			ax, ay := (float64(c)+0.5)*ts, (float64(r)+0.5)*ts
			if !ow.WalkableAt(ax, ay) {
				continue
			}
			for _, dir := range [][2]float64{{1, 0}, {0, 1}, {-1, 0}, {0, -1}} {
				if ow.WalkableAt(ax+dir[0]*ts, ay+dir[1]*ts) {
					continue
				}
				px, py, dx, dy = ax, ay, dir[0], dir[1]
				found = true
			}
		}
	}
	if !found {
		t.Skip("loaded map has no walkable tile adjacent to a wall")
	}

	h, _, owner := testHubWithPlayer(t, px, py)
	h.SetMap("greenwood", "Greenwood", ow)
	// Park the owner several tiles past the wall so the straight line to them
	// crosses it.
	owner.X, owner.Y = px+dx*ts*4, py+dy*ts*4

	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "P", Level: 1}, owner)
	pet.X, pet.Y = px, py
	h.entities[pet.ID] = pet

	now := time.Now()
	assertStaysWalkable := func(name string, tick func()) {
		for i := 0; i < 40; i++ {
			tick()
			if !h.walkableAt(pet.X, pet.Y) {
				t.Fatalf("%s: pet moved inside a wall at (%.1f,%.1f) on tick %d", name, pet.X, pet.Y, i)
			}
		}
	}

	assertStaysWalkable("follow", func() {
		pet.components.followOwner.Tick(h, pet, now, 0.05)
	})

	// Chase: a target parked beyond the wall gets the same treatment.
	n := hostileNPC(h, "wall-target", owner.X, owner.Y)
	pet.targetID = n.ID
	assertStaysWalkable("chase", func() {
		pet.components.chaseTarget.Tick(h, pet, now, 0.05)
	})
}

// sealedPocketMap builds a 24x24 map of open grass with the owner tile at
// (12,12) walled off on all eight sides — unreachable by walking or A*.
func sealedPocketMap() *game.Overworld {
	cells := make([]string, 24)
	for r := 0; r < 24; r++ {
		row := make([]byte, 24)
		for c := 0; c < 24; c++ {
			row[c] = game.TileGrass
		}
		cells[r] = string(row)
	}
	for r := 11; r <= 13; r++ {
		row := []byte(cells[r])
		for c := 11; c <= 13; c++ {
			row[c] = game.TileRock
		}
		cells[r] = string(row)
	}
	center := []byte(cells[12])
	center[12] = game.TileGrass
	cells[12] = string(center)
	return &game.Overworld{Cols: 24, Rows: 24, TileSize: 32, Cells: cells}
}

// petIslandMap builds a 48x48 map of open grass with the pet tile at (4,4)
// walled off on all eight sides — a sealed pocket over petTeleportDist from
// the open ground the owner stands on.
func petIslandMap() *game.Overworld {
	cells := make([]string, 48)
	for r := 0; r < 48; r++ {
		row := make([]byte, 48)
		for c := 0; c < 48; c++ {
			row[c] = game.TileGrass
		}
		cells[r] = string(row)
	}
	for r := 3; r <= 5; r++ {
		row := []byte(cells[r])
		for c := 3; c <= 5; c++ {
			row[c] = game.TileRock
		}
		cells[r] = string(row)
	}
	center := []byte(cells[4])
	center[4] = game.TileGrass
	cells[4] = string(center)
	return &game.Overworld{Cols: 48, Rows: 48, TileSize: 32, Cells: cells}
}

func TestPetTeleportsToUnreachableOwner(t *testing.T) {
	h, _, owner := testHubWithPlayer(t, 1400, 1400)
	h.SetMap("islands", "Islands", petIslandMap())
	owner.X, owner.Y = 1400, 1400 // open ground, ~1775px from the pet pocket

	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "P", Level: 1}, owner)
	pet.X, pet.Y = (4.5)*32, (4.5)*32 // sealed pocket at tile (4,4)
	h.entities[pet.ID] = pet

	fo := pet.components.followOwner
	now := time.Now()
	for i := 0; i < petTeleportTicks+60; i++ {
		fo.Tick(h, pet, now, combatTickInterval.Seconds())
		if !h.walkableAt(pet.X, pet.Y) {
			t.Fatalf("pet occupied an unwalkable tile on tick %d at (%.1f,%.1f)", i, pet.X, pet.Y)
		}
	}
	if got := dist(pet.X, pet.Y, owner.X, owner.Y); got > petWanderDist+0.5 {
		t.Fatalf("pet should teleport within wander range of a sealed owner, dist %v", got)
	}
}

func TestPetDoesNotTeleportInView(t *testing.T) {
	ow := sealedPocketMap()
	h, _, owner := testHubWithPlayer(t, 400, 400)
	h.SetMap("sealed", "Sealed", ow)
	owner.X, owner.Y = 400, 400 // tile (12,12) center, inside the pocket

	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "P", Level: 1}, owner)
	pet.X, pet.Y = (4.5)*32, 400 // open ground, ~8 tiles west — unreachable but in view
	h.entities[pet.ID] = pet

	fo := pet.components.followOwner
	now := time.Now()
	for i := 0; i < petTeleportTicks+60; i++ {
		fo.Tick(h, pet, now, combatTickInterval.Seconds())
	}
	if fo.unreachTicks != 0 {
		t.Fatalf("in-view pet should not accrue teleport ticks, got %d", fo.unreachTicks)
	}
	if got := dist(pet.X, pet.Y, owner.X, owner.Y); got <= petFollowDist {
		t.Fatalf("in-view pet should keep walking, not teleport (dist %v)", got)
	}
}

func TestPetWandersInsideLeash(t *testing.T) {
	h, _, owner := testHubWithPlayer(t, 400, 400)

	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "P", Level: 1}, owner)
	pet.X, pet.Y = owner.X+petFollowDist-4, owner.Y // inside the leash
	h.entities[pet.ID] = pet

	fo := pet.components.followOwner
	now := time.Now()
	fo.Tick(h, pet, now, 0.05)
	if !fo.hasSpot {
		t.Fatal("in-leash pet should pick a wander spot")
	}
	if d := dist(fo.wx, fo.wy, owner.X, owner.Y); d > petWanderDist {
		t.Fatalf("wander spot outside wander radius: %.1f", d)
	}
	// The pet ambles to the spot and never strays beyond the wander radius.
	arrived := false
	for i := 0; i < 40; i++ {
		fo.Tick(h, pet, now, 0.05)
		if d := dist(pet.X, pet.Y, owner.X, owner.Y); d > petWanderDist+0.5 {
			t.Fatalf("pet left the wander radius while wandering: %.1f", d)
		}
		if dist(pet.X, pet.Y, fo.wx, fo.wy) <= 4 {
			arrived = true
			break
		}
	}
	if !arrived {
		t.Fatalf("pet never reached its wander spot, still %.1f out", dist(pet.X, pet.Y, fo.wx, fo.wy))
	}
	// Once the interval elapses the next tick picks a fresh spot.
	first := fo.wanderAt
	fo.Tick(h, pet, now.Add(petWanderInterval+time.Second), 0.05)
	if !fo.wanderAt.After(first) {
		t.Fatal("expected a new wander spot after the interval")
	}
}

func TestHousePetWandersInsideLeash(t *testing.T) {
	hh := mustTestHub()
	hh.SetMap(HouseMapID("Bartz"), "House", game.NewHouseOverworld())
	hh.SetHouseContext(&HouseContext{Owner: "Bartz"})
	sx, sy := game.HouseSpawnCenter()
	c := &Client{ID: "c1", Name: "Bartz", Joined: true, Send: make(chan []byte, 256), Hub: hh}
	hh.clients[c.ID] = c
	hh.store.GetOrCreate("Bartz", game.JobVAN)
	owner := hh.ensurePlayer(c)
	owner.X, owner.Y = sx, sy
	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "P", Level: 1}, owner)
	pet.X, pet.Y = sx+petFollowDist-4, sy
	hh.entities[pet.ID] = pet

	// Inside an instance pets are ordinary followOwner entities on the
	// generated island overworld — wander reuses the world behavior.
	fo := pet.components.followOwner
	now := time.Now()
	moved := false
	bx, by := pet.X, pet.Y
	for i := 0; i < 40; i++ {
		fo.Tick(hh, pet, now, 0.05)
		if pet.X != bx || pet.Y != by {
			moved = true
		}
		if d := dist(pet.X, pet.Y, owner.X, owner.Y); d > petWanderDist+0.5 {
			t.Fatalf("house pet left the wander radius: %.1f", d)
		}
		if !hh.overworld.CircleWalkableAt(pet.X, pet.Y, game.PlayerCollisionRadius) {
			t.Fatalf("house pet stepped off the walkable island at (%.1f,%.1f)", pet.X, pet.Y)
		}
	}
	if !fo.hasSpot {
		t.Fatal("in-leash house pet should pick a wander spot")
	}
	if !moved {
		t.Fatal("in-leash house pet should amble to its wander spot")
	}
	// Once the interval elapses the next tick picks a fresh spot.
	first := fo.wanderAt
	fo.Tick(hh, pet, now.Add(petWanderInterval+time.Second), 0.05)
	if !fo.wanderAt.After(first) {
		t.Fatal("expected a new house wander spot after the interval")
	}
}

func TestPetDoesNotTeleportTowardCombatTarget(t *testing.T) {
	ow := sealedPocketMap()
	h, _, owner := testHubWithPlayer(t, 200, 400)
	h.SetMap("sealed", "Sealed", ow)
	owner.X, owner.Y = 200, 400 // outside the pocket, west of it

	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "P", Level: 1}, owner)
	pet.X, pet.Y = 144, 400
	h.entities[pet.ID] = pet
	// A combat target inside the sealed pocket: followOwner defers entirely
	// to chaseTarget, which releases unreachable targets rather than snapping.
	n := hostileNPC(h, "sealed-target", 400, 400)
	pet.targetID = n.ID

	fo := pet.components.followOwner
	now := time.Now()
	bx, by := pet.X, pet.Y
	for i := 0; i < 30; i++ {
		fo.Tick(h, pet, now, combatTickInterval.Seconds())
	}
	if pet.X != bx || pet.Y != by {
		t.Fatalf("followOwner should not move a pet with a combat target, moved to (%.1f,%.1f)", pet.X, pet.Y)
	}
	if fo.unreachTicks != 0 {
		t.Fatalf("combat target should not accrue follow unreachability, got %d", fo.unreachTicks)
	}
}

func TestMountToggleAndDismountRules(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)

	// No mount slotted: the keybind refuses.
	h.handleMountToggle(c, nil)
	if cc.mounted {
		t.Fatal("mount should refuse with no mount pet slotted")
	}

	_, rec, errMsg := h.store.AddPet("Bartz", "dire_wolf", "Wolf", 1)
	if errMsg != "" {
		t.Fatalf("AddPet: %s", errMsg)
	}
	if _, errMsg := h.store.SetMountPet("Bartz", rec.ID); errMsg != "" {
		t.Fatalf("SetMountPet: %s", errMsg)
	}

	h.handleMountToggle(c, nil)
	if !cc.mounted || cc.mountSprite != "dire_wolf" {
		t.Fatalf("expected mounted on dire_wolf, got mounted=%v sprite=%q", cc.mounted, cc.mountSprite)
	}
	if we := h.entitySync(pe); !we.Mounted || we.MountSprite != "dire_wolf" {
		t.Fatalf("wire snapshot should carry mount state, got %+v", we)
	}

	// Mounted riders get the widened move clamp: a report past maxMoveStep
	// clamps on foot but lands whole in the saddle.
	move, _ := json.Marshal(protocol.MovePayload{X: px + maxMoveStep + 15, Y: py})
	h.handleMove(c, move)
	if got := dist(px, py, pe.X, pe.Y); math.Abs(got-(maxMoveStep+15)) > 1e-6 {
		t.Fatalf("mounted move should clear the on-foot clamp, moved %v", got)
	}

	// Stepping into a house dismounts the rider: entering transfers to the
	// instance, where the respawned entity is never mounted and toggles are
	// refused.
	h.camps["Bartz"] = &worldCamp{OwnerName: "Bartz", OwnerClientID: c.ID, X: pe.X, Y: pe.Y}
	var dest TransferDest
	h.OnTransfer = func(_ string, d TransferDest) { dest = d }
	enter, _ := json.Marshal(protocol.EnterHousePayload{OwnerName: "Bartz"})
	h.handleEnterHouse(c, enter)
	if dest.House == nil {
		t.Fatal("entering a house should transfer to its instance")
	}
	hh := houseHubForTest(t, h, dest.House)
	hc := joinHouseClient(t, hh, c.ID, "Bartz", dest)
	hpe := hh.playerEnt(hc.ID)
	hcc := clientControlOf(hpe)
	if hcc == nil || hcc.mounted {
		t.Fatal("the instance entity should not be mounted")
	}
	hh.handleMountToggle(hc, nil)
	if hcc.mounted {
		t.Fatal("mount should be refused inside a house")
	}

	// Releasing the slotted mount pet also dismounts.
	release, _ := json.Marshal(protocol.PetIDPayload{PetID: rec.ID})
	h.handlePetRelease(c, release)
	if cc.mounted || cc.mountSprite != "" {
		t.Fatal("releasing the mount pet should dismount the rider")
	}
}

func TestMountDespawnsBattlePet(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)

	battle := slotBattlePet(t, h, "goblin", "Gob", 1)
	_, rec, errMsg := h.store.AddPet("Bartz", "dire_wolf", "Wolf", 1)
	if errMsg != "" {
		t.Fatalf("AddPet: %s", errMsg)
	}
	if _, errMsg := h.store.SetMountPet("Bartz", rec.ID); errMsg != "" {
		t.Fatalf("SetMountPet: %s", errMsg)
	}

	h.syncPetEntities()
	if h.entities[battle.ID] == nil {
		t.Fatal("battle pet should be out before mounting")
	}

	h.handleMountToggle(c, nil)
	if !cc.mounted {
		t.Fatal("mount toggle should seat the rider")
	}
	if h.entities[battle.ID] != nil {
		t.Fatal("mounting should despawn the battle pet")
	}

	h.handleMountToggle(c, nil)
	if cc.mounted {
		t.Fatal("second toggle should dismount")
	}
	if got := h.entities[battle.ID]; got == nil {
		t.Fatal("dismounting should resummon the battle pet")
	}

	// Force-dismounts (mount pet released) resummon the battle pet too.
	h.handleMountToggle(c, nil)
	if h.entities[battle.ID] != nil {
		t.Fatal("remounting should despawn the battle pet again")
	}
	release, _ := json.Marshal(protocol.PetIDPayload{PetID: rec.ID})
	h.handlePetRelease(c, release)
	if cc.mounted {
		t.Fatal("releasing the mount pet should dismount the rider")
	}
	if h.entities[battle.ID] == nil {
		t.Fatal("a forced dismount should resummon the battle pet")
	}
}
