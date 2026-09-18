package server

import (
	"encoding/json"
	"fmt"

	"clara-mundi/internal/protocol"
)

// registerCombatModule wires realtime-combat routes (actions, focus target,
// dodge) into the hub's route registry. Handlers keep their hub context —
// clientRoute already receives the *Client and runs on the Run goroutine.
func (h *Hub) registerCombatModule() error {
	routes := []struct {
		messageType protocol.MessageType
		handler     clientRoute
	}{
		{protocol.TypeAction, h.handleAction},
		{protocol.TypeSetTarget, h.handleSetTarget},
		{protocol.TypeDodge, func(c *Client, _ json.RawMessage) { h.handleDodge(c) }},
	}
	for _, route := range routes {
		if err := h.routes.register(route.messageType, route.handler); err != nil {
			return fmt.Errorf("register combat module: %w", err)
		}
	}
	return nil
}
