package game

import "fmt"

// EditorObjectsFromConfig returns objects for the map editor.
// Prefer explicit Objects; otherwise synthesize from regions / POIs.
func EditorObjectsFromConfig(cfg *MapConfig) []OverrideObject {
	if cfg == nil {
		return nil
	}
	if len(cfg.Objects) > 0 {
		return append([]OverrideObject(nil), cfg.Objects...)
	}
	return synthesizeEditorObjects(cfg.TileSize, cfg.Regions, cfg.SavePoints, cfg.JobChangers, cfg.NPCs, cfg.Exits)
}

func synthesizeEditorObjects(
	tileSize int,
	regions []Region,
	saves []savePointFile,
	jobs []jobChangerFile,
	npcs []patrolFile,
	exits []exitFile,
) []OverrideObject {
	if tileSize <= 0 {
		tileSize = defaultMapTileSize
	}
	ts := float64(tileSize)
	out := make([]OverrideObject, 0, len(regions)+len(saves)+len(jobs)+len(npcs)+len(exits))
	nextID := 1

	for _, reg := range regions {
		r := reg.EnsurePolygon()
		w := float64(r.MaxC-r.MinC+1) * ts
		h := float64(r.MaxR-r.MinR+1) * ts
		obj := OverrideObject{
			ID:     nextID,
			Name:   r.ID,
			Type:   "region",
			X:      float64(r.MinC) * ts,
			Y:      float64(r.MaxR+1) * ts,
			Width:  w,
			Height: h,
			Properties: []tiledProp{
				{Name: "id", Type: "string", Value: r.ID},
				{Name: "sanctuary", Type: "bool", Value: r.Sanctuary},
			},
		}
		nextID++
		if r.Kind != "" {
			obj.Properties = append(obj.Properties, tiledProp{Name: "kind", Type: "string", Value: r.Kind})
		}
		out = append(out, obj)
	}

	for _, sp := range saves {
		out = append(out, OverrideObject{
			ID: nextID, Name: sp.ID, Type: "save_point",
			X: (float64(sp.Tile[0]) + 0.5) * ts,
			Y: (float64(sp.Tile[1]) + 0.5) * ts,
			Point: true,
			Properties: []tiledProp{
				{Name: "id", Type: "string", Value: sp.ID},
				{Name: "name", Type: "string", Value: sp.Name},
			},
		})
		nextID++
	}

	for _, jc := range jobs {
		out = append(out, OverrideObject{
			ID: nextID, Name: jc.ID, Type: "job_changer",
			X: (float64(jc.Tile[0]) + 0.5) * ts,
			Y: (float64(jc.Tile[1]) + 0.5) * ts,
			Point: true,
			Properties: []tiledProp{
				{Name: "id", Type: "string", Value: jc.ID},
				{Name: "name", Type: "string", Value: jc.Name},
			},
		})
		nextID++
	}

	for _, n := range npcs {
		out = append(out, OverrideObject{
			ID: nextID, Name: n.ID, Type: "npc",
			X: (float64(n.Home[0]) + 0.5) * ts,
			Y: (float64(n.Home[1]) + 0.5) * ts,
			Point: true,
			Properties: []tiledProp{
				{Name: "id", Type: "string", Value: n.ID},
				{Name: "name", Type: "string", Value: n.Name},
				{Name: "kind", Type: "string", Value: n.Kind},
				{Name: "level", Type: "int", Value: n.Level},
				{Name: "region", Type: "string", Value: n.Region},
			},
		})
		nextID++
	}

	for i, e := range exits {
		minC, minR, maxC, maxR := e.Tiles[0], e.Tiles[1], e.Tiles[2], e.Tiles[3]
		w := float64(maxC-minC+1) * ts
		h := float64(maxR-minR+1) * ts
		name := fmt.Sprintf("exit_%d", i+1)
		out = append(out, OverrideObject{
			ID: nextID, Name: name, Type: "exit",
			X: float64(minC) * ts, Y: float64(maxR+1) * ts,
			Width: w, Height: h,
			Properties: []tiledProp{
				{Name: "destMap", Type: "string", Value: e.DestMap},
				{Name: "destX", Type: "float", Value: e.Dest[0]},
				{Name: "destY", Type: "float", Value: e.Dest[1]},
			},
		})
		nextID++
	}

	return out
}
