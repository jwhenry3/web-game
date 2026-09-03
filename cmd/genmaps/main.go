// genmaps converts legacy config/overworld*.json paint maps into Tiled .tmj files.
// Run from repo root: go run ./cmd/genmaps
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"ffv-web-game/internal/game"
)

const (
	scale    = 4
	tileSize = 32
	oldCols  = 40
	oldRows  = 30
	newCols  = oldCols * scale
	newRows  = oldRows * scale
)

func main() {
	root := findRoot()
	if err := os.MkdirAll(filepath.Join(root, "maps"), 0o755); err != nil {
		fatal(err)
	}
	baseChip, err := game.LoadBaseChipConfig(filepath.Join(root, game.DefaultBaseChipPath()))
	if err != nil {
		fatal(err)
	}
	if err := copyPipoyaAssets(root); err != nil {
		fatal(err)
	}
	if err := convert(filepath.Join(root, "config", "overworld.json"), filepath.Join(root, "maps", "greenwood.tmj"), baseChip, false); err != nil {
		fatal(err)
	}
	if err := convert(filepath.Join(root, "config", "overworld.north.json"), filepath.Join(root, "maps", "north.tmj"), baseChip, true); err != nil {
		fatal(err)
	}
	// Copy maps to web public assets.
	pub := filepath.Join(root, "web", "public", "assets", "maps")
	if err := os.MkdirAll(pub, 0o755); err != nil {
		fatal(err)
	}
	for _, name := range pipoyaPublicAssets() {
		if err := copyFile(filepath.Join(root, "maps", name), filepath.Join(pub, name)); err != nil {
			fatal(err)
		}
	}
	fmt.Println("Generated maps/greenwood.tmj and maps/north.tmj")
}

