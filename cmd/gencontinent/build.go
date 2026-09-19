package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
)

// The continent is a 10×10 grid of 128×96-tile zones — exactly 100× the old
// 128×96 world. Zone rects double as gameplay regions AND simulation-region
// boundaries, so each zone is one NPC worker's shard.
const (
	zonesX     = 10
	zonesY     = 10
	zoneCols   = 128
	zoneRows   = 96
	mapCols    = zonesX * zoneCols // 1280
	mapRows    = zonesY * zoneRows // 960
	npcPerZone = 11
)

type zone struct {
	zx, zy     int
	c0, r0     int // tile-space origin (inclusive)
	c1, r1     int // tile-space end (inclusive)
	biome      biomeID
	name       string // unique slug → gameplay region id
	settlement *settlement
}

func (z *zone) center() (int, int) { return (z.c0 + z.c1) / 2, (z.r0 + z.r1) / 2 }

type settlement struct {
	name     string
	hub      bool // job master present
	c0, r0   int
	c1, r1   int
	saveTile [2]int
	jobTile  [2]int
}

func (s *settlement) id() string { return slugify(s.name) }

func slugify(name string) string {
	out := make([]byte, 0, len(name))
	for i := 0; i < len(name); i++ {
		ch := name[i]
		switch {
		case ch >= 'A' && ch <= 'Z':
			out = append(out, ch+32)
		case ch == ' ' || ch == '-':
			out = append(out, '_')
		default:
			out = append(out, ch)
		}
	}
	return string(out)
}

// ---- region / entity records mirroring MapConfig's JSON schema ----

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

type continent struct {
	seed   uint64
	zones  [zonesY][zonesX]*zone
	canvas *canvas

	regions       []regionJSON
	saves         []saveJSON
	jobs          []jobJSON
	npcs          []npcJSON
	capitalSaveID string // spawn fallback — kept first in save_points
}

func newContinent(seed uint64) *continent {
	ct := &continent{seed: seed, canvas: newCanvas(mapCols, mapRows, grassGID)}
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			ct.zones[zy][zx] = &zone{
				zx: zx, zy: zy,
				c0: zx * zoneCols, r0: zy * zoneRows,
				c1: zx*zoneCols + zoneCols - 1, r1: zy*zoneRows + zoneRows - 1,
			}
		}
	}
	return ct
}

// nameZones assigns each zone a unique slug from its (already classified)
// biome. Runs after the capital forces its biome to forest so the capital
// region gets a forest-appropriate name.
func (ct *continent) nameZones() {
	used := map[string]bool{}
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			z := ct.zones[zy][zx]
			name := zoneName(ct.seed, zx, zy, z.biome)
			for i := 1; used[name] && i <= 32; i++ {
				name = zoneNameVariant(ct.seed, zx, zy, z.biome, i)
			}
			for i := 2; used[name]; i++ {
				name = fmt.Sprintf("%s_%d", zoneName(ct.seed, zx, zy, z.biome), i)
			}
			used[name] = true
			z.name = name
		}
	}
}

func (ct *continent) at(zx, zy int) *zone {
	if zx < 0 || zy < 0 || zx >= zonesX || zy >= zonesY {
		return nil
	}
	return ct.zones[zy][zx]
}

func (ct *continent) neighbors(z *zone) [4]*zone {
	return [4]*zone{ct.at(z.zx, z.zy-1), ct.at(z.zx, z.zy+1), ct.at(z.zx-1, z.zy), ct.at(z.zx+1, z.zy)}
}

func (z *zone) land() bool { return z.biome != biomeOcean }

// markCoasts is unnecessary under heightmap geography: classifyTerrain
// already labels shoreline zones from their painted water fraction.

// landComponent BFS-reaches every land zone connected to start via the road
// graph (4-neighbor land adjacency). Ocean-ringed islands stay unreachable —
// settlements are only ever placed inside the capital's component.
func (ct *continent) landComponent(start *zone) map[*zone]bool {
	seen := map[*zone]bool{start: true}
	q := []*zone{start}
	for len(q) > 0 {
		z := q[0]
		q = q[1:]
		for _, n := range ct.neighbors(z) {
			if n != nil && n.land() && !seen[n] {
				seen[n] = true
				q = append(q, n)
			}
		}
	}
	return seen
}

