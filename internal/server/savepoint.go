package server

import (
	"encoding/json"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

const savePointInteractRange = 80.0

func (h *Hub) worldSavePoints() []protocol.SavePoint {
	points := game.SavePoints
	if h.overworld != nil {
		points = h.overworld.SavePoints
	}
	out := make([]protocol.SavePoint, 0, len(points))
	for _, sp := range points {
		c := game.TileCenter(sp.Tile)
		out = append(out, protocol.SavePoint{ID: sp.ID, Name: sp.Name, X: c.X, Y: c.Y})
	}
	return out
}

// AtlasMap is the painted terrain and points of interest for this map process.
func (h *Hub) AtlasMap() protocol.AtlasMap {
	tile, cols, rows, cells := h.mapCells()
	pois := make([]protocol.AtlasPOI, 0)
	for _, sp := range h.worldSavePoints() {
		pois = append(pois, protocol.AtlasPOI{
			ID: sp.ID, Kind: "save_point", Name: sp.Name, X: sp.X, Y: sp.Y,
		})
	}
	id, name := h.mapID, h.mapName
	if id == "" {
		id = "world"
	}
	if name == "" {
		name = "World"
	}
	return protocol.AtlasMap{
		ID:   id,
		Name: name,
		Overworld: protocol.OverworldMap{
			Tile: tile, Cols: cols, Rows: rows, Cells: cells,
		},
		POIs: pois,
	}
}

func (h *Hub) savePointByID(id string) (game.SavePoint, bool) {
	if h.overworld != nil {
		return h.overworld.SavePointByID(id)
	}
	return game.SavePointByID(id)
}

func savePointName(id string) string {
	if id == "" {
		return ""
	}
	if rec, ok := game.LookupSavePoint(id); ok {
		return rec.Name
	}
	if loaded := game.Loaded(); loaded != nil {
		if sp, ok := loaded.SavePointByID(id); ok {
			return sp.Name
		}
	}
	if sp, ok := game.SavePointByID(id); ok {
		return sp.Name
	}
	return ""
}

func visitedSavePoints(p store.Profile) []protocol.VisitedSavePoint {
	out := make([]protocol.VisitedSavePoint, 0, len(p.VisitedSavePoints))
	for _, id := range p.VisitedSavePoints {
		if id == "" {
			continue
		}
		name := savePointName(id)
		if name == "" {
			name = id
		}
		mapName := ""
		if rec, ok := game.LookupSavePoint(id); ok {
			mapName = rec.MapName
		}
		out = append(out, protocol.VisitedSavePoint{
			ID: id, Name: name, MapName: mapName, Home: id == p.SavePointID,
		})
	}
	return out
}

func (h *Hub) handleUseWorldSkill(c *Client, raw json.RawMessage) {
	var p protocol.UseWorldSkillPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	wp, ok := h.world[c.ID]
	if !ok || wp.InBattle {
		h.sendError(c, "You cannot use that right now.")
		return
	}
	skill, ok := game.FindSkill(p.SkillID)
	if !ok || !skill.WorldOnly {
		h.sendError(c, "Unknown field skill.")
		return
	}
	profile, ok := h.store.Get(c.Name)
	if !ok || !profile.HasSkill(skill.ID) {
		h.sendError(c, "Skill not learned.")
		return
	}
	if !c.lastWorldSkill.IsZero() && time.Since(c.lastWorldSkill) < worldSkillCooldown {
		h.sendError(c, "Skill not ready.")
		return
	}

	destID := p.SavePointID
	switch skill.ID {
	case game.SkillIDReturn:
		destID = profile.SavePointID
		if destID == "" {
			h.sendError(c, "Set a save crystal first.")
			return
		}
	case game.SkillIDTeleport:
		if destID == "" {
			h.sendError(c, "Choose a destination crystal.")
			return
		}
		if !profile.HasVisitedSavePoint(destID) {
			h.sendError(c, "You have not attuned to that crystal.")
			return
		}
	default:
		h.sendError(c, "Unknown field skill.")
		return
	}

	if ms := game.SkillCastTime(skill); ms > 0 {
		h.beginWorldCast(c, wp, skill, destID, ms)
		return
	}
	h.cancelWorldCast(c, wp, "")
	if !h.warpToSavePoint(c, wp, destID, skill.Name+": "+savePointName(destID)+".") {
		return
	}
	c.lastWorldSkill = time.Now()
}

const worldCastMoveCancel = 3.0

func (h *Hub) beginWorldCast(c *Client, wp *protocol.WorldPlayer, skill game.Skill, destID string, ms int) {
	now := time.Now()
	c.worldCastSkill = skill.ID
	c.worldCastDest = destID
	c.worldCastReady = now.Add(time.Duration(ms) * time.Millisecond)
	c.worldCastX, c.worldCastY = wp.X, wp.Y
	wp.CastingSkillID = skill.ID
	wp.CastTimeMs = ms
	wp.CastEndsAt = c.worldCastReady.UnixMilli()
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
}

func (h *Hub) clearWorldCast(c *Client, wp *protocol.WorldPlayer) {
	c.worldCastSkill = ""
	c.worldCastDest = ""
	c.worldCastReady = time.Time{}
	if wp != nil {
		wp.CastingSkillID = ""
		wp.CastTimeMs = 0
		wp.CastEndsAt = 0
	}
}

func (h *Hub) cancelWorldCast(c *Client, wp *protocol.WorldPlayer, notice string) {
	if c.worldCastSkill == "" {
		return
	}
	h.clearWorldCast(c, wp)
	if notice != "" {
		h.send(c, protocol.TypeChatMsg, protocol.ChatMessagePayload{FromName: "System", Message: notice})
	}
	if wp != nil {
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
	}
}

func (h *Hub) interruptWorldCastOnMove(c *Client, wp *protocol.WorldPlayer) {
	if c.worldCastSkill == "" || wp == nil {
		return
	}
	if dist(c.worldCastX, c.worldCastY, wp.X, wp.Y) <= worldCastMoveCancel {
		return
	}
	h.cancelWorldCast(c, wp, "Teleport cancelled.")
}

func (h *Hub) finishDueWorldCasts(now time.Time) {
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.clients))
	for _, c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.RUnlock()
	for _, c := range clients {
		if c.worldCastSkill == "" || now.Before(c.worldCastReady) {
			continue
		}
		h.completeWorldCast(c)
	}
}

