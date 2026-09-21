package server

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

func TestMove3DRejectsClientElevationTeleport(t *testing.T) {
	x, y := wildernessXY()
	h, c, e := testHubWithPlayer(t, x, y)
	z := 99999.0
	raw, _ := json.Marshal(protocol.MovePayload{X: x + 2, Y: y, Z: &z})
	h.handleMove(c, raw)
	if e.Z == z || !e.grounded {
		t.Fatalf("client owns elevation: %+v", e)
	}
	if e.X != x {
		t.Fatalf("invalid elevation report moved player: %v", e.X)
	}
}

func TestMove3DJumpAndGravityAreServerOwned(t *testing.T) {
	x, y := wildernessXY()
	h, c, e := testHubWithPlayer(t, x, y)
	raw, _ := json.Marshal(protocol.MovePayload{X: x, Y: y, Jump: true})
	h.handleMove(c, raw)
	start := e.Z
	h.tickEntity(e, time.Now(), .05)
	if e.Z <= start || e.grounded {
		t.Fatalf("jump did not rise: %v -> %v", start, e.Z)
	}
	for i := 0; i < 80; i++ {
		h.tickEntity(e, time.Now(), .05)
	}
	if math.Abs(e.Z-start) > .001 || !e.grounded {
		t.Fatalf("jump did not land: %v -> %v", start, e.Z)
	}
	if got := h.entitySync(e).Z; got != e.Z {
		t.Fatalf("snapshot lost z: %v", got)
	}
}

func TestCombatDistance3DIncludesVerticalSeparation(t *testing.T) {
	a, b := &entity{X: 10, Y: 10, Z: 0}, &entity{X: 10, Y: 10, Z: 200}
	if entityDistance3D(a, b) != 200 {
		t.Fatal("combat uses planar distance")
	}
}

func TestNPCPhysics3DSweepsPipelineMovement(t *testing.T) {
	ow := &game.Overworld{Cols: 20, Rows: 20, TileSize: 32, WorldW: 640, WorldH: 640, Cells: make([]string, 20)}
	for i := range ow.Cells {
		ow.Cells[i] = "HHHHHHHHHHHHHHHHHHHH"
	}
	h := mustTestHub()
	h.overworld = ow
	e := &entity{Kind: kindNPC, X: 64, Y: 64, alive: true}
	h.ensureBody3D(e)
	h.moveEntity3D(e, 96, 64, 0)
	if math.Abs(e.Z-7.68) > .0001 {
		t.Fatalf("NPC not grounded: %v", e.Z)
	}
}

func TestPetTeleportSeatsPhysicsAtDestination(t *testing.T) {
	ow := &game.Overworld{Cols: 20, Rows: 20, TileSize: 32, WorldW: 640, WorldH: 640, Cells: make([]string, 20)}
	for i := range ow.Cells {
		ow.Cells[i] = "HHHHHHHHHHHHHHHHHHHH"
	}
	h := mustTestHub()
	h.overworld = ow
	owner := &entity{Kind: kindPlayer, X: 96, Y: 64, alive: true}
	pet := &entity{Kind: kindPet, X: 64, Y: 64, alive: true}
	h.ensureBody3D(pet)
	from := game.Vec3{X: pet.X, Y: pet.Y, Z: pet.Z}
	h.petTeleportTo(pet, owner)
	if pet.X == 64 {
		t.Fatal("petTeleportTo never committed a position")
	}
	h.resolveEntityPhysics3D(pet, from, .05)
	if pet.X == from.X && pet.Y == from.Y {
		t.Fatalf("short teleport rewound to %v,%v", pet.X, pet.Y)
	}
	if !pet.grounded {
		t.Fatal("teleported pet did not land on the destination surface")
	}
	if math.Abs(pet.Z-ow.TerrainHeightAt(pet.X, pet.Y)) > .001 {
		t.Fatalf("teleported pet z %v is not the surface height", pet.Z)
	}
}

func TestEnsureBody3DClearsStaleVelocity(t *testing.T) {
	x, y := wildernessXY()
	h, _, e := testHubWithPlayer(t, x, y)
	e.velocityZ = 150
	e.grounded = false
	e.physicsReady = false
	h.ensureBody3D(e)
	if e.velocityZ != 0 || !e.grounded {
		t.Fatalf("reseat kept stale vertical state: vz=%v grounded=%v", e.velocityZ, e.grounded)
	}
}
