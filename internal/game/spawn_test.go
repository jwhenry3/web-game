package game

import (
	"testing"
	"time"
)

func TestRespawnDelayFallsBackToDefault(t *testing.T) {
	if got := RespawnDelay("goblin", "g1"); got != DefaultRespawn {
		t.Fatalf("empty table should use default, got %s", got)
	}
}

func TestRespawnDelayPrefersIDOverKind(t *testing.T) {
	t.Cleanup(func() {
		delete(SpawnWindows, "g1")
		delete(SpawnWindows, "goblin")
	})
	SpawnWindows["goblin"] = 30 * time.Second
	SpawnWindows["g1"] = 90 * time.Second
	if got := RespawnDelay("goblin", "g1"); got != 90*time.Second {
		t.Fatalf("id should win, got %s", got)
	}
	if got := RespawnDelay("goblin", "g2"); got != 30*time.Second {
		t.Fatalf("kind should apply when id is missing, got %s", got)
	}
}
