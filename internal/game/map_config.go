package game

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// MapConfig is the server-authoritative map file (replaces runtime .tmj loading).
type MapConfig struct {
	TileSize    int              `json:"tile_size"`
	Cols        int              `json:"cols"`
	Rows        int              `json:"rows"`
	Wander      wanderSettings   `json:"wander"`
	Terrain     MapConfigTerrain `json:"terrain"`
	Regions     []Region         `json:"regions"`
	SavePoints  []savePointFile  `json:"save_points"`
	JobChangers []jobChangerFile `json:"job_changers"`
	NPCs        []patrolFile     `json:"npcs"`
	Exits       []exitFile       `json:"exits"`
	Objects     []OverrideObject `json:"objects,omitempty"`
}

// MapConfigTerrain holds authoritative ground/collision GID grids.
type MapConfigTerrain struct {
	Ground    []int `json:"ground"`
	Collision []int `json:"collision"`
}

// MapConfigPath returns data/maps/{id}.map.json for a map id.
func MapConfigPath(mapID string) string {
	return filepath.Join("data", "maps", mapID+".map.json")
}

// IsMapConfigPath reports whether path is a server map config file.
func IsMapConfigPath(path string) bool {
	return strings.HasSuffix(strings.ToLower(path), ".map.json")
}

// LoadMapConfig reads a map config JSON file.
func LoadMapConfig(path string) (*MapConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read map config %s: %w", path, err)
	}
	var cfg MapConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse map config %s: %w", path, err)
	}
	if cfg.Cols <= 0 || cfg.Rows <= 0 {
		return nil, fmt.Errorf("map config %s: invalid dimensions", path)
	}
	if cfg.TileSize <= 0 {
		cfg.TileSize = defaultMapTileSize
	}
	want := cfg.Cols * cfg.Rows
	if len(cfg.Terrain.Collision) != want {
		return nil, fmt.Errorf("map config %s: collision len %d want %d", path, len(cfg.Terrain.Collision), want)
	}
	if len(cfg.Terrain.Ground) != want {
		return nil, fmt.Errorf("map config %s: ground len %d want %d", path, len(cfg.Terrain.Ground), want)
	}
	if len(cfg.Regions) == 0 {
		return nil, fmt.Errorf("map config %s: regions required", path)
	}
	return &cfg, nil
}

