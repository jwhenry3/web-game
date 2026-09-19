package main

import (
	"clara-mundi/internal/game"
)

// Vegetation decorators run after roads and settlements exist (the road mask
// keeps thoroughfares clear). Ground cover itself is painted per-tile from
// the heightmap in geo.go — this file only stamps trees and bushes.

const (
	grassGID = game.PipoyaGIDGrass
	dirtGID  = game.PipoyaGIDPath
	cobble   = game.PipoyaGIDHaven
	rockGID  = game.PipoyaGIDRock
	waterGID = game.PipoyaGIDWater
)

// zoneTrees scatters 2×2 tree stamps; variant picks the Pipoya palette
// (0 light, 1 dark, 2 autumn, 3 dead). gate (may be nil) filters candidate
// tiles — moist-gated biomes get groves that ignore zone borders.
func zoneTrees(c *canvas, z *zone, seed uint64, density int, variant func(roll uint64) int, gate func(col, row int) bool) {
	c.scatterGated(seed^0x7ee5, density, z.c0+2, z.r0+2, z.c1-4, z.r1-4, gate, func(col, row int, roll uint64) {
		c.stampTree(col, row, variant(roll))
	})
}

// zoneBigTrees scatters the large-canopy Pipoya set — same variant order.
func zoneBigTrees(c *canvas, z *zone, seed uint64, density int, variant func(roll uint64) int, gate func(col, row int) bool) {
	c.scatterGated(seed^0x7ee5, density, z.c0+2, z.r0+2, z.c1-4, z.r1-4, gate, func(col, row int, roll uint64) {
		c.stampBigTree(col, row, variant(roll))
	})
}

// zoneMundiTrees scatters MundiTerrain 2×2 trees:
// variant 0 pine, 1 snowy pine, 2 palm, 3 dead grey.
func zoneMundiTrees(c *canvas, z *zone, seed uint64, density int, variant func(roll uint64) int, gate func(col, row int) bool) {
	c.scatterGated(seed^0x7ee5, density, z.c0+2, z.r0+2, z.c1-4, z.r1-4, gate, func(col, row int, roll uint64) {
		c.stampMundiTree(col, row, variant(roll))
	})
}

// zoneMundiProps scatters MundiTerrain 1×1 props; blocking follows
// MundiBlockingLocals (boulders/spires/stumps block, soft props don't).
func zoneMundiProps(c *canvas, z *zone, seed uint64, density int, locals []int, gate func(col, row int) bool) {
	c.scatterGated(seed^0xb05e, density, z.c0+2, z.r0+2, z.c1-2, z.r1-2, gate, func(col, row int, roll uint64) {
		c.stampMundiProp(col, row, locals[roll%uint64(len(locals))])
	})
}

// zonePipoyaProps scatters 1×1 BaseChip scatter props (tufts, flowers,
// mushrooms) — visual only, never blocking.
func zonePipoyaProps(c *canvas, z *zone, seed uint64, density int, locals []int, gate func(col, row int) bool) {
	c.scatterGated(seed^0xb05e, density, z.c0+2, z.r0+2, z.c1-2, z.r1-2, gate, func(col, row int, roll uint64) {
		c.stampProp(col, row, game.PipoyaBaseChipGID(locals[roll%uint64(len(locals))]), false)
	})
}

// zoneBushes scatters 1×1 bush props; variant indexes PipoyaBushLocals.
func zoneBushes(c *canvas, z *zone, seed uint64, density int, variant func(roll uint64) int) {
	c.scatter(seed^0xb05e, density, z.c0+2, z.r0+2, z.c1-2, z.r1-2, func(col, row int, roll uint64) {
		c.stampBush(col, row, variant(roll))
	})
}

func treeVariantLightDark(roll uint64) int { return int(roll % 2) }
func treeVariantDark(roll uint64) int      { return 1 }
func treeVariantAutumn(roll uint64) int    { return 2 }
func treeVariantDead(roll uint64) int      { return 3 }
func treeVariantAny(roll uint64) int       { return int(roll % 4) }
func bushVariantLight(roll uint64) int     { return 0 }
func bushVariantDark(roll uint64) int      { return 1 }
func bushVariantFall(roll uint64) int      { return 2 }
func bushVariantDead(roll uint64) int      { return 3 }

