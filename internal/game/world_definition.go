package game

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// WorldDefinition describes the immutable gameplay data for a world while
// keeping the existing per-map Overworld API available during migration.
// SimulationRegions are ownership boundaries and intentionally remain Region
// values so gameplay fields on Region do not need a broad schema change.
type WorldDefinition struct {
	*Overworld
	SimulationRegions []Region

	simulationRegionsByID map[string]int
}

// NewWorldDefinition builds and validates a world definition. A tile may be
// owned by at most one simulation region; uncovered tiles are allowed.
func NewWorldDefinition(overworld *Overworld, simulationRegions []Region) (*WorldDefinition, error) {
	if overworld == nil {
		return nil, fmt.Errorf("overworld required")
	}
	if overworld.Path == "" {
		return nil, fmt.Errorf("overworld path required")
	}
	w := &WorldDefinition{
		Overworld:             overworld,
		SimulationRegions:     append([]Region(nil), simulationRegions...),
		simulationRegionsByID: make(map[string]int, len(simulationRegions)),
	}
	if err := w.Validate(); err != nil {
		return nil, err
	}
	return w, nil
}

// LoadWorldDefinition loads the existing overworld formats and uses explicit
// simulation regions when supplied. For legacy maps without simulation regions,
// a single fallback region covering the full tile bounds is created so gameplay
// regions may overlap without breaking world activation. Loading is side-effect
// free, like LoadOverworldData; the legacy LoadOverworld installer remains
// unchanged.
func LoadWorldDefinition(path string) (*WorldDefinition, error) {
	if IsWorldConfigPath(path) {
		return LoadWorldDefinitionFromConfig(path)
	}

	overworld, err := LoadOverworldData(path)
	if err != nil {
		return nil, err
	}
	simulationRegions := overworld.SimulationRegions
	if len(simulationRegions) == 0 {
		simulationRegions = []Region{
			Region{
				ID:   "world",
				MinC: 0, MinR: 0,
				MaxC: overworld.Cols - 1,
				MaxR: overworld.Rows - 1,
			}.EnsurePolygon(),
		}
	}
	return NewWorldDefinition(overworld, simulationRegions)
}

// Validate checks the invariants required for exclusive simulation ownership.
func (w *WorldDefinition) Validate() error {
	if w == nil || w.Overworld == nil {
		return fmt.Errorf("overworld required")
	}
	index := make(map[string]int, len(w.SimulationRegions))
	for i, region := range w.SimulationRegions {
		if region.ID == "" {
			return fmt.Errorf("simulation region %d has empty id", i)
		}
		if _, exists := index[region.ID]; exists {
			return fmt.Errorf("duplicate simulation region id %q", region.ID)
		}
		index[region.ID] = i
		for j := 0; j < i; j++ {
			if simulationRegionsOverlap(region, w.SimulationRegions[j]) {
				return fmt.Errorf("simulation regions %q and %q overlap", w.SimulationRegions[j].ID, region.ID)
			}
		}
	}
	w.simulationRegionsByID = index
	return nil
}

// SimulationRegionByID returns an ownership region by its stable ID.
func (w *WorldDefinition) SimulationRegionByID(id string) (Region, bool) {
	if w == nil {
		return Region{}, false
	}
	i, ok := w.simulationRegionsByID[id]
	if !ok || i < 0 || i >= len(w.SimulationRegions) {
		return Region{}, false
	}
	return w.SimulationRegions[i], true
}

// SimulationRegionAt returns the sole simulation owner of a tile. Uncovered
// tiles return false; overlapping regions are rejected by construction.
func (w *WorldDefinition) SimulationRegionAt(c, r int) (Region, bool) {
	if w == nil {
		return Region{}, false
	}
	for _, region := range w.SimulationRegions {
		if region.Contains(c, r) {
			return region, true
		}
	}
	return Region{}, false
}

func simulationRegionsOverlap(a, b Region) bool {
	// Ownership is tile-based. Checking the common AABB avoids polygon boundary
	// ambiguity and exactly matches Region.Contains lookup semantics.
	minC, minR := maxInt(a.MinC, b.MinC), maxInt(a.MinR, b.MinR)
	maxC, maxR := minInt(a.MaxC, b.MaxC), minInt(a.MaxR, b.MaxR)
	if len(a.Polygon) >= 3 {
		minC, minR, maxC, maxR = intersectBounds(a, b)
	} else if len(b.Polygon) >= 3 {
		minC, minR, maxC, maxR = intersectBounds(a, b)
	}
	for r := minR; r <= maxR; r++ {
		for c := minC; c <= maxC; c++ {
			if a.Contains(c, r) && b.Contains(c, r) {
				return true
			}
		}
	}
	return false
}

