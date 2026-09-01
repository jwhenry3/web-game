package store

import (
	"testing"

	"ffv-web-game/internal/game"
)

func TestDefaultHotbarMainOnly(t *testing.T) {
	hb := defaultHotbar(game.JobWAR, "")
	if hb["1"].ID != game.BasicAttack.ID {
		t.Fatalf("slot 1 = %q, want attack", hb["1"].ID)
	}
	if hb["2"].ID != "potion" {
		t.Fatalf("slot 2 = %q, want potion", hb["2"].ID)
	}
	if hb["3"].ID != game.RootSkillID(game.JobWAR) {
		t.Fatalf("slot 3 = %q, want %q", hb["3"].ID, game.RootSkillID(game.JobWAR))
	}
	if _, ok := hb["4"]; ok {
		t.Fatal("slot 4 should be empty without sub job")
	}
}

func TestDefaultHotbarWithSub(t *testing.T) {
	hb := defaultHotbar(game.JobBLM, game.JobBRD)
	if hb["3"].ID != game.RootSkillID(game.JobBLM) {
		t.Fatalf("slot 3 = %q, want %q", hb["3"].ID, game.RootSkillID(game.JobBLM))
	}
	if hb["4"].ID != game.RootSkillID(game.JobBRD) {
		t.Fatalf("slot 4 = %q, want %q", hb["4"].ID, game.RootSkillID(game.JobBRD))
	}
}

func TestEnsureLoadoutReusesCombo(t *testing.T) {
	p := &Profile{
		MainJob: string(game.JobWAR),
		SubJob:  string(game.JobBLM),
		Jobs: map[string]game.JobProgress{
			string(game.JobWAR): {Level: 1},
			string(game.JobBLM): {Level: 1},
		},
		Loadouts: map[string]JobLoadout{
			game.JobComboKey(game.JobWAR, game.JobBLM): {
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
	l := p.Loadouts[game.JobComboKey(game.JobWAR, game.JobBLM)]
	if l.Hotbar["1"].ID != "custom_skill" {
		t.Fatalf("expected saved hotbar, got %+v", l.Hotbar)
	}
}

func TestEnsureLoadoutCreatesNewCombo(t *testing.T) {
	p := &Profile{
		MainJob:   string(game.JobWHM),
		SubJob:    "",
		Jobs:      map[string]game.JobProgress{string(game.JobWHM): {Level: 1}},
		Loadouts:  map[string]JobLoadout{},
		Inventory: []game.Item{},
	}
	p.ensureLoadout()
	key := game.JobComboKey(game.JobWHM, "")
	l, ok := p.Loadouts[key]
	if !ok {
		t.Fatal("expected new loadout")
	}
	if l.Hotbar["3"].ID != game.RootSkillID(game.JobWHM) {
		t.Fatalf("slot 3 = %q, want %q", l.Hotbar["3"].ID, game.RootSkillID(game.JobWHM))
	}
}
