package game

import "testing"

func TestPointInPolygonTile(t *testing.T) {
	poly := []Vec2{
		{X: 0, Y: 0},
		{X: 4, Y: 0},
		{X: 4, Y: 4},
		{X: 0, Y: 4},
	}
	if !pointInPolygonTile(1, 1, poly) {
		t.Fatal("expected interior tile inside")
	}
	if pointInPolygonTile(5, 5, poly) {
		t.Fatal("expected exterior tile outside")
	}
}

func TestPolygonsOverlapSharedEdgeAllowed(t *testing.T) {
	a := []Vec2{{X: 0, Y: 0}, {X: 2, Y: 0}, {X: 2, Y: 2}, {X: 0, Y: 2}}
	b := []Vec2{{X: 2, Y: 0}, {X: 4, Y: 0}, {X: 4, Y: 2}, {X: 2, Y: 2}}
	if polygonsOverlap(a, b) {
		t.Fatal("shared edge should not count as overlap")
	}
	c := []Vec2{{X: 1, Y: 1}, {X: 3, Y: 1}, {X: 3, Y: 3}, {X: 1, Y: 3}}
	if !polygonsOverlap(a, c) {
		t.Fatal("expected overlapping interiors")
	}
}

func TestRegionFromObjectPolygon(t *testing.T) {
	obj := OverrideObject{
		Type: "region",
		Name: "poly",
		X:    0,
		Y:    128,
		Width: 128,
		Height: 128,
		Polygon: []Vec2{
			{X: 0, Y: 0},
			{X: 128, Y: 0},
			{X: 64, Y: 128},
		},
		Properties: []tiledProp{{Name: "id", Type: "string", Value: "poly"}},
	}
	reg, err := regionFromObject(obj, 32)
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.Polygon) != 3 {
		t.Fatalf("want 3 verts, got %d", len(reg.Polygon))
	}
	if !reg.Contains(2, 1) {
		t.Fatal("expected tile near triangle center inside")
	}
}
