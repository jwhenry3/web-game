package game

import (
	"math"
	"testing"
)

func TestFacingYawFromDelta(t *testing.T) {
	const eps = 1e-9
	nearly := func(a, b float64) bool { return math.Abs(NormalizeYaw(a)-NormalizeYaw(b)) < eps }

	if !nearly(FacingYawFromDelta(4, 0, FacingYawSouth), FacingYawEast) {
		t.Fatal("positive dx faces east")
	}
	if !nearly(FacingYawFromDelta(-4, 0, FacingYawEast), FacingYawWest) {
		t.Fatal("negative dx faces west")
	}
	if !nearly(FacingYawFromDelta(0, 0, FacingYawWest), FacingYawWest) {
		t.Fatal("no motion keeps west")
	}
	if !nearly(FacingYawFromDelta(0, -4, FacingYawEast), FacingYawNorth) {
		t.Fatal("negative dy faces north")
	}
	if !nearly(FacingYawFromDelta(0, 4, FacingYawWest), FacingYawSouth) {
		t.Fatal("positive dy faces south")
	}
}

func TestResolveFacingYaw(t *testing.T) {
	client := FacingYawNorth
	got := ResolveFacingYaw(0, 0, client, true, FacingYawWest)
	if math.Abs(got-FacingYawNorth) > 1e-9 {
		t.Fatalf("client yaw preferred, got %v", got)
	}
	got = ResolveFacingYaw(4, 0, 0, false, FacingYawWest)
	if math.Abs(NormalizeYaw(got)-FacingYawEast) > 1e-9 {
		t.Fatalf("derived east, got %v", got)
	}
}

func TestFacingYawFromLegacy(t *testing.T) {
	if FacingYawFromLegacy("left") != FacingYawWest {
		t.Fatal("left")
	}
	if FacingYawFromLegacy("right") != FacingYawEast {
		t.Fatal("right")
	}
	if math.Abs(FacingYawFromLegacy("3.14159")-FacingYawSouth) > 1e-3 {
		t.Fatal("numeric string")
	}
}

func TestFacingDir(t *testing.T) {
	fx, fy := FacingDir(FacingYawNorth)
	if math.Abs(fx) > 1e-9 || math.Abs(fy+1) > 1e-9 {
		t.Fatalf("north dir %v,%v", fx, fy)
	}
	fx, fy = FacingDir(FacingYawEast)
	if math.Abs(fx-1) > 1e-9 || math.Abs(fy) > 1e-9 {
		t.Fatalf("east dir %v,%v", fx, fy)
	}
}
