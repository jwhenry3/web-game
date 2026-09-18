package server

import (
	"fmt"

	"clara-mundi/internal/protocol"
)

// registerPetsModule wires the pet routes (active/mount slots, release, the
// pet hotbar command, and the mount toggle stub) into the route registry.
func (h *Hub) registerPetsModule() error {
	routes := []struct {
		messageType protocol.MessageType
		handler     clientRoute
	}{
		{protocol.TypePetSetBattle, h.handlePetSetBattle},
		{protocol.TypePetSetMount, h.handlePetSetMount},
		{protocol.TypePetRelease, h.handlePetRelease},
		{protocol.TypePetCommand, h.handlePetCommand},
		{protocol.TypeMountToggle, h.handleMountToggle},
	}
	for _, route := range routes {
		if err := h.routes.register(route.messageType, route.handler); err != nil {
			return fmt.Errorf("register pets module: %w", err)
		}
	}
	return nil
}
