package game

import "testing"

func TestApplyMapOverride(t *testing.T) {
	base := []int{100, 101, 102, 103}
	layers := map[string][]int{"ground": append([]int(nil), base...)}
	override := &MapTileOverrides{
		MapID: "greenwood",
		Layers: map[string]map[string]int{
			"ground": {"1": 999},
		},
	}
	ApplyMapOverride(layers, override)
	if layers["ground"][1] != 999 {
		t.Fatalf("expected patched gid 999, got %d", layers["ground"][1])
	}
	if layers["ground"][0] != 100 {
		t.Fatal("unchanged tile should remain")
	}
}

func TestDiffMapOverride(t *testing.T) {
	base := map[string][]int{"ground": {1, 2, 3}}
	current := map[string][]int{"ground": {1, 9, 3}}
	diff := DiffMapOverride("north", base, current)
	if diff.Layers["ground"]["1"] != 9 {
		t.Fatalf("expected diff at index 1, got %v", diff.Layers)
	}
}
