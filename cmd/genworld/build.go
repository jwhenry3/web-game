package main

import (
	"encoding/json"
	"fmt"

	"clara-mundi/internal/game"
)

func buildMap(def mapDef, exits []exitRec) (*game.MapConfig, error) {
	base := game.PipoyaGIDGrass
	rock := game.PipoyaGIDRock
	path := game.PipoyaGIDPath
	haven := game.PipoyaGIDHaven
	water := game.PipoyaGIDWater

	switch def.region {
	case regionFrost:
		base = game.PipoyaGIDPath
	}

	c := newCanvas(def.cols, def.rows, base)
	c.plantDirt = def.region == regionFrost
	c.borderFrame(3, rock)

	switch def.region {
	case regionVerdant:
		paintVerdant(c, def.seed, rock, path)
	case regionFrost:
		paintFrost(c, def.seed, rock, path, water)
	case regionTide:
		paintTide(c, def.seed, rock, path, water)
	}

	hubCX, hubCY := def.cols/2, def.rows/2
	for _, s := range def.settlements {
		cx := (s.c0 + s.c1) / 2
		cy := (s.r0 + s.r1) / 2
		if s.hub || s.minor {
			hubCX, hubCY = cx, cy
		}
		c.fillRect(s.c0, s.r0, s.c1, s.r1, haven, false)
		c.strokeRect(s.c0+2, s.r0+2, s.c1-2, s.r1-2, path, false)
		c.fillRect(s.c0+3, s.r0+3, s.c1-3, s.r1-3, haven, false)
	}

	for _, e := range exits {
		if e.Ferry {
			continue
		}
		side, mid := sideFromTiles(def.cols, def.rows, e.Tiles)
		switch side {
		case edgeN:
			c.pathV(mid, 0, hubCY, 2, path)
		case edgeS:
			c.pathV(mid, hubCY, def.rows-1, 2, path)
		case edgeW:
			c.pathH(mid, 0, hubCX, 2, path)
		case edgeE:
			c.pathH(mid, hubCX, def.cols-1, 2, path)
		}
		span := max(3, (e.Tiles[2]-e.Tiles[0])/2)
		if side == edgeW || side == edgeE {
			span = max(3, (e.Tiles[3]-e.Tiles[1])/2)
		}
		c.openGate(string(side), mid, span, 4)
	}

	for _, e := range exits {
		if !e.Ferry {
			continue
		}
		mc := (e.Tiles[0] + e.Tiles[2]) / 2
		mr := (e.Tiles[1] + e.Tiles[3]) / 2
		// Compact basin so it does not swallow south/north zone-line landings.
		c.fillRect(mc-6, mr-1, mc+6, mr+4, water, true)
		c.fillRect(mc-2, mr-4, mc+2, mr+2, path, false)
		c.fillRect(e.Tiles[0], e.Tiles[1], e.Tiles[2], e.Tiles[3], path, false)
	}

	for _, e := range exits {
		c.fillRect(e.Tiles[0], e.Tiles[1], e.Tiles[2], e.Tiles[3], path, false)
	}

	type regionJSON struct {
		ID        string `json:"id"`
		MinC      int    `json:"minC"`
		MinR      int    `json:"minR"`
		MaxC      int    `json:"maxC"`
		MaxR      int    `json:"maxR"`
		Sanctuary bool   `json:"sanctuary,omitempty"`
		Kind      string `json:"kind,omitempty"`
	}
	type saveJSON struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Tile [2]int `json:"tile"`
	}
	type jobJSON struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Tile [2]int `json:"tile"`
	}
	type npcJSON struct {
		ID     string `json:"id"`
		Kind   string `json:"kind"`
		Name   string `json:"name"`
		Level  int    `json:"level"`
		Region string `json:"region"`
		Home   [2]int `json:"home"`
	}
	type exitJSON struct {
		DestMap string     `json:"destMap"`
		Tiles   [4]int     `json:"tiles"`
		Dest    [2]float64 `json:"dest"`
	}
	type propJSON struct {
		Name  string `json:"name"`
		Type  string `json:"type"`
		Value any    `json:"value"`
	}
	type objJSON struct {
		ID         int        `json:"id"`
		Name       string     `json:"name,omitempty"`
		Type       string     `json:"type"`
		X          float64    `json:"x"`
		Y          float64    `json:"y"`
		Width      float64    `json:"width"`
		Height     float64    `json:"height"`
		Point      bool       `json:"point,omitempty"`
		Properties []propJSON `json:"properties,omitempty"`
	}

	regions := make([]regionJSON, 0)
	saves := make([]saveJSON, 0)
	jobs := make([]jobJSON, 0)
	npcs := make([]npcJSON, 0)
	exitOut := make([]exitJSON, 0)
	objects := make([]objJSON, 0)
	objID := 1

	addRegionObj := func(id, kind string, sanctuary bool, c0, r0, c1, r1 int) {
		ts := float64(tileSize)
		objects = append(objects, objJSON{
			ID: objID, Name: id, Type: "region",
			X: float64(c0) * ts, Y: float64(r1+1) * ts,
			Width: float64(c1-c0+1) * ts, Height: float64(r1-r0+1) * ts,
			Properties: []propJSON{
				{Name: "id", Type: "string", Value: id},
				{Name: "sanctuary", Type: "bool", Value: sanctuary},
				{Name: "kind", Type: "string", Value: kind},
			},
		})
		objID++
	}
	addPointObj := func(typ, id, name string, col, row int, extra []propJSON) {
		ts := float64(tileSize)
		props := []propJSON{
			{Name: "id", Type: "string", Value: id},
			{Name: "name", Type: "string", Value: name},
		}
		props = append(props, extra...)
		objects = append(objects, objJSON{
			ID: objID, Name: id, Type: typ,
			X: (float64(col) + 0.5) * ts, Y: (float64(row) + 0.5) * ts,
			Point: true, Properties: props,
		})
		objID++
	}

	for _, s := range def.settlements {
		kind := "town"
		if s.minor && !s.hub {
			kind = "camp"
		}
		regions = append(regions, regionJSON{
			ID: s.id, MinC: s.c0, MinR: s.r0, MaxC: s.c1, MaxR: s.r1,
			Sanctuary: true, Kind: kind,
		})
		addRegionObj(s.id, kind, true, s.c0, s.r0, s.c1, s.r1)

		cx, cy := (s.c0+s.c1)/2, (s.r0+s.r1)/2
		spID := s.id + "_crystal"
		spName := s.name + " Crystal"
		saves = append(saves, saveJSON{ID: spID, Name: spName, Tile: [2]int{cx, cy}})
		addPointObj("save_point", spID, spName, cx, cy, nil)
		c.setGround(cx, cy, haven)
		c.clearCollision(cx, cy)

		if s.jobMaster {
			jx, jy := cx+4, cy
			if jx >= s.c1 {
				jx = cx - 4
			}
			jcID := s.id + "_job_master"
			jobs = append(jobs, jobJSON{ID: jcID, Name: "Job Master", Tile: [2]int{jx, jy}})
			addPointObj("job_changer", jcID, "Job Master", jx, jy, nil)
			c.setGround(jx, jy, haven)
			c.clearCollision(jx, jy)
		}
	}

	for _, w := range def.wild {
		regions = append(regions, regionJSON{
			ID: w.id, MinC: w.c0, MinR: w.r0, MaxC: w.c1, MaxR: w.r1,
			Kind: w.kind,
		})
		addRegionObj(w.id, w.kind, false, w.c0, w.r0, w.c1, w.r1)

		n := 0
		for _, en := range w.enemies {
			for i := 0; i < en.count; i++ {
				n++
				homeC := w.c0 + 4 + int(hash2(def.seed, uint64(n), 1)%uint64(max(1, w.c1-w.c0-8)))
				homeR := w.r0 + 4 + int(hash2(def.seed, uint64(n), 2)%uint64(max(1, w.r1-w.r0-8)))
				for _, s := range def.settlements {
					if homeC >= s.c0 && homeC <= s.c1 && homeR >= s.r0 && homeR <= s.r1 {
						homeC = min(def.cols-5, s.c1+3)
						homeR = min(def.rows-5, s.r1+3)
					}
				}
				id := fmt.Sprintf("%s_%s_%d", def.id, en.kind, n)
				npcs = append(npcs, npcJSON{
					ID: id, Kind: en.kind, Name: en.name, Level: en.level,
					Region: w.id, Home: [2]int{homeC, homeR},
				})
				addPointObj("npc", id, en.name, homeC, homeR, []propJSON{
					{Name: "kind", Type: "string", Value: en.kind},
					{Name: "level", Type: "int", Value: en.level},
					{Name: "region", Type: "string", Value: w.id},
				})
			}
		}
	}

	for _, e := range exits {
		exitOut = append(exitOut, exitJSON{DestMap: e.DestMap, Tiles: e.Tiles, Dest: e.Dest})
		ts := float64(tileSize)
		minC, minR, maxC, maxR := e.Tiles[0], e.Tiles[1], e.Tiles[2], e.Tiles[3]
		objects = append(objects, objJSON{
			ID: objID, Name: "to_" + e.DestMap, Type: "exit",
			X: float64(minC) * ts, Y: float64(maxR+1) * ts,
			Width: float64(maxC-minC+1) * ts, Height: float64(maxR-minR+1) * ts,
			Properties: []propJSON{
				{Name: "destMap", Type: "string", Value: e.DestMap},
				{Name: "destX", Type: "float", Value: e.Dest[0]},
				{Name: "destY", Type: "float", Value: e.Dest[1]},
			},
		})
		objID++

		// Clear the arrival pad for travelers coming the other way (inland of THIS exit).
		// Dest coords live on the other map — never paint them onto this canvas.
		if e.Ferry {
			mc := (minC + maxC) / 2
			mr := (minR + maxR) / 2
			c.fillRect(mc-2, mr-8, mc+2, mr-4, path, false)
			continue
		}
		side, mid := sideFromTiles(def.cols, def.rows, e.Tiles)
		sx, sy := inlandSpawn(def.cols, def.rows, side, mid)
		dc, dr := int(sx)/tileSize, int(sy)/tileSize
		c.fillRect(dc-2, dr-2, dc+2, dr+2, path, false)
	}

	// Vegetation after roads/settlements so 2×2 tree stamps stay intact.
	decorateVegetation(c, def)
	// Re-open exits and arrival pads (trees must not block zone lines).
	for _, e := range exits {
		c.fillRect(e.Tiles[0], e.Tiles[1], e.Tiles[2], e.Tiles[3], path, false)
		if e.Ferry {
			mc := (e.Tiles[0] + e.Tiles[2]) / 2
			mr := (e.Tiles[1] + e.Tiles[3]) / 2
			c.fillRect(mc-2, mr-4, mc+2, mr+2, path, false)
			c.fillRect(mc-2, mr-8, mc+2, mr-4, path, false)
			continue
		}
		side, mid := sideFromTiles(def.cols, def.rows, e.Tiles)
		sx, sy := inlandSpawn(def.cols, def.rows, side, mid)
		dc, dr := int(sx)/tileSize, int(sy)/tileSize
		c.fillRect(dc-2, dr-2, dc+2, dr+2, path, false)
	}
	for _, n := range npcs {
		c.clearSpawnPad(n.Home[0], n.Home[1], base)
	}
	c.varyPathFills(def.seed ^ 0x91a2)
	c.autotileShores()

	doc := map[string]any{
		"tile_size": tileSize,
		"cols":      def.cols,
		"rows":      def.rows,
		"wander":    map[string]any{"minDistance": 8, "pauseSec": 5, "speed": 28},
		"terrain": map[string]any{
			"ground":    c.ground,
			"collision": c.collision,
		},
		"regions":      regions,
		"save_points":  saves,
		"job_changers": jobs,
		"npcs":         npcs,
		"exits":        exitOut,
		"objects":      objects,
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var cfg game.MapConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("unmarshal map %s: %w", def.id, err)
	}
	return &cfg, nil
}

