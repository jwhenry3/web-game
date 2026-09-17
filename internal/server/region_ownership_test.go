package server

import (
	"encoding/json"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

func TestWorldMovementChangesRegionWithoutTransfer(t *testing.T) {
	ow := game.Loaded()
	ts := float64(ow.TileSizePx())
	var col, row int
	found := false
	for r := 1; r < 100 && !found; r++ {
		for c := 1; c < 100; c++ {
			x1, x2, y := (float64(c)+0.5)*ts, (float64(c+1)+0.5)*ts, (float64(r)+0.5)*ts
			if ow.BoundsWalkableAt(x1, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH) &&
				ow.BoundsWalkableAt(x2, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH) {
				col, row, found = c, r, true
				break
			}
		}
	}
	if !found {
		t.Fatal("test map has no adjacent walkable tiles")
	}
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "west", MinC: col, MaxC: col, MinR: row, MaxR: row},
		{ID: "east", MinC: col + 1, MaxC: col + 1, MinR: row, MaxR: row},
	})
	if err != nil {
		t.Fatal(err)
	}
	h := mustTestHub()
	h.SetWorld("world", "World", world)
	transfers := 0
	h.OnTransfer = func(string, TransferDest) { transfers++ }
	x, y := (float64(col)+0.5)*ts, (float64(row)+0.5)*ts
	c, e := addWorldClient(h, "client", "Bartz", x, y)
	h.refreshRegionOwnership(c, e)
	drainClient(c)

	raw, _ := json.Marshal(protocol.MovePayload{X: x + ts, Y: y})
	h.handleMove(c, raw)
	if e.regionID != "east" {
		t.Fatalf("authoritative region = %q, want east", e.regionID)
	}
	if transfers != 0 {
		t.Fatalf("world movement invoked %d transfer callbacks", transfers)
	}
	for _, env := range drainClient(c) {
		if env.Type == protocol.TypeRegionChanged {
			var changed protocol.RegionChangedPayload
			if err := json.Unmarshal(env.Payload, &changed); err != nil {
				t.Fatal(err)
			}
			if changed.RegionID != "east" {
				t.Fatalf("region notification = %q, want east", changed.RegionID)
			}
			return
		}
	}
	t.Fatal("missing region_changed notification")
}

func TestWorldJoinInitializesRegionOwnership(t *testing.T) {
	ow := game.Loaded()
	x, y := ow.SpawnPosition("")
	ts := float64(ow.TileSizePx())
	col, row := int(x/ts), int(y/ts)
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "spawn", MinC: col, MaxC: col, MinR: row, MaxR: row},
	})
	if err != nil {
		t.Fatal(err)
	}
	h := mustTestHub()
	h.SetWorld("world", "World", world)
	c := &Client{ID: "joining", Send: make(chan []byte, 64), Hub: h}
	h.clients[c.ID] = c
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: "Terra"})
	h.handleJoinWorld(c, raw)
	if e := h.playerEnt(c.ID); e == nil || e.regionID != "spawn" {
		t.Fatalf("joined entity ownership = %#v", e)
	}
	for _, env := range drainClient(c) {
		if env.Type == protocol.TypeRegionChanged {
			return
		}
	}
	t.Fatal("join did not emit region_changed")
}

func TestSetMapRetainsLegacyTransferMode(t *testing.T) {
	h := mustTestHub()
	world, err := game.NewWorldDefinition(game.Loaded(), nil)
	if err != nil {
		t.Fatal(err)
	}
	h.SetWorld("world", "World", world)
	h.SetMap("legacy", "Legacy", game.Loaded())
	if h.world != nil {
		t.Fatal("SetMap must restore legacy transfer mode")
	}
}

// ---- region ownership helpers ----

// testTickCounter counts how many times an entity is ticked.
type testTickCounter struct{ count int }

func (tc *testTickCounter) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	tc.count++
}

// testRegionMover moves an entity to a fixed coordinate during its Tick.
type testRegionMover struct {
	targetX, targetY float64
	moved            bool
}

func (m *testRegionMover) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	e.X, e.Y = m.targetX, m.targetY
	m.moved = true
}

func TestWorldNPCSeededOwnership(t *testing.T) {
	ow := game.Loaded()
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "all", MinC: 0, MaxC: ow.Cols - 1, MinR: 0, MaxR: ow.Rows - 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	h := mustTestHub()
	h.SetWorld("world", "World", world)
	h.seedNPCs(5)

	count := 0
	h.eachEntity(kindNPC, func(e *entity) {
		count++
		if e.regionID == "" {
			t.Errorf("seeded npc %s has no region ownership", e.ID)
		}
		if got, want := e.regionID, h.regionIDAt(e.X, e.Y); got != want {
			t.Errorf("seeded npc %s region = %q, want %q", e.ID, got, want)
		}
	})
	if count == 0 {
		t.Fatal("no npcs seeded")
	}
}

func TestWorldPetSyncOwnership(t *testing.T) {
	ow := game.Loaded()
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "all", MinC: 0, MaxC: ow.Cols - 1, MinR: 0, MaxR: ow.Rows - 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	h.SetWorld("world", "World", world)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)

	h.tickEntities(time.Now())

	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity after sync")
	}
	if pet.regionID == "" {
		t.Fatal("synced pet has no region ownership")
	}
	if got, want := pet.regionID, h.regionIDAt(pet.X, pet.Y); got != want {
		t.Fatalf("synced pet region = %q, want %q", got, want)
	}
	if pe.regionID == "" {
		t.Fatal("player has no region ownership after tick")
	}
}

