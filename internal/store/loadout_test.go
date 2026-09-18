package store

import (
	"testing"

	"clara-mundi/internal/game"
)

func TestDefaultHotbarMainOnly(t *testing.T) {
	hb := defaultHotbar(game.JobVAN, "")
	if hb["1"].ID != game.BasicAttack.ID {
		t.Fatalf("slot 1 = %q, want attack", hb["1"].ID)
	}
	if hb["2"].ID != "potio" {
		t.Fatalf("slot 2 = %q, want potion", hb["2"].ID)
	}
	if hb["3"].ID != game.RootSkillID(game.JobVAN) {
		t.Fatalf("slot 3 = %q, want %q", hb["3"].ID, game.RootSkillID(game.JobVAN))
	}
	if _, ok := hb["4"]; ok {
		t.Fatal("slot 4 should be empty without sub job")
	}
}

func TestDefaultHotbarWithSub(t *testing.T) {
	hb := defaultHotbar(game.JobHEX, game.JobCAN)
	if hb["3"].ID != game.RootSkillID(game.JobHEX) {
		t.Fatalf("slot 3 = %q, want %q", hb["3"].ID, game.RootSkillID(game.JobHEX))
	}
	if hb["4"].ID != game.RootSkillID(game.JobCAN) {
		t.Fatalf("slot 4 = %q, want %q", hb["4"].ID, game.RootSkillID(game.JobCAN))
	}
}

func TestNormalizeMergesWorldHotbar(t *testing.T) {
	l := JobLoadout{
		Hotbar: map[string]HotbarBinding{
			"1": {Kind: "skill", ID: game.BasicAttack.ID},
			"8": {Kind: "skill", ID: game.SkillIDReturn},
		},
		WorldHotbar: map[string]HotbarBinding{
			"1": {Kind: "skill", ID: game.SkillIDPort},
		},
	}
	l.normalize()
	if l.WorldHotbar != nil {
		t.Fatalf("world hotbar should be merged away: %+v", l.WorldHotbar)
	}
	// Legacy mixed bar stays put; the old world-bar binding lands on a free slot.
	if l.Hotbar["8"].ID != game.SkillIDReturn {
		t.Fatalf("slot 8 = %q, want return", l.Hotbar["8"].ID)
	}
	foundPort := false
	for _, b := range l.Hotbar {
		if b.ID == game.SkillIDPort {
			foundPort = true
		}
	}
	if !foundPort {
		t.Fatalf("world-bar binding lost in merge: %+v", l.Hotbar)
	}
	if l.Hotbar["7"].ID != game.ActionIDCapture {
		t.Fatalf("slot 7 = %q, want capture soft-fill", l.Hotbar["7"].ID)
	}
	// Return and port are already on the bar; camp soft-fills at ctrl+3.
	if l.Hotbar["ctrl+3"].ID != game.SkillIDCamp {
		t.Fatalf("ctrl+3 = %q, want camp soft-fill", l.Hotbar["ctrl+3"].ID)
	}
}

func TestNormalizeStripsDodge(t *testing.T) {
	l := JobLoadout{
		Hotbar: map[string]HotbarBinding{
			"8": {Kind: "skill", ID: game.ActionIDDodge},
		},
	}
	l.normalize()
	for _, b := range l.Hotbar {
		if b.ID == game.ActionIDDodge {
			t.Fatal("dodge must not sit on the hotbar (Shift keybind)")
		}
	}
}

func TestSetHotbar(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobVAN, "", nil)

	// Skills and items share the single hotbar.
	if _, ok := s.SetHotbar("Hero", "5", "skill", game.SkillIDReturn); !ok {
		t.Fatal("return should bind on the hotbar")
	}
	if _, ok := s.SetHotbar("Hero", "6", "item", "potio"); !ok {
		t.Fatal("item should bind on the hotbar")
	}
	if _, ok := s.SetHotbar("Hero", "7", "skill", game.ActionIDDodge); ok {
		t.Fatal("dodge should be rejected (Shift keybind)")
	}
	if _, ok := s.SetHotbar("Hero", "bogus", "skill", game.BasicAttack.ID); ok {
		t.Fatal("unknown slot should be rejected")
	}
	if _, ok := s.SetHotbar("Hero", "5", "", ""); !ok {
		t.Fatal("clear should succeed")
	}
	l := s.profiles["Hero"].ActiveLoadout()
	if _, ok := l.Hotbar["5"]; ok {
		t.Fatalf("slot 5 should be cleared: %+v", l.Hotbar)
	}
	if l.Hotbar["6"].ID != "potio" {
		t.Fatalf("slot 6 = %q, want potio", l.Hotbar["6"].ID)
	}
}