func paintVerdant(c *canvas, seed uint64, rock, path int) {
	c.scatter(seed, 36, 4, 4, c.cols-5, c.rows-5, func(col, row int, roll uint64) {
		c.stampRockCluster(col, row, rock, roll)
	})
	c.pathH(c.rows/3, 8, c.cols-9, 2, path)
	c.pathV(c.cols/3, 8, c.rows-9, 2, path)
}

func paintFrost(c *canvas, seed uint64, rock, path, water int) {
	c.scatter(seed, 28, 4, 4, c.cols-5, c.rows-5, func(col, row int, roll uint64) {
		c.stampRockCluster(col, row, rock, roll)
	})
	c.fillEllipse(c.cols/4, c.rows/4, 6, 4, water, true)
	c.fillEllipse(3*c.cols/4, 2*c.rows/3, 5, 5, water, true)
	c.pathH(c.rows/2, 6, c.cols-7, 2, path)
	c.pathV(c.cols/2, 6, c.rows-7, 2, path)
}

func paintTide(c *canvas, seed uint64, rock, path, water int) {
	c.fillRect(0, c.rows-6, c.cols-1, c.rows-1, water, true)
	c.fillRect(c.cols-8, c.rows/3, c.cols-1, c.rows-1, water, true)
	c.scatter(seed, 36, 4, 4, c.cols-10, c.rows-8, func(col, row int, roll uint64) {
		c.stampRockCluster(col, row, rock, roll)
	})
	c.pathH(c.rows/2, 6, c.cols-10, 2, path)
	c.pathV(c.cols/2, 6, c.rows-8, 2, path)
}

