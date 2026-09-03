package game

import "fmt"

// NewBlankMapConfig builds a walkable grass map with a full-map sanctuary and spawn crystal.
func NewBlankMapConfig(cols, rows, tileSize int) (*MapConfig, error) {
	if tileSize <= 0 {
		tileSize = defaultMapTileSize
	}
	if cols < 16 || rows < 16 {
		return nil, fmt.Errorf("map size must be at least 16×16")
	}
	if cols > 512 || rows > 512 {
		return nil, fmt.Errorf("map size must be at most 512×512")
	}
	n := cols * rows
	ground := make([]int, n)
	collision := make([]int, n)
	for i := range ground {
		ground[i] = PipoyaGIDGrass
	}
	cx, cy := cols/2, rows/2
	return &MapConfig{
		TileSize: tileSize,
		Cols:     cols,
		Rows:     rows,
		Wander: wanderSettings{
			MinDistance: 8,
			PauseSec:    5,
			Speed:       28,
		},
		Terrain: MapConfigTerrain{
			Ground:    ground,
			Collision: collision,
		},
		Regions: []Region{{
			ID:        "main",
			MinC:      0,
			MinR:      0,
			MaxC:      cols - 1,
			MaxR:      rows - 1,
			Sanctuary: true,
			Kind:      "town",
		}},
		SavePoints: []savePointFile{{
			ID:   "spawn",
			Name: "Spawn Crystal",
			Tile: [2]int{cx, cy},
		}},
		JobChangers: nil,
		NPCs:        nil,
		Exits:       nil,
	Objects: []OverrideObject{
			{
				ID:     1,
				Name:   "main",
				Type:   "region",
				X:      0,
				Y:      float64(rows * tileSize),
				Width:  float64(cols * tileSize),
				Height: float64(rows * tileSize),
				Properties: []tiledProp{
					{Name: "id", Type: "string", Value: "main"},
					{Name: "sanctuary", Type: "bool", Value: true},
					{Name: "kind", Type: "string", Value: "town"},
				},
			},
			{
				ID:    2,
				Name:  "spawn",
				Type:  "save_point",
				X:     (float64(cx) + 0.5) * float64(tileSize),
				Y:     (float64(cy) + 0.5) * float64(tileSize),
				Point: true,
				Properties: []tiledProp{
					{Name: "id", Type: "string", Value: "spawn"},
					{Name: "name", Type: "string", Value: "Spawn Crystal"},
				},
			},
		},
	}, nil
}