func findRoot() string {
	if _, err := os.Stat("config/overworld.json"); err == nil {
		return "."
	}
	if _, err := os.Stat("../../config/overworld.json"); err == nil {
		return "../.."
	}
	return "."
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func copyFile(src, dst string) error {
	return copyFileStream(src, dst)
}

type legacyFile struct {
	Regions     []legacyRegion `json:"regions"`
	NPCs        []legacyNPC    `json:"npcs"`
	SavePoints  []legacyPOI    `json:"savePoints"`
	JobChangers []legacyPOI    `json:"jobChangers"`
	Wander      legacyWander   `json:"wander"`
	Map         legacyPaint    `json:"map"`
	Exits       []legacyExit   `json:"exits"`
}

type legacyRegion struct {
	ID        string `json:"id"`
	MinC      int    `json:"minC"`
	MinR      int    `json:"minR"`
	MaxC      int    `json:"maxC"`
	MaxR      int    `json:"maxR"`
	Sanctuary bool   `json:"sanctuary"`
	Kind      string `json:"kind"`
}

type legacyNPC struct {
	ID, Kind, Name, Region string
	Level                  int
	Home                   [2]int `json:"home"`
}

type legacyPOI struct {
	ID, Name string
	Tile     [2]int `json:"tile"`
}

type legacyWander struct {
	MinDistance int     `json:"minDistance"`
	PauseSec    float64 `json:"pauseSec"`
	Speed       float64 `json:"speed"`
}

type legacyPaint struct {
	BaseTile   string `json:"baseTile"`
	BorderTile string `json:"borderTile"`
	Border     struct {
		Top, Bottom, Left, Right int
	} `json:"border"`
	Fills  []legacyRect  `json:"fills"`
	Stamps []legacyPoint `json:"stamps"`
	Rings  []legacyRect  `json:"rings"`
}

type legacyRect struct {
	C0, R0, C1, R1 int
	Tile           string `json:"tile"`
}

type legacyPoint struct {
	C, R int
	Tile string `json:"tile"`
}

type legacyExit struct {
	DestMap string    `json:"destMap"`
	Tiles   [4]int    `json:"tiles"`
	Dest    [2]float64 `json:"dest"`
}

func convert(src, dst string, baseChip *game.BaseChipConfig, north bool) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	var raw legacyFile
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	// Build scaled terrain grid from legacy paint.
	oldGrid := paintLegacy(raw.Map, raw.NPCs)
	grid := scaledGrid(oldGrid)
	layers := paintPipoyaLayers(grid, baseChip, newCols, newRows)

	// Mark sanctuary regions from legacy haven-like regions.
	regions := make([]tmjObject, 0, len(raw.Regions))
	for _, reg := range raw.Regions {
		sanctuary := reg.Sanctuary || reg.ID == "haven" || reg.ID == "frostgate"
		kind := reg.Kind
		if kind == "" {
			if sanctuary {
				kind = "town"
			} else {
				kind = "wilderness"
			}
		}
		objType := "region"
		if sanctuary {
			objType = "sanctuary"
		}
		regions = append(regions, tmjObject{
			Name: reg.ID, Type: objType,
			X: float64(reg.MinC * scale * tileSize),
			Y: float64((reg.MaxR + 1) * scale * tileSize),
			Width:  float64((reg.MaxC - reg.MinC + 1) * scale * tileSize),
			Height: float64((reg.MaxR - reg.MinR + 1) * scale * tileSize),
			Properties: []tmjProp{
				{Name: "id", Type: "string", Value: reg.ID},
				{Name: "kind", Type: "string", Value: kind},
			},
		})
	}

	// Mark sanctuary towns and add camp sanctuaries around other save points.
	regions = applySanctuaries(regions, raw.SavePoints, raw.Regions)

	objects := append([]tmjObject{}, regions...)

	for _, sp := range raw.SavePoints {
		objects = append(objects, poiObject("save_point", sp.ID, sp.Name, sp.Tile, []tmjProp{
			{Name: "id", Type: "string", Value: sp.ID},
			{Name: "name", Type: "string", Value: sp.Name},
		}))
	}
	for _, jc := range raw.JobChangers {
		objects = append(objects, poiObject("job_changer", jc.ID, jc.Name, jc.Tile, []tmjProp{
			{Name: "id", Type: "string", Value: jc.ID},
			{Name: "name", Type: "string", Value: jc.Name},
		}))
	}
	for _, npc := range raw.NPCs {
		objects = append(objects, poiObject("npc", npc.ID, npc.Name, npc.Home, []tmjProp{
			{Name: "id", Type: "string", Value: npc.ID},
			{Name: "kind", Type: "string", Value: npc.Kind},
			{Name: "name", Type: "string", Value: npc.Name},
			{Name: "level", Type: "int", Value: npc.Level},
			{Name: "region", Type: "string", Value: npc.Region},
		}))
	}
	for _, ex := range raw.Exits {
		minC, minR, maxC, maxR := ex.Tiles[0], ex.Tiles[1], ex.Tiles[2], ex.Tiles[3]
		oldW := float64(oldCols * 40)
		oldH := float64(oldRows * 40)
		newW := float64(newCols * tileSize)
		newH := float64(newRows * tileSize)
		objects = append(objects, tmjObject{
			Type: "exit",
			X:    float64(minC * scale * tileSize),
			Y:    float64((maxR + 1) * scale * tileSize),
			Width:  float64((maxC - minC + 1) * scale * tileSize),
			Height: float64((maxR - minR + 1) * scale * tileSize),
			Properties: []tmjProp{
				{Name: "destMap", Type: "string", Value: ex.DestMap},
				{Name: "destX", Type: "float", Value: ex.Dest[0] * newW / oldW},
				{Name: "destY", Type: "float", Value: ex.Dest[1] * newH / oldH},
			},
		})
	}

	tmj := tmjMap{
		CompressionLevel: -1,
		Type:             "map",
		Version:          "1.10",
		TiledVersion:     "1.10.2",
		Orientation:      "orthogonal",
		RenderOrder:      "right-down",
		Width:            newCols,
		Height:           newRows,
		TileWidth:        tileSize,
		TileHeight:       tileSize,
		Infinite:         false,
		Properties: []tmjProp{
			{Name: "wanderMinDistance", Type: "int", Value: raw.Wander.MinDistance},
			{Name: "wanderPauseSec", Type: "float", Value: raw.Wander.PauseSec},
			{Name: "wanderSpeed", Type: "float", Value: raw.Wander.Speed},
		},
		Tilesets: pipoyaTilesetsTMJ(baseChip),
		Layers: []tmjLayer{
			{ID: 1, Name: "ground", Type: "tilelayer", Width: newCols, Height: newRows, Visible: true, Opacity: 1, Data: layers.Ground},
			{ID: 2, Name: "grass", Type: "tilelayer", Width: newCols, Height: newRows, Visible: true, Opacity: 1, Data: layers.Grass},
			{ID: 3, Name: "water", Type: "tilelayer", Width: newCols, Height: newRows, Visible: true, Opacity: 1, Data: layers.Water},
			{ID: 4, Name: "water_grass", Type: "tilelayer", Width: newCols, Height: newRows, Visible: true, Opacity: 1, Data: layers.WaterGrass},
			{ID: 5, Name: "tree", Type: "tilelayer", Width: newCols, Height: newRows, Visible: true, Opacity: 1, Data: layers.Tree},
			{ID: 6, Name: "collision", Type: "tilelayer", Width: newCols, Height: newRows, Visible: false, Opacity: 1, Data: layers.Collision},
			{ID: 7, Name: "objects", Type: "objectgroup", Visible: true, Objects: objects},
		},
	}
	_ = north
	out, err := json.MarshalIndent(tmj, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(dst, out, 0o644)
}

func applySanctuaries(objs []tmjObject, savePoints []legacyPOI, legacyRegions []legacyRegion) []tmjObject {
	inSanctuary := func(c, r int) bool {
		for _, o := range objs {
			if o.Type != "sanctuary" && !(o.Type == "region" && propBool(o.Properties, "sanctuary")) {
				continue
			}
			minC := int(o.X) / tileSize
			minR := int(o.Y-o.Height) / tileSize
			maxC := int(o.X+o.Width)/tileSize - 1
			maxR := int(o.Y)/tileSize - 1
			if c >= minC && c <= maxC && r >= minR && r <= maxR {
				return true
			}
		}
		return false
	}
	nextID := 9000
	for _, sp := range savePoints {
		c := sp.Tile[0]*scale + scale/2
		r := sp.Tile[1]*scale + scale/2
		if inSanctuary(c, r) {
			continue
		}
		pad := 4 * scale
		minC := (sp.Tile[0]*scale - pad)
		minR := (sp.Tile[1]*scale - pad)
		maxC := (sp.Tile[0]*scale + pad)
		maxR := (sp.Tile[1]*scale + pad)
		if minC < 0 {
			minC = 0
		}
		if minR < 0 {
			minR = 0
		}
		id := sp.ID + "_sanctuary"
		objs = append(objs, tmjObject{
			ID: nextID, Name: id, Type: "sanctuary",
			X: float64(minC * tileSize),
			Y: float64((maxR + 1) * tileSize),
			Width:  float64((maxC-minC+1)*tileSize),
			Height: float64((maxR-minR+1)*tileSize),
			Properties: []tmjProp{
				{Name: "id", Type: "string", Value: id},
				{Name: "kind", Type: "string", Value: "camp"},
			},
		})
		nextID++
	}
	return objs
}

func propBool(props []tmjProp, name string) bool {
	for _, p := range props {
		if p.Name == name {
			if v, ok := p.Value.(bool); ok {
				return v
			}
		}
	}
	return false
}

func poiObject(typ, id, name string, tile [2]int, props []tmjProp) tmjObject {
	c := tile[0]*scale + scale/2
	r := tile[1]*scale + scale/2
	return tmjObject{
		Name: id, Type: typ, Point: true,
		X: float64(c*tileSize) + float64(tileSize)/2,
		Y: float64(r*tileSize) + float64(tileSize)/2,
		Width: 0, Height: 0,
		Properties: props,
	}
}

func isWalkableChar(ch byte) bool {
	switch ch {
	case game.TileHaven, game.TileGrass, game.TilePath, game.TileRuins:
		return true
	default:
		return false
	}
}

func paintLegacy(cfg legacyPaint, npcs []legacyNPC) [][]byte {
	g := make([][]byte, oldRows)
	base := byte(game.TileGrass)
	if cfg.BaseTile != "" {
		base = cfg.BaseTile[0]
	}
	border := byte(game.TileRock)
	if cfg.BorderTile != "" {
		border = cfg.BorderTile[0]
	}
	for r := 0; r < oldRows; r++ {
		g[r] = make([]byte, oldCols)
		for c := 0; c < oldCols; c++ {
			g[r][c] = base
			if r < cfg.Border.Top || r >= oldRows-cfg.Border.Bottom ||
				c < cfg.Border.Left || c >= oldCols-cfg.Border.Right {
				g[r][c] = border
			}
		}
	}
	fill := func(c0, r0, c1, r1 int, ch byte) {
		for r := r0; r <= r1; r++ {
			for c := c0; c <= c1; c++ {
				if r >= 0 && r < oldRows && c >= 0 && c < oldCols {
					g[r][c] = ch
				}
			}
		}
	}
	for _, op := range cfg.Fills {
		if op.Tile == "" {
			continue
		}
		fill(op.C0, op.R0, op.C1, op.R1, op.Tile[0])
	}
	for _, op := range cfg.Rings {
		if op.Tile == "" {
			continue
		}
		ch := op.Tile[0]
		fill(op.C0, op.R0, op.C1, op.R0, ch)
		fill(op.C0, op.R1, op.C1, op.R1, ch)
		fill(op.C0, op.R0, op.C0, op.R1, ch)
		fill(op.C1, op.R0, op.C1, op.R1, ch)
	}
	for _, op := range cfg.Stamps {
		if op.Tile == "" {
			continue
		}
		if op.R >= 0 && op.R < oldRows && op.C >= 0 && op.C < oldCols {
			g[op.R][op.C] = op.Tile[0]
		}
	}
	return g
}

type tmjMap struct {
	CompressionLevel int          `json:"compressionlevel"`
	Type             string       `json:"type"`
	Version          string       `json:"version"`
	TiledVersion     string       `json:"tiledversion"`
	Orientation      string       `json:"orientation"`
	RenderOrder      string       `json:"renderorder"`
	Width            int          `json:"width"`
	Height           int          `json:"height"`
	TileWidth        int          `json:"tilewidth"`
	TileHeight       int          `json:"tileheight"`
	Infinite         bool         `json:"infinite"`
	Properties       []tmjProp    `json:"properties,omitempty"`
	Tilesets         []tmjTileset `json:"tilesets"`
	Layers           []tmjLayer   `json:"layers"`
}

type tmjTileset struct {
	FirstGID    int    `json:"firstgid"`
	Name        string `json:"name"`
	Image       string `json:"image"`
	TileWidth   int    `json:"tilewidth"`
	TileHeight  int    `json:"tileheight"`
	TileCount   int    `json:"tilecount"`
	Columns     int    `json:"columns"`
	ImageWidth  int    `json:"imagewidth"`
	ImageHeight int    `json:"imageheight"`
	Margin      int    `json:"margin"`
	Spacing     int    `json:"spacing"`
}

type tmjLayer struct {
	ID      int         `json:"id"`
	Name    string      `json:"name"`
	Type    string      `json:"type"`
	Width   int         `json:"width,omitempty"`
	Height  int         `json:"height,omitempty"`
	Visible bool        `json:"visible"`
	Opacity float64     `json:"opacity,omitempty"`
	Data    []int       `json:"data,omitempty"`
	Objects []tmjObject `json:"objects,omitempty"`
}

type tmjObject struct {
	ID         int       `json:"id,omitempty"`
	Name       string    `json:"name,omitempty"`
	Type       string    `json:"type"`
	X          float64   `json:"x"`
	Y          float64   `json:"y"`
	Width      float64   `json:"width"`
	Height     float64   `json:"height"`
	Point      bool      `json:"point,omitempty"`
	Properties []tmjProp `json:"properties,omitempty"`
}

type tmjProp struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value any    `json:"value"`
}
