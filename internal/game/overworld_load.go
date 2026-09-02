package game

import (
	"encoding/json"
	"fmt"
	"os"
)

type overworldFile struct {
	Regions    []Region         `json:"regions"`
	NPCs       []patrolFile     `json:"npcs"`
	SavePoints []savePointFile  `json:"savePoints"`
	Wander     wanderSettings   `json:"wander"`
	Map        mapPaintFile     `json:"map"`
}

type patrolFile struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	Level  int    `json:"level"`
	Region string `json:"region"`
	Home   [2]int `json:"home"`
}

type savePointFile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Tile [2]int `json:"tile"`
}

type mapPaintFile struct {
	BaseTile         string      `json:"baseTile"`
	BorderTile       string      `json:"borderTile"`
	Border           mapBorder   `json:"border"`
	Fills            []mapRect   `json:"fills"`
	Stamps           []mapPoint  `json:"stamps"`
	Rings            []mapRect   `json:"rings"`
	ReopenNPCHomes   bool        `json:"reopenNpcHomes"`
}

type mapBorder struct {
	Top    int `json:"top"`
	Bottom int `json:"bottom"`
	Left   int `json:"left"`
	Right  int `json:"right"`
}

type mapRect struct {
	C0, R0, C1, R1 int
	Tile           string `json:"tile"`
}

type mapPoint struct {
	C, R int
	Tile string `json:"tile"`
}

// LoadOverworld reads regions, NPC spawns, wander tuning, and map paint ops from JSON.
func LoadOverworld(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read overworld %s: %w", path, err)
	}
	var raw overworldFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("parse overworld %s: %w", path, err)
	}
	if err := applyOverworld(raw); err != nil {
		return fmt.Errorf("apply overworld %s: %w", path, err)
	}
	loadedOverworldPath = path
	return nil
}

// OverworldPath returns the JSON file loaded by the most recent LoadOverworld call.
func OverworldPath() string { return loadedOverworldPath }

func applyOverworld(raw overworldFile) error {
	if len(raw.Regions) == 0 {
		return fmt.Errorf("regions required")
	}
	Regions = raw.Regions

	NPCPatrols = make([]Patrol, 0, len(raw.NPCs))
	for _, n := range raw.NPCs {
		if n.ID == "" || n.Region == "" {
			return fmt.Errorf("npc missing id or region")
		}
		NPCPatrols = append(NPCPatrols, Patrol{
			ID: n.ID, Kind: n.Kind, Name: n.Name, Level: n.Level, Region: n.Region,
			Home: Tile{C: n.Home[0], R: n.Home[1]},
		})
	}

	if raw.Wander.MinDistance > 0 || raw.Wander.PauseSec > 0 || raw.Wander.Speed > 0 {
		Wander = raw.Wander
	}
	if Wander.PauseSec <= 0 || Wander.Speed <= 0 {
		return fmt.Errorf("invalid wander settings")
	}

	cells, err := buildOverworldFromPaint(raw.Map)
	if err != nil {
		return err
	}
	OverworldCells = cells

	SavePoints = make([]SavePoint, 0, len(raw.SavePoints))
	for _, sp := range raw.SavePoints {
		if sp.ID == "" || sp.Name == "" {
			return fmt.Errorf("save point missing id or name")
		}
		tile := Tile{C: sp.Tile[0], R: sp.Tile[1]}
		if !WalkableTile(tile.C, tile.R) {
			return fmt.Errorf("save point %s tile (%d,%d) not walkable", sp.ID, tile.C, tile.R)
		}
		SavePoints = append(SavePoints, SavePoint{ID: sp.ID, Name: sp.Name, Tile: tile})
	}
	return nil
}

func tileByte(s string, fallback byte) (byte, error) {
	if s == "" {
		return fallback, nil
	}
	if len(s) != 1 {
		return 0, fmt.Errorf("tile must be one character, got %q", s)
	}
	return s[0], nil
}

func buildOverworldFromPaint(cfg mapPaintFile) ([]string, error) {
	base, err := tileByte(cfg.BaseTile, TileGrass)
	if err != nil {
		return nil, err
	}
	border, err := tileByte(cfg.BorderTile, TileRock)
	if err != nil {
		return nil, err
	}

	g := make([][]byte, OverworldRows)
	for r := 0; r < OverworldRows; r++ {
		g[r] = bytesRepeat(base, OverworldCols)
		for c := 0; c < OverworldCols; c++ {
			if r < cfg.Border.Top || r >= OverworldRows-cfg.Border.Bottom ||
				c < cfg.Border.Left || c >= OverworldCols-cfg.Border.Right {
				g[r][c] = border
			}
		}
	}

	for _, op := range cfg.Fills {
		ch, err := tileByte(op.Tile, 0)
		if err != nil {
			return nil, err
		}
		fill(g, op.C0, op.R0, op.C1, op.R1, ch)
	}
	for _, op := range cfg.Rings {
		ch, err := tileByte(op.Tile, 0)
		if err != nil {
			return nil, err
		}
		ring(g, op.C0, op.R0, op.C1, op.R1, ch)
	}
	for _, op := range cfg.Stamps {
		ch, err := tileByte(op.Tile, 0)
		if err != nil {
			return nil, err
		}
		stamp(g, op.C, op.R, ch)
	}

	if cfg.ReopenNPCHomes {
		for _, p := range NPCPatrols {
			wp := p.Home
			if wp.C > 0 && wp.C < OverworldCols-1 && wp.R > 1 && wp.R < OverworldRows-2 {
				if p.Region == "haven" {
					g[wp.R][wp.C] = TileHaven
				} else {
					g[wp.R][wp.C] = TileGrass
				}
			}
		}
	}

	out := make([]string, OverworldRows)
	for r, row := range g {
		out[r] = string(row)
	}
	return out, nil
}

var loadedOverworldPath string
