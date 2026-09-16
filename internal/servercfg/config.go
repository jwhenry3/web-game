package servercfg

import (
	"encoding/json"
	"fmt"
	"os"
)

type GlobalConfig struct {
	Name      string `json:"name"`
	Addr      string `json:"addr"`
	Data      string `json:"data"`
	Accounts  string `json:"accounts"`
	Static    string `json:"static"`
	Overworld string `json:"overworld"`
}

// Config is the top-level server.json document.
type Config struct {
	Server GlobalConfig `json:"server"`
}

// Overrides are optional CLI values; non-zero / non-empty fields replace file settings.
type Overrides struct {
	Addr      string
	Data      string
	Accounts  string
	Static    string
	Overworld string
}

func Default() Config {
	return Config{
		Server: GlobalConfig{
			Addr:      ":8080",
			Data:      "data/profiles.json",
			Accounts:  "data/accounts.json",
			Static:    "",
			Overworld: "data/maps/greenwood.map.json",
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

// Save writes cfg as indented JSON to path.
func Save(path string, cfg Config) error {
	cfg.applyDefaults()
	if err := cfg.validate(); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0o644)
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
}

func (c *Config) validate() error {
	if c.Server.Overworld == "" {
		return fmt.Errorf("server config: server.overworld path required")
	}
	if _, err := os.Stat(c.Server.Overworld); err != nil {
		return fmt.Errorf("server config: overworld %q: %w", c.Server.Overworld, err)
	}
	return nil
}
