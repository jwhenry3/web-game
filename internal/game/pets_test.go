package game

import "testing"

func TestCaptureChanceClamped(t *testing.T) {
	low := CaptureChance(1, 50)
	if low < CaptureChanceMin-1e-9 || low > CaptureChanceMin+1e-9 {
		t.Fatalf("low level vs high enemy: got %v want %v", low, CaptureChanceMin)
	}
	high := CaptureChance(99, 1)
	if high < CaptureChanceMax-1e-9 || high > CaptureChanceMax+1e-9 {
		t.Fatalf("high level vs low enemy: got %v want %v", high, CaptureChanceMax)
	}
	mid := CaptureChance(10, 10)
	if mid < CaptureChanceBase-1e-9 || mid > CaptureChanceBase+1e-9 {
		t.Fatalf("equal levels: got %v want %v", mid, CaptureChanceBase)
	}
}

func TestEligibleForCapture(t *testing.T) {
	if !EligibleForCapture(true, true, 19, 100) {
		t.Fatal("19/100 should be eligible")
	}
	if EligibleForCapture(true, true, 20, 100) {
		t.Fatal("20/100 should not be eligible")
	}
	if EligibleForCapture(false, true, 1, 100) {
		t.Fatal("non-capturable should fail")
	}
}

func TestSkillCaptureFindable(t *testing.T) {
	sk, ok := FindSkill(ActionIDCapture)
	if !ok || sk.ID != ActionIDCapture || sk.Name != "Capture" {
		t.Fatalf("FindSkill(capture) = %+v ok=%v", sk, ok)
	}
	if !SkillAlwaysUnlocked(ActionIDCapture) {
		t.Fatal("capture should always be unlocked")
	}
	if SkillIsRanged(SkillCapture) {
		t.Fatal("capture should behave like a melee/instant target skill")
	}
}

func TestEncounterCapturableDefault(t *testing.T) {
	cfg := ParseEncounterJSON(`{"minEnemies":1,"maxEnemies":1,"enemies":[{"kind":"goblin","levelMin":1,"levelMax":1}]}`, "goblin", 1)
	if len(cfg.Enemies) != 1 || !cfg.Enemies[0].Capturable {
		t.Fatalf("missing capturable should default true: %+v", cfg.Enemies)
	}
	cfg2 := ParseEncounterJSON(`{"minEnemies":1,"maxEnemies":1,"enemies":[{"kind":"goblin","levelMin":1,"levelMax":1,"capturable":false}]}`, "goblin", 1)
	if cfg2.Enemies[0].Capturable {
		t.Fatal("explicit false should stick")
	}
}