// decorateVegetation stamps Pipoya multi-tile trees / bushes onto remaining plantable ground.
func decorateVegetation(c *canvas, def mapDef) {
	switch def.region {
	case regionVerdant:
		c.scatter(def.seed^0xb051, 28, 4, 4, c.cols-5, c.rows-5, func(col, row int, roll uint64) {
			c.stampBush(col, row, int(hash2(roll, 1, 2)%3))
		})
		c.scatter(def.seed^0x51ee, 55, 4, 4, c.cols-6, c.rows-6, func(col, row int, roll uint64) {
			choice := hash2(roll, uint64(col), uint64(row))
			variant := int(choice % 3) // light / dark / autumn
			c.stampTree(col, row, variant)
		})
	case regionFrost:
		c.scatter(def.seed^0x0dd, 60, 4, 4, c.cols-6, c.rows-6, func(col, row int, roll uint64) {
			c.stampTree(col, row, 3) // dead / winter
		})
		c.scatter(def.seed^0xb052, 40, 4, 4, c.cols-5, c.rows-5, func(col, row int, roll uint64) {
			c.stampBush(col, row, 3)
		})
	case regionTide:
		c.scatter(def.seed^0xb01a, 65, 4, 4, c.cols-12, c.rows-10, func(col, row int, roll uint64) {
			c.stampTree(col, row, int(hash2(roll, 3, 5)%2))
		})
		c.scatter(def.seed^0xb053, 36, 4, 4, c.cols-10, c.rows-8, func(col, row int, roll uint64) {
			c.stampBush(col, row, int(hash2(roll, 4, 6)%2))
		})
	}
}

func sideFromTiles(cols, rows int, tiles [4]int) (edge, int) {
	minC, minR, maxC, maxR := tiles[0], tiles[1], tiles[2], tiles[3]
	if minR <= 1 {
		return edgeN, (minC + maxC) / 2
	}
	if maxR >= rows-2 {
		return edgeS, (minC + maxC) / 2
	}
	if minC <= 1 {
		return edgeW, (minR + maxR) / 2
	}
	if maxC >= cols-2 {
		return edgeE, (minR + maxR) / 2
	}
	return edgeS, (minC + maxC) / 2
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
