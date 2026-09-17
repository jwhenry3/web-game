package server

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

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
	wantHP, _, _ := game.PetCombatStats(tpl.hp, tpl.str, tpl.agi, 3)
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

	// Inside the leash radius, the pet keeps its current position.
	pet.X, pet.Y = pe.X-petFollowDist/2, pe.Y
	bx, by := pet.X, pet.Y
	fo.Tick(h, pet, time.Now(), dt)
	if moved := dist(bx, by, pet.X, pet.Y); moved != 0 {
		t.Fatalf("near pet should stay put, moved %v", moved)
	}

	// Just outside the radius, the pet stops at the threshold instead of
	// converging on a fixed owner-relative destination.
	pet.X, pet.Y = pe.X-petFollowDist-2, pe.Y
	fo.Tick(h, pet, time.Now(), dt)
	if got := dist(pet.X, pet.Y, pe.X, pe.Y); math.Abs(got-petFollowDist) > 1e-6 {
		t.Fatalf("pet should stop at leash radius %v, got %v", petFollowDist, got)
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
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity on the world")
	}

	h.placeCamp(c, pe)
	raw, _ := json.Marshal(protocol.EnterHousePayload{OwnerName: "Bartz"})
	h.handleEnterHouse(c, raw)
	room := h.houses["Bartz"]
	if room == nil {
		t.Fatal("expected a house room")
	}
	guest := room.Guests[c.ID]
	if guest == nil || len(guest.Pets) != 1 || guest.Pets[0].ID != rec.ID {
		t.Fatalf("pet should follow the owner inside, got %+v", guest)
	}
	h.tickEntities(time.Now())
	if !pet.hidden {
		t.Fatal("pet should be hidden on the overworld while the owner is inside")
	}

	h.handleLeaveHouse(c)
	h.tickEntities(time.Now())
	if pet.hidden {
		t.Fatal("pet should be back on the overworld after leaving")
	}
	if d := dist(pet.X, pet.Y, pe.X, pe.Y); d > 120 {
		t.Fatalf("pet should reappear beside the owner (dist %.1f)", d)
	}
}
