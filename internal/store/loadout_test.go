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
	if hb["7"].ID != game.ActionIDCapture {
		t.Fatalf("slot 7 = %q, want capture", hb["7"].ID)
	}
	wb := defaultWorldHotbar()
	if wb["1"].ID != game.SkillIDReturn || wb["2"].ID != game.SkillIDPort || wb["3"].ID != game.SkillIDCamp {
		t.Fatalf("world hotbar = %+v, want return/port/camp", wb)
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
	if hb["7"].ID != game.ActionIDCapture {
		t.Fatalf("slot 7 = %q, want capture", hb["7"].ID)
	}
}

func TestNormalizeSplitsWorldSkills(t *testing.T) {
	l := JobLoadout{
		Hotbar: map[string]HotbarBinding{
			"1": {Kind: "skill", ID: game.BasicAttack.ID},
			"8": {Kind: "skill", ID: game.SkillIDReturn},
		},
	}
	l.normalize()
	if _, ok := l.Hotbar["8"]; ok {
		t.Fatalf("return should move off the battle bar: %+v", l.Hotbar)
	}
	if l.WorldHotbar["8"].ID != game.SkillIDReturn {
		t.Fatalf("world hotbar slot 8 = %q, want return", l.WorldHotbar["8"].ID)
	}
	if l.WorldHotbar["2"].ID != game.SkillIDPort || l.WorldHotbar["3"].ID != game.SkillIDCamp {
		t.Fatalf("world hotbar = %+v, want port/camp soft-filled", l.WorldHotbar)
	}
	if l.Hotbar["7"].ID != game.ActionIDCapture {
		t.Fatalf("battle hotbar slot 7 = %q, want capture", l.Hotbar["7"].ID)
	}
}

func TestNormalizeSplitsBattleSkillsOffWorldBar(t *testing.T) {
	l := JobLoadout{
		WorldHotbar: map[string]HotbarBinding{
			"5": {Kind: "skill", ID: game.BasicAttack.ID},
			"6": {Kind: "item", ID: "potio"},
		},
	}
	l.normalize()
	if _, ok := l.WorldHotbar["5"]; ok {
		t.Fatalf("attack should move off the world bar: %+v", l.WorldHotbar)
	}
	if _, ok := l.WorldHotbar["6"]; ok {
		t.Fatalf("items should move off the world bar: %+v", l.WorldHotbar)
	}
	if l.Hotbar["5"].ID != game.BasicAttack.ID || l.Hotbar["6"].ID != "potio" {
		t.Fatalf("battle hotbar = %+v, want attack + potio", l.Hotbar)
	}
}

func TestSetHotbarRoutesByBar(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobVAN, "", nil)

	// Field skills bind on the world bar; battle skills and items on the
	// battle bar. Cross-bar writes are rejected.
	if _, ok := s.SetHotbar("Hero", game.HotbarBarWorld, "5", "skill", game.SkillIDReturn); !ok {
		t.Fatal("return should bind on the world bar")
	}
	if _, ok := s.SetHotbar("Hero", game.HotbarBarWorld, "6", "skill", game.BasicAttack.ID); ok {
		t.Fatal("attack should be rejected on the world bar")
	}
	if _, ok := s.SetHotbar("Hero", game.HotbarBarWorld, "6", "item", "potio"); ok {
		t.Fatal("items should be rejected on the world bar")
	}
	if _, ok := s.SetHotbar("Hero", game.HotbarBarBattle, "6", "item", "potio"); !ok {
		t.Fatal("item should bind on the battle bar")
	}
	if _, ok := s.SetHotbar("Hero", game.HotbarBarBattle, "5", "skill", game.SkillIDReturn); ok {
		t.Fatal("return should be rejected on the battle bar")
	}
	// Empty bar defaults to battle for backwards compatibility.
	if _, ok := s.SetHotbar("Hero", "", "8", "skill", game.BasicAttack.ID); !ok {
		t.Fatal("default bar should accept battle skills")
	}
	if _, ok := s.SetHotbar("Hero", "bogus", "8", "skill", game.BasicAttack.ID); ok {
		t.Fatal("unknown bar should be rejected")
	}
	// Clearing is per-bar: clearing the world slot leaves the battle slot.
	if _, ok := s.SetHotbar("Hero", game.HotbarBarWorld, "5", "", ""); !ok {
		t.Fatal("clear on world bar should succeed")
	}
	l := s.profiles["Hero"].ActiveLoadout()
	if _, ok := l.WorldHotbar["5"]; ok {
		t.Fatalf("world slot 5 should be cleared: %+v", l.WorldHotbar)
	}
	if l.WorldHotbar["6"].ID != "" || l.Hotbar["6"].ID != "potio" {
		t.Fatalf("bars = %+v / %+v", l.WorldHotbar, l.Hotbar)
	}
	if l.Hotbar["8"].ID != game.BasicAttack.ID {
		t.Fatalf("battle slot 8 = %q, want attack", l.Hotbar["8"].ID)
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
