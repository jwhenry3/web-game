package store

import (
	"testing"

	"clara-mundi/internal/game"
)

func TestCreateCharacterMainOnlySeedsUnlockedJobs(t *testing.T) {
	s := testStore(t)
	p, errMsg := s.CreateCharacter("acct1", "Hero", game.RaceHumanus, game.JobVAN, game.JobCUT, Appearance{})
	if errMsg != "" {
		t.Fatalf("create: %s", errMsg)
	}
	if p.SubJob != "" {
		t.Fatalf("creation must not equip sub job, got %q", p.SubJob)
	}
	if len(p.UnlockedJobs) != len(game.StartingJobs) {
		t.Fatalf("expected %d unlocked starters, got %v", len(game.StartingJobs), p.UnlockedJobs)
	}
}

func TestCreateCharacterRejectsAdvancedMain(t *testing.T) {
	s := testStore(t)
	_, errMsg := s.CreateCharacter("acct1", "Hero", game.RaceHumanus, game.JobLNC, "", Appearance{})
	if errMsg == "" {
		t.Fatal("expected rejection for advanced Lancer at create")
	}
}

func TestSetJobsRejectsLockedAdvanced(t *testing.T) {
	s := testStore(t)
	s.GetOrCreate("Hero", game.JobVAN)
	_, errMsg := s.SetJobs("Hero", game.JobRON, "")
	if errMsg == "" {
		t.Fatal("expected locked Ronin to be rejected")
	}
	if _, errMsg := s.UnlockJob("Hero", game.JobRON); errMsg != "" {
		t.Fatalf("unlock: %s", errMsg)
	}
	p, errMsg := s.SetJobs("Hero", game.JobRON, "")
	if errMsg != "" {
		t.Fatalf("set unlocked job: %s", errMsg)
	}
	if p.MainJob != string(game.JobRON) {
		t.Fatalf("expected RON, got %s", p.MainJob)
	}
}

func TestSetJobsRejectsSubBeforeUnlockLevel(t *testing.T) {
	prev := game.SubjobUnlockLevel
	game.SubjobUnlockLevel = 5
	t.Cleanup(func() { game.SubjobUnlockLevel = prev })

	s := testStore(t)
	s.GetOrCreate("Hero", game.JobVAN)
	_, errMsg := s.SetJobs("Hero", game.JobVAN, game.JobCUT)
	if errMsg == "" {
		t.Fatal("expected sub job rejection below unlock level")
	}

	s.mu.Lock()
	s.profiles["Hero"].Jobs[string(game.JobVAN)] = game.JobProgress{Level: 5, XP: 0}
	s.profiles["Hero"].syncLegacyLevel()
	s.mu.Unlock()

	p, errMsg := s.SetJobs("Hero", game.JobVAN, game.JobCUT)
	if errMsg != "" {
		t.Fatalf("set sub at unlock level: %s", errMsg)
	}
	if p.SubJob != string(game.JobCUT) {
		t.Fatalf("expected CUT sub, got %q", p.SubJob)
	}
}
