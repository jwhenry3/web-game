package server

import (
	"math"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

func TestProjectorMatchesEntitySnapshotWrapper(t *testing.T) {
	x, y := wildernessXY()
	h, _, pe := testHubWithPlayer(t, x, y)
	n := hostileNPC(h, "npc-1", 100, 100)
	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "Gob", Level: 1}, pe)
	now := time.Now()

	cases := []struct {
		name string
		e    *entity
	}{
		{"player", pe},
		{"npc", n},
		{"pet", pet},
	}
	for _, tc := range cases {
		got := h.projector.project(tc.e, now)
		want := h.entitySnapshot(tc.e, now)
		if !worldEntityEqual(got, want) {
			t.Errorf("%s: projector.project does not match entitySnapshot", tc.name)
		}
	}
}

func TestProjectorPlayerFields(t *testing.T) {
	h, _, pe := testHubWithPlayer(t, 100, 200)
	cc := clientControlOf(pe)
	cc.weaponName = "sword"
	cc.mainJobName = "WAR"
	cc.subJobName = "MNK"
	cc.appearance = protocol.CharacterAppearance{Skin: "a", Face: "b", Hair: "c", HairColor: "d"}
	cc.inCombat = true
	cc.immuneUntil = time.Now().Add(5 * time.Second).UnixMilli()
	cc.inHouse = true
	cc.houseOwner = "Bartz"

	pe.hp, pe.maxHP, pe.mp, pe.maxMP = 80, 100, 30, 50
	pe.targetID = "npc-1"
	pe.str, pe.dex, pe.vit, pe.int, pe.md = 10, 8, 10, 12, 10

	now := time.Now()
	we := h.projector.project(pe, now)

	if we.ID != pe.ID || we.Name != pe.Name {
		t.Fatalf("basic fields mismatch: got %+v", we)
	}
	if we.Kind != string(kindPlayer) || we.Sprite != pe.Sprite || we.Level != pe.Level {
		t.Errorf("kind/sprite/level mismatch: got %+v", we)
	}
	if we.HP != pe.hp || we.MaxHP != pe.maxHP || we.MP != pe.mp || we.MaxMP != pe.maxMP {
		t.Errorf("stats mismatch: got hp=%d/%d mp=%d/%d", we.HP, we.MaxHP, we.MP, we.MaxMP)
	}
	if we.Weapon != "sword" || we.MainJob != "WAR" || we.SubJob != "MNK" {
		t.Errorf("job/weapon mismatch: got weapon=%q main=%q sub=%q", we.Weapon, we.MainJob, we.SubJob)
	}
	if we.Appearance.Skin != "a" || we.Appearance.Face != "b" || we.Appearance.Hair != "c" {
		t.Errorf("appearance mismatch: got %+v", we.Appearance)
	}
	if !we.Engaged {
		t.Error("expected Engaged true")
	}
	if we.Stamina != cc.staminaNow(now) {
		t.Errorf("stamina mismatch: got %v want %v", we.Stamina, cc.staminaNow(now))
	}
	if !we.InHouse || we.HouseOwner != "Bartz" {
		t.Errorf("house mismatch: got inHouse=%v owner=%q", we.InHouse, we.HouseOwner)
	}
	if we.ImmuneUntil != cc.immuneUntil {
		t.Errorf("immuneUntil mismatch: got %d want %d", we.ImmuneUntil, cc.immuneUntil)
	}
	if we.TargetID != "npc-1" {
		t.Errorf("targetID mismatch: got %q", we.TargetID)
	}
	if math.Abs(we.SkillATB-pe.gcdProgress(now)) > 1e-6 {
		t.Errorf("skillATB mismatch: got %v want %v", we.SkillATB, pe.gcdProgress(now))
	}
}

func TestProjectorPlayerCasting(t *testing.T) {
	h, _, pe := testHubWithPlayer(t, 100, 200)
	pe.casting = &activeCast{SkillID: game.BasicAttack.ID, TargetID: "npc-1", Progress: 33.3}
	we := h.projector.project(pe, time.Now())

	if we.CastingSkillID != game.BasicAttack.ID {
		t.Errorf("casting skill mismatch: got %q", we.CastingSkillID)
	}
	if we.CastTargetID != "npc-1" {
		t.Errorf("cast target mismatch: got %q", we.CastTargetID)
	}
	if math.Abs(we.CastProgress-33.3) > 1e-6 {
		t.Errorf("cast progress mismatch: got %v", we.CastProgress)
	}
	if we.CastTimeMs != game.SkillCastTime(game.BasicAttack) {
		t.Errorf("cast time mismatch: got %d want %d", we.CastTimeMs, game.SkillCastTime(game.BasicAttack))
	}
	if we.CastEndsAt != 0 {
		t.Errorf("cast ends at should be 0 during combat cast, got %d", we.CastEndsAt)
	}
}

