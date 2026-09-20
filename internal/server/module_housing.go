package server

import (
	"encoding/json"
	"fmt"

	"clara-mundi/internal/protocol"
)

// registerHousingModule wires the camp/house routes into the hub's route
// registry. Camp despawn on logout runs through the registry's disconnect
// hook (previously an explicit call in handleDisconnect); the hook still sees
// the client's Name/Transferring flag because it fires before teardown.
func (h *Hub) registerHousingModule() error {
	routes := []struct {
		messageType protocol.MessageType
		handler     clientRoute
	}{
		{protocol.TypeEnterHouse, h.handleEnterHouse},
		{protocol.TypeLeaveHouse, func(c *Client, _ json.RawMessage) { h.handleLeaveHouse(c) }},
		{protocol.TypeHouseInteract, h.handleHouseInteract},
		{protocol.TypeHouseStorageDeposit, h.handleHouseStorageDeposit},
		{protocol.TypeHouseStorageWithdraw, h.handleHouseStorageWithdraw},
		{protocol.TypeHousePlaceFurniture, h.handleHousePlaceFurniture},
		{protocol.TypeHousePickFurniture, h.handleHousePickFurniture},
		{protocol.TypeSetCampSkin, h.handleSetCampSkin},
	}
	for _, route := range routes {
		if err := h.routes.register(route.messageType, route.handler); err != nil {
			return fmt.Errorf("register housing module: %w", err)
		}
	}
	h.routes.onDisconnect(h.onHousingDisconnect)
	return nil
}