// zoneSettlable reports whether a zone can host a settlement.
func zoneSettlable(z *zone) bool {
	return z.land() && z.biome != biomeCrags && z.biome != biomeGlacier
}

// placeCapital picks the settlable zone nearest map center, forces its biome
// to forest, and founds Hearthvale (the spawn-fallback save point).
func (ct *continent) placeCapital() *zone {
	var capital *zone
	best := math.MaxFloat64
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			z := ct.zones[zy][zx]
			if !zoneSettlable(z) {
				continue
			}
			d := math.Hypot(float64(zx)-4.5, float64(zy)-4.5)
			if d < best {
				best, capital = d, z
			}
		}
	}
	if capital == nil {
		return nil
	}
	capital.biome = biomeForest
	ct.addSettlement(capital, "Hearthvale", true)
	ct.capitalSaveID = capital.settlement.id() + "_crystal"
	return capital
}

// placeSettlements picks well-spread land zones for towns/camps, all inside
// the capital's connected land component. Three hubs anchor the far north, a
// coast, and the far south; the rest are biome-named minor camps.
func (ct *continent) placeSettlements(capital *zone) {
	if capital == nil {
		return
	}
	reach := ct.landComponent(capital)
	eligibleRoad := func(z *zone) bool { return zoneSettlable(z) && reach[z] }

	// Hub candidates: far north, any coast, far south.
	prefer := func(want func(*zone) bool) *zone {
		var pick *zone
		bestScore := math.MaxFloat64
		for zy := 0; zy < zonesY; zy++ {
			for zx := 0; zx < zonesX; zx++ {
				z := ct.zones[zy][zx]
				if !eligibleRoad(z) || z.settlement != nil || !want(z) {
					continue
				}
				d := math.Hypot(float64(zx)-4.5, float64(zy)-4.5)
				if d < bestScore {
					bestScore, pick = d, z
				}
			}
		}
		return pick
	}
	if z := prefer(func(z *zone) bool { return z.zy <= 2 }); z != nil {
		ct.addSettlement(z, "Frostwatch", true)
	}
	if z := prefer(func(z *zone) bool { return z.biome == biomeCoast }); z != nil {
		ct.addSettlement(z, "Tidewater", true)
	}
	if z := prefer(func(z *zone) bool { return z.zy >= 7 }); z != nil {
		ct.addSettlement(z, "Emberrest", true)
	}

	// Minor camps: spread over remaining eligible zones, ≥2 zones apart.
	settlements := 0
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			if ct.zones[zy][zx].settlement != nil {
				settlements++
			}
		}
	}
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			z := ct.zones[zy][zx]
			if !eligibleRoad(z) || z.settlement != nil {
				continue
			}
			if settlements >= 14 {
				return
			}
			near := false
			for dy := -1; dy <= 1 && !near; dy++ {
				for dx := -1; dx <= 1; dx++ {
					if n := ct.at(zx+dx, zy+dy); n != nil && n.settlement != nil {
						near = true
						break
					}
				}
			}
			if !near {
				ct.addSettlement(z, titleCase(z.name)+" Camp", false)
				settlements++
			}
		}
	}
}

func titleCase(slug string) string {
	out := []byte(slug)
	upper := true
	for i, ch := range out {
		if upper && ch >= 'a' && ch <= 'z' {
			out[i] = ch - 32
			upper = false
		} else if ch == '_' {
			out[i] = ' '
			upper = true
		}
	}
	return string(out)
}

func (ct *continent) addSettlement(z *zone, name string, hub bool) {
	cx, cy := z.center()
	s := &settlement{
		name: name, hub: hub,
		c0: cx - 13, r0: cy - 9,
		c1: cx + 13, r1: cy + 9,
		saveTile: [2]int{cx, cy},
		jobTile:  [2]int{cx + 5, cy},
	}
	if s.c0 < z.c0+4 {
		shift := z.c0 + 4 - s.c0
		s.c0 += shift
		s.c1 += shift
		s.saveTile[0] += shift
		s.jobTile[0] += shift
	}
	if s.c1 > z.c1-4 {
		shift := s.c1 - (z.c1 - 4)
		s.c0 -= shift
		s.c1 -= shift
		s.saveTile[0] -= shift
		s.jobTile[0] -= shift
	}
	if s.r0 < z.r0+4 {
		shift := z.r0 + 4 - s.r0
		s.r0 += shift
		s.r1 += shift
		s.saveTile[1] += shift
		s.jobTile[1] += shift
	}
	if s.r1 > z.r1-4 {
		shift := s.r1 - (z.r1 - 4)
		s.r0 -= shift
		s.r1 -= shift
		s.saveTile[1] -= shift
		s.jobTile[1] -= shift
	}
	z.settlement = s
}

