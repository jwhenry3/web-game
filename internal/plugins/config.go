package plugins

import "fmt"

// ModuleConfig describes one predefined plugin known at build time.
type ModuleConfig struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Version      string         `json:"version"`
	Capabilities []string       `json:"capabilities"`
	Enabled      bool           `json:"enabled"`
	Frontend     FrontendConfig `json:"frontend"`
	Config       map[string]any `json:"config"`
}

type FrontendConfig struct {
	PluginID string `json:"pluginId"`
}

// Config is the plugin section from server.json, served to clients at /api/modules.
type Config struct {
	Combat  string         `json:"combat"`
	Modules []ModuleConfig `json:"modules"`
}

func (c Config) ActiveCombatModule() (ModuleConfig, error) {
	for _, m := range c.Modules {
		if m.ID == c.Combat && m.Enabled {
			return m, nil
		}
	}
	return ModuleConfig{}, fmt.Errorf("combat module %q is not enabled", c.Combat)
}

func (c Config) ClientManifest() ClientManifest {
	mods := make([]ClientModule, 0, len(c.Modules))
	for _, m := range c.Modules {
		if !m.Enabled {
			continue
		}
		mods = append(mods, ClientModule{
			ID:           m.ID,
			Name:         m.Name,
			Version:      m.Version,
			Capabilities: m.Capabilities,
			Frontend:     m.Frontend,
			Config:       m.Config,
		})
	}
	return ClientManifest{
		Version: 1,
		Combat:  c.Combat,
		Modules: mods,
	}
}
