package server

import (
	"encoding/json"
	"math/rand"
	"strings"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// A damage+self-status skill runs both components: the enemy takes the hit,
// the caster gains the buff.
func TestComponentDamageAndSelfStatus(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000
	skill, ok := game.FindSkill("van_furor_linea")
	if !ok || len(skill.Effects) != 2 {
		t.Fatal("van_furor_linea should carry damage + self-status components")
	}
	if _, msg := h.store.UnlockSkill(c.Name, skill.ID); msg != "" {
		t.Fatal(msg)
	}
	h.refreshCombatStats(c, pe)
	pe.mp = pe.maxMP

	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: skill.ID, TargetID: n.ID})
	h.handleAction(c, raw)

	if n.hp >= n.maxHP {
		t.Fatal("damage component should land")
	}
	if !hasStatus(pe.statuses, game.StatusDefenseUp) {
		t.Fatal("caster should gain the OnCaster defense component")
	}
}

// An ally status skill applies its component to the friendly target and
// produces one combat event — never a damage roll.
func TestComponentAllyStatusAppliesToTarget(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	_, ally := addWorldClient(h, "client-2", "Lenna", px+10, py)
	skill, ok := game.FindSkill("aeg_tegimen")
	if !ok || !game.SkillTargetsAlly(skill) {
		t.Fatal("aeg_tegimen should target allies")
	}
	if _, msg := h.store.UnlockSkill(c.Name, skill.ID); msg != "" {
		t.Fatal(msg)
	}
	h.refreshCombatStats(c, pe)
	pe.mp = pe.maxMP
	cc := clientControlOf(pe)
	cc.weapon = "hammer" // AEG skill requires the hammer

	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: skill.ID, TargetID: ally.ID})
	h.handleAction(c, raw)

	if !hasStatus(ally.statuses, game.StatusDefenseUp) {
		t.Fatal("status component should land on the ally")
	}
	evs := combatEvents(drainClient(c))
	if len(evs) == 0 || evs[len(evs)-1].Damage != 0 {
		t.Fatalf("buff skills must not deal damage, got %+v", evs)
	}
}

// An enemy-targeted skill with only a status component debuffs without a
// damage roll — the dispatch still emits a combat event.
func TestComponentDebuffSkillAppliesWithoutDamage(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	skill, ok := game.FindSkill("san_lux_mitis")
	if !ok || skill.TargetRule() != game.TargetEnemy {
		t.Fatal("san_lux_mitis should be an enemy-targeted debuff")
	}
	// Resolve directly — the wand requirement is resolveAction validation,
	// not component semantics.
	h.applySkillTo(pe, n, skill, protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: n.ID})

	if n.hp != n.maxHP {
		t.Fatal("a status-only skill must not deal damage")
	}
	if !hasStatus(n.statuses, game.StatusDefenseDown) {
		t.Fatal("the debuff component should land on the enemy")
	}
}

// Legacy flag-only skills resolve through the same synthesized components.
func TestLegacyFlagSkillStillDamages(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	skill, ok := game.FindSkill("van_cuneus")
	if !ok || len(skill.Effects) != 0 {
		t.Fatal("van_cuneus should stay a legacy flag-only def")
	}
	h.applySkillTo(pe, n, skill, protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: n.ID})
	if n.hp >= n.maxHP {
		t.Fatal("synthesized damage component should land")
	}
}

// A heal component still drives the heal message and enmity splash.
func TestComponentHealMessageAndEnmity(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+20, py)
	npcSetHome(h, n, px, py)
	h.engage(n, pe)
	skill, ok := game.FindSkill("san_sanare")
	if !ok || !skill.Heals {
		t.Fatal("san_sanare not found")
	}
	if _, msg := h.store.UnlockSkill(c.Name, skill.ID); msg != "" {
		t.Fatal(msg)
	}
	h.refreshCombatStats(c, pe)
	pe.hp = pe.maxHP / 2
	pe.mp = pe.maxMP

	h.applySkillTo(pe, pe, skill, protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: pe.ID})

	if pe.hp <= pe.maxHP/2 {
		t.Fatal("heal component should restore HP")
	}
	evs := combatEvents(drainClient(c))
	if len(evs) == 0 || !strings.Contains(evs[len(evs)-1].Message, "heals") {
		t.Fatalf("expected a heal message, got %+v", evs)
	}
	if n.enmity[pe.ID] <= 0 {
		t.Fatal("healing should splash enmity onto engaged enemies")
	}
}

// Shield Bash is the regression case for the old inference: its stun used to
// route it through the ally path. With an explicit enemy target it damages
// and stuns the foe.
func TestShieldBashHitsEnemyAndStuns(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000
	skill, ok := game.FindSkill("aeg_umbo")
	if !ok || skill.TargetRule() != game.TargetEnemy {
		t.Fatal("aeg_umbo should target enemies")
	}
	h.applySkillTo(pe, n, skill, protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: n.ID})
	if n.hp >= n.maxHP {
		t.Fatal("shield bash should deal damage")
	}
	if !hasStatus(n.statuses, game.StatusStun) {
		t.Fatal("shield bash should stun the target")
	}
}

