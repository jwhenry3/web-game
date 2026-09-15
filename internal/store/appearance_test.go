package store

import (
	"encoding/json"
	"os"
	"testing"

	"clara-mundi/internal/game"
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

func seedCharactersCatalog(t *testing.T) {
	t.Helper()
	payload := json.RawMessage(`{
		"parts": [
			{"id":"c1","group":"skin","slots":["skin"]},
			{"id":"c2","group":"face","slots":["face"]},
			{"id":"m9","group":"hair","slots":["hair_bot","hair_top"],"variants":["c1","c2"]},
			{"id":"cloth9","group":"cloth","slots":["cloth_bot","cloth_top"],"variants":["c1","c3"]},
			{"id":"weapon9","group":"weapon","slots":["weapon_bot","weapon_top"]}
		],
		"races": {"testfolk": {"skin":"c1","face":"c2","hair":"m9","hair_color":"c2","cloth":"cloth9","cloth_color":"c3","weapon":"weapon9","weapon_color":"c1"}}
	}`)
	if err := game.SaveContent("characters", payload); err != nil {
		t.Fatal(err)
	}
}

func TestDefaultAppearanceFromCatalog(t *testing.T) {
	chdirTemp(t)
	seedCharactersCatalog(t)
	a := DefaultAppearanceForRace("testfolk")
	if a.Hair != "m9" || a.Weapon != "weapon9" || a.Cloth != "cloth9" {
		t.Fatalf("catalog preset not applied: %+v", a)
	}
}

func TestDefaultAppearanceFallsBack(t *testing.T) {
	chdirTemp(t)
	// No catalog file: compiled presets apply.
	a := DefaultAppearanceForRace("felis")
	if a.Hair != "f3" || a.Cloth != "cloth3" {
		t.Fatalf("fallback preset not applied: %+v", a)
	}
}

func TestNormalizeClampsUnknownParts(t *testing.T) {
	chdirTemp(t)
	seedCharactersCatalog(t)
	a := NormalizeAppearance("testfolk", Appearance{
		Skin: "c1", Face: "c2", Hair: "bogus", HairColor: "c9",
		Cloth: "cloth9", ClothColor: "c9", Weapon: "bogus", WeaponColor: "c1",
	})
	if a.Hair != "m9" {
		t.Fatalf("unknown hair should clamp to preset, got %q", a.Hair)
	}
	if a.HairColor != "c2" {
		t.Fatalf("invalid hair variant should clamp to preset, got %q", a.HairColor)
	}
	if a.Cloth != "cloth9" || a.ClothColor != "c3" {
		t.Fatalf("cloth normalize = %+v", a)
	}
	if a.Weapon != "weapon9" {
		t.Fatalf("unknown weapon should clamp to preset, got %q", a.Weapon)
	}
}