// MundiTerrain tree pickers (0 pine, 1 snowy pine, 2 palm, 3 dead grey).
func mundiPine(roll uint64) int      { return 0 }
func mundiSnowyPine(roll uint64) int { return 1 }
func mundiPalm(roll uint64) int      { return 2 }
func mundiDeadGrey(roll uint64) int  { return 3 }
func mundiSnowyOrDead(roll uint64) int {
	if roll%3 == 0 {
		return 3
	}
	return 1
}
func mundiPineOrDead(roll uint64) int {
	switch roll % 5 {
	case 0, 1:
		return 0 // green pine
	case 2, 3:
		return 1 // snowy pine — taiga sits at the snow line
	default:
		return 3 // dead grey
	}
}

// sandGate admits only beach/dune fills — palms and driftwood stay on sand.
func sandGate(c *canvas) func(col, row int) bool {
	return func(col, row int) bool {
		return c.groundIs(col, row, game.MundiGIDBeach, game.MundiGIDDune)
	}
}

// warmSandGate is sandGate plus a temperature floor — palms only grow on
// warm (southern) beaches, never beside a frozen shoreline.
func warmSandGate(c *canvas, geo *geography, minTemp float64) func(col, row int) bool {
	sand := sandGate(c)
	return func(col, row int) bool {
		return sand(col, row) && geo.tempAt(col, row) >= minTemp
	}
}

// waterEdgeGate admits land tiles touching open water — reeds and shore
// props hug real waterlines.
func waterEdgeGate(c *canvas) func(col, row int) bool {
	return c.nearWater
}

// moistGate returns a tile gate admitting positions where the moisture field
// clears min — forested biomes clump into groves instead of uniform scatter.
func moistGate(geo *geography, min float64) func(col, row int) bool {
	if min <= 0 {
		return nil
	}
	return func(col, row int) bool {
		return float64(geo.moist[geo.idx(col, row)]) >= min
	}
}