// A conditional branch swaps the whole effect list — here an execute-phase
// branch that fires only under 30% target HP.
func TestConditionalBranchSelectsEffectList(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000
	step3 := 3
	skill := game.Skill{
		ID: "test_execute", Name: "Execute", Power: 1.0,
		Branches: []game.SkillBranch{
			{Name: "Combo Hit", When: &game.EffectCondition{ComboStep: &step3},
				Effects: []game.SkillEffect{{Kind: game.EffectDamage, Power: 9}}},
			{Name: "Finisher", When: &game.EffectCondition{TargetHPBelow: 0.3},
				Effects: []game.SkillEffect{{Kind: game.EffectDamage, Power: 5}}},
		},
	}

	// Healthy target, step 0: no branch matches — base damage, base name.
	h.applySkillTo(pe, n, skill, protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: n.ID})
	healthy := n.maxHP - n.hp
	evs := combatEvents(drainClient(c))
	if len(evs) == 0 || evs[len(evs)-1].ActionName != "Execute" {
		t.Fatalf("base execution should keep the skill name, got %+v", evs)
	}

	// Wounded target: the execute branch fires — more damage, branch name.
	n.hp = int(float64(n.maxHP) * 0.2)
	h.applySkillTo(pe, n, skill, protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: n.ID})
	finisher := 0
	for _, ev := range combatEvents(drainClient(c)) {
		if ev.ActionName == "Finisher" {
			finisher = ev.Damage
		}
	}
	if finisher == 0 {
		t.Fatal("the execute branch should fire under 30% target HP")
	}
	if finisher <= healthy {
		t.Fatalf("finisher damage %d should exceed base %d", finisher, healthy)
	}
}

// A missed swing deals no damage but still provokes the target and emits a
// whiff event — accuracy is attacker dex vs. defender dex.
func TestMissedAttackStillEngages(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000
	h.rng = alwaysMissRNG()
	skill, ok := game.FindSkill("van_cuneus")
	if !ok {
		t.Fatal("van_cuneus not found")
	}

	h.applySkillTo(pe, n, skill, protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: n.ID})

	if n.hp != n.maxHP {
		t.Fatal("a miss should deal no damage")
	}
	if !npcEngaged(n) {
		t.Fatal("a whiffed attack should still engage the target")
	}
	evs := combatEvents(drainClient(c))
	if len(evs) == 0 || evs[len(evs)-1].Hit || evs[len(evs)-1].Damage != 0 {
		t.Fatalf("expected a miss event, got %+v", evs)
	}
}

// Physical damage is mitigated by vit; elemental damage ignores vit but is
// mitigated by md.
func TestDefenseStatsMitigateByClass(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000
	ev := protocol.CombatEventPayload{ActionID: "test"}

	n.vit, n.md = 60, 0
	if dealt := h.applyDamageMsgClass(pe, n, 100, ev, "", game.ClassPhysical); dealt != 67 {
		t.Fatalf("vit 60 should mitigate 100 physical to 67, got %d", dealt)
	}
	n.hp = n.maxHP
	if dealt := h.applyDamageMsgClass(pe, n, 100, ev, "", game.ClassElemental); dealt != 100 {
		t.Fatalf("elemental should bypass vit: got %d", dealt)
	}
	n.vit, n.md = 0, 60
	n.hp = n.maxHP
	if dealt := h.applyDamageMsgClass(pe, n, 100, ev, "", game.ClassElemental); dealt != 67 {
		t.Fatalf("md 60 should mitigate 100 elemental to 67, got %d", dealt)
	}
}

// Heals scale on the caster's md; elemental skills on int; overrides win.
func TestAffinityStatScaling(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	h.rng = alwaysHitRNG() // fixes the 0.85 variance floor

	heal := game.Skill{ID: "t_heal", Name: "Heal", Heals: true, Power: 1.0}
	eff := game.SkillEffect{Kind: game.EffectHeal}
	pe.md, pe.str, pe.int = 100, 5, 5
	high := h.rollDamage(pe, pe, heal, eff)
	pe.md = 10
	low := h.rollDamage(pe, pe, heal, eff)
	if high <= low {
		t.Fatalf("heal should scale with md: md100=%d md10=%d", high, low)
	}

	magic := game.Skill{ID: "t_hex", Name: "Hex", UsesMagic: true, Power: 1.0}
	dmg := game.SkillEffect{Kind: game.EffectDamage}
	pe.int = 100
	if got := h.rollDamage(pe, n, magic, dmg); got < 80 {
		t.Fatalf("int 100 elemental hit = %d, want ~85", got)
	}
	pe.int = 5
	if got := h.rollDamage(pe, n, magic, dmg); got > 10 {
		t.Fatalf("int 5 elemental hit = %d, want ~4", got)
	}
	// Explicit stat override beats the skill default.
	pe.vit = 90
	over := game.SkillEffect{Kind: game.EffectDamage, Stat: game.StatVit}
	if got := h.rollDamage(pe, n, magic, over); got < 70 {
		t.Fatalf("vit override should roll on vit (90): got %d", got)
	}
}

