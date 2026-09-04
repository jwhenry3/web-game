package game

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const defaultMapTileSize = 32

// LoadOverworldFromTiled reads a Tiled JSON map (.tmj) as the authoritative overworld source.
func LoadOverworldFromTiled(path string) (*Overworld, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read tiled map %s: %w", path, err)
	}
	var raw tiledMapFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse tiled map %s: %w", path, err)
	}
	if raw.Width <= 0 || raw.Height <= 0 {
		return nil, fmt.Errorf("tiled map %s: invalid dimensions %dx%d", path, raw.Width, raw.Height)
	}
	tileSize := raw.TileWidth
	if tileSize <= 0 {
		tileSize = defaultMapTileSize
	}

	ow := &Overworld{
		Path:     path,
		TiledMap: filepath.ToSlash(strings.TrimPrefix(filepath.Base(path), "")),
		Cols:     raw.Width,
		Rows:     raw.Height,
		TileSize: tileSize,
		WorldW:   raw.Width * tileSize,
		WorldH:   raw.Height * tileSize,
		Wander:   defaultWanderSettings(),
	}

	ow.TiledMap = tiledPublicPath(path)

	applyTiledMapProps(&ow.Wander, raw.Properties)

	collision, ground, err := parseTiledTileLayers(raw, ow.Cols, ow.Rows)
	if err != nil {
		return nil, err
	}
	layerMap := map[string][]int{
		"collision": append([]int(nil), collision...),
		"ground":    append([]int(nil), ground...),
	}
	mapID := MapIDFromPath(path)
	override, err := LoadMapOverride(mapID)
	if err != nil {
		return nil, err
	}
	ApplyMapOverride(layerMap, override)
	collision = layerMap["collision"]
	ground = layerMap["ground"]
	ow.Ground = append([]int(nil), ground...)
	ow.Collision = append([]int(nil), collision...)
	ow.TileOverrides = override
	if override != nil && len(override.Objects) > 0 {
		replaceObjectLayer(&raw, override.Objects)
	}
	ow.Cells = buildCellsFromLayers(collision, ground, ow.Cols, ow.Rows)

	if err := parseTiledObjectLayers(raw, ow); err != nil {
		return nil, err
	}
	if err := validateSanctuaries(ow); err != nil {
		return nil, err
	}
	if ow.Wander.PauseSec <= 0 || ow.Wander.Speed <= 0 {
		return nil, fmt.Errorf("invalid wander settings in %s", path)
	}
	ow.Objects = objectsFromTiledRaw(raw)
	return ow, nil
}

func tiledPublicPath(path string) string {
	base := filepath.Base(path)
	// Historical client asset path when a .tmj was published; hub may send empty tiled_map.
	return "data/maps/" + base
}

func defaultWanderSettings() wanderSettings {
	return wanderSettings{
		MinDistance: defaultWanderMinDist,
		PauseSec:    defaultWanderPause,
		Speed:       defaultWanderSpeed,
	}
}

func applyTiledMapProps(w *wanderSettings, props []tiledProp) {
	if v := tiledPropInt(props, "wanderMinDistance"); v > 0 {
		w.MinDistance = v
	}
	if v := tiledPropFloat(props, "wanderPauseSec"); v > 0 {
		w.PauseSec = v
	}
	if v := tiledPropFloat(props, "wanderSpeed"); v > 0 {
		w.Speed = v
	}
}

func parseTiledTileLayers(raw tiledMapFile, cols, rows int) (collision, ground []int, err error) {
	want := cols * rows
	for _, layer := range raw.Layers {
		if layer.Type != "tilelayer" {
			continue
		}
		name := strings.ToLower(layer.Name)
		if len(layer.Data) != want {
			return nil, nil, fmt.Errorf("layer %q: data len %d want %d", layer.Name, len(layer.Data), want)
		}
		switch name {
		case "collision":
			collision = layer.Data
		case "ground":
			ground = layer.Data
		}
	}
	if collision == nil {
		return nil, nil, fmt.Errorf("tiled map missing collision tile layer")
	}
	return collision, ground, nil
}


func buildCellsFromLayers(collision, ground []int, cols, rows int) []string {
	out := make([]string, rows)
	for r := 0; r < rows; r++ {
		row := make([]byte, cols)
		for c := 0; c < cols; c++ {
			i := r*cols + c
			if tiledGID(collision[i]) != 0 {
				row[c] = TileRock
				continue
			}
			ch := byte(TileGrass)
			if ground != nil {
				if g, ok := CharFromPipoyaGroundGID(tiledGID(ground[i])); ok && g != 0 {
					ch = g
				}
			}
			row[c] = ch
		}
		out[r] = string(row)
	}
	return out
}

