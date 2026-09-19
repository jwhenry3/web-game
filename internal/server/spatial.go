package server

import "math"

// Spatial index over h.entities for the hot radius queries (aggro pull,
// near-sync fanout, combat AoI, NPC separation). It replaces the per-query
// "scan every entity" loops that ran per move event and per 50ms tick.
//
// Cell size: the dominant query radii are aggroRadius (110), the NPC
// separation checks (36-64), and nearSyncDist/combatAoIDist (900). 128px
// cells keep the small combat queries to ~2x2 cells and the big AoI scans to
// ~9x9 cells — both tiny next to a full entities pass.
//
// Maintenance: the grid is rebuilt lazily, at most once per invalidation.
// h.spatialDirty is set:
//   - at the top of every Hub.Run loop pass (each event/tick pass may move,
//     spawn, or remove entities; the first query of the pass rebuilds once),
//   - after hub-driven position writes in owned handlers (handleMove, dodge),
//   - at the top of the post-tick broadcast passes (broadcastEntityState,
//     broadcastCombatTick, flushFarSync) so those queries always see the
//     settled, post-tick positions.
//
// Correctness under staleness: a query scans the cells overlapping the
// (r + spatialSlack) circle, re-resolves every candidate through h.entities,
// and re-checks the entity's LIVE position. Membership therefore matches a
// fresh full scan for any entity that moved less than spatialSlack between
// the rebuild and the query — the largest bounded in-pass move is one player
// move report (maxMoveStep + dodgeDashDist = 144px); per-tick plugin steps are
// ~15px or less. Re-resolution also makes world-mode worker projections safe:
// h.entities entries are replaced with fresh *entity copies each tick, and the
// query always sees the current object.
//
// Unbounded in-pass jumps (respawn-to-home, savepoint teleports, leash snaps)
// cannot evade detection for the queries that care: teleports only affect
// entities that post-tick passes re-index via an explicit invalidate, or that
// live-filters exclude anyway (a leash-snapped or respawning NPC is not
// engaged; a respawned player's near/far classification is recomputed by the
// invalidated post-tick broadcast).
//
// Worker simulation façades (h.npcEffects != nil) have no Run loop to mark
// the grid dirty; npcWorker.rebuildEntities invalidates it instead, so a
// worker tick or command rebuilds the grid at most once and every spatial
// query in that pass shares it.
const (
	spatialCellSize = 128.0
	spatialSlack    = 160.0
)

// spatialGrid buckets entities by their position at rebuild time.
type spatialGrid struct {
	cells map[int64][]*entity
}

func spatialCellKey(x, y float64) int64 {
	cx := int64(math.Floor(x / spatialCellSize))
	cy := int64(math.Floor(y / spatialCellSize))
	return cx<<32 | int64(uint32(cy))
}

func (g *spatialGrid) rebuild(entities map[string]*entity) {
	if g.cells == nil {
		g.cells = make(map[int64][]*entity, len(entities))
	} else {
		clear(g.cells)
	}
	for _, e := range entities {
		if e == nil {
			continue
		}
		k := spatialCellKey(e.X, e.Y)
		g.cells[k] = append(g.cells[k], e)
	}
}

// eachInRadius visits entities in cells overlapping the (x,y,r+spatialSlack)
// circle. Every candidate is re-resolved through entities (the map may have
// replaced or dropped the object since the rebuild) and must sit within r of
// (x,y) at its CURRENT position and pass filter before fn runs.
func (g *spatialGrid) eachInRadius(entities map[string]*entity, x, y, r float64, filter func(*entity) bool, fn func(*entity)) {
	reach := r + spatialSlack
	cx0 := int64(math.Floor((x - reach) / spatialCellSize))
	cx1 := int64(math.Floor((x + reach) / spatialCellSize))
	cy0 := int64(math.Floor((y - reach) / spatialCellSize))
	cy1 := int64(math.Floor((y + reach) / spatialCellSize))
	for cx := cx0; cx <= cx1; cx++ {
		for cy := cy0; cy <= cy1; cy++ {
			for _, stale := range g.cells[cx<<32|int64(uint32(cy))] {
				e := entities[stale.ID]
				if e == nil {
					continue
				}
				if dist(x, y, e.X, e.Y) > r {
					continue
				}
				if filter != nil && !filter(e) {
					continue
				}
				fn(e)
			}
		}
	}
}

// spatialInvalidate marks the index stale; the next spatial query rebuilds it.
func (h *Hub) spatialInvalidate() { h.spatialDirty = true }

func (h *Hub) spatialEnsure() {
	if h.spatial.cells != nil && !h.spatialDirty {
		return
	}
	h.spatialDirty = false
	h.spatial.rebuild(h.entities)
}

// spatialEach calls fn for every entity whose current position is within r of
// (x, y) and that passes filter (nil filter admits everything in range).
func (h *Hub) spatialEach(x, y, r float64, filter func(*entity) bool, fn func(*entity)) {
	h.spatialEnsure()
	h.spatial.eachInRadius(h.entities, x, y, r, filter, fn)
}

// spatialAny reports whether any entity within r of (x, y) passes filter.
func (h *Hub) spatialAny(x, y, r float64, filter func(*entity) bool) bool {
	return h.spatialFirst(x, y, r, filter) != nil
}

// spatialFirst returns the first entity within r of (x, y) passing filter.
// Iteration follows cell order — "first" is arbitrary, not nearest.
func (h *Hub) spatialFirst(x, y, r float64, filter func(*entity) bool) *entity {
	var found *entity
	h.spatialEach(x, y, r, func(e *entity) bool {
		return found == nil && (filter == nil || filter(e))
	}, func(e *entity) {
		found = e
	})
	return found
}

// spatialPlayerIDs collects the IDs of player entities within r of (x, y).
func (h *Hub) spatialPlayerIDs(x, y, r float64) map[string]bool {
	set := map[string]bool{}
	h.spatialEach(x, y, r, func(p *entity) bool {
		return p.Kind == kindPlayer
	}, func(p *entity) {
		set[p.ID] = true
	})
	return set
}