// paintSettlements stamps haven ground for every settlement (called after
// roads so towns overwrite the thoroughfare, not vice versa).
func (ct *continent) paintSettlements() {
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			s := ct.zones[zy][zx].settlement
			if s == nil {
				continue
			}
			c := ct.canvas
			c.fillRect(s.c0, s.r0, s.c1, s.r1, dirtGID, false)
			c.fillRect(s.c0+2, s.r0+2, s.c1-2, s.r1-2, cobble, false)
			// Clear any road marks under the plaza so haven reads clean.
			for r := s.r0; r <= s.r1; r++ {
				for col := s.c0; col <= s.c1; col++ {
					c.road[c.idx(col, r)] = false
				}
			}
		}
	}
}

// carveRoads links every land zone's center to its east/south land neighbors,
// producing a connected road graph. Roads bridge lakes and cut through rock —
// settlements are painted over them afterwards.
func (ct *continent) carveRoads() {
	c := ct.canvas
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			z := ct.zones[zy][zx]
			if !z.land() {
				continue
			}
			x0, y0 := z.center()
			if e := ct.at(zx+1, zy); e != nil && e.land() {
				x1, y1 := e.center()
				c.pathL(x0, y0, x1, y1, 1, dirtGID)
			}
			if s := ct.at(zx, zy+1); s != nil && s.land() {
				x1, y1 := s.center()
				c.pathL(x0, y0, x1, y1, 1, dirtGID)
			}
		}
	}
}

func (ct *continent) buildEntities() {
	c := ct.canvas
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			z := ct.zones[zy][zx]
			ct.regions = append(ct.regions, regionJSON{
				ID: z.name, MinC: z.c0, MinR: z.r0, MaxC: z.c1, MaxR: z.r1,
				Kind: z.biome.kind(),
			})
			if s := z.settlement; s != nil {
				sid := s.id()
				ct.regions = append(ct.regions, regionJSON{
					ID: sid, MinC: s.c0, MinR: s.r0, MaxC: s.c1, MaxR: s.r1,
					Sanctuary: true, Kind: "town",
				})
				ct.saves = append(ct.saves, saveJSON{
					ID: sid + "_crystal", Name: s.name + " Crystal", Tile: s.saveTile,
				})
				c.clearSpawnPad(s.saveTile[0], s.saveTile[1], cobble)
				if s.hub {
					ct.jobs = append(ct.jobs, jobJSON{
						ID: sid + "_job_master", Name: "Job Master", Tile: s.jobTile,
					})
					c.clearSpawnPad(s.jobTile[0], s.jobTile[1], cobble)
				}
			}
			if !z.land() {
				continue
			}
			ct.scatterNPCs(z)
		}
	}
}

