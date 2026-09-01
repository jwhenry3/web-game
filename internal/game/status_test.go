package game

import "testing"

func TestApplyStatusRefreshes(t *testing.T) {
	var list []ActiveStatus
	ApplyStatus(&list, StatusEffectDef{Kind: StatusDefenseUp, Duration: 20, Potency: 0.25}, "a1", 0)
	ApplyStatus(&list, StatusEffectDef{Kind: StatusDefenseUp, Duration: 40, Potency: 0.30}, "a1", 0)
	if len(list) != 1 {
		t.Fatalf("expected 1 status, got %d", len(list))
	}
	if list[0].Remaining != 40 || list[0].Potency != 0.30 {
		t.Fatalf("refresh failed: %+v", list[0])
	}
}

func TestDefenseUpReducesDamage(t *testing.T) {
	list := []ActiveStatus{{Kind: StatusDefenseUp, Potency: 0.25, Remaining: 10}}
	got := ModifyDamageTaken(&list, 100)
	if got >= 80 {
		t.Fatalf("expected reduced damage, got %d", got)
	}
}

func TestShieldAbsorbs(t *testing.T) {
	list := []ActiveStatus{{Kind: StatusShield, Potency: 1, Remaining: 10, ShieldHP: 30}}
	got := ModifyDamageTaken(&list, 100)
	if got != 70 {
		t.Fatalf("expected 70 damage after 30 shield, got %d", got)
	}
	if len(list) != 0 {
		t.Fatalf("depleted shield should be removed, got %+v", list)
	}
}

func TestStunBlocks(t *testing.T) {
	list := []ActiveStatus{{Kind: StatusStun, Remaining: 5}}
	if !IsStunned(list) {
		t.Fatal("expected stunned")
	}
}

func TestHasteMultiplier(t *testing.T) {
	list := []ActiveStatus{{Kind: StatusHaste, Potency: 0.25, Remaining: 5}}
	if got := ATBMultiplier(list); got != 1.25 {
		t.Fatalf("expected 1.25, got %v", got)
	}
}

func TestMinneTargetsAlly(t *testing.T) {
	sk, ok := FindSkill("brd_minne")
	if !ok {
		t.Fatal("brd_minne not found")
	}
	if !SkillTargetsAlly(sk) {
		t.Fatal("minne should target allies")
	}
}
