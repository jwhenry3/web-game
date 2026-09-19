package main

import (
	"clara-mundi/internal/game"
	"math"
)

// Tile-resolution geography: continuous elevation/moisture/ridge fields drive
// terrain painting, so coastlines, mountain ranges, basins and rivers ignore
// the zone grid and read as one continent. Zones are classified AFTER the
// paint from the tiles they actually contain.

const (
	seaLevel     = 0.44
	beachMargin  = 0.020 // elevation band above sea that reads as shore
	mountainElev = 0.95  // absolute high-altitude rock (top of the e range)
	ridgeFloor   = 0.80  // elevation where ridge rock begins to appear
	ridgeTop     = 1.02  // elevation where the ridge mask is fully active
	ridgeLine    = 0.30  // ridge*elevMask above this → rock
	coldTemp     = 0.30  // below this, land freezes (rocky peaks, dead ground)
)

type geography struct {
	elev  []float32 // heightmap: < seaLevel is water
	moist []float32 // rainfall: drives ground cover and forest clumping
	ridge []float32 // sharpened ridged noise: mountain-range mask
}

func (g *geography) idx(c, r int) int { return r*mapCols + c }

func smoothstep(a, b, x float64) float64 {
	t := math.Max(0, math.Min(1, (x-a)/(b-a)))
	return t * t * (3 - 2*t)
}

// buildGeography fills the three fields at tile resolution. Elevation uses
// domain-warped fBm (the warp bends iso-lines so coasts wiggle organically)
// plus an elliptical falloff so the rim sinks into ocean — one bounded
// continent with bays, peninsulas and off-shore islands rather than noise
// soup. Ridge uses 1-|2n-1| ridged noise cubed for sharp mountain spines.
func buildGeography(seed uint64) *geography {
	g := &geography{
		elev:  make([]float32, mapCols*mapRows),
		moist: make([]float32, mapCols*mapRows),
		ridge: make([]float32, mapCols*mapRows),
	}
	const (
		eFreq = 0.0045 // base wavelength ~220 tiles ≈ 2 zones
		wFreq = 0.006  // domain-warp field
		mFreq = 0.0038 // moisture, slightly broader than elevation
		rFreq = 0.012  // mountain-range wavelength ~80 tiles
	)
	cx := float64(mapCols-1) / 2
	cy := float64(mapRows-1) / 2
	for r := 0; r < mapRows; r++ {
		for c := 0; c < mapCols; c++ {
			i := g.idx(c, r)
			qx := fbm(seed^0xd0a1, float64(c)*wFreq, float64(r)*wFreq, 3) - 0.5
			qy := fbm(seed^0xd0a2, float64(c)*wFreq+7.3, float64(r)*wFreq+2.9, 3) - 0.5
			e := fbm(seed^0xe1e7, float64(c)*eFreq+qx*1.6, float64(r)*eFreq+qy*1.6, 5)
			dx := (float64(c) - cx) / cx
			dy := (float64(r) - cy) / cy
			d := math.Sqrt(dx*dx + dy*dy)
			// Interior base ~0.6 (above sea 0.44): the falloff decides where the
			// coastline sits, fBm wiggles it into bays and peninsulas.
			e = e*1.5 - 0.15 - smoothstep(0.72, 1.12, d)*0.72
			g.elev[i] = float32(e)

			g.moist[i] = float32(fbm(seed^0x90157,
				float64(c)*mFreq+qx*1.2, float64(r)*mFreq+qy*1.2, 4))

			rg := fbm(seed^0x6c1ff, float64(c)*rFreq, float64(r)*rFreq, 4)
			rid := 1 - math.Abs(rg*2-1)
			g.ridge[i] = float32(rid * rid * rid)
		}
	}
	return g
}

// tempAt approximates temperature for painting: latitude dominates, altitude
// cools (snow caps on southern peaks), noise wobbles the boundary.
func (g *geography) tempAt(c, r int) float64 {
	i := g.idx(c, r)
	lat := float64(r) / float64(mapRows-1)
	wob := fbm(0x7e99, float64(c)*0.02, float64(r)*0.02, 2) * 0.08
	return 0.16 + lat*0.88 - float64(g.elev[i])*0.55 + wob
}

