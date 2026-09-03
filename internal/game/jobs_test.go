package game

import "testing"

func TestSubjobEffectiveLevel(t *testing.T) {
	if got := SubjobEffectiveLevel(10, 8); got != 5 {
		t.Fatalf("expected 5, got %d", got)
	}
	if got := SubjobEffectiveLevel(10, 3); got != 3 {
		t.Fatalf("expected 3, got %d", got)
	}
	if got := SubjobEffectiveLevel(1, 1); got != 1 {
		t.Fatalf("expected floor of 1 at main lv 1, got %d", got)
	}
	if got := SubjobEffectiveLevel(10, 0); got != 0 {
		t.Fatalf("expected 0 with no sub level, got %d", got)
	}
}

func TestJobXPSplit(t *testing.T) {
	ConfigureExp(ExpRates{Rate: 1, MainPercent: 75, SubPercent: 25})
	t.Cleanup(func() { ConfigureExp(DefaultExpRates()) })

	main, sub := JobXPSplit(100, true)
	if main != 75 || sub != 25 {
		t.Fatalf("expected 75/25 split, got %d/%d", main, sub)
	}
	main, sub = JobXPSplit(100, false)
	if main != 100 || sub != 0 {
		t.Fatalf("solo main should take all XP, got %d/%d", main, sub)
	}
	main, sub = JobXPSplit(10, true)
	if main+sub != 10 {
		t.Fatalf("split should preserve total XP, got %d+%d", main, sub)
	}
}

func TestDistributeJobXPAppliesRate(t *testing.T) {
	ConfigureExp(ExpRates{Rate: 2, MainPercent: 50, SubPercent: 50})
	t.Cleanup(func() { ConfigureExp(DefaultExpRates()) })

	main, sub := DistributeJobXP(100, true)
	if main != 100 || sub != 100 {
		t.Fatalf("expected 2x then 50/50 → 100/100, got %d/%d", main, sub)
	}
	main, sub = DistributeJobXP(50, false)
	if main != 100 || sub != 0 {
		t.Fatalf("expected scaled solo main 100, got %d/%d", main, sub)
	}
}

func TestSkillUnlockLevel(t *testing.T) {
	if SkillUnlockLevel("war_heavy_swing") != 1 {
		t.Fatal("tier 0 should unlock at 1")
	}
	if SkillUnlockLevel("war_berserk") != 5 {
		t.Fatal("tier 1 should unlock at 5")
	}
}

func TestSkillLevelPotency(t *testing.T) {
	if SkillLevelPotency(1) != 1.0 {
		t.Fatal("level 1 should be 1.0")
	}
	if SkillLevelPotency(3) < 1.15 {
		t.Fatal("level 3 should be stronger")
	}
}

func TestJobComboKey(t *testing.T) {
	if JobComboKey(JobWAR, "") != "WAR" {
		t.Fatal("solo main key")
	}
	if JobComboKey(JobWAR, JobTHF) != "WAR/THF" {
		t.Fatal("combo key")
	}
}

func TestJobAllowsWeapon(t *testing.T) {
	if !JobAllowsWeapon(JobBLM, WeaponStaff) {
		t.Fatal("BLM should allow staff")
	}
	if JobAllowsWeapon(JobBLM, WeaponSword) {
		t.Fatal("BLM should not allow sword")
	}
	if !JobAllowsWeapon(JobRDM, WeaponSword) || !JobAllowsWeapon(JobRDM, WeaponStaff) {
		t.Fatal("RDM should allow sword and staff")
	}
	if !JobAllowsWeapon(JobDRG, WeaponSpear) {
		t.Fatal("DRG should allow spear")
	}
	if JobWeapon(JobDRG) != WeaponSpear {
		t.Fatalf("DRG default weapon = %q, want spear", JobWeapon(JobDRG))
	}
	if len(JobAllowedWeapons(JobWAR)) != 1 || JobAllowedWeapons(JobWAR)[0] != WeaponSword {
		t.Fatalf("WAR allowlist = %v, want [sword]", JobAllowedWeapons(JobWAR))
	}
}
