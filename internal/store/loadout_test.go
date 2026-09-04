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
	if hb["8"].ID != game.SkillIDReturn {
		t.Fatalf("slot 8 = %q, want return", hb["8"].ID)
	}
	if hb["7"].ID != game.ActionIDCapture {
		t.Fatalf("slot 7 = %q, want capture", hb["7"].ID)
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
	if hb["8"].ID != game.SkillIDReturn {
		t.Fatalf("slot 8 = %q, want return", hb["8"].ID)
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
