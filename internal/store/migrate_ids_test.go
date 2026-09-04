package store

import (
	"testing"

	"clara-mundi/internal/game"
)

func TestMigrateClaraMundiIDs(t *testing.T) {
	p := &Profile{
		Race:         "hume",
		MainJob:      "WAR",
		SubJob:       "THF",
		UnlockedJobs: []string{"WAR", "THF", "BLM", "SPL"},
		Jobs: map[string]game.JobProgress{
			"WAR": {Level: 12, XP: 40},
			"THF": {Level: 6, XP: 10},
			"SPL": {Level: 4, XP: 0},
		},
		UnlockedSkills: []string{"return", "teleport"},
		Inventory: []game.Item{
			{ID: "p1", Kind: game.KindConsumable, Consumable: "potion", Qty: 2},
		},
		Loadouts: map[string]JobLoadout{
			"WAR/THF": {
				Hotbar: map[string]HotbarBinding{
					"8": {Kind: "skill", ID: "return"},
					"2": {Kind: "item", ID: "potion"},
				},
				SkillLevels: map[string]int{"return": 1},
			},
		},
	}
	p.migrateClaraMundiIDs()

	if p.Race != string(game.RaceHumanus) {
		t.Fatalf("race = %q", p.Race)
	}
	if p.MainJob != string(game.JobVAN) || p.SubJob != string(game.JobCUT) {
		t.Fatalf("jobs = %s/%s", p.MainJob, p.SubJob)
	}
	if !p.HasUnlockedJob(game.JobHEX) {
		t.Fatal("expected HEX unlock from BLM/SPL")
	}
	if _, ok := p.Jobs[string(game.JobVAN)]; !ok {
		t.Fatal("expected VAN progress")
	}
	lo, ok := p.Loadouts[game.JobComboKey(game.JobVAN, game.JobCUT)]
	if !ok {
		t.Fatalf("loadout keys: %#v", p.Loadouts)
	}
	if lo.Hotbar["8"].ID != game.SkillIDReturn {
		t.Fatalf("hotbar return = %q", lo.Hotbar["8"].ID)
	}
	if p.Inventory[0].Consumable != "potio" {
		t.Fatalf("consumable = %q", p.Inventory[0].Consumable)
	}
	foundPort := false
	for _, id := range p.UnlockedSkills {
		if id == game.SkillIDPort {
			foundPort = true
		}
		if id == "teleport" || id == "porta" || id == "reditus" {
			t.Fatalf("legacy skill id still present: %q", id)
		}
	}
	if !foundPort {
		t.Fatal("expected port unlock from teleport")
	}
}

func TestMigrateNicheAliasToCombo(t *testing.T) {
	p := &Profile{
		MainJob:      "NVE",
		UnlockedJobs: []string{"NVE"},
		Jobs:         map[string]game.JobProgress{"NVE": {Level: 8}},
	}
	p.migrateClaraMundiIDs()
	if p.MainJob != string(game.JobCUT) {
		t.Fatalf("main = %q, want CUT", p.MainJob)
	}
	if !p.HasUnlockedJob(game.JobCAN) {
		t.Fatal("Nightveil should unlock Cantor sub")
	}
}