func replaceObjectLayer(raw *tiledMapFile, objects []OverrideObject) {
	objs := make([]tiledObject, len(objects))
	for i, o := range objects {
		objs[i] = tiledObject{
			ID: o.ID, Name: o.Name, Type: o.Type,
			X: o.X, Y: o.Y, Width: o.Width, Height: o.Height,
			Point: o.Point, Properties: o.Properties,
		}
	}
	for i := range raw.Layers {
		if raw.Layers[i].Type == "objectgroup" && strings.ToLower(raw.Layers[i].Name) == "objects" {
			raw.Layers[i].Objects = objs
			return
		}
	}
}

func parseTiledObjectLayers(raw tiledMapFile, ow *Overworld) error {
	tw := float64(ow.TileSize)
	th := float64(ow.TileSize)

	for _, layer := range raw.Layers {
		if layer.Type != "objectgroup" {
			continue
		}
		for _, obj := range layer.Objects {
			typ := strings.ToLower(obj.Type)
			if typ == "" {
				typ = strings.ToLower(obj.Name)
			}
			switch typ {
			case "region", "sanctuary":
				reg, err := regionFromObject(OverrideObject{
					ID: obj.ID, Name: obj.Name, Type: obj.Type,
					X: obj.X, Y: obj.Y, Width: obj.Width, Height: obj.Height,
					Point: obj.Point, Polygon: obj.Polygon, Properties: obj.Properties,
				}, ow.TileSize)
				if err != nil {
					return err
				}
				ow.Regions = append(ow.Regions, reg)
				if reg.Sanctuary {
					stampSanctuaryFloor(ow, reg)
				}

			case "save_point":
				id := tiledPropString(obj.Properties, "id")
				name := tiledPropString(obj.Properties, "name")
				if id == "" || name == "" {
					return fmt.Errorf("save_point missing id or name")
				}
				tile := objectTile(obj, ow.TileSize)
				if !ow.WalkableTile(tile.C, tile.R) {
					return fmt.Errorf("save point %s tile (%d,%d) blocked", id, tile.C, tile.R)
				}
				ow.SavePoints = append(ow.SavePoints, SavePoint{ID: id, Name: name, Tile: tile})

			case "job_changer", "interactable_npc":
				id := tiledPropString(obj.Properties, "id")
				name := tiledPropString(obj.Properties, "name")
				if id == "" || name == "" {
					return fmt.Errorf("%s missing id or name", obj.Type)
				}
				roles := npcRolesFromObject(OverrideObject{Type: obj.Type, Properties: obj.Properties})
				if !npcRolesContain(roles, "job_master") && obj.Type == "job_changer" {
					roles = []string{"job_master"}
				}
				if npcRolesContain(roles, "job_master") {
					tile := objectTile(obj, ow.TileSize)
					if !ow.WalkableTile(tile.C, tile.R) {
						return fmt.Errorf("job changer %s tile (%d,%d) blocked", id, tile.C, tile.R)
					}
					ow.JobChangers = append(ow.JobChangers, JobChanger{ID: id, Name: name, Tile: tile})
				}

			case "npc":
				roles := npcRolesFromObject(OverrideObject{Type: obj.Type, Name: obj.Name, Properties: obj.Properties, Point: obj.Point, X: obj.X, Y: obj.Y})
				if npcRolesContain(roles, combatNpcRole) || (len(roles) == 0 && isLegacyCombatNpc(OverrideObject{Type: obj.Type, Properties: obj.Properties})) {
					id := tiledPropString(obj.Properties, "id")
					region := tiledPropString(obj.Properties, "region")
					if id == "" || region == "" {
						return fmt.Errorf("npc %s missing id or region", obj.Name)
					}
					tile := objectTile(obj, ow.TileSize)
					ow.NPCPatrols = append(ow.NPCPatrols, Patrol{
						ID:        id,
						Kind:      tiledPropString(obj.Properties, "kind"),
						Name:      tiledPropString(obj.Properties, "name"),
						Level:     tiledPropInt(obj.Properties, "level"),
						Region:    region,
						Home:      tile,
						Encounter: EncounterFromProps(obj.Properties),
					})
				}
				if npcRolesContain(roles, "job_master") {
					id := tiledPropString(obj.Properties, "id")
					name := tiledPropString(obj.Properties, "name")
					if id == "" || name == "" {
						return fmt.Errorf("npc %s missing id or name for job master", obj.Name)
					}
					tile := objectTile(obj, ow.TileSize)
					if !ow.WalkableTile(tile.C, tile.R) {
						return fmt.Errorf("job changer %s tile (%d,%d) blocked", id, tile.C, tile.R)
					}
					ow.JobChangers = append(ow.JobChangers, JobChanger{ID: id, Name: name, Tile: tile})
				}

			case "exit":
				dest := tiledPropString(obj.Properties, "destMap")
				if dest == "" {
					return fmt.Errorf("exit missing destMap")
				}
				minC := int(obj.X / tw)
				minR := int((obj.Y - obj.Height) / th)
				maxC := int((obj.X+obj.Width)/tw) - 1
				maxR := int(obj.Y/th) - 1
				destX := tiledPropFloat(obj.Properties, "destX")
				destY := tiledPropFloat(obj.Properties, "destY")
				for c := minC; c <= maxC; c++ {
					for r := minR; r <= maxR; r++ {
						if !ow.WalkableTile(c, r) {
							return fmt.Errorf("exit to %s tile (%d,%d) blocked", dest, c, r)
						}
					}
				}
				ow.Exits = append(ow.Exits, MapExit{
					DestMap: normalizeDestMap(dest),
					MinC:    minC, MinR: minR,
					MaxC:    maxC, MaxR: maxR,
					DestX:   destX, DestY: destY,
				})
			}
		}
	}

	if len(ow.Regions) == 0 {
		return fmt.Errorf("tiled map missing region objects")
	}
	return nil
}

