package game

import (
	"fmt"
	"sort"
)

// BorderReport is the result of validating the map border graph across the
// whole cluster. Errors are broken relationships (unknown/self/mismatched
// borders); Warnings are suspicious but legal states (dead borders, open
// edges with no border declared).
type BorderReport struct {
	Errors   []string
	Warnings []string
}

// ValidateMapBorders checks border symmetry across every map config: if map A
// declares a border to B on edge E, B must declare A on the opposite edge.
// It also checks that bordered edges actually have walkable tiles (otherwise
// the border can never be crossed) and flags open walkable edges with no
// declared border.
//
// cfgs maps map id -> its parsed config. Interior `exits` links are validated
// for destination existence only (one-way portals are legal).
func ValidateMapBorders(cfgs map[string]*MapConfig) BorderReport {
	var rep BorderReport
	ids := make([]string, 0, len(cfgs))
	for id := range cfgs {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	for _, id := range ids {
		cfg := cfgs[id]
		seen := map[string]bool{}
		for edgeName, dest := range cfg.Borders {
			edge := BorderEdge(edgeName)
			if !edge.Valid() {
				rep.Errors = append(rep.Errors, fmt.Sprintf("%s: border edge %q is invalid", id, edgeName))
				continue
			}
			if seen[string(edge)] {
				rep.Errors = append(rep.Errors, fmt.Sprintf("%s: duplicate border edge %q", id, edgeName))
				continue
			}
			seen[string(edge)] = true
			if dest == id {
				rep.Errors = append(rep.Errors, fmt.Sprintf("%s: %s border targets itself", id, edgeName))
				continue
			}
			other, ok := cfgs[dest]
			if !ok {
				rep.Errors = append(rep.Errors, fmt.Sprintf("%s: %s border targets unknown map %q", id, edgeName, dest))
				continue
			}
			// Symmetry: the neighbor must border back across the opposite edge.
			if back, ok := other.Borders[string(edge.Opposite())]; !ok {
				rep.Errors = append(rep.Errors, fmt.Sprintf(
					"%s: %s border to %q is one-way — %s has no %s border back", id, edgeName, dest, dest, edge.Opposite()))
			} else if back != id {
				rep.Errors = append(rep.Errors, fmt.Sprintf(
					"%s: %s border to %q mismatched — %s's %s border points at %q", id, edgeName, dest, dest, edge.Opposite(), back))
			}
			// A bordered edge with no walkable band tiles can never be crossed.
			if !edgeHasWalkableBand(cfg, edge) {
				rep.Warnings = append(rep.Warnings, fmt.Sprintf(
					"%s: %s border to %q has no walkable edge tiles (dead border)", id, edgeName, dest))
			}
		}
		// Open walkable edge with no border declared — likely a missing link.
		for _, edge := range []BorderEdge{EdgeNorth, EdgeSouth, EdgeWest, EdgeEast} {
			if seen[string(edge)] {
				continue
			}
			if edgeHasWalkableBand(cfg, edge) {
				rep.Warnings = append(rep.Warnings, fmt.Sprintf(
					"%s: %s edge has walkable tiles but no border declared", id, edge))
			}
		}
		// Interior exits must at least point at real maps.
		for _, e := range cfg.Exits {
			dest := normalizeDestMap(e.DestMap)
			if dest == "" {
				rep.Errors = append(rep.Errors, fmt.Sprintf("%s: exit missing destMap", id))
				continue
			}
			if _, ok := cfgs[dest]; !ok {
				rep.Errors = append(rep.Errors, fmt.Sprintf("%s: exit targets unknown map %q", id, dest))
			}
		}
	}
	return rep
}

// ComputeWorldLayout assigns every map a grid cell via BFS over its borders:
// A's east neighbor sits at cell A+(1,0), south at A+(0,1), etc. The result is
// normalized so the minimum cell is (0,0). Conflicts — two maps claiming the
// same cell, or a placed map contradicting an implied position — are errors.
// Maps unreachable through borders (e.g. linked only by an interior exit)
// are errors too: they cannot be placed on the shared world scene.
func ComputeWorldLayout(cfgs map[string]*MapConfig) (map[string][2]int, []string) {
	// Deterministic root: lexically first map id.
	ids := make([]string, 0, len(cfgs))
	for id := range cfgs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) == 0 {
		return map[string][2]int{}, nil
	}

	pos := map[string][2]int{ids[0]: {0, 0}}
	var errs []string
	queue := []string{ids[0]}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		p := pos[id]
		edges := make([]string, 0, len(cfgs[id].Borders))
		for edgeName := range cfgs[id].Borders {
			edges = append(edges, edgeName)
		}
		sort.Strings(edges)
		for _, edgeName := range edges {
			dest := cfgs[id].Borders[edgeName]
			edge := BorderEdge(edgeName)
			if !edge.Valid() {
				continue // reported by ValidateMapBorders
			}
			if _, known := cfgs[dest]; !known {
				continue // unknown dest — reported by ValidateMapBorders
			}
			var want [2]int
			switch edge {
			case EdgeNorth:
				want = [2]int{p[0], p[1] - 1}
			case EdgeSouth:
				want = [2]int{p[0], p[1] + 1}
			case EdgeWest:
				want = [2]int{p[0] - 1, p[1]}
			case EdgeEast:
				want = [2]int{p[0] + 1, p[1]}
			}
			if got, placed := pos[dest]; placed {
				if got != want {
					errs = append(errs, fmt.Sprintf(
						"layout conflict: %s's %s border implies %s at cell %v, but it is already at %v",
						id, edgeName, dest, want, got))
				}
				continue
			}
			pos[dest] = want
			queue = append(queue, dest)
		}
	}
	if len(errs) > 0 {
		return nil, errs
	}
	// Maps with no border path back to the root component (ferry/teleport-only
	// islands) simply have no world position — callers may warn, but they
	// aren't graph errors.

	// Normalize so the top-left cell is (0,0).
	minX, minY := pos[ids[0]][0], pos[ids[0]][1]
	for _, p := range pos {
		if p[0] < minX {
			minX = p[0]
		}
		if p[1] < minY {
			minY = p[1]
		}
	}
	out := make(map[string][2]int, len(pos))
	for id, p := range pos {
		out[id] = [2]int{p[0] - minX, p[1] - minY}
	}
	return out, nil
}

// edgeHasWalkableBand reports whether any tile inside the edge's trigger band
// is walkable, using the config's own collision/ground grids.
func edgeHasWalkableBand(cfg *MapConfig, edge BorderEdge) bool {
	ow := &Overworld{
		Cols:     cfg.Cols,
		Rows:     cfg.Rows,
		TileSize: cfg.TileSize,
	}
	ow.Cells = buildCellsFromLayers(cfg.Terrain.Collision, cfg.Terrain.Ground, cfg.Cols, cfg.Rows)
	span := cfg.Cols
	if edge == EdgeWest || edge == EdgeEast {
		span = cfg.Rows
	}
	for a := 0; a < span; a++ {
		for d := 0; d < BorderBandTiles; d++ {
			var c, r int
			switch edge {
			case EdgeNorth:
				c, r = a, d
			case EdgeSouth:
				c, r = a, cfg.Rows-1-d
			case EdgeWest:
				c, r = d, a
			case EdgeEast:
				c, r = cfg.Cols-1-d, a
			}
			if ow.WalkableTile(c, r) {
				return true
			}
		}
	}
	return false
}