// Dex shortens the global cooldown — attack speed.
func TestDexScalesAttackSpeed(t *testing.T) {
	pe := &entity{}
	pe.dex = 0
	pe.startGCD(time.Now())
	if got := pe.gcdLen(); got != gcdDuration {
		t.Fatalf("dex 0 GCD = %v, want %v", got, gcdDuration)
	}
	pe.dex = 40
	pe.startGCD(time.Now())
	if got := pe.gcdLen(); got != 800*time.Millisecond {
		t.Fatalf("dex 40 GCD = %v, want 800ms", got)
	}
}

func hasStatus(list []game.ActiveStatus, kind game.StatusKind) bool {
	for _, s := range list {
		if s.Kind == kind {
			return true
		}
	}
	return false
}

// Executing a skill rolls 0.10–0.40 growth (hundredths) into the discipline
// it trains — weapon disciplines for weapon skills, magic schools for spells.
func TestSkillUseGrowsProficiency(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)
	cc.weapon = game.WeaponSword

	attack := game.BasicAttack
	h.trackSkillUse(pe, attack)
	got := cc.pendingProfGrowth[string(game.ProfSwords)]
	if got < game.ProfGrowthMin || got >= game.ProfGrowthMin+game.ProfGrowthSpan {
		t.Fatalf("attack growth = %d, want 10..40", got)
	}
	if cc.pendingProfGrowth[string(game.ProfElemental)] != 0 {
		t.Fatal("a weapon attack must not grow a magic discipline")
	}

	hex := game.Skill{ID: "t_hex", Name: "Hex", UsesMagic: true, Power: 1}
	h.trackSkillUse(pe, hex)
	if cc.pendingProfGrowth[string(game.ProfElemental)] < game.ProfGrowthMin {
		t.Fatal("a spell should grow elemental")
	}
	if got := cc.pendingProfGrowth[string(game.ProfSwords)]; got > 40 {
		t.Fatal("a spell must not grow the weapon discipline")
	}

	// Passives, field skills, and dodge train nothing.
	before := len(cc.pendingProfGrowth)
	h.trackSkillUse(pe, game.SkillDodge)
	h.trackSkillUse(pe, game.Skill{ID: "t_world", WorldOnly: true})
	h.trackSkillUse(pe, game.Skill{ID: "t_pass", Passive: &game.PassiveEffect{EffectMultiplier: 0.1}})
	if len(cc.pendingProfGrowth) != before {
		t.Fatal("dodge/world/passive skills should roll no growth")
	}
}

// Discipline level scales potency through the same potency curve.
func TestProficiencyScalesPotency(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	h.rng = alwaysHitRNG()
	cc := clientControlOf(pe)
	cc.weapon = game.WeaponSword
	pe.str = 50

	eff := game.SkillEffect{Kind: game.EffectDamage}
	untrained := h.rollDamage(pe, n, game.BasicAttack, eff)
	cc.profLevels[string(game.ProfSwords)] = 10
	trained := h.rollDamage(pe, n, game.BasicAttack, eff)
	if trained <= untrained {
		t.Fatalf("swords 10 should out-damage untrained: %d vs %d", trained, untrained)
	}
	want := int(float64(untrained) * game.SkillLevelPotency(10))
	if trained < want-2 || trained > want+2 {
		t.Fatalf("trained damage %d, want ~%d (potency curve)", trained, want)
	}
}

// fixedRollSource rolls exactly `roll` on every Float64 — a deterministic
// point on the hit-chance spectrum between the always-hit/miss fixtures.
type fixedRollSource struct{ roll float64 }

func (s fixedRollSource) Int63() int64 { return int64(s.roll * (1 << 63)) }
func (s fixedRollSource) Seed(int64)   {}

// Discipline level adds flat hit chance on top of the dex contest.
func TestProficiencyImprovesAccuracy(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	n.hp, n.maxHP = 10000, 10000
	cc := clientControlOf(pe)
	cc.weapon = game.WeaponSword
	pe.dex, n.dex = 0, 100 // huge dex deficit clamps HitChance to its 0.50 floor
	pe.str = 50

	// Roll 0.52 whiffs at the 0.50 floor but lands once proficiency lifts it.
	h.rng = rand.New(fixedRollSource{roll: 0.52})
	res := &protocol.CombatEventPayload{AttackerID: pe.ID, TargetID: n.ID}
	applyDamageEffect(h, &skillExec{caster: pe, target: n, skill: game.BasicAttack, res: res}, game.SkillEffect{Kind: game.EffectDamage})
	if n.hp != n.maxHP {
		t.Fatalf("roll 0.52 vs 0.50 hit chance should miss, but hp dropped")
	}

	cc.profLevels[string(game.ProfSwords)] = 5 // +5% hit chance → 0.55 > 0.52
	applyDamageEffect(h, &skillExec{caster: pe, target: n, skill: game.BasicAttack, res: res}, game.SkillEffect{Kind: game.EffectDamage})
	if n.hp >= n.maxHP {
		t.Fatalf("proficiency bonus should turn the whiff into a hit")
	}
}
