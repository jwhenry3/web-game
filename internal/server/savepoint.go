package server

import (
	"encoding/json"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
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
	for _, jc := range h.worldJobChangers() {
		pois = append(pois, protocol.AtlasPOI{
			ID: jc.ID, Kind: "job_changer", Name: jc.Name, X: jc.X, Y: jc.Y,
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
		POIs:    pois,
		OriginX: h.worldOriginX,
		OriginY: h.worldOriginY,
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
	e := h.playerEnt(c.ID)
	cc := clientControlOf(e)
	if e == nil || cc == nil || cc.inCombat || cc.inHouse {
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
	switch worldSkillAction(skill) {
	case "return":
		destID = profile.SavePointID
		if destID == "" {
			h.sendError(c, "Set a save crystal first.")
			return
		}
	case "port":
		if destID == "" {
			h.sendError(c, "Choose a destination crystal.")
			return
		}
		if !profile.HasVisitedSavePoint(destID) {
			h.sendError(c, "You have not attuned to that crystal.")
			return
		}
	case "camp":
		destID = ""
	default:
		h.sendError(c, "Unknown field skill.")
		return
	}

	if ms := game.SkillCastTime(skill); ms > 0 {
		h.beginWorldCast(c, e, skill, destID, ms)
		return
	}
	h.cancelWorldCast(c, e, "")
	if worldSkillAction(skill) == "camp" {
		h.placeCamp(c, e)
		c.lastWorldSkill = time.Now()
		return
	}
	if !h.warpToSavePoint(c, e, destID, skill.Name+": "+savePointName(destID)+".") {
		return
	}
	c.lastWorldSkill = time.Now()
}

// worldSkillAction names the field action a skill performs — the EffectWorld
// component's payload, or the legacy skill id for defs without components.
func worldSkillAction(skill game.Skill) string {
	if action := game.WorldSkillAction(skill); action != "" {
		return action
	}
	switch skill.ID {
	case game.SkillIDReturn:
		return "return"
	case game.SkillIDPort:
		return "port"
	case game.SkillIDCamp:
		return "camp"
	}
	return ""
}

const worldCastMoveCancel = 3.0

func (h *Hub) beginWorldCast(c *Client, e *entity, skill game.Skill, destID string, ms int) {
	now := time.Now()
	c.worldCastSkill = skill.ID
	c.worldCastDest = destID
	c.worldCastReady = now.Add(time.Duration(ms) * time.Millisecond)
	c.worldCastX, c.worldCastY = e.X, e.Y
	if cc := clientControlOf(e); cc != nil {
		cc.fieldCastSkillID = skill.ID
		cc.fieldCastTimeMs = ms
		cc.fieldCastEndsAt = c.worldCastReady.UnixMilli()
	}
	h.sendPlayerSync(e)
}

func (h *Hub) clearWorldCast(c *Client, e *entity) {
	c.worldCastSkill = ""
	c.worldCastDest = ""
	c.worldCastReady = time.Time{}
	if cc := clientControlOf(e); cc != nil {
		cc.fieldCastSkillID = ""
		cc.fieldCastTimeMs = 0
		cc.fieldCastEndsAt = 0
	}
}

func (h *Hub) cancelWorldCast(c *Client, e *entity, notice string) {
	if c.worldCastSkill == "" {
		return
	}
	h.clearWorldCast(c, e)
	if notice != "" {
		h.send(c, protocol.TypeChatMsg, protocol.ChatMessagePayload{FromName: "System", Message: notice})
	}
	if e != nil {
		h.sendPlayerSync(e)
	}
}

func (h *Hub) interruptWorldCastOnMove(c *Client, e *entity) {
	if c.worldCastSkill == "" || e == nil {
		return
	}
	if dist(c.worldCastX, c.worldCastY, e.X, e.Y) <= worldCastMoveCancel {
		return
	}
	h.cancelWorldCast(c, e, "Cast cancelled.")
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
	e := h.playerEnt(c.ID)
	h.clearWorldCast(c, e)
	cc := clientControlOf(e)
	if e == nil || cc == nil || cc.inCombat || cc.inHouse {
		if e != nil {
			h.sendPlayerSync(e)
		}
		return
	}
	skill, ok := game.FindSkill(skillID)
	if !ok {
		h.sendPlayerSync(e)
		return
	}
	if worldSkillAction(skill) == "camp" {
		h.placeCamp(c, e)
		c.lastWorldSkill = time.Now()
		h.sendPlayerSync(e)
		return
	}
	if !h.warpToSavePoint(c, e, destID, skill.Name+": "+savePointName(destID)+".") {
		h.sendPlayerSync(e)
		return
	}
	c.lastWorldSkill = time.Now()
}

func (h *Hub) resolveSavePointDest(id string) (mapID, name string, x, y float64, ok bool) {
	// Crystals physically on this map/world always resolve locally, even when
	// the cluster registry lists the id under a different map — save points
	// are scoped to the world that owns them and never trigger a transfer
	// inside their own world.
	if sp, found := h.savePointByID(id); found {
		c := game.TileCenter(sp.Tile)
		return h.mapID, sp.Name, c.X, c.Y, true
	}
	if h.world != nil {
		// Singular-world mode: every save point lives inside this world, so an
		// id missing locally is unknown — never a cross-map transfer.
		return "", "", 0, 0, false
	}
	if rec, found := game.LookupSavePoint(id); found {
		return rec.MapID, rec.Name, rec.X, rec.Y, true
	}
	return "", "", 0, 0, false
}

func (h *Hub) warpToSavePoint(c *Client, e *entity, destID, notice string) bool {
	mapID, _, x, y, ok := h.resolveSavePointDest(destID)
	if !ok {
		h.sendError(c, "Unknown save point.")
		return false
	}
	if notice != "" {
		h.send(c, protocol.TypeChatMsg, protocol.ChatMessagePayload{FromName: "System", Message: notice})
	}
	if mapID != "" && mapID != h.mapID && h.OnTransfer != nil {
		h.OnTransfer(c.ID, TransferDest{Map: mapID, X: x, Y: y, Facing: e.Facing})
		return true
	}
	e.X, e.Y = x, y
	h.persistWorldLocation(c, e, true)
	h.refreshRegionOwnership(c, e)
	h.grantBattleImmunity(e)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: c.ID, X: e.X, Y: e.Y, Facing: e.Facing,
	}))
	h.sendPlayerSync(e)
	return true
}

func (h *Hub) handleSetSavePoint(c *Client, raw json.RawMessage) {
	var p protocol.SetSavePointPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	e := h.playerEnt(c.ID)
	cc := clientControlOf(e)
	if e == nil || (cc != nil && cc.inCombat) {
		h.sendError(c, "You cannot set a save point right now.")
		return
	}
	sp, ok := h.savePointByID(p.SavePointID)
	if !ok {
		h.sendError(c, "Unknown save point.")
		return
	}
	center := game.TileCenter(sp.Tile)
	if dist(e.X, e.Y, center.X, center.Y) > savePointInteractRange {
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
	e := h.playerEnt(clientID)
	if e == nil {
		return
	}
	saveID := ""
	if c, ok := h.clients[clientID]; ok {
		if profile, ok := h.store.Get(c.Name); ok {
			saveID = profile.SavePointID
		}
	}
	if h.overworld != nil {
		e.X, e.Y = h.overworld.SpawnPosition(saveID)
	} else {
		e.X, e.Y = game.SpawnPosition(saveID)
	}
	if c, ok := h.clients[clientID]; ok {
		h.persistWorldLocation(c, e, true)
		h.refreshRegionOwnership(c, e)
	}
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: clientID, X: e.X, Y: e.Y, Facing: e.Facing,
	}))
}