func intersectBounds(a, b Region) (int, int, int, int) {
	aminC, aminR, amaxC, amaxR := a.MinC, a.MinR, a.MaxC, a.MaxR
	bminC, bminR, bmaxC, bmaxR := b.MinC, b.MinR, b.MaxC, b.MaxR
	if len(a.Polygon) >= 3 {
		aminC, aminR, amaxC, amaxR = bboxFromPolygon(a.Polygon)
	}
	if len(b.Polygon) >= 3 {
		bminC, bminR, bmaxC, bmaxR = bboxFromPolygon(b.Polygon)
	}
	return maxInt(aminC, bminC), maxInt(aminR, bminR), minInt(amaxC, bmaxC), minInt(amaxR, bmaxR)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// WorldConfig is a lightweight singular-world manifest. It references a terrain
// (overworld) asset and declares the simulation regions that partition it.
// Gameplay regions, NPCs, save points, etc. remain in the referenced map file.
type WorldConfig struct {
	Terrain           string   `json:"terrain"`
	SimulationRegions []Region `json:"simulation_regions"`
}

// IsWorldConfigPath reports whether path is a world manifest file.
func IsWorldConfigPath(path string) bool {
	return strings.HasSuffix(strings.ToLower(path), ".world.json")
}

// LoadWorldConfig reads a .world.json manifest.
func LoadWorldConfig(path string) (*WorldConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read world config %s: %w", path, err)
	}
	var cfg WorldConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse world config %s: %w", path, err)
	}
	return &cfg, nil
}

// LoadWorldDefinitionFromConfig loads a world from a manifest. The referenced
// terrain path is resolved repo-root style (e.g. "data/maps/...") or relative
// to the manifest itself. Simulation regions come from the manifest, overriding
// any regions declared inside the map file.
func LoadWorldDefinitionFromConfig(path string) (*WorldDefinition, error) {
	cfg, err := LoadWorldConfig(path)
	if err != nil {
		return nil, err
	}
	if cfg.Terrain == "" {
		return nil, fmt.Errorf("world config %s: terrain path required", path)
	}
	terrainPath, err := resolveWorldTerrainPath(path, cfg.Terrain)
	if err != nil {
		return nil, fmt.Errorf("world config %s: %w", path, err)
	}
	overworld, err := LoadOverworldData(terrainPath)
	if err != nil {
		return nil, fmt.Errorf("world config %s: load terrain %q: %w", path, cfg.Terrain, err)
	}
	if len(cfg.SimulationRegions) == 0 {
		return nil, fmt.Errorf("world config %s: simulation_regions required", path)
	}
	for i := range cfg.SimulationRegions {
		cfg.SimulationRegions[i] = cfg.SimulationRegions[i].EnsurePolygon()
	}
	return NewWorldDefinition(overworld, cfg.SimulationRegions)
}

// resolveWorldTerrainPath resolves a terrain path declared in a world manifest.
// Absolute paths are used unchanged. Relative paths are resolved in priority order:
//  1. repo-root style paths starting with "data/" relative to the repository root
//     (discovered by walking up from the manifest looking for go.mod), then
//  2. relative to the manifest's own directory.
func resolveWorldTerrainPath(worldPath, terrainPath string) (string, error) {
	if terrainPath == "" {
		return "", fmt.Errorf("terrain path required")
	}
	if filepath.IsAbs(terrainPath) {
		return filepath.Clean(terrainPath), nil
	}

	slashPath := filepath.ToSlash(terrainPath)

	// Repo-root style: data/...
	if strings.HasPrefix(slashPath, "data/") {
		if root := findRepoRootFromPath(worldPath); root != "" {
			candidate := filepath.Join(root, terrainPath)
			if _, err := os.Stat(candidate); err == nil {
				return filepath.Clean(candidate), nil
			}
		}
	}

	// Manifest-relative.
	manifestDir := filepath.Dir(worldPath)
	candidate := filepath.Join(manifestDir, terrainPath)
	if _, err := os.Stat(candidate); err == nil {
		return filepath.Clean(candidate), nil
	}

	// Fallback to repo root even for non data/ prefixes, when discoverable.
	if root := findRepoRootFromPath(worldPath); root != "" {
		candidate := filepath.Join(root, terrainPath)
		if _, err := os.Stat(candidate); err == nil {
			return filepath.Clean(candidate), nil
		}
	}

	// Return manifest-relative so the underlying loader reports a clean error.
	return filepath.Clean(candidate), nil
}

// findRepoRootFromPath walks up from path looking for a directory containing go.mod.
func findRepoRootFromPath(from string) string {
	dir := filepath.Dir(from)
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}
