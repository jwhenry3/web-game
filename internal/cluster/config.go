package cluster

import (
	"encoding/json"
	"fmt"
	"os"

	"ffv-web-game/internal/servercfg"
)

// Config is the cluster document: one global proxy and N map servers.
type Config struct {
	Proxy ProxyConfig `json:"proxy"`
	Maps  []MapSpec   `json:"maps"`
}

type ProxyConfig struct {
	Name            string `json:"name"`
	Addr            string `json:"addr"`
	Accounts        string `json:"accounts"`
	Data            string `json:"data"`
	Static          string `json:"static"`
	InternalSecret  string `json:"internal_secret"`
}

type MapSpec struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Addr    string `json:"addr"`
	Config  string `json:"config"`
	Default bool   `json:"default"`
}

func Default() Config {
	return Config{
		Proxy: ProxyConfig{
			Name:     "FFV",
			Addr:     ":8080",
			Accounts: "data/accounts.json",
			Data:     "data/profiles.json",
			Static:   "web/dist",
		},
		Maps: []MapSpec{
			{ID: "greenwood", Name: "Greenwood", Addr: ":8091", Config: "config/server.json", Default: true},
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
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c *Config) applyDefaults() {
	d := Default()
	if c.Proxy.Addr == "" {
		c.Proxy.Addr = d.Proxy.Addr
	}
	if c.Proxy.Accounts == "" {
		c.Proxy.Accounts = d.Proxy.Accounts
	}
	if c.Proxy.Data == "" {
		c.Proxy.Data = d.Proxy.Data
	}
	if c.Proxy.Static == "" {
		c.Proxy.Static = d.Proxy.Static
	}
}

func (c Config) Validate() error {
	if len(c.Maps) == 0 {
		return fmt.Errorf("cluster: at least one map is required")
	}
	seen := map[string]bool{}
	defaults := 0
	for _, m := range c.Maps {
		if m.ID == "" {
			return fmt.Errorf("cluster: map id required")
		}
		if seen[m.ID] {
			return fmt.Errorf("cluster: duplicate map id %q", m.ID)
		}
		seen[m.ID] = true
		if m.Config == "" {
			return fmt.Errorf("cluster: map %q missing config", m.ID)
		}
		if _, err := os.Stat(m.Config); err != nil {
			return fmt.Errorf("cluster: map %q config %q: %w", m.ID, m.Config, err)
		}
		if _, err := servercfg.Load(m.Config); err != nil {
			return fmt.Errorf("cluster: map %q: %w", m.ID, err)
		}
		if m.Default {
			defaults++
		}
	}
	if defaults > 1 {
		return fmt.Errorf("cluster: only one map may be default")
	}
	return nil
}

func (c Config) DefaultMap() MapSpec {
	for _, m := range c.Maps {
		if m.Default {
			return m
		}
	}
	return c.Maps[0]
}

func (c Config) MapByID(id string) (MapSpec, bool) {
	for _, m := range c.Maps {
		if m.ID == id {
			return m, true
		}
	}
	return MapSpec{}, false
}

func (c Config) HasMap(id string) bool {
	_, ok := c.MapByID(id)
	return ok
}