func TestProjectorPlayerFieldCast(t *testing.T) {
	h, _, pe := testHubWithPlayer(t, 100, 200)
	cc := clientControlOf(pe)
	cc.fieldCastSkillID = "teleport"
	cc.fieldCastTimeMs = 2500
	cc.fieldCastEndsAt = time.Now().Add(2 * time.Second).UnixMilli()

	we := h.projector.project(pe, time.Now())
	if we.CastingSkillID != "teleport" || we.CastTimeMs != 2500 || we.CastEndsAt != cc.fieldCastEndsAt {
		t.Errorf("field cast mismatch: got %+v", we)
	}
}

func TestProjectorNPCFields(t *testing.T) {
	h := mustTestHub()
	n := hostileNPC(h, "npc-1", 100, 100)
	n.Level = 5
	n.hp, n.maxHP = 40, 80
	ng := npcEngageOf(n)
	ng.engaged = true
	r := respawnOf(n)
	r.capturable = true

	we := h.projector.project(n, time.Now())
	if we.Kind != string(kindNPC) || we.Level != 5 || we.HP != 40 || we.MaxHP != 80 {
		t.Errorf("npc base mismatch: got %+v", we)
	}
	if !we.Engaged {
		t.Error("expected Engaged true")
	}
	if !we.Capturable {
		t.Error("expected Capturable true")
	}
}

func TestProjectorPetFields(t *testing.T) {
	h, _, pe := testHubWithPlayer(t, 100, 200)
	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "Gob", Level: 3}, pe)
	we := h.projector.project(pet, time.Now())
	if we.Kind != string(kindPet) || we.OwnerID != pe.ID || we.Level != 3 {
		t.Errorf("pet base mismatch: got %+v", we)
	}
	if !we.IsAlly {
		t.Error("expected IsAlly true for pet")
	}
}

func TestProjectorWorldEntitiesFiltering(t *testing.T) {
	x, y := wildernessXY()
	h, _, pe := testHubWithPlayer(t, x, y)
	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "Gob", Level: 1}, pe)
	h.entities[pet.ID] = pet
	n := hostileNPC(h, "npc-1", 300, 300)

	// Hidden player is still listed (in_house tells clients to hide them).
	pe.hidden = true
	// Hidden NPC/pet are omitted.
	n.hidden = true
	pet.hidden = true

	entities := h.worldEntities(time.Now())
	ids := entityIDs(entities)
	if !contains(ids, pe.ID) {
		t.Error("worldEntities should include hidden player")
	}
	if contains(ids, n.ID) {
		t.Error("worldEntities should exclude hidden NPC")
	}
	if contains(ids, pet.ID) {
		t.Error("worldEntities should exclude hidden pet")
	}
}

func TestProjectorServerEntitySnapshotsFiltering(t *testing.T) {
	x, y := wildernessXY()
	h, _, pe := testHubWithPlayer(t, x, y)
	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "Gob", Level: 1}, pe)
	h.entities[pet.ID] = pet
	n := hostileNPC(h, "npc-1", 300, 300)

	entities := h.serverEntitySnapshotsNear(x, y, 100000)
	ids := entityIDs(entities)
	if contains(ids, pe.ID) {
		t.Error("serverEntitySnapshotsNear should exclude players")
	}
	if !contains(ids, n.ID) || !contains(ids, pet.ID) {
		t.Error("serverEntitySnapshotsNear should include on-world NPC and pet")
	}

	// Hidden server entities are excluded.
	n.hidden = true
	pet.hidden = true
	entities = h.serverEntitySnapshotsNear(x, y, 100000)
	ids = entityIDs(entities)
	if contains(ids, n.ID) || contains(ids, pet.ID) {
		t.Error("serverEntitySnapshotsNear should exclude hidden server entities")
	}
}

