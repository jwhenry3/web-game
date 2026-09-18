package server

import (
	"math/rand"

	"clara-mundi/internal/store"
)

func mustTestHub() *Hub {
	h, err := NewHub(store.Load(""), nil, nil)
	if err != nil {
		panic(err)
	}
	// Fixed-seed RNG: accuracy rolls, variance, and loot are deterministic in
	// tests. Tests needing a guaranteed hit give the attacker +15 dex over
	// the defender (HitChance caps at 1.0).
	h.rng = rand.New(rand.NewSource(1))
	return h
}
