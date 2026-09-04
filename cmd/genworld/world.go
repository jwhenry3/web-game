package main

import "fmt"

type regionKind string

const (
	regionVerdant regionKind = "verdant"
	regionFrost   regionKind = "frost"
	regionTide    regionKind = "tide"
)

type edge string

const (
	edgeN edge = "n"
	edgeS edge = "s"
	edgeW edge = "w"
	edgeE edge = "e"
)

// link is a contiguous zone-line connection (FFXI-style edge walk).
type link struct {
	from, to      string
	fromSide      edge
	toSide        edge
	midBias       int
	span          int
	interRegion   bool
}

// ferry is a non-contiguous boat portal inside hub maps (Frost ↔ Tide).
type ferry struct {
	from, to string
	fromDock [2]int
	toDock   [2]int
}

type settlement struct {
	id, name       string
	c0, r0, c1, r1 int
	hub            bool
	minor          bool
	jobMaster      bool
}

type wildRegion struct {
	id, kind string
	c0, r0, c1, r1 int
	enemies        []enemySpec
}

type enemySpec struct {
	kind  string
	name  string
	level int
	count int
}

type mapDef struct {
	id, name       string
	region         regionKind
	cols, rows     int
	settlements    []settlement
	wild           []wildRegion
	combat         string
	seed           uint64
}

type exitRec struct {
	DestMap string
	Tiles   [4]int
	Dest    [2]float64
	Ferry   bool
}