// paintGeography stamps every tile's ground from the fields. Water below sea
// level (oceans AND inland basins), sand at the shore margin, rock on high
// ridges and frozen peaks, grass/dirt patchiness by moisture elsewhere.
func (ct *continent) paintGeography(geo *geography) {
	c := ct.canvas
	for r := 0; r < mapRows; r++ {
		for col := 0; col < mapCols; col++ {
			i := c.idx(col, r)
			e := float64(geo.elev[i])
			if e < seaLevel {
				c.setWater(col, r, waterGID)
				continue
			}
			m := float64(geo.moist[i])
			temp := geo.tempAt(col, r)
			lat := float64(r) / float64(mapRows-1)
			switch {
			case e < seaLevel+beachMargin:
				c.setGround(col, r, game.MundiGIDBeach) // shoreline sand
			case e > mountainElev || float64(geo.ridge[i])*smoothstep(ridgeFloor, ridgeTop, e) > ridgeLine:
				// Rock fill resolves to '#': ranges genuinely block travel.
				// The elevation-scaled ridge mask concentrates rock on real
				// high ground instead of filling broad plateaus.
				c.setBlocked(col, r, rockGID)
			case temp < coldTemp && e > 0.78:
				c.setBlocked(col, r, rockGID) // frozen peaks
			default:
				n := fbm(ct.seed^0xba5e, float64(col)*0.07, float64(r)*0.07, 3)
				dirtiness := (0.52-m)*1.1 + (n-0.5)*0.7
				switch {
				case temp < coldTemp:
					// Frozen ground: packed snow on highlands, loose snow below.
					if e > 0.62 {
						c.setGround(col, r, game.MundiGIDPackedSnow)
					} else {
						c.setGround(col, r, game.MundiGIDSnow)
					}
				case e > 0.80:
					c.setGround(col, r, game.MundiGIDScree) // rocky highland below the cliffs
				case lat > 0.66:
					dirtiness += (lat - 0.66) * 1.2 // arid south
					dry := m - (lat-0.66)*0.7
					switch {
					case dry > 0.58:
						c.setGround(col, r, game.PipoyaBaseChipGID(2)) // vivid jungle floor
					case dirtiness > 0.55:
						c.setGround(col, r, game.MundiGIDDune)
					case dirtiness > 0.16:
						c.setGround(col, r, game.PipoyaBaseChipGID(4)) // dry savanna tan
					default:
						c.setGround(col, r, grassGID)
					}
				case m > 0.70:
					c.setGround(col, r, game.MundiGIDPeat) // waterlogged mire ground
				case m > 0.56:
					c.setGround(col, r, game.PipoyaBaseChipGID(1)) // dark taiga/forest grass
				case dirtiness > 0.16:
					c.setGround(col, r, dirtGID)
				default:
					c.setGround(col, r, grassGID)
				}
			}
		}
	}
}

// seaMargin floods a band around the map edge so the continent is always
// ringed by open ocean — no land may touch the world boundary. Painted before
// rivers so they terminate in the margin sea.
func (ct *continent) seaMargin(depth int) {
	c := ct.canvas
	for r := 0; r < depth; r++ {
		for col := 0; col < mapCols; col++ {
			c.setWater(col, r, waterGID)
			c.setWater(col, mapRows-1-r, waterGID)
		}
	}
	for r := depth; r < mapRows-depth; r++ {
		for col := 0; col < depth; col++ {
			c.setWater(col, r, waterGID)
			c.setWater(mapCols-1-col, r, waterGID)
		}
	}
}

// classifyTerrain derives a zone's biome from what actually got painted in
// it: mostly-water is ocean, a shoreline band is coast, high rock fraction is
// crags, and the remaining land falls back to the climate table.
func classifyTerrain(waterFrac, rockFrac, moist, lat float64) biomeID {
	switch {
	case waterFrac > 0.62:
		return biomeOcean
	case rockFrac > 0.34:
		return biomeCrags
	case waterFrac > 0.09:
		return biomeCoast
	case lat < 0.24:
		if rockFrac > 0.14 || lat < 0.10 {
			return biomeGlacier
		}
		if moist > 0.5 {
			return biomeTaiga
		}
		return biomeTundra
	case lat >= 0.66:
		dry := moist - (lat-0.66)*0.7
		if dry > 0.58 {
			return biomeJungle
		}
		if dry > 0.34 {
			return biomeSavanna
		}
		return biomeDunes
	default:
		if moist > 0.68 && waterFrac > 0.02 {
			return biomeMire
		}
		if moist > 0.56 {
			return biomeForest
		}
		if moist > 0.42 {
			return biomeWeald
		}
		return biomeMeadow
	}
}

