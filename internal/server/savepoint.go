package server

import (
	"encoding/json"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

const savePointInteractRange = 56.0

func worldSavePoints() []protocol.SavePoint {
	out := make([]protocol.SavePoint, 0, len(game.SavePoints))
	for _, sp := range game.SavePoints {
		c := game.TileCenter(sp.Tile)
		out = append(out, protocol.SavePoint{ID: sp.ID, Name: sp.Name, X: c.X, Y: c.Y})
	}
	return out
}

func savePointName(id string) string {
	if id == "" {
		return ""
	}
	if sp, ok := game.SavePointByID(id); ok {
		return sp.Name
	}
	return ""
}

func (h *Hub) handleSetSavePoint(c *Client, raw json.RawMessage) {
	var p protocol.SetSavePointPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	wp, ok := h.world[c.ID]
	if !ok || wp.InBattle {
		h.sendError(c, "You cannot set a save point right now.")
		return
	}
	sp, ok := game.SavePointByID(p.SavePointID)
	if !ok {
		h.sendError(c, "Unknown save point.")
		return
	}
	center := game.TileCenter(sp.Tile)
	if dist(wp.X, wp.Y, center.X, center.Y) > savePointInteractRange {
		h.sendError(c, "Move closer to the save point.")
		return
	}
	profile, ok := h.store.SetSavePoint(c.Name, sp.ID)
	if !ok {
		h.sendError(c, "Could not update save point.")
		return
	}
	h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{
		PlayerID: c.ID,
		Profile:  profileInfo(profile),
	})
}

func (h *Hub) respawnAtSavePoint(clientID string) {
	wp, ok := h.world[clientID]
	if !ok {
		return
	}
	saveID := ""
	if c, ok := h.clients[clientID]; ok {
		if profile, ok := h.store.Get(c.Name); ok {
			saveID = profile.SavePointID
		}
	}
	wp.X, wp.Y = game.SpawnPosition(saveID)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: clientID, X: wp.X, Y: wp.Y,
	}))
}