func allMapDefs() []mapDef {
	return []mapDef{
		// ── Verdant March (6) ──────────────────────────────────────
		{
			id: "greenwood", name: "Greenwood", region: regionVerdant, cols: 128, rows: 96,
			combat: "combat.realtime", seed: 0x56100d,
			settlements: []settlement{{
				id: "greenwood_city", name: "Greenwood",
				c0: 44, r0: 32, c1: 84, r1: 64, hub: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "city_fringe", kind: "wilderness",
				c0: 8, r0: 8, c1: 119, r1: 87,
				enemies: []enemySpec{{"goblin", "Goblin Scout", 1, 3}},
			}},
		},
		{
			id: "timberroad", name: "Timber Road", region: regionVerdant, cols: 128, rows: 96,
			combat: "combat.realtime", seed: 0x71b8e2,
			settlements: []settlement{{
				id: "roadside_camp", name: "Roadside Camp",
				c0: 54, r0: 42, c1: 72, r1: 54, minor: true,
			}},
			wild: []wildRegion{{
				id: "timber_wilds", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 89,
				enemies: []enemySpec{
					{"goblin", "Wood Goblin", 2, 4},
					{"dire_wolf", "March Wolf", 3, 2},
				},
			}},
		},
		{
			id: "deepcanopy", name: "Deep Canopy", region: regionVerdant, cols: 128, rows: 96,
			combat: "combat.realtime", seed: 0xdee9ca,
			settlements: []settlement{{
				id: "canopy_ward", name: "Canopy Ward",
				c0: 56, r0: 40, c1: 72, r1: 52, minor: true,
			}},
			wild: []wildRegion{{
				id: "deep_woods", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 89,
				enemies: []enemySpec{
					{"dire_wolf", "Canopy Wolf", 3, 4},
					{"stone_imp", "Root Imp", 3, 3},
				},
			}},
		},
		{
			id: "willowford", name: "Willowford", region: regionVerdant, cols: 112, rows: 88,
			combat: "combat.realtime", seed: 0x91770f,
			settlements: []settlement{{
				id: "willowford_town", name: "Willowford",
				c0: 36, r0: 28, c1: 76, r1: 58, minor: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "willow_banks", kind: "wilderness",
				c0: 6, r0: 6, c1: 105, r1: 81,
				enemies: []enemySpec{{"goblin", "River Goblin", 1, 3}},
			}},
		},
		{
			id: "sanctuarygrove", name: "Sanctuary Grove", region: regionVerdant, cols: 112, rows: 88,
			combat: "combat.realtime", seed: 0x5a7c70,
			settlements: []settlement{{
				id: "covenant_temple", name: "Covenant Temple",
				c0: 38, r0: 30, c1: 74, r1: 56, minor: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "grove_paths", kind: "wilderness",
				c0: 6, r0: 6, c1: 105, r1: 81,
				enemies: []enemySpec{{"stone_imp", "Grove Imp", 2, 3}},
			}},
		},
		{
			id: "northwatch", name: "Northwatch March", region: regionVerdant, cols: 128, rows: 80,
			combat: "combat.realtime", seed: 0x70b7c4,
			settlements: []settlement{{
				id: "northwatch_fort", name: "Northwatch Fort",
				c0: 52, r0: 30, c1: 76, r1: 48, minor: true,
			}},
			wild: []wildRegion{{
				id: "march_scrub", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 73,
				enemies: []enemySpec{
					{"dire_wolf", "Border Wolf", 3, 3},
					{"goblin", "Raider Goblin", 4, 3},
				},
			}},
		},

		// ── Frost Bastion (6) ──────────────────────────────────────
		{
			id: "frostkeep", name: "Frostkeep", region: regionFrost, cols: 128, rows: 96,
			combat: "combat.ordo", seed: 0xf2057,
			settlements: []settlement{{
				id: "frostkeep_city", name: "Frostkeep",
				c0: 44, r0: 32, c1: 84, r1: 64, hub: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "keep_yards", kind: "wilderness",
				c0: 8, r0: 8, c1: 119, r1: 87,
				enemies: []enemySpec{{"stone_imp", "Ice Imp", 1, 3}},
			}},
		},
		{
			id: "windswept", name: "Windswept Flats", region: regionFrost, cols: 128, rows: 96,
			combat: "combat.ordo", seed: 0x1711d5,
			settlements: []settlement{{
				id: "windcairn", name: "Windcairn Shelter",
				c0: 56, r0: 42, c1: 72, r1: 54, minor: true,
			}},
			wild: []wildRegion{{
				id: "ice_flats", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 89,
				enemies: []enemySpec{
					{"dire_wolf", "Frost Wolf", 4, 4},
					{"stone_imp", "Gale Imp", 3, 3},
				},
			}},
		},
		{
			id: "icehollow", name: "Icehollow Crags", region: regionFrost, cols: 112, rows: 88,
			combat: "combat.ordo", seed: 0x1ce401,
			settlements: []settlement{{
				id: "hollow_refuge", name: "Hollow Refuge",
				c0: 46, r0: 36, c1: 66, r1: 50, minor: true,
			}},
			wild: []wildRegion{{
				id: "crag_depths", kind: "wilderness",
				c0: 6, r0: 6, c1: 105, r1: 81,
				enemies: []enemySpec{
					{"stone_imp", "Crag Imp", 5, 4},
					{"dire_wolf", "Hollow Wolf", 6, 2},
				},
			}},
		},
		{
			id: "stillstone", name: "Stillstone Monastery", region: regionFrost, cols: 112, rows: 88,
			combat: "combat.ordo", seed: 0x57111,
			settlements: []settlement{{
				id: "stillstone_abbey", name: "Stillstone Abbey",
				c0: 36, r0: 28, c1: 76, r1: 58, minor: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "abbey_slopes", kind: "wilderness",
				c0: 6, r0: 6, c1: 105, r1: 81,
				enemies: []enemySpec{{"stone_imp", "Monastery Imp", 2, 3}},
			}},
		},
		{
			id: "cairnwatch", name: "Cairnwatch", region: regionFrost, cols: 112, rows: 88,
			combat: "combat.ordo", seed: 0xca12a,
			settlements: []settlement{{
				id: "cairnwatch_outpost", name: "Cairnwatch Outpost",
				c0: 36, r0: 28, c1: 76, r1: 58, minor: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "cairn_ridge", kind: "wilderness",
				c0: 6, r0: 6, c1: 105, r1: 81,
				enemies: []enemySpec{{"dire_wolf", "Ridge Wolf", 3, 3}},
			}},
		},
		{
			id: "frostmarch", name: "Frostmarch Gate", region: regionFrost, cols: 128, rows: 80,
			combat: "combat.ordo", seed: 0xf204c4,
			settlements: []settlement{{
				id: "frostmarch_gate", name: "Frostmarch Gate",
				c0: 52, r0: 30, c1: 76, r1: 48, minor: true,
			}},
			wild: []wildRegion{{
				id: "gate_approaches", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 73,
				enemies: []enemySpec{
					{"goblin", "Frost Raider", 4, 3},
					{"dire_wolf", "Gate Wolf", 5, 2},
				},
			}},
		},

		// ── Tide Courts (6) ────────────────────────────────────────
		{
			id: "tidecourt", name: "Tide Court", region: regionTide, cols: 128, rows: 96,
			combat: "combat.realtime", seed: 0x71de,
			settlements: []settlement{{
				id: "tidecourt_city", name: "Tide Court",
				c0: 44, r0: 32, c1: 84, r1: 64, hub: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "harbor_edge", kind: "wilderness",
				c0: 8, r0: 8, c1: 119, r1: 87,
				enemies: []enemySpec{{"goblin", "Dock Rat", 1, 3}},
			}},
		},
		{
			id: "brinecoast", name: "Brine Coast", region: regionTide, cols: 128, rows: 96,
			combat: "combat.realtime", seed: 0xb21e,
			settlements: []settlement{{
				id: "brine_lantern", name: "Brine Lantern",
				c0: 54, r0: 40, c1: 72, r1: 54, minor: true,
			}},
			wild: []wildRegion{{
				id: "salt_flats", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 89,
				enemies: []enemySpec{
					{"goblin", "Shore Goblin", 2, 4},
					{"dire_wolf", "Dune Hound", 3, 2},
				},
			}},
		},
		{
			id: "dunesreach", name: "Dunesreach", region: regionTide, cols: 128, rows: 96,
			combat: "combat.realtime", seed: 0xd01e5,
			settlements: []settlement{{
				id: "reach_camp", name: "Reach Camp",
				c0: 56, r0: 40, c1: 72, r1: 52, minor: true,
			}},
			wild: []wildRegion{{
				id: "outer_dunes", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 89,
				enemies: []enemySpec{
					{"dire_wolf", "Sand Wolf", 4, 3},
					{"stone_imp", "Mirage Imp", 4, 3},
				},
			}},
		},
		{
			id: "redsash", name: "Red Sash Quay", region: regionTide, cols: 112, rows: 88,
			combat: "combat.realtime", seed: 0x2ed5a5,
			settlements: []settlement{{
				id: "academy_quay", name: "Academy Quay",
				c0: 36, r0: 28, c1: 76, r1: 58, minor: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "quay_yards", kind: "wilderness",
				c0: 6, r0: 6, c1: 105, r1: 81,
				enemies: []enemySpec{{"goblin", "Quay Cutpurse", 2, 3}},
			}},
		},
		{
			id: "cliffhaven", name: "Cliffhaven", region: regionTide, cols: 112, rows: 88,
			combat: "combat.realtime", seed: 0xc11ff,
			settlements: []settlement{{
				id: "cliffhaven_town", name: "Cliffhaven",
				c0: 36, r0: 28, c1: 76, r1: 58, minor: true, jobMaster: true,
			}},
			wild: []wildRegion{{
				id: "cliff_paths", kind: "wilderness",
				c0: 6, r0: 6, c1: 105, r1: 81,
				enemies: []enemySpec{{"stone_imp", "Cliff Imp", 2, 3}},
			}},
		},
		{
			id: "westwharf", name: "West Wharf Road", region: regionTide, cols: 128, rows: 80,
			combat: "combat.realtime", seed: 0x4e57,
			settlements: []settlement{{
				id: "wharf_toll", name: "Wharf Tollhouse",
				c0: 52, r0: 30, c1: 76, r1: 48, minor: true,
			}},
			wild: []wildRegion{{
				id: "wharf_road", kind: "wilderness",
				c0: 6, r0: 6, c1: 121, r1: 73,
				enemies: []enemySpec{
					{"goblin", "Road Bandit", 3, 3},
					{"dire_wolf", "Wharf Hound", 4, 2},
				},
			}},
		},
	}
}

