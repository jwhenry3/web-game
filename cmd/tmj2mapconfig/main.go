// tmj2mapconfig exports server map config JSON from legacy .tmj base maps.
// Run from repo root: go run ./cmd/tmj2mapconfig
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
		tmj := filepath.Join(root, "maps", id+".tmj")
		out := filepath.Join(root, "maps", id+".map.json")
		cfg, err := game.ExportMapConfigFromTiled(tmj)
		if err != nil {
			fatal(err)
		}
		if err := game.SaveMapConfig(out, cfg); err != nil {
			fatal(err)
		}
		fmt.Printf("wrote %s (%dx%d, %d objects)\n", out, cfg.Cols, cfg.Rows, len(cfg.Objects))
	}
}

func findRoot() string {
	if _, err := os.Stat("maps/greenwood.tmj"); err == nil {
		return "."
	}
	if _, err := os.Stat("../../maps/greenwood.tmj"); err == nil {
		return "../.."
	}
	return "."
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