func (h *Hub) completeWorldCast(c *Client) {
	skillID := c.worldCastSkill
	destID := c.worldCastDest
	if skillID == "" {
		return
	}
	wp := h.world[c.ID]
	h.clearWorldCast(c, wp)
	if wp == nil || wp.InBattle {
		if wp != nil {
			h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
		}
		return
	}
	skill, ok := game.FindSkill(skillID)
	if !ok {
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
		return
	}
	if !h.warpToSavePoint(c, wp, destID, skill.Name+": "+savePointName(destID)+".") {
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
		return
	}
	c.lastWorldSkill = time.Now()
}

func (h *Hub) resolveSavePointDest(id string) (mapID, name string, x, y float64, ok bool) {
	if rec, found := game.LookupSavePoint(id); found {
		return rec.MapID, rec.Name, rec.X, rec.Y, true
	}
	if sp, found := h.savePointByID(id); found {
		c := game.TileCenter(sp.Tile)
		return h.mapID, sp.Name, c.X, c.Y, true
	}
	return "", "", 0, 0, false
}

func (h *Hub) warpToSavePoint(c *Client, wp *protocol.WorldPlayer, destID, notice string) bool {
	mapID, _, x, y, ok := h.resolveSavePointDest(destID)
	if !ok {
		h.sendError(c, "Unknown save point.")
		return false
	}
	if notice != "" {
		h.send(c, protocol.TypeChatMsg, protocol.ChatMessagePayload{FromName: "System", Message: notice})
	}
	if mapID != "" && mapID != h.mapID && h.OnTransfer != nil {
		h.OnTransfer(c.ID, mapID, x, y, wp.Facing)
		return true
	}
	wp.X, wp.Y = x, y
	h.persistWorldLocation(c, wp, true)
	h.grantBattleImmunity(wp)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: c.ID, X: wp.X, Y: wp.Y,
	}))
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
	return true
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
	sp, ok := h.savePointByID(p.SavePointID)
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
	h.sendWelcome(c, profile)
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
	if h.overworld != nil {
		wp.X, wp.Y = h.overworld.SpawnPosition(saveID)
	} else {
		wp.X, wp.Y = game.SpawnPosition(saveID)
	}
	if c, ok := h.clients[clientID]; ok {
		h.persistWorldLocation(c, wp, true)
	}
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: clientID, X: wp.X, Y: wp.Y,
	}))
}
