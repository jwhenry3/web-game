// genmapwalls writes sanctuary perimeter walls into maps/overrides/{mapId}.json.
// Run from repo root: go run ./cmd/genmapwalls
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"ffv-web-game/internal/game"
)

func main() {
	root := findRoot()
	for _, id := range []string{"greenwood", "north"} {
		mapPath := filepath.Join(root, "maps", id+".map.json")
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
		fmt.Printf("wrote maps/overrides/%s.json (%d ground, %d collision tiles)\n", id, ground, collision)
	}
}

func findRoot() string {
	if _, err := os.Stat("maps/greenwood.map.json"); err == nil {
		return "."
	}
	if _, err := os.Stat("../../maps/greenwood.map.json"); err == nil {
		return "../.."
	}
	return "."
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
