package plugins

import (
	"fmt"

	"clara-mundi/internal/plugins/combatatb"
	"clara-mundi/internal/plugins/combatrealtime"
	"clara-mundi/internal/plugins/contracts"
)

type factory func() contracts.CombatPlugin

var combatFactories = map[string]factory{
	"combat.ordo":      func() contracts.CombatPlugin { return combatatb.New() },
	"combat.atb":       func() contracts.CombatPlugin { return combatatb.New() }, // legacy alias
	"combat.realtime":  func() contracts.CombatPlugin { return combatrealtime.New() },
}

// NewCombatPlugin instantiates the configured combat plugin.
func NewCombatPlugin(cfg Config, host contracts.CombatHost) (contracts.CombatPlugin, error) {
	mod, err := cfg.ActiveCombatModule()
	if err != nil {
		return nil, err
	}
	f, ok := combatFactories[mod.ID]
	if !ok {
		return nil, fmt.Errorf("unknown combat plugin %q", mod.ID)
	}
	p := f()
	if err := p.Init(host, mod.Config); err != nil {
		return nil, err
	}
	return p, nil
}