// SaveMapConfig writes a map config JSON file.
func SaveMapConfig(path string, cfg *MapConfig) error {
	if cfg == nil {
		return fmt.Errorf("nil map config")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// LoadOverworldFromMapConfig loads an overworld from a .map.json config + optional overrides.
func LoadOverworldFromMapConfig(path string) (*Overworld, error) {
	cfg, err := LoadMapConfig(path)
	if err != nil {
		return nil, err
	}
	mapID := MapIDFromPath(path)

	layerMap := map[string][]int{
		"collision": append([]int(nil), cfg.Terrain.Collision...),
		"ground":    append([]int(nil), cfg.Terrain.Ground...),
	}
	override, err := LoadMapOverride(mapID)
	if err != nil {
		return nil, err
	}
	ApplyMapOverride(layerMap, override)

	ow := &Overworld{
		Path:     path,
		Cols:     cfg.Cols,
		Rows:     cfg.Rows,
		TileSize: cfg.TileSize,
		WorldW:   cfg.Cols * cfg.TileSize,
		WorldH:   cfg.Rows * cfg.TileSize,
		Wander:   cfg.Wander,
		Regions:  append([]Region(nil), cfg.Regions...),
		Ground:   append([]int(nil), layerMap["ground"]...),
		Collision: append([]int(nil), layerMap["collision"]...),
		TileOverrides: override,
	}
	if ow.Wander.PauseSec <= 0 || ow.Wander.Speed <= 0 {
		ow.Wander = defaultWanderSettings()
	}

	ow.Cells = buildCellsFromLayers(layerMap["collision"], layerMap["ground"], ow.Cols, ow.Rows)

	if err := applyMapConfigEntities(ow, cfg); err != nil {
		return nil, err
	}

	if override != nil && len(override.Objects) > 0 {
		ow.Objects = append([]OverrideObject(nil), override.Objects...)
	} else {
		ow.Objects = append([]OverrideObject(nil), cfg.Objects...)
	}

	if regs, err := regionsFromObjects(ow.Objects, ow.TileSize); err != nil {
		return nil, err
	} else if len(regs) > 0 {
		ow.Regions = regs
	} else {
		for i := range ow.Regions {
			ow.Regions[i] = ow.Regions[i].EnsurePolygon()
		}
	}

	for _, reg := range ow.Regions {
		if reg.Sanctuary {
			stampSanctuaryFloor(ow, reg)
		}
	}

	if hasNpcObjects(ow.Objects) {
		if err := npcEntitiesFromObjects(ow, ow.Objects); err != nil {
			return nil, err
		}
	}

	if err := validateSanctuaries(ow); err != nil {
		return nil, err
	}
	if ow.Wander.PauseSec <= 0 || ow.Wander.Speed <= 0 {
		return nil, fmt.Errorf("invalid wander settings in %s", path)
	}
	return ow, nil
}

func applyMapConfigEntities(ow *Overworld, cfg *MapConfig) error {
	ow.NPCPatrols = make([]Patrol, 0, len(cfg.NPCs))
	for _, n := range cfg.NPCs {
		if n.ID == "" || n.Region == "" {
			return fmt.Errorf("npc missing id or region")
		}
		ow.NPCPatrols = append(ow.NPCPatrols, Patrol{
			ID: n.ID, Kind: n.Kind, Name: n.Name, Level: n.Level, Region: n.Region,
			Home: Tile{C: n.Home[0], R: n.Home[1]},
			Encounter: encounterFromPatrolFile(n),
		})
	}

	ow.SavePoints = make([]SavePoint, 0, len(cfg.SavePoints))
	for _, sp := range cfg.SavePoints {
		if sp.ID == "" || sp.Name == "" {
			return fmt.Errorf("save point missing id or name")
		}
		tile := Tile{C: sp.Tile[0], R: sp.Tile[1]}
		if !ow.WalkableTile(tile.C, tile.R) {
			return fmt.Errorf("save point %s tile (%d,%d) blocked", sp.ID, tile.C, tile.R)
		}
		ow.SavePoints = append(ow.SavePoints, SavePoint{ID: sp.ID, Name: sp.Name, Tile: tile})
	}

	ow.JobChangers = make([]JobChanger, 0, len(cfg.JobChangers))
	for _, jc := range cfg.JobChangers {
		if jc.ID == "" || jc.Name == "" {
			return fmt.Errorf("job changer missing id or name")
		}
		tile := Tile{C: jc.Tile[0], R: jc.Tile[1]}
		if !ow.WalkableTile(tile.C, tile.R) {
			return fmt.Errorf("job changer %s tile (%d,%d) blocked", jc.ID, tile.C, tile.R)
		}
		ow.JobChangers = append(ow.JobChangers, JobChanger{ID: jc.ID, Name: jc.Name, Tile: tile})
	}

	for _, e := range cfg.Exits {
		dest := normalizeDestMap(e.DestMap)
		if dest == "" {
			return fmt.Errorf("exit missing destMap")
		}
		minC, minR, maxC, maxR := e.Tiles[0], e.Tiles[1], e.Tiles[2], e.Tiles[3]
		for c := minC; c <= maxC; c++ {
			for r := minR; r <= maxR; r++ {
				if !ow.WalkableTile(c, r) {
					return fmt.Errorf("exit to %s tile (%d,%d) blocked", dest, c, r)
				}
			}
		}
		ow.Exits = append(ow.Exits, MapExit{
			DestMap: dest,
			MinC:    minC, MinR: minR,
			MaxC:    maxC, MaxR: maxR,
			DestX:   e.Dest[0], DestY: e.Dest[1],
		})
	}
	return nil
}

// ExportMapConfigFromTiled converts a base .tmj (no overrides) into MapConfig.
func ExportMapConfigFromTiled(tmjPath string) (*MapConfig, error) {
	ow, objects, wander, err := loadOverworldFromTiledBase(tmjPath)
	if err != nil {
		return nil, err
	}
	cfg := &MapConfig{
		TileSize:    ow.TileSize,
		Cols:        ow.Cols,
		Rows:        ow.Rows,
		Wander:      wander,
		Terrain:     MapConfigTerrain{Ground: ow.Ground, Collision: ow.Collision},
		Regions:     ow.Regions,
		Objects:     objects,
		SavePoints:  make([]savePointFile, 0, len(ow.SavePoints)),
		JobChangers: make([]jobChangerFile, 0, len(ow.JobChangers)),
		NPCs:        make([]patrolFile, 0, len(ow.NPCPatrols)),
		Exits:       make([]exitFile, 0, len(ow.Exits)),
	}
	for _, sp := range ow.SavePoints {
		cfg.SavePoints = append(cfg.SavePoints, savePointFile{
			ID: sp.ID, Name: sp.Name, Tile: [2]int{sp.Tile.C, sp.Tile.R},
		})
	}
	for _, jc := range ow.JobChangers {
		cfg.JobChangers = append(cfg.JobChangers, jobChangerFile{
			ID: jc.ID, Name: jc.Name, Tile: [2]int{jc.Tile.C, jc.Tile.R},
		})
	}
	for _, p := range ow.NPCPatrols {
		pf := patrolFile{
			ID: p.ID, Kind: p.Kind, Name: p.Name, Level: p.Level, Region: p.Region,
			Home: [2]int{p.Home.C, p.Home.R},
		}
		enc := NormalizeEncounter(p.Encounter, p.Kind, p.Level)
		pf.Encounter = &enc
		cfg.NPCs = append(cfg.NPCs, pf)
	}
	for _, e := range ow.Exits {
		cfg.Exits = append(cfg.Exits, exitFile{
			DestMap: e.DestMap,
			Tiles:   [4]int{e.MinC, e.MinR, e.MaxC, e.MaxR},
			Dest:    [2]float64{e.DestX, e.DestY},
		})
	}
	return cfg, nil
}

// loadOverworldFromTiledBase parses TMJ without applying runtime overrides.
func loadOverworldFromTiledBase(path string) (*Overworld, []OverrideObject, wanderSettings, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, wanderSettings{}, fmt.Errorf("read tiled map %s: %w", path, err)
	}
	var raw tiledMapFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, nil, wanderSettings{}, fmt.Errorf("parse tiled map %s: %w", path, err)
	}
	if raw.Width <= 0 || raw.Height <= 0 {
		return nil, nil, wanderSettings{}, fmt.Errorf("tiled map %s: invalid dimensions", path)
	}
	tileSize := raw.TileWidth
	if tileSize <= 0 {
		tileSize = defaultMapTileSize
	}

	wander := defaultWanderSettings()
	applyTiledMapProps(&wander, raw.Properties)

	collision, ground, err := parseTiledTileLayers(raw, raw.Width, raw.Height)
	if err != nil {
		return nil, nil, wanderSettings{}, err
	}

	ow := &Overworld{
		Path:       path,
		Cols:       raw.Width,
		Rows:       raw.Height,
		TileSize:   tileSize,
		WorldW:     raw.Width * tileSize,
		WorldH:     raw.Height * tileSize,
		Wander:     wander,
		Ground:     append([]int(nil), ground...),
		Collision:  append([]int(nil), collision...),
	}
	ow.Cells = buildCellsFromLayers(collision, ground, ow.Cols, ow.Rows)

	if err := parseTiledObjectLayers(raw, ow); err != nil {
		return nil, nil, wanderSettings{}, err
	}
	if err := validateSanctuaries(ow); err != nil {
		return nil, nil, wanderSettings{}, err
	}

	objects := objectsFromTiledRaw(raw)
	return ow, objects, wander, nil
}

func objectsFromTiledRaw(raw tiledMapFile) []OverrideObject {
	for _, layer := range raw.Layers {
		if layer.Type != "objectgroup" || !strings.EqualFold(layer.Name, "objects") {
			continue
		}
		out := make([]OverrideObject, len(layer.Objects))
		for i, obj := range layer.Objects {
			out[i] = OverrideObject{
				ID: obj.ID, Name: obj.Name, Type: obj.Type,
				X: obj.X, Y: obj.Y, Width: obj.Width, Height: obj.Height,
				Point: obj.Point, Polygon: append([]Vec2(nil), obj.Polygon...),
				Properties: obj.Properties,
			}
		}
		return out
	}
	return nil
}

// MapConfigBase returns the base terrain/objects from a map config file (no overrides).
func MapConfigBase(path string) (MapConfigTerrain, []OverrideObject, error) {
	cfg, err := LoadMapConfig(path)
	if err != nil {
		return MapConfigTerrain{}, nil, err
	}
	return cfg.Terrain, EditorObjectsFromConfig(cfg), nil
}
