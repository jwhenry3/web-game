package game

import (
	"encoding/json"
	"math/rand"
	"strings"
)

// EncounterEnemy is one spawnable enemy type in a combat NPC encounter.
type EncounterEnemy struct {
	Kind       string `json:"kind"`
	LevelMin   int    `json:"levelMin"`
	LevelMax   int    `json:"levelMax"`
	DropPoolID string `json:"dropPoolId"`
	// Capturable defaults true when omitted from JSON.
	Capturable bool `json:"capturable"`
}

func (e *EncounterEnemy) UnmarshalJSON(data []byte) error {
	type raw EncounterEnemy
	aux := struct {
		Capturable *bool `json:"capturable"`
		*raw
	}{raw: (*raw)(e)}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	if aux.Capturable == nil {
		e.Capturable = true
	} else {
		e.Capturable = *aux.Capturable
	}
	return nil
}

// EncounterConfig controls enemy count, types, levels, and drop pools for a combat NPC.
type EncounterConfig struct {
	MinEnemies int              `json:"minEnemies"`
	MaxEnemies int              `json:"maxEnemies"`
	Enemies    []EncounterEnemy `json:"enemies"`
}

// DefaultEncounter builds a legacy-compatible encounter from kind + level.
func DefaultEncounter(kind string, level int) EncounterConfig {
	if kind == "" {
		kind = "goblin"
	}
	if level < 1 {
		level = 1
	}
	return EncounterConfig{
		MinEnemies: 2,
		MaxEnemies: 3,
		Enemies: []EncounterEnemy{{
			Kind:       kind,
			LevelMin:   level,
			LevelMax:   level,
			Capturable: true,
		}},
	}
}

// NormalizeEncounter clamps counts/levels and fills empty enemy lists.
func NormalizeEncounter(cfg EncounterConfig, fallbackKind string, fallbackLevel int) EncounterConfig {
	base := DefaultEncounter(fallbackKind, fallbackLevel)
	if cfg.MinEnemies < 1 {
		cfg.MinEnemies = base.MinEnemies
	}
	if cfg.MaxEnemies < 1 {
		cfg.MaxEnemies = base.MaxEnemies
	}
	if cfg.MaxEnemies < cfg.MinEnemies {
		cfg.MaxEnemies = cfg.MinEnemies
	}
	if cfg.MaxEnemies > 8 {
		cfg.MaxEnemies = 8
	}
	if cfg.MinEnemies > 8 {
		cfg.MinEnemies = 8
	}
	out := make([]EncounterEnemy, 0, len(cfg.Enemies))
	for _, e := range cfg.Enemies {
		e.Kind = strings.TrimSpace(e.Kind)
		if e.Kind == "" {
			e.Kind = fallbackKind
			if e.Kind == "" {
				e.Kind = "goblin"
			}
		}
		if e.LevelMin < 1 {
			e.LevelMin = fallbackLevel
			if e.LevelMin < 1 {
				e.LevelMin = 1
			}
		}
		if e.LevelMax < 1 {
			e.LevelMax = e.LevelMin
		}
		if e.LevelMax < e.LevelMin {
			e.LevelMax = e.LevelMin
		}
		e.DropPoolID = strings.TrimSpace(e.DropPoolID)
		out = append(out, e)
	}
	if len(out) == 0 {
		out = base.Enemies
	}
	cfg.Enemies = out
	return cfg
}

// ParseEncounterJSON parses the encounter property; empty/invalid → defaults.
func ParseEncounterJSON(raw string, fallbackKind string, fallbackLevel int) EncounterConfig {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DefaultEncounter(fallbackKind, fallbackLevel)
	}
	var cfg EncounterConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return DefaultEncounter(fallbackKind, fallbackLevel)
	}
	return NormalizeEncounter(cfg, fallbackKind, fallbackLevel)
}

// EncounterFromProps reads encounter from tiled props, falling back to kind/level.
func EncounterFromProps(props []tiledProp) EncounterConfig {
	kind := tiledPropString(props, "kind")
	level := tiledPropInt(props, "level")
	return ParseEncounterJSON(tiledPropString(props, "encounter"), kind, level)
}

// RollEnemyCount picks a count in [min, max].
func (cfg EncounterConfig) RollEnemyCount(rng *rand.Rand) int {
	if cfg.MinEnemies < 1 {
		cfg.MinEnemies = 1
	}
	if cfg.MaxEnemies < cfg.MinEnemies {
		cfg.MaxEnemies = cfg.MinEnemies
	}
	if cfg.MaxEnemies == cfg.MinEnemies {
		return cfg.MinEnemies
	}
	return cfg.MinEnemies + rng.Intn(cfg.MaxEnemies-cfg.MinEnemies+1)
}

// PickEnemy picks a uniform random spawn entry.
func (cfg EncounterConfig) PickEnemy(rng *rand.Rand) EncounterEnemy {
	if len(cfg.Enemies) == 0 {
		return DefaultEncounter("goblin", 1).Enemies[0]
	}
	return cfg.Enemies[rng.Intn(len(cfg.Enemies))]
}

// RollLevel picks a level in [LevelMin, LevelMax].
func (e EncounterEnemy) RollLevel(rng *rand.Rand) int {
	min, max := e.LevelMin, e.LevelMax
	if min < 1 {
		min = 1
	}
	if max < min {
		max = min
	}
	if max == min {
		return min
	}
	return min + rng.Intn(max-min+1)
}
