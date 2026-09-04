// genmapwalls writes sanctuary perimeter walls into data/maps/overrides/{mapId}.json.
// Run from repo root: go run ./cmd/genmapwalls
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"clara-mundi/internal/game"
)

func main() {
	root := findRoot()
	matches, err := filepath.Glob(filepath.Join(root, "data", "maps", "*.map.json"))
	if err != nil {
		fatal(err)
	}
	if len(matches) == 0 {
		fatal(fmt.Errorf("no maps found under data/maps"))
	}
	for _, mapPath := range matches {
		id := strings.TrimSuffix(filepath.Base(mapPath), ".map.json")
		patches, err := game.GenerateSanctuaryWallOverride(mapPath)
		if err != nil {
			fatal(err)
		}
		if patches == nil {
			fmt.Printf("%s: no sanctuary wall patches\n", id)
			continue
		}
		existing, err := game.LoadMapOverride(id)
		if err != nil {
			fatal(err)
		}
		merged := game.MergeMapOverrides(existing, patches)
		if err := game.SaveMapOverride(merged); err != nil {
			fatal(err)
		}
		ground := len(merged.Layers["ground"])
		collision := len(merged.Layers["collision"])
		fmt.Printf("wrote data/maps/overrides/%s.json (%d ground, %d collision tiles)\n", id, ground, collision)
	}
}

func findRoot() string {
	if _, err := os.Stat("data/maps"); err == nil {
		return "."
	}
	if _, err := os.Stat("../../data/maps"); err == nil {
		return "../.."
	}
	return "."
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
