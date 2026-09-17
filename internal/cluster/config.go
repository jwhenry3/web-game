package cluster

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"clara-mundi/internal/game"
	"clara-mundi/internal/servercfg"
)

// Config is the cluster document: one global proxy and either one singular
// world server or N legacy map servers. When World is configured, the host
// starts it instead of the legacy Maps list.
type Config struct {
	Proxy ProxyConfig   `json:"proxy"`
	Exp   game.ExpRates `json:"exp"`
	Maps  []MapSpec     `json:"maps"`
	// World selects singular-world startup while Maps remain available as
	// legacy content and migration metadata.
	World *WorldSpec `json:"world,omitempty"`
	// WorldLayout maps map id → world-space pixel origin, computed from the
	// border graph at Validate time. Not persisted.
	WorldLayout map[string][2]int `json:"-"`
}

type WorldSpec struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Config string `json:"config"`
}

type ProxyConfig struct {
	Name           string `json:"name"`
	Addr           string `json:"addr"`
	Accounts       string `json:"accounts"`
	Data           string `json:"data"`
	Static         string `json:"static"`
	InternalSecret string `json:"internal_secret"`
}

type MapSpec struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Addr    string `json:"addr,omitempty"`
	Config  string `json:"config"`
	Default bool   `json:"default,omitempty"`
	// Enabled defaults to true when omitted. Disabled maps stay in the
	// registry but do not run a map server until re-enabled.
	Enabled *bool `json:"enabled,omitempty"`
}

func (m MapSpec) IsEnabled() bool {
	return m.Enabled == nil || *m.Enabled
}

func BoolPtr(v bool) *bool { return &v }

// MapsRegistryPath is the runtime map list (created/disabled maps). Kept under
// data/ so the Air live-reload watcher does not restart the server mid-request.
func MapsRegistryPath(dataFile string) string {
	dir := filepath.Dir(dataFile)
	if dir == "" || dir == "." {
		dir = "data"
	}
	return filepath.Join(dir, "cluster.maps.json")
}

type mapsRegistry struct {
	Maps []MapSpec `json:"maps"`
}