func TestEnsureLoadoutReusesCombo(t *testing.T) {
	p := &Profile{
		MainJob: string(game.JobVAN),
		SubJob:  string(game.JobHEX),
		Jobs: map[string]game.JobProgress{
			string(game.JobVAN): {Level: 1},
			string(game.JobHEX): {Level: 1},
		},
		Loadouts: map[string]JobLoadout{
			game.JobComboKey(game.JobVAN, game.JobHEX): {
				Hotbar: map[string]HotbarBinding{
					"1": {Kind: "skill", ID: "custom_skill"},
				},
				SkillLevels: map[string]int{},
				SkillUsage:  map[string]int{},
				Proficiency: map[string]int{},
			},
		},
		Inventory: []game.Item{},
	}
	p.ensureLoadout()
	l := p.Loadouts[game.JobComboKey(game.JobVAN, game.JobHEX)]
	if l.Hotbar["1"].ID != "custom_skill" {
		t.Fatalf("expected saved hotbar, got %+v", l.Hotbar)
	}
}

func TestEnsureLoadoutCreatesNewCombo(t *testing.T) {
	p := &Profile{
		MainJob:   string(game.JobSAN),
		SubJob:    "",
		Jobs:      map[string]game.JobProgress{string(game.JobSAN): {Level: 1}},
		Loadouts:  map[string]JobLoadout{},
		Inventory: []game.Item{},
	}
	p.ensureLoadout()
	key := game.JobComboKey(game.JobSAN, "")
	l, ok := p.Loadouts[key]
	if !ok {
		t.Fatal("expected new loadout")
	}
	if l.Hotbar["3"].ID != game.RootSkillID(game.JobSAN) {
		t.Fatalf("slot 3 = %q, want %q", l.Hotbar["3"].ID, game.RootSkillID(game.JobSAN))
	}
}

// Discipline growth accumulates in hundredths and levels on the linear curve.
func TestProficiencyGrowthLevels(t *testing.T) {
	l := JobLoadout{ProfLevels: map[string]int{}, ProfExp: map[string]int{}}
	applyProficiencyGrowth(&l, "swords", 40)
	if l.ProfLevels["swords"] != 0 || l.ProfExp["swords"] != 40 {
		t.Fatalf("40 growth = lvl %d exp %d, want 0/40", l.ProfLevels["swords"], l.ProfExp["swords"])
	}
	// Crossing the untrained threshold (100) levels to 1 and carries the remainder.
	applyProficiencyGrowth(&l, "swords", 80)
	if l.ProfLevels["swords"] != 1 || l.ProfExp["swords"] != 20 {
		t.Fatalf("120 total growth = lvl %d exp %d, want 1/20", l.ProfLevels["swords"], l.ProfExp["swords"])
	}
	// A big enough roll can skip multiple levels on the linear curve.
	applyProficiencyGrowth(&l, "swords", 500)
	if l.ProfLevels["swords"] != 3 || l.ProfExp["swords"] != 20 {
		t.Fatalf("520+ growth = lvl %d exp %d, want 3/20", l.ProfLevels["swords"], l.ProfExp["swords"])
	}
	// Growth stops at the cap.
	l.ProfLevels["swords"] = game.ProfMaxLevel
	applyProficiencyGrowth(&l, "swords", 40)
	if l.ProfExp["swords"] != 20 {
		t.Fatalf("maxed discipline still banks exp: %d", l.ProfExp["swords"])
	}
}
