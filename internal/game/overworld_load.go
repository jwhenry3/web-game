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
	Exits      []exitFile       `json:"exits"`
}

type exitFile struct {
	DestMap string  `json:"destMap"`
	Tiles   [4]int  `json:"tiles"` // minC, minR, maxC, maxR
	Dest    [2]float64 `json:"dest"`
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

// LoadOverworldData reads a map file without installing it as the process default.
func LoadOverworldData(path string) (*Overworld, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read overworld %s: %w", path, err)
	}
	var raw overworldFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse overworld %s: %w", path, err)
	}
	ow, err := parseOverworld(raw)
	if err != nil {
		return nil, fmt.Errorf("apply overworld %s: %w", path, err)
	}
	ow.Path = path
	return ow, nil
}

// LoadOverworld reads regions, NPC spawns, wander tuning, and map paint ops from JSON.
func LoadOverworld(path string) error {
	ow, err := LoadOverworldData(path)
	if err != nil {
		return err
	}
	ow.install()
	return nil
}

// OverworldPath returns the JSON file loaded by the most recent LoadOverworld call.
func OverworldPath() string { return loadedOverworldPath }

func parseOverworld(raw overworldFile) (*Overworld, error) {
	if len(raw.Regions) == 0 {
		return nil, fmt.Errorf("regions required")
	}
	ow := &Overworld{
		Regions: raw.Regions,
		Wander:  raw.Wander,
	}

	ow.NPCPatrols = make([]Patrol, 0, len(raw.NPCs))
	for _, n := range raw.NPCs {
		if n.ID == "" || n.Region == "" {
			return nil, fmt.Errorf("npc missing id or region")
		}
		ow.NPCPatrols = append(ow.NPCPatrols, Patrol{
			ID: n.ID, Kind: n.Kind, Name: n.Name, Level: n.Level, Region: n.Region,
			Home: Tile{C: n.Home[0], R: n.Home[1]},
		})
	}

	if ow.Wander.MinDistance > 0 || ow.Wander.PauseSec > 0 || ow.Wander.Speed > 0 {
		// keep parsed wander
	}
	if ow.Wander.PauseSec <= 0 || ow.Wander.Speed <= 0 {
		ow.Wander = Wander
	}
	if ow.Wander.PauseSec <= 0 || ow.Wander.Speed <= 0 {
		return nil, fmt.Errorf("invalid wander settings")
	}

	cells, err := buildOverworldFromPaint(raw.Map, ow.NPCPatrols)
	if err != nil {
		return nil, err
	}
	ow.Cells = cells

	ow.SavePoints = make([]SavePoint, 0, len(raw.SavePoints))
	for _, sp := range raw.SavePoints {
		if sp.ID == "" || sp.Name == "" {
			return nil, fmt.Errorf("save point missing id or name")
		}
		tile := Tile{C: sp.Tile[0], R: sp.Tile[1]}
		if !ow.WalkableTile(tile.C, tile.R) {
			return nil, fmt.Errorf("save point %s tile (%d,%d) not walkable", sp.ID, tile.C, tile.R)
		}
		ow.SavePoints = append(ow.SavePoints, SavePoint{ID: sp.ID, Name: sp.Name, Tile: tile})
	}

	for _, e := range raw.Exits {
		dest := normalizeDestMap(e.DestMap)
		if dest == "" {
			return nil, fmt.Errorf("exit missing destMap")
		}
		minC, minR, maxC, maxR := e.Tiles[0], e.Tiles[1], e.Tiles[2], e.Tiles[3]
		if minC > maxC || minR > maxR {
			return nil, fmt.Errorf("exit to %s has inverted tile rect", dest)
		}
		for c := minC; c <= maxC; c++ {
			for r := minR; r <= maxR; r++ {
				if !ow.WalkableTile(c, r) {
					return nil, fmt.Errorf("exit to %s tile (%d,%d) not walkable", dest, c, r)
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
	return ow, nil
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

func buildOverworldFromPaint(cfg mapPaintFile, patrols []Patrol) ([]string, error) {
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
		for _, p := range patrols {
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