// decorateZone stamps vegetation — runs after roads so the road mask keeps
// thoroughfares clear. Tree sets mix Pipoya small/big trees with the
// MundiTerrain pines/palms/dead greys; props come from both sheets.
func decorateZone(c *canvas, z *zone, seed uint64, geo *geography) {
	switch z.biome {
	case biomeOcean:
		// nothing
	case biomeCoast:
		c.plantDirt = false
		zoneTrees(c, z, seed, 90, treeVariantLightDark, moistGate(geo, 0.52))
		zoneMundiTrees(c, z, seed, 130, mundiPalm, warmSandGate(c, geo, 0.45))
		zoneMundiProps(c, z, seed, 110, []int{
			game.MundiLocalShells, game.MundiLocalDriftwood, game.MundiLocalWetRock,
		}, waterEdgeGate(c))
		zoneBushes(c, z, seed, 40, bushVariantLight)
	case biomeGlacier:
		c.plantDirt = true
		zoneMundiTrees(c, z, seed, 150, mundiSnowyOrDead, nil)
		zoneMundiProps(c, z, seed, 60, []int{
			game.MundiLocalIceCrystal, game.MundiLocalSnowyRock,
			game.MundiLocalSnowDrift, game.MundiLocalBoulder,
		}, nil)
		zonePipoyaProps(c, z, seed, 90, []int{game.BaseChipLocalGrassDead, game.BaseChipLocalTwig}, nil)
	case biomeTundra:
		c.plantDirt = true
		zoneMundiTrees(c, z, seed, 80, mundiSnowyOrDead, nil)
		zoneMundiProps(c, z, seed, 55, []int{
			game.MundiLocalSnowShrub, game.MundiLocalSnowyRock, game.MundiLocalSnowDrift,
		}, nil)
		zoneBushes(c, z, seed, 60, bushVariantDead)
	case biomeTaiga:
		c.plantDirt = false
		zoneMundiTrees(c, z, seed, 14, mundiPineOrDead, moistGate(geo, 0.30))
		zoneMundiProps(c, z, seed, 70, []int{
			game.MundiLocalMossyRock, game.MundiLocalBoulder, game.MundiLocalFern,
		}, nil)
		zoneBushes(c, z, seed, 55, bushVariantDark)
	case biomeCrags:
		c.plantDirt = true
		zoneMundiTrees(c, z, seed, 170, mundiDeadGrey, nil)
		zoneMundiProps(c, z, seed, 70, []int{
			game.MundiLocalRockSpire, game.MundiLocalBoulder,
			game.MundiLocalCharredStump, game.MundiLocalObsidian,
		}, nil)
	case biomeMire:
		c.plantDirt = false
		zoneTrees(c, z, seed, 60, treeVariantDark, moistGate(geo, 0.50))
		zoneMundiTrees(c, z, seed, 130, mundiDeadGrey, nil)
		zoneMundiProps(c, z, seed, 40, []int{
			game.MundiLocalGiantMushroom, game.MundiLocalMudMound, game.MundiLocalMossyRock,
		}, nil)
		zoneMundiProps(c, z, seed, 55, []int{
			game.MundiLocalReedsTall, game.MundiLocalReedsShort,
		}, waterEdgeGate(c))
		zonePipoyaProps(c, z, seed, 50, []int{game.BaseChipLocalMushBrown, game.BaseChipLocalMushPink}, nil)
	case biomeForest:
		c.plantDirt = false
		zoneTrees(c, z, seed, 26, treeVariantLightDark, moistGate(geo, 0.40))
		zoneBigTrees(c, z, seed, 110, treeVariantLightDark, moistGate(geo, 0.58))
		zoneMundiProps(c, z, seed, 70, []int{
			game.MundiLocalFern, game.MundiLocalMossyRock,
		}, nil)
		zoneBushes(c, z, seed, 36, bushVariantLight)
	case biomeWeald:
		c.plantDirt = false
		zoneTrees(c, z, seed, 34, treeVariantAutumn, moistGate(geo, 0.44))
		zoneBigTrees(c, z, seed, 120, treeVariantAutumn, moistGate(geo, 0.52))
		zoneMundiProps(c, z, seed, 80, []int{game.MundiLocalFern}, nil)
		zoneBushes(c, z, seed, 38, bushVariantFall)
	case biomeMeadow:
		c.plantDirt = false
		zoneTrees(c, z, seed, 120, treeVariantLightDark, moistGate(geo, 0.58))
		zonePipoyaProps(c, z, seed, 45, []int{
			game.BaseChipLocalGrassTuft, game.BaseChipLocalGrassTuftB,
			game.BaseChipLocalFlowerWhite, game.BaseChipLocalFlowerBush,
			game.BaseChipLocalFlowerBlue, game.BaseChipLocalFlowerSun,
		}, nil)
		zoneBushes(c, z, seed, 48, bushVariantLight)
	case biomeJungle:
		c.plantDirt = false
		zoneBigTrees(c, z, seed, 22, treeVariantAny, moistGate(geo, 0.38))
		zoneMundiTrees(c, z, seed, 90, mundiPalm, warmSandGate(c, geo, 0.45))
		zoneMundiProps(c, z, seed, 36, []int{
			game.MundiLocalFern, game.MundiLocalVineBush,
		}, nil)
		zoneBushes(c, z, seed, 30, bushVariantDark)
	case biomeSavanna:
		c.plantDirt = true
		zoneTrees(c, z, seed, 130, treeVariantAutumn, nil)
		zoneMundiProps(c, z, seed, 75, []int{
			game.MundiLocalSage, game.MundiLocalSkull, game.MundiLocalBoulder,
		}, nil)
		zonePipoyaProps(c, z, seed, 60, []int{game.BaseChipLocalGrassDead, game.BaseChipLocalTwig}, nil)
	case biomeDunes:
		c.plantDirt = true
		zoneMundiTrees(c, z, seed, 180, mundiDeadGrey, nil)
		zoneMundiProps(c, z, seed, 60, []int{
			game.MundiLocalCactusTall, game.MundiLocalCactusRound,
			game.MundiLocalSage, game.MundiLocalSkull, game.MundiLocalStoneMarker,
		}, nil)
	}
}
