package servercfg

import (
	"encoding/json"
	"fmt"
	"os"

	"ffv-web-game/internal/plugins"
	"ffv-web-game/internal/plugins/combatatb"
)
type GlobalConfig struct {
	Name        string  `json:"name"`
	Addr        string  `json:"addr"`
	Data        string  `json:"data"`
	Accounts    string  `json:"accounts"`
	Static      string  `json:"static"`
	Overworld   string  `json:"overworld"`
	BattleSpeed float64 `json:"battle_speed"`
}

// Config is the top-level server.json document.
type Config struct {
	Server  GlobalConfig   `json:"server"`
	Plugins plugins.Config `json:"plugins"`
}

// Overrides are optional CLI values; non-zero / non-empty fields replace file settings.
type Overrides struct {
	Addr        string
	Data        string
	Accounts    string
	Static      string
	Overworld   string
	BattleSpeed float64
}

func Default() Config {
	return Config{
		Server: GlobalConfig{
			Addr:        ":8080",
			Data:        "data/profiles.json",
			Accounts:    "data/accounts.json",
			Static:      "",
			Overworld:   "data/maps/greenwood.map.json",
			BattleSpeed: combatatb.DefaultBattleSpeed,
		},
		Plugins: plugins.Config{
			Combat: "combat.atb",
			Modules: []plugins.ModuleConfig{
				{
					ID:           "combat.atb",
					Name:         "ATB Combat",
					Version:      "1.0.0",
					Capabilities: []string{"combat"},
					Enabled:      true,
					Frontend:     plugins.FrontendConfig{PluginID: "combat.atb"},
					Config:       map[string]any{"battle_speed": combatatb.DefaultBattleSpeed},
				},
			},
		},
	}
}

func Load(path string) (Config, error) {
	cfg := Default()
	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse %s: %w", path, err)
	}
	cfg.applyDefaults()
	if err := cfg.validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c *Config) ApplyOverrides(o Overrides) error {
	if o.Addr != "" {
		c.Server.Addr = o.Addr
	}
	if o.Data != "" {
		c.Server.Data = o.Data
	}
	if o.Accounts != "" {
		c.Server.Accounts = o.Accounts
	}
	if o.Static != "" {
		c.Server.Static = o.Static
	}
	if o.Overworld != "" {
		c.Server.Overworld = o.Overworld
	}
	if o.BattleSpeed > 0 {
		c.Server.BattleSpeed = o.BattleSpeed
	}
	c.applyDefaults()
	return c.validate()
}

func (c *Config) applyDefaults() {
	d := Default()
	if c.Server.Addr == "" {
		c.Server.Addr = d.Server.Addr
	}
	if c.Server.Data == "" {
		c.Server.Data = d.Server.Data
	}
	if c.Server.Accounts == "" {
		c.Server.Accounts = d.Server.Accounts
	}
	if c.Server.Static == "" {
		c.Server.Static = d.Server.Static
	}
	if c.Server.Overworld == "" {
		c.Server.Overworld = d.Server.Overworld
	}
	if c.Server.BattleSpeed <= 0 {
		c.Server.BattleSpeed = d.Server.BattleSpeed
	}
}

func (c *Config) validate() error {
	if c.Server.Overworld == "" {
		return fmt.Errorf("server config: server.overworld path required")
	}
	if _, err := os.Stat(c.Server.Overworld); err != nil {
		return fmt.Errorf("server config: overworld %q: %w", c.Server.Overworld, err)
	}
	if c.Plugins.Combat == "" {
		return fmt.Errorf("server config: plugins.combat module id required")
	}
	if _, err := c.Plugins.ActiveCombatModule(); err != nil {
		return fmt.Errorf("server config: %w", err)
	}
	return nil
}
