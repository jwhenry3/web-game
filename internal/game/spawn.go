package game

import "time"

// DefaultRespawn is used when a foe has no row in SpawnWindows.
const DefaultRespawn = 60 * time.Second

// SpawnWindows is the per-enemy respawn table. Keys may be a patrol ID
// (g1) or a kind (goblin). ID wins over kind. Missing keys use DefaultRespawn.
// Fill this in later with real spawn windows; every current foe is 60s.
var SpawnWindows = map[string]time.Duration{}

func RespawnDelay(kind, id string) time.Duration {
	if d, ok := SpawnWindows[id]; ok && d > 0 {
		return d
	}
	if d, ok := SpawnWindows[kind]; ok && d > 0 {
		return d
	}
	return DefaultRespawn
}
