package game

import "testing"

func TestPassiveSkillMultiplier(t *testing.T) {
	heal, ok := FindSkill("san_sanare")
	if !ok {
		t.Fatal("heal skill missing")
	}
	mult := PassiveSkillMultiplier(map[string]int{"san_meditatio": 1}, heal, PassiveContext{})
	if mult != 1.15 {
		t.Fatalf("heal multiplier = %v, want 1.15", mult)
	}
	if got := PassiveSkillMultiplier(map[string]int{"san_meditatio": 1}, BasicAttack, PassiveContext{}); got != 1 {
		t.Fatalf("unmatched passive multiplier = %v, want 1", got)
	}
}

func TestPassiveCooldownReductionConditions(t *testing.T) {
	skill, ok := FindSkill("brw_intentio_pugna")
	if !ok || skill.CooldownMs <= 0 {
		t.Fatal("expected configured cooldown on Focus Blow")
	}
	levels := map[string]int{"brw_fluctus": 1}
	if got := PassiveCooldownReduction(levels, skill, PassiveContext{ComboStack: 1}); got != 0 {
		t.Fatalf("low combo reduction = %v, want 0", got)
	}
	if got := PassiveCooldownReduction(levels, skill, PassiveContext{ComboStack: 2}); got != 0.25 {
		t.Fatalf("high combo reduction = %v, want 0.25", got)
	}
}

func TestComboStatusCyclesAndExpires(t *testing.T) {
	var statuses []ActiveStatus
	def := BasicAttack.Combo
	if def == nil || len(def.Variants) != 4 {
		t.Fatal("basic attack should define four combo variants")
	}
	for i := 0; i < 4; i++ {
		if step := AdvanceCombo(&statuses, def, "player"); step != i {
			t.Fatalf("combo step = %d, want %d", step, i)
		}
		if i < 3 && ComboStack(statuses, def) != i+1 {
			t.Fatalf("combo stack = %d, want %d", ComboStack(statuses, def), i+1)
		}
	}
	if ComboStack(statuses, def) != 0 {
		t.Fatal("final combo variant should reset the stack")
	}
	if step := AdvanceCombo(&statuses, def, "player"); step != 0 {
		t.Fatalf("next combo should restart, got step %d", step)
	}
	if statuses[0].Remaining != 15 {
		t.Fatalf("combo should last 3 seconds (15 ticks), got %d", statuses[0].Remaining)
	}
	for i := 0; i < 15; i++ {
		TickStatuses(&statuses, 100, 1)
	}
	if len(statuses) != 0 {
		t.Fatal("combo status should expire after 3 seconds")
	}
}