func contiguousLinks() []link {
	return []link{
		// Verdant March — contiguous field web around Greenwood
		{from: "greenwood", to: "timberroad", fromSide: edgeN, toSide: edgeS, span: 5},
		{from: "greenwood", to: "willowford", fromSide: edgeW, toSide: edgeE, span: 5},
		{from: "greenwood", to: "deepcanopy", fromSide: edgeE, toSide: edgeW, span: 5},
		{from: "timberroad", to: "sanctuarygrove", fromSide: edgeW, toSide: edgeE, midBias: -4, span: 5},
		{from: "timberroad", to: "northwatch", fromSide: edgeN, toSide: edgeS, span: 5},
		{from: "willowford", to: "sanctuarygrove", fromSide: edgeN, toSide: edgeS, span: 4},

		// Contiguous inter-region border: Verdant ↔ Frost
		{from: "northwatch", to: "frostmarch", fromSide: edgeN, toSide: edgeS, span: 6, interRegion: true},

		// Frost Bastion — hub north to flats; towns flank the flats (not the keep)
		{from: "frostkeep", to: "frostmarch", fromSide: edgeS, toSide: edgeN, span: 5},
		{from: "frostkeep", to: "windswept", fromSide: edgeN, toSide: edgeS, span: 5},
		{from: "windswept", to: "cairnwatch", fromSide: edgeW, toSide: edgeE, span: 5},
		{from: "windswept", to: "stillstone", fromSide: edgeE, toSide: edgeW, span: 5},
		{from: "windswept", to: "icehollow", fromSide: edgeN, toSide: edgeS, span: 5},

		// Contiguous inter-region border: Verdant ↔ Tide
		{from: "deepcanopy", to: "westwharf", fromSide: edgeE, toSide: edgeW, span: 6, interRegion: true},

		// Tide Courts
		{from: "westwharf", to: "brinecoast", fromSide: edgeE, toSide: edgeW, span: 5},
		{from: "brinecoast", to: "tidecourt", fromSide: edgeE, toSide: edgeW, span: 5},
		{from: "brinecoast", to: "cliffhaven", fromSide: edgeN, toSide: edgeS, midBias: -6, span: 4},
		{from: "tidecourt", to: "dunesreach", fromSide: edgeE, toSide: edgeW, span: 5},
		{from: "tidecourt", to: "redsash", fromSide: edgeS, toSide: edgeN, span: 5},
	}
}

