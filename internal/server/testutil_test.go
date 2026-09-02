package server

import (
	"ffv-web-game/internal/plugins"
	"ffv-web-game/internal/store"
)

// testModulesConfig returns a minimal ATB combat config for unit tests.
func testModulesConfig() plugins.Config {
	return plugins.Config{
		Combat: "combat.atb",
		Modules: []plugins.ModuleConfig{
			{ID: "combat.atb", Enabled: true, Config: map[string]any{"battle_speed": 0.75}},
		},
	}
}

func mustTestHub() *Hub {
	h, err := NewHub(store.Load(""), nil, nil, 0, testModulesConfig())
	if err != nil {
		panic(err)
	}
	return h
}