func Default() Config {
	return Config{
		Proxy: ProxyConfig{
			Name:     "Clara Mundi",
			Addr:     ":8080",
			Accounts: "data/accounts.json",
			Data:     "data/profiles.json",
			Static:   "",
		},
		Exp: game.DefaultExpRates(),
		Maps: []MapSpec{
			{ID: "greenwood", Name: "Greenwood", Addr: ":8091", Config: "data/maps/greenwood.server.json", Default: true},
			{ID: "frostkeep", Name: "Frostkeep", Addr: ":8097", Config: "data/maps/frostkeep.server.json"},
			{ID: "tidecourt", Name: "Tide Court", Addr: ":8103", Config: "data/maps/tidecourt.server.json"},
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
	if err := cfg.loadMapsRegistry(); err != nil {
		return Config{}, err
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c *Config) loadMapsRegistry() error {
	path := MapsRegistryPath(c.Proxy.Data)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read maps registry: %w", err)
	}
	var reg mapsRegistry
	if err := json.Unmarshal(raw, &reg); err != nil {
		return fmt.Errorf("parse maps registry: %w", err)
	}
	if len(reg.Maps) > 0 {
		c.Maps = reg.Maps
	}
	return nil
}

// SaveMapsRegistry persists the live map list without touching data/cluster.json.
func SaveMapsRegistry(cfg Config) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	path := MapsRegistryPath(cfg.Proxy.Data)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(mapsRegistry{Maps: cfg.Maps}, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

// Save writes the full cluster document (proxy + maps). Prefer SaveMapsRegistry
// for runtime map create/enable/disable so live-reload does not bounce the process.
func Save(path string, cfg Config) error {
	if err := cfg.Validate(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
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
	if c.Exp == (game.ExpRates{}) {
		c.Exp = game.DefaultExpRates()
	} else {
		c.Exp = game.NormalizeExpRates(c.Exp)
	}
}

func (c *Config) Validate() error {
	if c.World != nil {
		if err := c.validateWorld(); err != nil {
			return err
		}
	}
	if len(c.Maps) == 0 {
		return fmt.Errorf("cluster: at least one map is required")
	}
	seen := map[string]bool{}
	defaults := 0
	enabledCount := 0
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
		if m.IsEnabled() {
			enabledCount++
		}
		if m.Default {
			defaults++
			if !m.IsEnabled() {
				return fmt.Errorf("cluster: default map %q must be enabled", m.ID)
			}
		}
	}
	if defaults > 1 {
		return fmt.Errorf("cluster: only one map may be default")
	}
	if enabledCount == 0 {
		return fmt.Errorf("cluster: at least one map must be enabled")
	}
	return c.validateBorders()
}

func (c *Config) validateWorld() error {
	w := c.World
	if w.ID == "" {
		return fmt.Errorf("cluster: world id required")
	}
	if w.Name == "" {
		return fmt.Errorf("cluster: world name required")
	}
	if w.Config == "" {
		return fmt.Errorf("cluster: world %q missing config", w.ID)
	}
	if _, err := os.Stat(w.Config); err != nil {
		return fmt.Errorf("cluster: world %q config %q: %w", w.ID, w.Config, err)
	}
	if _, err := servercfg.Load(w.Config); err != nil {
		return fmt.Errorf("cluster: world %q: %w", w.ID, err)
	}
	return nil
}

// validateBorders checks the map border graph across every configured map:
// symmetric opposite-edge relationships, real destinations, and reachable
// edge tiles. Broken relationships are boot-fatal; suspicious states log
// warnings. Maps whose overworld is not a .map.json have no border graph.
func (c *Config) validateBorders() error {
	cfgs := map[string]*game.MapConfig{}
	enabled := map[string]bool{}
	for _, m := range c.Maps {
		sc, err := servercfg.Load(m.Config)
		if err != nil {
			continue // already reported by the per-map checks above
		}
		path := sc.Server.Overworld
		if !game.IsMapConfigPath(path) {
			continue
		}
		mc, err := game.LoadMapConfig(path)
		if err != nil {
			return fmt.Errorf("cluster: map %q: %w", m.ID, err)
		}
		cfgs[m.ID] = mc
		enabled[m.ID] = m.IsEnabled()
	}
	rep := game.ValidateMapBorders(cfgs)
	for _, w := range rep.Warnings {
		log.Printf("cluster: border warning: %s", w)
	}
	for id, mc := range cfgs {
		for _, dest := range mc.Borders {
			if ok, known := enabled[dest]; known && !ok {
				log.Printf("cluster: border warning: %s borders disabled map %q — transfers there will be refused", id, dest)
			}
		}
	}
	// World layout: BFS the border graph onto a uniform cell grid. The stride
	// is the largest map's pixel size so smaller maps never overlap.
	layout, lerrs := game.ComputeWorldLayout(cfgs)
	rep.Errors = append(rep.Errors, lerrs...)
	if len(rep.Errors) > 0 {
		return fmt.Errorf("cluster: broken map border graph:\n  %s", strings.Join(rep.Errors, "\n  "))
	}
	strideX, strideY := 0, 0
	for _, mc := range cfgs {
		if w := mc.Cols * mc.TileSize; w > strideX {
			strideX = w
		}
		if h := mc.Rows * mc.TileSize; h > strideY {
			strideY = h
		}
	}
	c.WorldLayout = make(map[string][2]int, len(layout))
	for id, cell := range layout {
		c.WorldLayout[id] = [2]int{cell[0] * strideX, cell[1] * strideY}
	}
	for id := range cfgs {
		if _, ok := c.WorldLayout[id]; !ok {
			log.Printf("cluster: border warning: %s has no border path to the world graph — it won't appear in the map overlay", id)
		}
	}
	return nil
}

func (c Config) DefaultMap() MapSpec {
	for _, m := range c.Maps {
		if m.Default && m.IsEnabled() {
			return m
		}
	}
	for _, m := range c.Maps {
		if m.IsEnabled() {
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

// CanTravelTo reports whether transfers to id should be allowed.
func (c Config) CanTravelTo(id string) bool {
	m, ok := c.MapByID(id)
	return ok && m.IsEnabled()
}

func (c *Config) UpdateMap(id string, fn func(*MapSpec)) bool {
	for i := range c.Maps {
		if c.Maps[i].ID == id {
			fn(&c.Maps[i])
			return true
		}
	}
	return false
}

func (c *Config) RemoveMapSpec(id string) bool {
	for i := range c.Maps {
		if c.Maps[i].ID == id {
			c.Maps = append(c.Maps[:i], c.Maps[i+1:]...)
			return true
		}
	}
	return false
}

// HasWorld reports whether the cluster should use singular-world startup.
func (c Config) HasWorld() bool {
	return c.World != nil && c.World.ID != ""
}

// WorldSpec returns the configured world when present. The bool result is
// false when the cluster is running in legacy map-only mode.
func (c Config) WorldSpec() (WorldSpec, bool) {
	if !c.HasWorld() {
		return WorldSpec{}, false
	}
	return *c.World, true
}

// LoadWorldConfig loads and validates the world server config path using
// the same servercfg.Load convention as MapSpec.Config.
func (c Config) LoadWorldConfig() (servercfg.Config, error) {
	if !c.HasWorld() {
		return servercfg.Config{}, fmt.Errorf("cluster: no world configured")
	}
	return servercfg.Load(c.World.Config)
}