func ferryLinks() []ferry {
	return []ferry{{
		from: "frostkeep", to: "tidecourt",
		// Keep docks clear of south zone-line inland spawns (row ≈ rows-15).
		fromDock: [2]int{64, 70},
		toDock:   [2]int{64, 70},
	}}
}

func mapByID(defs []mapDef) map[string]mapDef {
	out := make(map[string]mapDef, len(defs))
	for _, d := range defs {
		out[d.id] = d
	}
	return out
}

func gateMid(cols, rows int, side edge, bias int) int {
	switch side {
	case edgeN, edgeS:
		m := cols/2 + bias
		if m < 12 {
			m = 12
		}
		if m > cols-13 {
			m = cols - 13
		}
		return m
	default:
		m := rows/2 + bias
		if m < 12 {
			m = 12
		}
		if m > rows-13 {
			m = rows - 13
		}
		return m
	}
}

func exitTiles(cols, rows int, side edge, mid, span int) [4]int {
	depth := 3
	switch side {
	case edgeN:
		return [4]int{mid - span, 0, mid + span, depth}
	case edgeS:
		return [4]int{mid - span, rows - 1 - depth, mid + span, rows - 1}
	case edgeW:
		return [4]int{0, mid - span, depth, mid + span}
	case edgeE:
		return [4]int{cols - 1 - depth, mid - span, cols - 1, mid + span}
	default:
		return [4]int{}
	}
}

func inlandSpawn(cols, rows int, side edge, mid int) (float64, float64) {
	inland := 14
	switch side {
	case edgeN:
		return px(mid, inland)
	case edgeS:
		return px(mid, rows-1-inland)
	case edgeW:
		return px(inland, mid)
	case edgeE:
		return px(cols-1-inland, mid)
	default:
		return px(cols/2, rows/2)
	}
}

func assembleExits(defs []mapDef) (map[string][]exitRec, error) {
	byID := mapByID(defs)
	out := make(map[string][]exitRec, len(defs))
	add := func(fromID string, e exitRec) {
		out[fromID] = append(out[fromID], e)
	}

	for _, l := range contiguousLinks() {
		if l.from == l.to {
			return nil, fmt.Errorf("link %s↔%s: self-transition not allowed", l.from, l.to)
		}
		a, okA := byID[l.from]
		b, okB := byID[l.to]
		if !okA || !okB {
			return nil, fmt.Errorf("link %s↔%s: unknown map", l.from, l.to)
		}
		midA := gateMid(a.cols, a.rows, l.fromSide, l.midBias)
		midB := gateMid(b.cols, b.rows, l.toSide, -l.midBias)
		dxB, dyB := inlandSpawn(b.cols, b.rows, l.toSide, midB)
		dxA, dyA := inlandSpawn(a.cols, a.rows, l.fromSide, midA)
		add(l.from, exitRec{
			DestMap: l.to,
			Tiles:   exitTiles(a.cols, a.rows, l.fromSide, midA, l.span),
			Dest:    [2]float64{dxB, dyB},
		})
		add(l.to, exitRec{
			DestMap: l.from,
			Tiles:   exitTiles(b.cols, b.rows, l.toSide, midB, l.span),
			Dest:    [2]float64{dxA, dyA},
		})
	}

	for _, f := range ferryLinks() {
		if f.from == f.to {
			return nil, fmt.Errorf("ferry %s↔%s: self-transition not allowed", f.from, f.to)
		}
		if _, ok := byID[f.from]; !ok {
			return nil, fmt.Errorf("ferry from unknown map %s", f.from)
		}
		if _, ok := byID[f.to]; !ok {
			return nil, fmt.Errorf("ferry to unknown map %s", f.to)
		}
		half := 2
		fc, fr := f.fromDock[0], f.fromDock[1]
		tc, tr := f.toDock[0], f.toDock[1]
		dxB, dyB := px(tc, tr-6)
		dxA, dyA := px(fc, fr-6)
		add(f.from, exitRec{
			DestMap: f.to,
			Tiles:   [4]int{fc - half, fr - half, fc + half, fr + half},
			Dest:    [2]float64{dxB, dyB},
			Ferry:   true,
		})
		add(f.to, exitRec{
			DestMap: f.from,
			Tiles:   [4]int{tc - half, tr - half, tc + half, tr + half},
			Dest:    [2]float64{dxA, dyA},
			Ferry:   true,
		})
	}
	return out, nil
}