func TestProjectorCombatSnapshotsFiltering(t *testing.T) {
	x, y := wildernessXY()
	h, _, pe := testHubWithPlayer(t, x, y)
	pet := newPetEntity(game.PetRecord{ID: "pet-1", Kind: "goblin", Name: "Gob", Level: 1}, pe)
	h.entities[pet.ID] = pet
	n := hostileNPC(h, "npc-1", 300, 300)
	bystander := hostileNPC(h, "npc-2", 3000, 3000)

	// Engage the NPC and flag the player active via combat.
	ng := npcEngageOf(n)
	ng.engaged = true
	clientControlOf(pe).inCombat = true

	entities := h.combatSnapshots(time.Now())
	ids := entityIDs(entities)
	if !contains(ids, pe.ID) {
		t.Error("combatSnapshots should include active player")
	}
	if !contains(ids, n.ID) {
		t.Error("combatSnapshots should include engaged NPC")
	}
	if !contains(ids, pet.ID) {
		t.Error("combatSnapshots should include active owner's pet")
	}
	if contains(ids, bystander.ID) {
		t.Error("combatSnapshots should exclude unengaged NPC")
	}

	// Hidden player and hidden pet are excluded.
	pe.hidden = true
	pet.hidden = true
	entities = h.combatSnapshots(time.Now())
	ids = entityIDs(entities)
	if contains(ids, pe.ID) || contains(ids, pet.ID) {
		t.Error("combatSnapshots should exclude hidden player/pet")
	}
}

func TestProjectorStatuses(t *testing.T) {
	h, _, pe := testHubWithPlayer(t, 100, 200)
	game.ApplyStatus(&pe.statuses, game.StatusEffectDef{Kind: game.StatusPoison, Duration: 10, Potency: 0.5}, pe.ID, 0)
	we := h.projector.project(pe, time.Now())
	if len(we.Statuses) != 1 || we.Statuses[0].Kind != string(game.StatusPoison) {
		t.Errorf("statuses mismatch: got %+v", we.Statuses)
	}
}

func worldEntityEqual(a, b protocol.WorldEntity) bool {
	return a.ID == b.ID && a.Name == b.Name && a.Kind == b.Kind && a.Sprite == b.Sprite &&
		a.OwnerID == b.OwnerID && a.Level == b.Level &&
		math.Abs(a.X-b.X) < 1e-9 && math.Abs(a.Y-b.Y) < 1e-9 && math.Abs(a.Facing-b.Facing) < 1e-9 &&
		a.HP == b.HP && a.MaxHP == b.MaxHP && a.MP == b.MP && a.MaxMP == b.MaxMP &&
		math.Abs(a.Stamina-b.Stamina) < 1e-9 && a.Alive == b.Alive && a.Engaged == b.Engaged &&
		a.IsAlly == b.IsAlly && a.TargetID == b.TargetID && a.Capturable == b.Capturable &&
		math.Abs(a.SkillATB-b.SkillATB) < 1e-9 &&
		a.CastingSkillID == b.CastingSkillID && a.CastTargetID == b.CastTargetID &&
		math.Abs(a.CastProgress-b.CastProgress) < 1e-9 && a.CastTimeMs == b.CastTimeMs && a.CastEndsAt == b.CastEndsAt &&
		a.Weapon == b.Weapon && a.MainJob == b.MainJob && a.SubJob == b.SubJob &&
		a.ImmuneUntil == b.ImmuneUntil && a.InHouse == b.InHouse && a.HouseOwner == b.HouseOwner
}

func entityIDs(entities []protocol.WorldEntity) []string {
	out := make([]string, len(entities))
	for i, e := range entities {
		out[i] = e.ID
	}
	return out
}

func contains(ids []string, id string) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

func TestProjectorUsesEntityPresenceFromProfile(t *testing.T) {
	// Verify that applying profile presence writes the same fields visible on the wire.
	h, _, pe := testHubWithPlayer(t, 100, 200)
	profile := h.store.GetOrCreate("Bartz", game.JobVAN)
	profile.MainJob = string(game.JobAEG)
	profile.SubJob = string(game.JobBRW)
	profile.Race = "humanus"
	h.applyProfilePresence(pe, profile)

	we := h.projector.project(pe, time.Now())
	if we.Sprite != "humanus" {
		t.Errorf("sprite mismatch: got %q want humanus", we.Sprite)
	}
	if we.MainJob != string(game.JobAEG) || we.SubJob != string(game.JobBRW) {
		t.Errorf("job mismatch after applyProfilePresence: got main=%q sub=%q", we.MainJob, we.SubJob)
	}
	if we.Level != profile.MainJobLevel() {
		t.Errorf("level mismatch: got %d want %d", we.Level, profile.MainJobLevel())
	}
}