func objectTile(obj tiledObject, tileSize int) Tile {
	ts := float64(tileSize)
	c := int(obj.X / ts)
	r := int(obj.Y/ts) - 1
	if obj.Point {
		r = int((obj.Y - ts*0.5) / ts)
	}
	return Tile{C: c, R: r}
}

func stampSanctuaryFloor(ow *Overworld, reg Region) {
	for r := reg.MinR; r <= reg.MaxR; r++ {
		if r < 0 || r >= len(ow.Cells) {
			continue
		}
		row := []byte(ow.Cells[r])
		for c := reg.MinC; c <= reg.MaxC; c++ {
			if c < 0 || c >= len(row) {
				continue
			}
			if !reg.Contains(c, r) {
				continue
			}
			switch row[c] {
			case TileGrass, TilePath, TileRuins:
				row[c] = TileHaven
			}
		}
		ow.Cells[r] = string(row)
	}
}

func validateSanctuaries(ow *Overworld) error {
	sanctuaryIDs := map[string]bool{}
	for _, reg := range ow.Regions {
		if reg.Sanctuary {
			sanctuaryIDs[reg.ID] = true
		}
	}
	if len(sanctuaryIDs) == 0 {
		return fmt.Errorf("map must define at least one sanctuary region")
	}

	saveInSanctuary := map[string]bool{}
	for _, sp := range ow.SavePoints {
		inSanctuary := false
		for _, reg := range ow.Regions {
			if reg.Sanctuary && reg.Contains(sp.Tile.C, sp.Tile.R) {
				inSanctuary = true
				saveInSanctuary[reg.ID] = true
				break
			}
		}
		if !inSanctuary {
			return fmt.Errorf("save point %s must be inside a sanctuary", sp.ID)
		}
	}

	for id := range sanctuaryIDs {
		if !saveInSanctuary[id] {
			return fmt.Errorf("sanctuary %q has no save point", id)
		}
	}

	for _, jc := range ow.JobChangers {
		inSanctuary := false
		for _, reg := range ow.Regions {
			if reg.Sanctuary && reg.Contains(jc.Tile.C, jc.Tile.R) {
				inSanctuary = true
				break
			}
		}
		if !inSanctuary {
			return fmt.Errorf("job changer %s must be inside a sanctuary", jc.ID)
		}
	}

	for _, p := range ow.NPCPatrols {
		reg, ok := ow.RegionByID(p.Region)
		if !ok {
			return fmt.Errorf("npc %s references unknown region %q", p.ID, p.Region)
		}
		if reg.Sanctuary {
			return fmt.Errorf("npc %s cannot patrol sanctuary region %q", p.ID, p.Region)
		}
		if !reg.Contains(p.Home.C, p.Home.R) {
			return fmt.Errorf("npc %s home outside region %q", p.ID, p.Region)
		}
	}
	return nil
}

func tiledPropString(props []tiledProp, name string) string {
	for _, p := range props {
		if p.Name != name {
			continue
		}
		switch v := p.Value.(type) {
		case string:
			return v
		case float64:
			return fmt.Sprintf("%d", int(v))
		case bool:
			if v {
				return "true"
			}
			return "false"
		}
	}
	return ""
}

func tiledPropBool(props []tiledProp, name string) bool {
	for _, p := range props {
		if p.Name != name {
			continue
		}
		switch v := p.Value.(type) {
		case bool:
			return v
		case string:
			return v == "true" || v == "1"
		case float64:
			return v != 0
		}
	}
	return false
}

func tiledPropInt(props []tiledProp, name string) int {
	for _, p := range props {
		if p.Name != name {
			continue
		}
		switch v := p.Value.(type) {
		case float64:
			return int(v)
		case int:
			return v
		}
	}
	return 0
}

func tiledPropFloat(props []tiledProp, name string) float64 {
	for _, p := range props {
		if p.Name != name {
			continue
		}
		switch v := p.Value.(type) {
		case float64:
			return v
		case int:
			return float64(v)
		}
	}
	return 0
}
