package game

import (
	"path/filepath"
	"testing"
)

func TestGenerateSanctuaryWallOverrideGreenwood(t *testing.T) {
	o, err := GenerateSanctuaryWallOverride(defaultOverworldPath())
	if err != nil {
		t.Fatal(err)
	}
	if o == nil || len(o.Layers["collision"]) == 0 {
		t.Fatal("expected sanctuary wall collision patches")
	}
	if len(o.Layers["ground"]) == 0 {
		t.Fatal("expected sanctuary wall ground patches")
	}
}

func TestGenerateSanctuaryWallOverrideFrostkeep(t *testing.T) {
	path := filepath.Join(filepath.Dir(defaultOverworldPath()), "frostkeep.map.json")
	o, err := GenerateSanctuaryWallOverride(path)
	if err != nil {
		t.Fatal(err)
	}
	if o == nil || len(o.Layers["collision"]) == 0 {
		t.Fatal("expected sanctuary wall collision patches")
	}
}