func TestWorldNPCMovementUpdatesOwnership(t *testing.T) {
	ow := game.Loaded()
	ts := float64(ow.TileSizePx())
	var col, row int
	found := false
	for r := 1; r < ow.Rows-1 && !found; r++ {
		for c := 1; c < ow.Cols-2; c++ {
			x1, x2, y := (float64(c)+0.5)*ts, (float64(c+1)+0.5)*ts, (float64(r)+0.5)*ts
			if ow.BoundsWalkableAt(x1, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH) &&
				ow.BoundsWalkableAt(x2, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH) {
				col, row, found = c, r, true
				break
			}
		}
	}
	if !found {
		t.Fatal("test map has no adjacent walkable tiles")
	}
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "west", MinC: col, MaxC: col, MinR: row, MaxR: row},
		{ID: "east", MinC: col + 1, MaxC: col + 1, MinR: row, MaxR: row},
	})
	if err != nil {
		t.Fatal(err)
	}
	h := mustTestHub()
	h.SetWorld("world", "World", world)

	x, y := (float64(col)+0.5)*ts, (float64(row)+0.5)*ts
	home := game.WorldToTile(x, y)
	if h.overworld != nil {
		home = h.overworld.WorldToTile(x, y)
	}
	p := game.Patrol{ID: "mover", Name: "Mover", Kind: "goblin", Level: 1, Home: home}
	n := newNPCEntity(p, game.Region{}, h.overworld)
	n.X, n.Y = x, y
	h.entities[n.ID] = n
	h.refreshRegionOwnership(nil, n)
	if n.regionID != "west" {
		t.Fatalf("initial region = %q, want west", n.regionID)
	}

	mover := &testRegionMover{targetX: x + ts, targetY: y}
	n.pipeline = append(n.pipeline, mover)
	h.tickEntities(time.Now())

	if !mover.moved {
		t.Fatal("mover plugin did not run during tick")
	}
	if n.regionID != "east" {
		t.Fatalf("region after movement = %q, want east", n.regionID)
	}
}

func TestWorldEachEntityTicksOnce(t *testing.T) {
	ow := game.Loaded()
	ts := float64(ow.TileSizePx())
	var col, row int
	found := false
	for r := 1; r < ow.Rows-1 && !found; r++ {
		for c := 1; c < ow.Cols-1; c++ {
			x, y := (float64(c)+0.5)*ts, (float64(r)+0.5)*ts
			if ow.BoundsWalkableAt(x, y, game.PlayerCollisionHalfW, game.PlayerCollisionHalfH) {
				col, row, found = c, r, true
				break
			}
		}
	}
	if !found {
		t.Fatal("test map has no walkable tile")
	}
	world, err := game.NewWorldDefinition(ow, []game.Region{
		{ID: "inside", MinC: col, MaxC: col, MinR: row, MaxR: row},
	})
	if err != nil {
		t.Fatal(err)
	}
	h, c, _ := testHubWithPlayer(t, (float64(col)+0.5)*ts, (float64(row)+0.5)*ts)
	h.SetWorld("world", "World", world)
	n := hostileNPC(h, "npc-tick", (float64(col)+0.5)*ts, (float64(row)+0.5)*ts)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)
	h.tickEntities(time.Now())
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity")
	}

	// An entity outside every declared region still lands in the unowned fallback bucket.
	outside := &entity{
		ID: "outside", Kind: kindNPC, Faction: factionNeutral, alive: true,
		X: (float64(col) - 10) * ts, Y: (float64(row) - 10) * ts,
	}
	oc := &testTickCounter{}
	outside.pipeline = []entitySystem{oc}
	h.entities[outside.ID] = outside

	pc := &testTickCounter{}
	nc := &testTickCounter{}
	petc := &testTickCounter{}
	pe := h.playerEnt(c.ID)
	pe.pipeline = append(pe.pipeline, pc)
	n.pipeline = append(n.pipeline, nc)
	pet.pipeline = append(pet.pipeline, petc)

	h.tickEntities(time.Now())

	if pc.count != 1 {
		t.Errorf("player tick count = %d, want 1", pc.count)
	}
	if nc.count != 1 {
		t.Errorf("npc tick count = %d, want 1", nc.count)
	}
	if petc.count != 1 {
		t.Errorf("pet tick count = %d, want 1", petc.count)
	}
	if oc.count != 1 {
		t.Errorf("outside entity tick count = %d, want 1", oc.count)
	}
}

func TestLegacyMapEachEntityTicksOnce(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	h.SetMap("legacy", "Legacy", game.Loaded())
	n := hostileNPC(h, "npc-legacy", px+100, py)
	rec := slotBattlePet(t, h, "goblin", "Gobby", 1)
	h.tickEntities(time.Now())
	pet := h.ent(rec.ID)
	if pet == nil {
		t.Fatal("expected pet entity")
	}

	pc := &testTickCounter{}
	nc := &testTickCounter{}
	petc := &testTickCounter{}
	pe := h.playerEnt(c.ID)
	pe.pipeline = append(pe.pipeline, pc)
	n.pipeline = append(n.pipeline, nc)
	pet.pipeline = append(pet.pipeline, petc)

	h.tickEntities(time.Now())

	if pc.count != 1 || nc.count != 1 || petc.count != 1 {
		t.Fatalf("legacy tick counts player=%d npc=%d pet=%d, all want 1", pc.count, nc.count, petc.count)
	}
	if pe.regionID != "" || n.regionID != "" || pet.regionID != "" {
		t.Fatalf("legacy mode must not assign region ownership")
	}
}
