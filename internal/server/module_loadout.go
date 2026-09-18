package server

import (
	"fmt"

	"clara-mundi/internal/protocol"
)

// registerLoadoutModule wires profile/loadout routes (equipment, jobs, hotbar,
// keybinds) into the hub's route registry.
func (h *Hub) registerLoadoutModule() error {
	routes := []struct {
		messageType protocol.MessageType
		handler     clientRoute
	}{
		{protocol.TypeEquip, h.handleEquip},
		{protocol.TypeUnequip, h.handleUnequip},
		{protocol.TypeSetJobs, h.handleSetJobs},
		{protocol.TypeSetHotbar, h.handleSetHotbar},
		{protocol.TypeSetKeybinds, h.handleSetKeybinds},
	}
	for _, route := range routes {
		if err := h.routes.register(route.messageType, route.handler); err != nil {
			return fmt.Errorf("register loadout module: %w", err)
		}
	}
	return nil
}
