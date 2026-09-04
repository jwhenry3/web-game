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
	if SkillUnlockLevel("van_cuneus") != 1 {
		t.Fatal("tier 0 should unlock at 1")
	}
	if SkillUnlockLevel("van_clamor_castra") != 5 {
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
	if JobComboKey(JobVAN, "") != "VAN" {
		t.Fatal("solo main key")
	}
	if JobComboKey(JobVAN, JobCUT) != "VAN/CUT" {
		t.Fatal("combo key")
	}
}

func TestJobAllowsWeapon(t *testing.T) {
	if !JobAllowsWeapon(JobHEX, WeaponStaff) {
		t.Fatal("Hexwright should allow staff")
	}
	if JobAllowsWeapon(JobHEX, WeaponSword) {
		t.Fatal("Hexwright should not allow sword")
	}
	if !JobAllowsWeapon(JobSAN, WeaponWand) {
		t.Fatal("Sanctifier should allow wand")
	}
	if !JobAllowsWeapon(JobAEG, WeaponHammer) {
		t.Fatal("Aegis should allow hammer")
	}
	if !JobAllowsWeapon(JobRVR, WeaponAxe) {
		t.Fatal("Reaver should allow axe")
	}
	if !JobAllowsWeapon(JobRON, WeaponKatana) {
		t.Fatal("Ronin should allow katana")
	}
	if !JobAllowsWeapon(JobBRW, WeaponKnuckles) {
		t.Fatal("Brawler should allow knuckles")
	}
	if !JobAllowsWeapon(JobLNC, WeaponSpear) {
		t.Fatal("Lancer should allow spear")
	}
	if len(JobAllowedWeapons(JobVAN)) != 1 || JobAllowedWeapons(JobVAN)[0] != WeaponSword {
		t.Fatalf("Vanguard allowlist = %v, want [sword]", JobAllowedWeapons(JobVAN))
	}
}

func TestEveryWeaponHasACore(t *testing.T) {
	covered := map[WeaponType]bool{}
	for _, def := range AllJobs() {
		covered[def.Weapon] = true
		for _, w := range def.AllowedWeapons {
			covered[w] = true
		}
	}
	for _, w := range WeaponTypes {
		if !covered[w] {
			t.Fatalf("weapon %s has no core class", w)
		}
	}
}

func TestComboAliasSpellblade(t *testing.T) {
	a, ok := AliasForCombo(JobVAN, JobHEX)
	if !ok || a.Name != "Spellblade" {
		t.Fatalf("VAN/HEX alias = %+v, ok=%v", a, ok)
	}
	if ComboDisplayName(JobVAN, JobHEX) != "Spellblade" {
		t.Fatal("display should use alias name")
	}
}
