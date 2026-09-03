package store

import (
	"testing"

	"ffv-web-game/internal/game"
)

func TestCreateCharacterMainOnlySeedsUnlockedJobs(t *testing.T) {
	s := testStore(t)
	p, errMsg := s.CreateCharacter("acct1", "Hero", game.RaceHume, game.JobWAR, game.JobTHF, Appearance{})
	if errMsg != "" {
		t.Fatalf("create: %s", errMsg)
	}
	if p.SubJob != "" {
		t.Fatalf("creation must not equip sub job, got %q", p.SubJob)
	}
	if len(p.UnlockedJobs) != len(game.StartingJobs) {
		t.Fatalf("expected %d unlocked starters, got %v", len(game.StartingJobs), p.UnlockedJobs)
	}
	for _, j := range game.StartingJobs {
		if !p.HasUnlockedJob(j) {
			t.Fatalf("missing starter unlock %s", j)
		}
	}
}

func TestCreateCharacterRejectsNonStarterMain(t *testing.T) {
	s := testStore(t)
	_, errMsg := s.CreateCharacter("acct1", "Hero", game.RaceHume, game.JobNIN, "", Appearance{})
	if errMsg == "" {
		t.Fatal("expected rejection for non-starter main")
	}
}

func TestSetJobsRejectsLockedJob(t *testing.T) {
	s := testStore(t)
	s.GetOrCreate("Hero", game.JobWAR)
	_, errMsg := s.SetJobs("Hero", game.JobNIN, "")
	if errMsg == "" {
		t.Fatal("expected locked advanced job to be rejected")
	}
	if _, errMsg := s.UnlockJob("Hero", game.JobNIN); errMsg != "" {
		t.Fatalf("unlock: %s", errMsg)
	}
	p, errMsg := s.SetJobs("Hero", game.JobNIN, "")
	if errMsg != "" {
		t.Fatalf("set unlocked job: %s", errMsg)
	}
	if p.MainJob != string(game.JobNIN) {
		t.Fatalf("expected NIN, got %s", p.MainJob)
	}
}

func TestSetJobsRejectsSubBeforeUnlockLevel(t *testing.T) {
	prev := game.SubjobUnlockLevel
	game.SubjobUnlockLevel = 5
	t.Cleanup(func() { game.SubjobUnlockLevel = prev })

	s := testStore(t)
	s.GetOrCreate("Hero", game.JobWAR)
	_, errMsg := s.SetJobs("Hero", game.JobWAR, game.JobTHF)
	if errMsg == "" {
		t.Fatal("expected sub job rejection below unlock level")
	}

	s.mu.Lock()
	s.profiles["Hero"].Jobs[string(game.JobWAR)] = game.JobProgress{Level: 5, XP: 0}
	s.profiles["Hero"].syncLegacyLevel()
	s.mu.Unlock()

	p, errMsg := s.SetJobs("Hero", game.JobWAR, game.JobTHF)
	if errMsg != "" {
		t.Fatalf("set sub at unlock level: %s", errMsg)
	}
	if p.SubJob != string(game.JobTHF) {
		t.Fatalf("expected THF sub, got %q", p.SubJob)
	}
}
