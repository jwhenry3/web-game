package store

import (
	"encoding/json"
	"testing"

	"clara-mundi/internal/game"
)

func TestSetWorldLocationChurnsPrevMapID(t *testing.T) {
	s := Load("")
	s.GetOrCreate("Bartz", game.JobVAN)

	if _, ok := s.SetWorldLocation("Bartz", "greenwood", 10, 20, 0, true); !ok {
		t.Fatal("SetWorldLocation failed")
	}
	p, _ := s.SetWorldLocation("Bartz", "north", 30, 40, 0, true)
	if p.MapID != "north" {
		t.Fatalf("MapID = %q, want north", p.MapID)
	}
	if p.PrevMapID != "greenwood" {
		t.Fatalf("PrevMapID = %q, want greenwood", p.PrevMapID)
	}
}

func TestSetWorldLocationInWorldRecordsWorldIDWithoutMapChurn(t *testing.T) {
	s := Load("")
	s.GetOrCreate("Bartz", game.JobVAN)

	// Seed a legacy map-mode location first.
	s.SetWorldLocation("Bartz", "greenwood", 10, 20, 0, true)
	s.SetWorldLocation("Bartz", "north", 30, 40, 0, true)

	p, ok := s.SetWorldLocationInWorld("Bartz", "world", 500, 600, game.FacingYawWest, true)
	if !ok {
		t.Fatal("SetWorldLocationInWorld failed")
	}
	if p.WorldID != "world" {
		t.Fatalf("WorldID = %q, want world", p.WorldID)
	}
	// Legacy map fields must stay untouched — no PrevMapID churn in world mode.
	if p.MapID != "north" {
		t.Fatalf("MapID = %q, want north (unchanged)", p.MapID)
	}
	if p.PrevMapID != "greenwood" {
		t.Fatalf("PrevMapID = %q, want greenwood (unchanged)", p.PrevMapID)
	}
	if !p.HasWorldPos || p.WorldX != 500 || p.WorldY != 600 {
		t.Fatalf("pos = %v,%v has=%v", p.WorldX, p.WorldY, p.HasWorldPos)
	}
	if p.Facing != game.FacingYawWest {
		t.Fatalf("facing = %v", p.Facing)
	}

	// Repeated world-mode writes still do not churn map fields.
	p, _ = s.SetWorldLocationInWorld("Bartz", "world", 510, 610, 0, true)
	if p.MapID != "north" || p.PrevMapID != "greenwood" {
		t.Fatalf("map fields churned: MapID=%q PrevMapID=%q", p.MapID, p.PrevMapID)
	}
}

func TestPersistedWorldIDPrefersWorldID(t *testing.T) {
	p := Profile{MapID: "greenwood"}
	if got := p.PersistedWorldID(); got != "greenwood" {
		t.Fatalf("PersistedWorldID = %q, want greenwood", got)
	}
	p.WorldID = "world"
	if got := p.PersistedWorldID(); got != "world" {
		t.Fatalf("PersistedWorldID = %q, want world", got)
	}
}

func TestWorldIDJSONTag(t *testing.T) {
	p := Profile{Name: "Bartz", WorldID: "world"}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	if raw["world_id"] != "world" {
		t.Fatalf("world_id = %v", raw["world_id"])
	}
}
