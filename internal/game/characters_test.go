package game

import (
	"encoding/json"
	"os"
	"testing"
)

// chdirTemp isolates data/content lookups in a temp working dir.
func chdirTemp(t *testing.T) {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	tmp := t.TempDir()
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })
}

func TestLoadCharacterCatalogAbsent(t *testing.T) {
	chdirTemp(t)
	cat, err := LoadCharacterCatalog()
	if err != nil {
		t.Fatal(err)
	}
	if cat != nil {
		t.Fatalf("expected nil catalog, got %+v", cat)
	}
}

func TestLoadCharacterCatalogRoundTrip(t *testing.T) {
	chdirTemp(t)
	payload := json.RawMessage(`{
		"parts": [
			{"id":"m9","group":"hair","slots":["hair_bot","hair_top"],"variants":["c1","c2"]},
			{"id":"weapon9","group":"weapon","slots":["weapon_bot","weapon_top"],"tags":["sword"]}
		],
		"races": {"testfolk": {"skin":"c1","face":"c1","hair":"m9","hair_color":"c1","cloth":"cloth1","cloth_color":"c1","weapon":"weapon9","weapon_color":"c1"}}
	}`)
	if err := SaveContent("characters", payload); err != nil {
		t.Fatal(err)
	}
	cat, err := LoadCharacterCatalog()
	if err != nil {
		t.Fatal(err)
	}
	if cat == nil {
		t.Fatal("expected catalog")
	}
	look, ok := cat.RacePreset("testfolk")
	if !ok || look.Hair != "m9" || look.Weapon != "weapon9" {
		t.Fatalf("RacePreset = %+v ok=%v", look, ok)
	}
	if !cat.PartInGroup("hair", "m9") {
		t.Fatal("m9 should be a hair part")
	}
	if cat.PartInGroup("cloth", "m9") {
		t.Fatal("m9 is not a cloth part")
	}
	if !cat.ValidVariant("m9", "c2") {
		t.Fatal("c2 should be a valid variant of m9")
	}
	if cat.ValidVariant("m9", "c9") {
		t.Fatal("c9 is not a variant of m9")
	}
	if !cat.ValidVariant("weapon9", "c9") {
		t.Fatal("parts without variants accept any value")
	}
}