// classifyZones counts water/rock/moisture per zone and assigns its biome.
func (ct *continent) classifyZones(geo *geography) {
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			z := ct.zones[zy][zx]
			water, rock, land, n := 0, 0, 0, 0
			moistSum := 0.0
			for r := z.r0; r <= z.r1; r += 3 {
				for col := z.c0; col <= z.c1; col += 3 {
					i := ct.canvas.idx(col, r)
					n++
					switch {
					case isWaterGID(ct.canvas.ground[i]):
						water++
					case ct.canvas.collision[i] != 0:
						rock++
					default:
						land++
						moistSum += float64(geo.moist[i])
					}
				}
			}
			lat := float64(zy) / float64(zonesY-1)
			z.biome = classifyTerrain(
				float64(water)/float64(n),
				float64(rock)/float64(n),
				moistSum/math.Max(1, float64(land)),
				lat,
			)
		}
	}
}

const freezeTemp = 0.10 // water colder than this freezes to ice

// freezeWater converts open water to ice where the temperature field drops
// below freezeTemp — frozen seas, lakes and river reaches in the far north.
// Runs after shore autotiling: frozen tiles collapse to the solid ice chip,
// and the 'I' cell char blocks travel exactly like '~'.
func (ct *continent) freezeWater(geo *geography) {
	c := ct.canvas
	for r := 0; r < mapRows; r++ {
		for col := 0; col < mapCols; col++ {
			i := c.idx(col, r)
			if !isWaterGID(c.ground[i]) {
				continue
			}
			if geo.tempAt(col, r) < freezeTemp {
				c.ground[i] = game.MundiGIDIce
			}
		}
	}
}

// carveRivers drains the highlands to the sea: steepest-descent walks over
// the heightmap, wetting each tile they cross. Paths merge naturally — a
// trace ends when it reaches any water. Trapped walks die as springs.
func (ct *continent) carveRivers(geo *geography) {
	c := ct.canvas
	made := 0
	for i := 0; i < 600 && made < 30; i++ {
		h := hash2(ct.seed^0x11e7, uint64(i), 0x77)
		c0 := 6 + int(h%uint64(mapCols-12))
		r0 := 6 + int((h>>16)%uint64(mapRows-12))
		i0 := c.idx(c0, r0)
		if geo.elev[i0] < 0.56 || geo.elev[i0] > mountainElev || geo.moist[i0] < 0.40 {
			continue
		}
		if isWaterGID(c.ground[i0]) {
			continue
		}
		if c.traceRiver(c0, r0, geo) > 70 {
			made++
		}
	}
}

// traceRiver walks downhill from (c0, r0), painting water. Returns tiles
// painted before reaching water, looping, or getting trapped in a basin.
func (c *canvas) traceRiver(c0, r0 int, geo *geography) int {
	x, y := c0, r0
	seen := make(map[int]bool, 512)
	for steps := 0; steps < 5000; steps++ {
		i := c.idx(x, y)
		if isWaterGID(c.ground[i]) {
			return steps
		}
		if seen[i] {
			return steps
		}
		seen[i] = true
		c.setWater(x, y, waterGID)
		// Occasional width so rivers read as rivers, not dotted lines.
		if hash2(0x9a77, uint64(x), uint64(y))%6 == 0 && c.in(x+1, y) && !isWaterGID(c.gidAt(x+1, y)) {
			c.setWater(x+1, y, waterGID)
		}
		bx, by, best := x, y, math.MaxFloat64
		for _, d := range [4][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}} {
			nx, ny := x+d[0], y+d[1]
			if !c.in(nx, ny) {
				continue
			}
			ni := c.idx(nx, ny)
			jitter := float64(hash2(0xf11d, uint64(nx), uint64(ny))%1024) / 1024 * 0.05
			if e := float64(geo.elev[ni]) + jitter; e < best {
				best, bx, by = e, nx, ny
			}
		}
		if bx == x && by == y {
			return steps
		}
		// Trapped in a basin — the stream dies here (leaves a spring).
		if float64(geo.elev[c.idx(bx, by)]) > float64(geo.elev[i])+0.006 {
			return steps
		}
		x, y = bx, by
	}
	return 5000
}
