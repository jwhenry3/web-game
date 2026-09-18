package server

import (
	"fmt"

	"clara-mundi/internal/protocol"
)

// registerWorldModule wires world-interaction routes (save-point attunement
// and field skills like Return/Teleport/Camp) into the hub's route registry.
func (h *Hub) registerWorldModule() error {
	routes := []struct {
		messageType protocol.MessageType
		handler     clientRoute
	}{
		{protocol.TypeSetSavePoint, h.handleSetSavePoint},
		{protocol.TypeUseWorldSkill, h.handleUseWorldSkill},
	}
	for _, route := range routes {
		if err := h.routes.register(route.messageType, route.handler); err != nil {
			return fmt.Errorf("register world module: %w", err)
		}
	}
	return nil
}
