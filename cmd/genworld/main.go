// genworld wipes legacy stock maps and regenerates Clara Mundi's three-region world.
// Run from repo root: go run ./cmd/genworld
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"clara-mundi/internal/game"
)

var legacyMapIDs = []string{"greenwood", "north", "cave", "easternshore"}

func main() {
	root := findRoot()
	if err := os.Chdir(root); err != nil {
		fatal(err)
	}

	defs := allMapDefs()
	exits, err := assembleExits(defs)
	if err != nil {
		fatal(err)
	}

	keep := map[string]bool{}
	for _, d := range defs {
		keep[d.id] = true
	}
	// Wipe legacy maps and ALL prior overrides (stale wall patches break new exits).
	for _, id := range legacyMapIDs {
		if !keep[id] {
			removeMapFiles(id)
		}
	}
	overrideDir := filepath.Join("data", "maps", "overrides")
	entries, _ := os.ReadDir(overrideDir)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		_ = os.Remove(filepath.Join(overrideDir, e.Name()))
	}

	port := 8091
	clusterMaps := make([]map[string]any, 0, len(defs))

	for i, def := range defs {
		cfg, err := buildMap(def, exits[def.id])
		if err != nil {
			fatal(fmt.Errorf("%s: %w", def.id, err))
		}
		mapPath := filepath.Join("data", "maps", def.id+".map.json")
		if err := game.SaveMapConfig(mapPath, cfg); err != nil {
			fatal(err)
		}
		// Validate load
		if _, err := game.LoadOverworldData(mapPath); err != nil {
			fatal(fmt.Errorf("validate %s: %w", def.id, err))
		}

		serverPath := filepath.Join("data", "maps", def.id+".server.json")
		if err := writeServerJSON(serverPath, def); err != nil {
			fatal(err)
		}

		entry := map[string]any{
			"id":     def.id,
			"name":   def.name,
			"addr":   fmt.Sprintf(":%d", port+i),
			"config": filepath.ToSlash(serverPath),
		}
		if def.id == "greenwood" {
			entry["default"] = true
		}
		clusterMaps = append(clusterMaps, entry)
		fmt.Printf("wrote %s (%dx%d, %d exits, %d npcs)\n",
			def.id, def.cols, def.rows, len(exits[def.id]), len(cfg.NPCs))
	}

	if err := writeCluster(clusterMaps); err != nil {
		fatal(err)
	}

	// Sanctuary wall overrides for maps that have town sanctuaries
	for _, def := range defs {
		mapPath := filepath.Join("data", "maps", def.id+".map.json")
		patches, err := game.GenerateSanctuaryWallOverride(mapPath)
		if err != nil {
			fatal(fmt.Errorf("walls %s: %w", def.id, err))
		}
		if patches == nil {
			continue
		}
		if err := game.SaveMapOverride(patches); err != nil {
			fatal(err)
		}
		fmt.Printf("walls: %s\n", def.id)
	}

	if err := migrateProfiles(keep); err != nil {
		fmt.Fprintf(os.Stderr, "warn: profile migration: %v\n", err)
	}

	fmt.Printf("\nworld ready: %d maps across Verdant March, Frost Bastion, Tide Courts\n", len(defs))
}

func removeMapFiles(id string) {
	for _, p := range []string{
		filepath.Join("data", "maps", id+".map.json"),
		filepath.Join("data", "maps", id+".server.json"),
		filepath.Join("data", "maps", "overrides", id+".json"),
	} {
		_ = os.Remove(p)
	}
	fmt.Printf("removed legacy %s\n", id)
}

func writeServerJSON(path string, def mapDef) error {
	combat := def.combat
	doc := map[string]any{
		"server": map[string]any{
			"name":         def.name,
			"addr":         ":8080",
			"data":         "data/profiles.json",
			"accounts":     "data/accounts.json",
			"static":       "",
			"overworld":    filepath.ToSlash(filepath.Join("data", "maps", def.id+".map.json")),
			"battle_speed": 0.75,
		},
		"plugins": map[string]any{
			"combat": combat,
			"modules": []map[string]any{
				{
					"id": "combat.ordo", "name": "Ordo Combat", "version": "1.0.0",
					"capabilities": []string{"combat"}, "enabled": true,
					"frontend": map[string]any{"pluginId": "combat.ordo"},
					"config":   map[string]any{"battle_speed": 0.75},
				},
				{
					"id": "combat.realtime", "name": "Realtime Combat", "version": "1.0.0",
					"capabilities": []string{"combat"}, "enabled": true,
					"frontend": map[string]any{"pluginId": "combat.realtime"},
					"config":   map[string]any{},
				},
			},
		},
	}
	raw, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0o644)
}

func writeCluster(maps []map[string]any) error {
	clusterPath := filepath.Join("data", "cluster.json")
	raw, err := os.ReadFile(clusterPath)
	if err != nil {
		return err
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return err
	}
	doc["maps"] = maps
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(clusterPath, append(out, '\n'), 0o644); err != nil {
		return err
	}

	reg := map[string]any{"maps": maps}
	regOut, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join("data", "cluster.maps.json"), append(regOut, '\n'), 0o644)
}

func migrateProfiles(keep map[string]bool) error {
	path := filepath.Join("data", "profiles.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var asMap map[string]map[string]any
	if err := json.Unmarshal(raw, &asMap); err != nil {
		return err
	}
	changed := 0
	for _, p := range asMap {
		id, _ := p["map_id"].(string)
		if id == "" || keep[id] {
			continue
		}
		p["map_id"] = "greenwood"
		p["world_x"] = float64(64 * tileSize)
		p["world_y"] = float64(48 * tileSize)
		p["has_world_pos"] = true
		changed++
	}
	if changed == 0 {
		return nil
	}
	out, err := json.MarshalIndent(asMap, "", "  ")
	if err != nil {
		return err
	}
	fmt.Printf("migrated %d profiles off removed maps → greenwood\n", changed)
	return os.WriteFile(path, append(out, '\n'), 0o644)
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