// scatterNPCs seeds each land zone's patrols: count scales with zone, level
// scales with distance from the capital, kinds come from the biome table.
func (ct *continent) scatterNPCs(z *zone) {
	c := ct.canvas
	table := biomeEnemies[z.biome]
	if len(table) == 0 {
		return
	}
	count := npcPerZone - 3 + int(hash2(ct.seed^0x9c55, uint64(z.zx), uint64(z.zy))%7)
	if count < 4 {
		count = 4
	}
	// Distance from the map-center capital drives the level curve.
	d := math.Hypot(float64(z.zx)-4.5, float64(z.zy)-4.5)
	level := 1 + int(math.Round(d/6.4*19))
	if level > 20 {
		level = 20
	}
	used := map[[2]int]bool{}
	for i := 0; i < count; i++ {
		var home [2]int
		ok := false
		for tries := 0; tries < 200; tries++ {
			h := hash2(ct.seed^0x7f11, uint64(z.zx*97+i*13+tries), uint64(z.zy*89+tries))
			hc := z.c0 + 4 + int(h%uint64(zoneCols-8))
			hr := z.r0 + 4 + int((h>>16)%uint64(zoneRows-8))
			idx := c.idx(hc, hr)
			if c.collision[idx] != 0 || c.road[idx] || !walkableSpawn(c.ground[idx]) || used[[2]int{hc, hr}] {
				continue
			}
			if s := z.settlement; s != nil && hc >= s.c0-1 && hc <= s.c1+1 && hr >= s.r0-1 && hr <= s.r1+1 {
				continue
			}
			home = [2]int{hc, hr}
			ok = true
			break
		}
		if !ok {
			continue
		}
		used[home] = true
		en := table[int(hash2(ct.seed, uint64(i), uint64(z.zx+z.zy))%uint64(len(table)))]
		jitter := int(hash2(ct.seed^0x11, uint64(i), uint64(z.zx*31+z.zy))%3) - 1
		lv := level + jitter
		if lv < 1 {
			lv = 1
		}
		if lv > 20 {
			lv = 20
		}
		id := fmt.Sprintf("%s_%s_%d", z.name, en.kind, i+1)
		ct.npcs = append(ct.npcs, npcJSON{
			ID: id, Kind: en.kind, Name: en.name, Level: lv,
			Region: z.name, Home: home,
		})
		c.clearSpawnPad(home[0], home[1], c.gidAt(home[0], home[1]))
	}
}

// scatterBoulders drops sparse rock clusters on foothills — texture at the
// edge of ranges and open highlands, sparing roads/water/settlements.
func (ct *continent) scatterBoulders(geo *geography) {
	c := ct.canvas
	c.scatter(ct.seed^0xb01d, 900, 4, 4, mapCols-5, mapRows-5, func(col, row int, roll uint64) {
		e := float64(geo.elev[c.idx(col, row)])
		if e < 0.50 || e > 0.85 {
			return
		}
		c.stampRockCluster(col, row, rockGID, roll)
	})
}

// build runs the full pipeline: heightmap geography → zone classification →
// rivers/settlements/roads → vegetation → entities → shore autotile.
func (ct *continent) build() {
	geo := buildGeography(ct.seed)
	ct.paintGeography(geo)
	ct.seaMargin(seaMarginTiles)
	ct.classifyZones(geo)
	ct.carveRivers(geo)

	capital := ct.placeCapital()
	ct.nameZones()
	ct.placeSettlements(capital)
	ct.carveRoads()
	ct.paintSettlements()
	ct.scatterBoulders(geo)

	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			decorateZone(ct.canvas, ct.zones[zy][zx], ct.seed, geo)
		}
	}

	ct.buildEntities()
	// The capital's crystal is the spawn fallback — keep it first.
	for i, s := range ct.saves {
		if s.ID == ct.capitalSaveID && i > 0 {
			ct.saves[0], ct.saves[i] = ct.saves[i], ct.saves[0]
			break
		}
	}
	ct.canvas.varyPathFills(ct.seed ^ 0x91a2)
	ct.canvas.autotileShores()
	ct.freezeWater(geo)
}

// mapDoc returns the MapConfig-shaped JSON document (compact marshal — the
// pretty-printed form of a 1.2M-cell grid would be ~3x larger).
func (ct *continent) mapDoc() map[string]any {
	return map[string]any{
		"tile_size": tileSize,
		"cols":      mapCols,
		"rows":      mapRows,
		"wander":    map[string]any{"minDistance": 8, "pauseSec": 5, "speed": 28},
		"terrain": map[string]any{
			"ground":    ct.canvas.ground,
			"collision": ct.canvas.collision,
		},
		"regions":      ct.regions,
		"save_points":  ct.saves,
		"job_changers": ct.jobs,
		"npcs":         ct.npcs,
		"exits":        []any{},
	}
}

// worldDoc returns the .world.json manifest: the terrain path plus one
// simulation region per zone (abutting, non-overlapping).
func (ct *continent) worldDoc(terrainPath string) map[string]any {
	sims := make([]regionJSON, 0, zonesX*zonesY)
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			z := ct.zones[zy][zx]
			sims = append(sims, regionJSON{
				ID:   "sim_" + z.name,
				MinC: z.c0, MinR: z.r0, MaxC: z.c1, MaxR: z.r1,
			})
		}
	}
	return map[string]any{
		"terrain":            terrainPath,
		"simulation_regions": sims,
	}
}

func writeJSON(path string, doc any) error {
	data, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
