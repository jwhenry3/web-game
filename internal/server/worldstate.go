package server

import (
	"math"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

// ---- world-state assembly ----
//
// Everything that projects the hub's canonical state onto the wire:
// world_state broadcasts, the map snapshot embedded in welcome/map_config,
// the profile payload, and spawn/resume position resolution.

func (h *Hub) broadcastWorldState() {
	tile, cols, rows, cells := h.mapCells()
	h.broadcastAll(protocol.Encode(protocol.TypeWorldState, protocol.WorldStatePayload{
		Entities:    h.worldEntities(time.Now()),
		Camps:       h.campList(),
		SavePoints:  h.worldSavePoints(),
		JobChangers: h.worldJobChangers(),
		Map:         protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
	}))
}

// MapSnapshot returns the current map configuration for clients (REST + welcome).
func (h *Hub) MapSnapshot() *protocol.MapSnapshot {
	return h.mapSnapshot()
}

func (h *Hub) mapSnapshot() *protocol.MapSnapshot {
	if h.mapID == "" || h.overworld == nil {
		return nil
	}
	tile, cols, rows, cells := h.overworld.MapPayload()
	ts := float64(h.overworld.TileSizePx())
	portals := make([]protocol.MapPortal, 0, len(h.overworld.Exits)+len(h.overworld.Borders))
	for _, e := range h.overworld.Exits {
		portals = append(portals, protocol.MapPortal{
			X: float64(e.MinC) * ts,
			Y: float64(e.MinR) * ts,
			W: float64(e.MaxC-e.MinC+1) * ts,
			H: float64(e.MaxR-e.MinR+1) * ts,
		})
	}
	// Border crossings get their walkable band strips as portal rects.
	for _, r := range h.overworld.BorderPortalRects() {
		portals = append(portals, protocol.MapPortal{
			X: float64(r[0]) * ts,
			Y: float64(r[1]) * ts,
			W: float64(r[2]-r[0]+1) * ts,
			H: float64(r[3]-r[1]+1) * ts,
		})
	}
	return &protocol.MapSnapshot{
		ID:            h.mapID,
		Name:          h.mapName,
		Overworld:     protocol.OverworldMap{Tile: tile, Cols: cols, Rows: rows, Cells: cells},
		TiledMap:      "",
		Portals:       portals,
		TileOverrides: tileOverridesPayload(h.overworld.TileOverrides),
		TerrainLayers: terrainLayersPayload(h.overworld),
		OriginX:       h.worldOriginX,
		OriginY:       h.worldOriginY,
		Neighbors:     append([]protocol.MapNeighbor(nil), h.neighbors...),
	}
}

func terrainLayersPayload(ow *game.Overworld) *protocol.MapTerrainLayers {
	if ow == nil || len(ow.Ground) == 0 || len(ow.Collision) == 0 {
		return nil
	}
	return &protocol.MapTerrainLayers{
		Ground:    ow.Ground,
		Collision: ow.Collision,
	}
}

func tileOverridesPayload(o *game.MapTileOverrides) *protocol.MapTileOverrides {
	if o == nil || len(o.Layers) == 0 {
		return nil
	}
	return &protocol.MapTileOverrides{
		MapID:     o.MapID,
		Layers:    o.Layers,
		UpdatedAt: o.UpdatedAt,
	}
}

func (h *Hub) welcomePayload(c *Client, profile store.Profile) protocol.WelcomePayload {
	return protocol.WelcomePayload{
		PlayerID: c.ID,
		Profile:  profileInfo(profile),
		Map:      h.mapSnapshot(),
	}
}

func (h *Hub) sendWelcome(c *Client, profile store.Profile) {
	h.send(c, protocol.TypeWelcome, h.welcomePayload(c, profile))
}

// sendProfileRefresh pushes a profile-only welcome. The full welcome embeds
// the map snapshot — on large maps that is a multi-MB cells string plus the
// ground/collision int layers — and profile updates fire per kill, equip,
// pet, and party event, so resending terrain each time floods both the hub
// encode path and the client's send queue. A missing map means "keep
// current" (the client's welcome handler applies the map only when present);
// the join path still sends the full snapshot via sendWelcome.
func (h *Hub) sendProfileRefresh(c *Client, profile store.Profile) {
	h.send(c, protocol.TypeWelcome, protocol.WelcomePayload{
		PlayerID: c.ID,
		Profile:  profileInfo(profile),
	})
}

func (h *Hub) mapCells() (tile, cols, rows int, cells string) {
	if h.overworld != nil {
		return h.overworld.MapPayload()
	}
	return game.OverworldMapPayload()
}

// worldEntities snapshots every world inhabitant for world_state. Players are
// always listed (in_house flag tells clients to hide them); NPCs and pets are
// omitted while hidden (despawned / owner off-world).
func (h *Hub) worldEntities(now time.Time) []protocol.WorldEntity {
	out := make([]protocol.WorldEntity, 0, len(h.entities))
	for _, e := range h.entities {
		if e.Kind != kindPlayer && e.hidden {
			continue
		}
		out = append(out, h.projector.project(e, now))
	}
	return out
}

func profileInfo(p store.Profile) protocol.ProfileInfo {
	loadout := p.ActiveLoadout()
	activeJobs := p.ActiveJobIDs()
	jobActive := func(job game.JobID) bool {
		for _, j := range activeJobs {
			if j == job {
				return true
			}
		}
		return false
	}
	weaponReqStrings := func(ws []game.WeaponType) []string {
		if len(ws) == 0 {
			return nil
		}
		out := make([]string, len(ws))
		for i, w := range ws {
			out[i] = string(w)
		}
		return out
	}
	weaponForSkill := func(s game.Skill) game.WeaponType {
		if s.Job != "" && s.Job == game.JobID(p.SubJob) && s.Job != game.JobID(p.MainJob) {
			return p.SubWeaponType()
		}
		return p.WeaponType()
	}
	toInfo := func(s game.Skill) protocol.SkillInfo {
		lvl := loadout.SkillLevels[s.ID]
		unlocked := game.SkillAlwaysUnlocked(s.ID) || lvl > 0
		comboLength := game.ComboSteps(s.Combo)
		prof := game.SkillProficiency(s, weaponForSkill(s))
		profLvl := loadout.ProfLevels[string(prof)]
		return protocol.SkillInfo{
			ID: s.ID, Name: s.Name, MPCost: s.MPCost, Heals: s.Heals, Buffs: s.Buffs,
			Description: s.Description, Category: string(s.Category),
			Job:        string(s.Job),
			Prereq:     game.SkillPrereq(s.ID),
			WeaponReqs: weaponReqStrings(s.WeaponReqs), Unlocked: unlocked,
			Proficiency: string(prof),
			Level:       profLvl,
			MaxLevel:    game.ProfMaxLevel,
			UnlockLevel: game.SkillUnlockLevel(s.ID),
			ProfExp:     loadout.ProfExp[string(prof)],
			ProfExpNext: game.ProfExpToNext(profLvl),
			CastTimeMs:  game.SkillCastTime(s),
			CooldownMs:  s.CooldownMs,
			WorldOnly:   s.WorldOnly,
			Passive:     s.Passive != nil,
			ComboLength: comboLength,
			Target:      string(s.TargetRule()),
			Effects:     game.SkillEffects(s),
		}
	}
	skills := []protocol.SkillInfo{toInfo(game.BasicAttack), toInfo(game.SkillCapture), toInfo(game.SkillDodge)}
	for _, s := range game.Catalog {
		if s.WorldOnly || jobActive(s.Job) {
			skills = append(skills, toInfo(s))
		}
	}

	equipped := loadout.Equipped
	if equipped == nil {
		equipped = map[string]string{}
	}
	hotbar := map[string]protocol.HotbarBinding{}
	for slot, b := range loadout.Hotbar {
		hotbar[slot] = protocol.HotbarBinding{Kind: b.Kind, ID: b.ID}
	}
	mainLvl := p.MainJobLevel()
	subLvl := p.SubJobEffectiveLevel()
	stats := game.ComputeJobStats(
		game.JobID(p.MainJob), mainLvl,
		game.JobID(p.SubJob), subLvl,
		p.EquippedItems(),
	)

	unlocked := append([]string(nil), p.UnlockedJobs...)
	if len(unlocked) == 0 {
		for _, j := range game.StartingJobs {
			unlocked = append(unlocked, string(j))
		}
	}

	jobs := make([]protocol.JobProgressInfo, 0, len(game.AllJobs()))
	for _, def := range game.AllJobs() {
		prog := p.Jobs[string(def.ID)]
		if prog.Level < 1 {
			prog.Level = 1
		}
		jobs = append(jobs, protocol.JobProgressInfo{
			ID: string(def.ID), Name: def.Name, Abbr: def.Abbr,
			Category: string(def.Category),
			Level:    prog.Level, XP: prog.XP, MaxXP: game.XPToNext(prog.Level),
		})
	}

	mainXP := 0
	if prog, ok := p.Jobs[p.MainJob]; ok {
		mainXP = prog.XP
	}

	return protocol.ProfileInfo{
		Name:         p.Name,
		Race:         p.Race,
		Level:        mainLvl,
		XP:           mainXP,
		MaxXP:        game.XPToNext(mainLvl),
		MainJob:      p.MainJob,
		SubJob:       p.SubJob,
		SubjobUnlock: game.CurrentSubjobUnlockLevel(),
		UnlockedJobs: unlocked,
		Appearance:   appearanceProto(p),
		Jobs:         jobs,
		Stats: protocol.StatBlock{
			HP: stats.HP, MP: stats.MP,
			Str: stats.Str, Dex: stats.Dex, Vit: stats.Vit, Int: stats.Int, MD: stats.MD,
			Mag: stats.Int, Agi: stats.Dex, // legacy aliases for protobuf clients
		},
		Inventory:         p.Inventory,
		HouseStorage:      append([]game.Item(nil), p.HouseStorage...),
		HouseStorageCap:   game.DefaultHouseStorageCapacity,
		CampSkin:          game.NormalizeCampSkin(p.CampSkin),
		Equipped:          equipped,
		Hotbar:            hotbar,
		Skills:            skills,
		ProfLevels:        loadout.ProfLevels,
		ProfExp:           loadout.ProfExp,
		Friends:           append([]string(nil), p.Friends...),
		SavePointID:       p.SavePointID,
		SavePointName:     savePointName(p.SavePointID),
		VisitedSavePoints: visitedSavePoints(p),
		Keybinds:          p.KeybindMap(),
		Pets:              append([]game.PetRecord(nil), p.Pets...),
		BattlePetID:       p.BattlePetID,
		MountPetID:        p.MountPetID,
	}
}

func appearanceProto(p store.Profile) protocol.CharacterAppearance {
	a := p.Appearance
	if a.IsZero() {
		a = store.DefaultAppearanceForRace(p.Race)
	} else {
		a = store.NormalizeAppearance(p.Race, a)
	}
	return protocol.CharacterAppearance{
		Skin: a.Skin, Face: a.Face, Hair: a.Hair, HairColor: a.HairColor,
		Cloth: a.Cloth, ClothColor: a.ClothColor, Weapon: a.Weapon, WeaponColor: a.WeaponColor,
	}
}

func storeAppearanceFromPayload(p *protocol.CharacterAppearance) store.Appearance {
	if p == nil {
		return store.Appearance{}
	}
	return store.Appearance{
		Skin: p.Skin, Face: p.Face, Hair: p.Hair, HairColor: p.HairColor,
		Cloth: p.Cloth, ClothColor: p.ClothColor, Weapon: p.Weapon, WeaponColor: p.WeaponColor,
	}
}

// ---- spawn / resume / world position ----

func (h *Hub) resumeSpawn(c *Client, profile store.Profile) (x, y float64, facing float64) {
	if c.UseSpawn {
		if c.SpawnEdge != "" && h.overworld != nil {
			// EntryPoint already falls back to the map spawn when no
			// walkable landing exists on that edge.
			x, y = h.overworld.EntryPoint(c.SpawnEdge, c.SpawnEdgeT)
			return x, y, c.SpawnFacing
		}
		return c.SpawnX, c.SpawnY, c.SpawnFacing
	}
	if profile.HasWorldPos && h.persistedPosInThisWorld(profile) && h.canResumeAt(profile.WorldX, profile.WorldY) {
		return profile.WorldX, profile.WorldY, profile.Facing.Radians()
	}
	if h.overworld != nil {
		x, y = h.overworld.SpawnPosition(profile.SavePointID)
	} else {
		x, y = game.SpawnPosition(profile.SavePointID)
	}
	return x, y, game.FacingYawDefault
}

// persistedPosInThisWorld reports whether the profile's saved coordinates were
// recorded inside this hub's world. Only enforced in singular-world mode: a
// stale legacy MapID must not veto resuming (persisted MapID never controls
// world selection), while a position saved in a different world must not
// teleport the hero across worlds. Legacy map hubs keep trusting the saved
// position — the proxy already routed the client to prof.MapID.
func (h *Hub) persistedPosInThisWorld(p store.Profile) bool {
	if h.world == nil {
		return true
	}
	loc := p.PersistedWorldID()
	return loc == "" || loc == h.mapID
}

func (h *Hub) canResumeAt(x, y float64) bool {
	if h.overworld != nil {
		return h.overworld.CircleWalkableAt(x, y, game.PlayerCollisionRadius)
	}
	return game.CircleWalkableAt(x, y, game.PlayerCollisionRadius)
}

func (h *Hub) persistWorldLocation(c *Client, e *entity, flush bool) {
	if c == nil || e == nil || c.Name == "" {
		return
	}
	doFlush := flush || time.Since(c.lastWorldSave) >= worldPosSaveInterval
	if h.world != nil {
		// Singular world: record the world id in WorldID without churning the
		// legacy MapID/PrevMapID fields used by multi-map routing.
		h.store.SetWorldLocationInWorld(c.Name, h.mapID, e.X, e.Y, e.Facing, doFlush)
	} else {
		h.store.SetWorldLocation(c.Name, h.mapID, e.X, e.Y, e.Facing, doFlush)
	}
	if doFlush {
		c.lastWorldSave = time.Now()
	}
}

// regionIDAt returns the simulation region ID that owns (x, y) in singular-world
// mode, or "" when no region covers the coordinate. It does not require a Client
// so it can be used for NPCs and pets as well as players.
func (h *Hub) regionIDAt(x, y float64) string {
	if h.world == nil {
		return ""
	}
	tileSize := h.world.TileSizePx()
	if tileSize <= 0 {
		return ""
	}
	col, row := int(math.Floor(x/float64(tileSize))), int(math.Floor(y/float64(tileSize)))
	if region, ok := h.world.SimulationRegionAt(col, row); ok {
		return region.ID
	}
	return ""
}

// refreshRegionOwnership derives ownership from the entity's accepted server
// position. When c is non-nil, notifications are private to the affected player.
func (h *Hub) refreshRegionOwnership(c *Client, e *entity) {
	if h.world == nil || e == nil {
		return
	}
	regionID := h.regionIDAt(e.X, e.Y)
	if e.regionID == regionID {
		return
	}
	e.regionID = regionID
	if c != nil {
		h.send(c, protocol.TypeRegionChanged, protocol.RegionChangedPayload{RegionID: regionID})
	}
}
