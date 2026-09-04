package server

import (
	"testing"

	"clara-mundi/internal/game"
)

func TestMapSnapshotFromHub(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	snap := h.mapSnapshot()
	if snap == nil {
		t.Fatal("expected map snapshot")
	}
	if snap.ID != "greenwood" || snap.Name != "Greenwood" {
		t.Fatalf("id/name = %s %s", snap.ID, snap.Name)
	}
	if snap.Combat != "combat.atb" {
		t.Fatalf("combat = %s", snap.Combat)
	}
	if snap.Overworld.Cols == 0 || snap.Overworld.Cells == "" {
		t.Fatal("overworld missing from snapshot")
	}
	if len(snap.Modules) == 0 {
		t.Fatal("expected modules in snapshot")
	}
	if len(snap.Portals) == 0 {
		t.Fatal("expected zone portals in snapshot")
	}
	for _, p := range snap.Portals {
		if p.W <= 0 || p.H <= 0 {
			t.Fatalf("portal size %v", p)
		}
	}
}

func TestAtlasMapIncludesSavePoints(t *testing.T) {
	h := mustTestHub()
	h.SetMap("greenwood", "Greenwood", game.Loaded())
	atlas := h.AtlasMap()
	if atlas.ID != "greenwood" || atlas.Name != "Greenwood" {
		t.Fatalf("id/name = %s %s", atlas.ID, atlas.Name)
	}
	if atlas.Overworld.Cols == 0 || atlas.Overworld.Cells == "" {
		t.Fatal("overworld missing from atlas")
	}
	if len(atlas.POIs) == 0 {
		t.Fatal("expected save-point POIs from map config")
	}
	for _, poi := range atlas.POIs {
		if poi.ID == "" || poi.Name == "" {
			t.Fatalf("poi %+v", poi)
		}
		if poi.Kind != "save_point" && poi.Kind != "job_changer" {
			t.Fatalf("unexpected poi kind %+v", poi)
		}
	}
}
