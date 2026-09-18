package server

import (
	"testing"
)

// putGridEntity installs a bare NPC entity at (x, y) for grid tests.
func putGridEntity(h *Hub, id string, x, y float64) *entity {
	e := &entity{ID: id, Kind: kindNPC, X: x, Y: y, alive: true}
	h.entities[id] = e
	return e
}

func collectIDs(h *Hub, x, y, r float64, filter func(*entity) bool) map[string]bool {
	got := map[string]bool{}
	h.spatialEach(x, y, r, filter, func(e *entity) { got[e.ID] = true })
	return got
}

func TestSpatialEachFindsEntitiesInRadius(t *testing.T) {
	h := mustTestHub()
	putGridEntity(h, "origin", 1000, 1000)
	putGridEntity(h, "inside", 1100, 1100)   // ~141px
	putGridEntity(h, "edge", 1150, 1000)     // exactly at r
	putGridEntity(h, "beyond", 1151, 1000)   // 1px out
	putGridEntity(h, "far", 9000, 9000)      // other side of the map
	putGridEntity(h, "negative", -500, -500) // negative coords
	putGridEntity(h, "diag-in", 1070, 1070)  // ~99px diagonal
	putGridEntity(h, "diag-out", 1110, 1110) // ~156px diagonal

	got := collectIDs(h, 1000, 1000, 150, nil)
	want := map[string]bool{
		"origin": true, "inside": true, "edge": true, "diag-in": true,
	}
	if len(got) != len(want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
	for id := range want {
		if !got[id] {
			t.Fatalf("entity %s should be inside the radius, got %v", id, got)
		}
	}
}

func TestSpatialEachFilter(t *testing.T) {
	h := mustTestHub()
	putGridEntity(h, "npc", 1010, 1000)
	p := &entity{ID: "player", Kind: kindPlayer, X: 1020, Y: 1000, alive: true}
	h.entities[p.ID] = p
	hid := putGridEntity(h, "hidden", 1030, 1000)
	hid.hidden = true

	npcs := collectIDs(h, 1000, 1000, 100, func(e *entity) bool {
		return e.Kind == kindNPC && !e.hidden
	})
	if len(npcs) != 1 || !npcs["npc"] {
		t.Fatalf("expected only the visible npc, got %v", npcs)
	}
	if !h.spatialAny(1000, 1000, 100, func(e *entity) bool { return e.Kind == kindPlayer }) {
		t.Fatal("spatialAny should find the player entity")
	}
	if h.spatialAny(1000, 1000, 100, func(e *entity) bool { return e.Kind == kindPet }) {
		t.Fatal("spatialAny should not find a pet that does not exist")
	}
	if h.spatialAny(5000, 5000, 100, nil) {
		t.Fatal("spatialAny should find nothing in an empty region")
	}
}

// Entities that move less than spatialSlack between the last rebuild and the
// query are still classified by their live position — stale cells only decide
// which candidates get re-checked.
func TestSpatialEachUsesLivePositions(t *testing.T) {
	h := mustTestHub()
	mover := putGridEntity(h, "mover", 1200, 1000) // outside r=150
	leaver := putGridEntity(h, "leaver", 1000, 1000)

	// First query builds the grid.
	if got := collectIDs(h, 1000, 1000, 150, nil); !got["leaver"] || got["mover"] {
		t.Fatalf("initial query wrong: %v", got)
	}

	// Drift within slack: mover steps into range, leaver steps out.
	mover.X = 1050 // moved 150px, inside r now
	leaver.X = 2000
	got := collectIDs(h, 1000, 1000, 150, nil)
	if !got["mover"] {
		t.Fatal("entity that moved into range within slack should be found via live position")
	}
	if got["leaver"] {
		t.Fatal("entity that moved out of range should be excluded via live position")
	}

	// Entities removed from the map since the rebuild are skipped.
	delete(h.entities, "mover")
	if got := collectIDs(h, 1000, 1000, 500, nil); got["mover"] {
		t.Fatal("deleted entity must not be visited")
	}
}

func TestSpatialInvalidateRebuilds(t *testing.T) {
	h := mustTestHub()
	e := putGridEntity(h, "a", 1000, 1000)
	if got := collectIDs(h, 1000, 1000, 100, nil); !got["a"] {
		t.Fatal("setup: entity should be found")
	}
	e.X, e.Y = 5000, 5000 // teleport beyond slack
	h.spatialInvalidate()
	if got := collectIDs(h, 1000, 1000, 100, nil); got["a"] {
		t.Fatal("after invalidate, teleported entity should be re-indexed")
	}
	if got := collectIDs(h, 5000, 5000, 100, nil); !got["a"] {
		t.Fatal("after invalidate, entity should be found at its new cell")
	}
	// New entities appear after a rebuild.
	putGridEntity(h, "b", 5050, 5000)
	h.spatialInvalidate()
	if got := collectIDs(h, 5000, 5000, 100, nil); !got["b"] {
		t.Fatal("after invalidate, newly added entity should be found")
	}
}

// Worker simulation façades (npcEffects != nil) have no Run loop to mark the
// grid dirty, so every query rebuilds — even jumps beyond slack stay correct.
func TestSpatialFacadeAlwaysRebuilds(t *testing.T) {
	h := &Hub{entities: map[string]*entity{}, npcEffects: &npcSimEffects{}}
	e := &entity{ID: "n", Kind: kindNPC, X: 100, Y: 100, alive: true}
	h.entities["n"] = e
	if got := collectIDs(h, 100, 100, 50, nil); !got["n"] {
		t.Fatal("setup: entity should be found")
	}
	e.X = 9000 // jump far beyond slack, no invalidation on a façade
	if got := collectIDs(h, 100, 100, 50, nil); got["n"] {
		t.Fatal("façade query should rebuild and see the live position")
	}
	if got := collectIDs(h, 9000, 100, 50, nil); !got["n"] {
		t.Fatal("façade query should rebuild and find the entity at its new cell")
	}
}

// checkAggroAt drives its NPC pull through the grid: inside aggroRadius a foe
// engages, beyond it the foe stays idle.
func TestCheckAggroAtEngagesWithinRadius(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+aggroRadius-10, py)
	h.checkAggroAt(c.ID, px, py)
	if !npcEngaged(n) {
		t.Fatal("npc inside aggroRadius should engage")
	}
	if n.targetID != c.ID {
		t.Fatalf("engaged npc should target the player, got %q", n.targetID)
	}
}

func TestCheckAggroAtEngagesAtBoundary(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+aggroRadius, py) // exactly at the radius
	h.checkAggroAt(c.ID, px, py)
	if !npcEngaged(n) {
		t.Fatal("npc exactly at aggroRadius should engage")
	}
}

func TestCheckAggroAtIgnoresBeyondRadius(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+aggroRadius+60, py)
	h.checkAggroAt(c.ID, px, py)
	if npcEngaged(n) {
		t.Fatal("npc beyond aggroRadius must not engage")
	}
}
