package game

import (
	"math/rand"
	"time"
)

const (
	defaultWanderMinDist = 8
	defaultWanderPause   = 5.0
	defaultWanderSpeed   = 28.0
	wanderPickAttempts   = 24
)

// Wander tuning loaded from data/overworld.json.
var Wander = wanderSettings{
	MinDistance: defaultWanderMinDist,
	PauseSec:    defaultWanderPause,
	Speed:       defaultWanderSpeed,
}

type wanderSettings struct {
	MinDistance int     `json:"minDistance"`
	PauseSec    float64 `json:"pauseSec"`
	Speed       float64 `json:"speed"`
}

// SeedFromID is a stable hash for deterministic NPC behaviour.
func SeedFromID(id string) int64 {
	var h int64
	for i := 0; i < len(id); i++ {
		h = h*31 + int64(id[i])
	}
	return h
}

// WalkableTilesInRegion lists every walkable tile inside a region.
func WalkableTilesInRegion(region Region) []Tile {
	out := make([]Tile, 0, (region.MaxC-region.MinC+1)*(region.MaxR-region.MinR+1))
	for r := region.MinR; r <= region.MaxR; r++ {
		for c := region.MinC; c <= region.MaxC; c++ {
			if WalkableTile(c, r) {
				out = append(out, Tile{C: c, R: r})
			}
		}
	}
	return out
}

func wanderMinDistance() int {
	if Wander.MinDistance > 0 {
		return Wander.MinDistance
	}
	return defaultWanderMinDist
}

// WanderIdleDuration is how long an NPC rests at each wander stop.
func WanderIdleDuration() time.Duration {
	sec := Wander.PauseSec
	if sec <= 0 {
		sec = defaultWanderPause
	}
	return time.Duration(sec * float64(time.Second))
}

// WanderSpeed returns overworld NPC movement in pixels per second.
func WanderSpeed() float64 {
	if Wander.Speed > 0 {
		return Wander.Speed
	}
	return defaultWanderSpeed
}

// PickRandomWanderPath chooses a distant random tile in the region and paths to it.
func PickRandomWanderPath(id string, region Region, from Tile, step int) []Vec2 {
	pool := WalkableTilesInRegion(region)
	if len(pool) == 0 {
		return nil
	}

	minDist := wanderMinDistance()
	rng := rand.New(rand.NewSource(SeedFromID(id) + int64(step)*7919 + int64(from.C)*997 + int64(from.R)*37))

	for attempt := 0; attempt < wanderPickAttempts; attempt++ {
		dest := pool[rng.Intn(len(pool))]
		if dest == from {
			continue
		}
		if tileManhattan(from, dest) < minDist {
			continue
		}
		path := Pathfind(from, dest, region)
		if len(path) > 0 {
			return path
		}
	}

	// Relax distance if the region is tight or heavily blocked.
	for attempt := 0; attempt < wanderPickAttempts; attempt++ {
		dest := pool[rng.Intn(len(pool))]
		if dest == from {
			continue
		}
		path := Pathfind(from, dest, region)
		if len(path) > 0 && tileManhattan(from, dest) >= 3 {
			return path
		}
	}
	return nil
}

func tileManhattan(a, b Tile) int {
	dc := a.C - b.C
	if dc < 0 {
		dc = -dc
	}
	dr := a.R - b.R
	if dr < 0 {
		dr = -dr
	}
	return dc + dr
}
