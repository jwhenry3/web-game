package main

// gencontinent generates the 100× Clara Mundi overworld: a 1280×960-tile
// continent (10×10 zones of the old 128×96 map size) with climate-driven
// biomes, named regions, settlements, roads, and biome enemy tables.
//
//	usage: go run ./cmd/gencontinent [-seed N] [-ascii] [-png out.png]
//
// Outputs:
//   data/maps/clara_mundi.map.json    — terrain + entities (MapConfig schema)
//   data/world/clara_mundi.world.json — manifest + per-zone simulation regions
//   -png path                         — baked terrain graphic for the map
//                                       window/minimap (same render as the
//                                       proxy's /api/mapimg endpoint)
//
// The generated files are validated through the real loader
// (game.LoadWorldDefinition) before the command exits.

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"clara-mundi/internal/game"
)

const (
	mapPath   = "data/maps/clara_mundi.map.json"
	worldPath = "data/world/clara_mundi.world.json"

	// seaMarginTiles floods a band around the map edge so the continent is
	// always ringed by open ocean — no land may touch the world boundary.
	seaMarginTiles = 24
)

func main() {
	seed := flag.Uint64("seed", 0xc1a4a, "world seed")
	ascii := flag.Bool("ascii", false, "print a downsampled ASCII map (no files written)")
	pngOut := flag.String("png", "", "bake the terrain map graphic to this PNG path (map window/minimap art)")
	flag.Parse()

	ct := newContinent(*seed)
	ct.build()

	if *ascii {
		printASCII(ct)
		return
	}

	if err := writeJSON(mapPath, ct.mapDoc()); err != nil {
		log.Fatalf("write %s: %v", mapPath, err)
	}
	if err := writeJSON(worldPath, ct.worldDoc(mapPath)); err != nil {
		log.Fatalf("write %s: %v", worldPath, err)
	}

	// Validate through the real loader: sanctuary/save-point pairing, patrol
	// homes inside non-sanctuary regions, walkable POI tiles, sim-region
	// exclusivity — everything the server checks at boot.
	w, err := game.LoadWorldDefinition(worldPath)
	if err != nil {
		log.Fatalf("generated world failed validation: %v", err)
	}
	// The continent must be ringed by open water — land touching the edge
	// would read as the world continuing past the map boundary.
	if dry := edgeDryTiles(ct); dry > 0 {
		log.Fatalf("continent touches the world edge: %d non-water tiles on the outer ring", dry)
	}

	// Optional baked map graphic — rendered from the validated load so it is
	// pixel-identical to what /api/mapimg serves at runtime (same scale).
	if *pngOut != "" {
		_, cols, rows, cells := w.Overworld.MapPayload()
		img, err := game.RenderMapPNG(cols, rows, cells, 2)
		if err != nil {
			log.Fatalf("render map image: %v", err)
		}
		if err := os.WriteFile(*pngOut, img, 0o644); err != nil {
			log.Fatalf("write %s: %v", *pngOut, err)
		}
	}

	biomes := map[string]int{}
	for zy := 0; zy < zonesY; zy++ {
		for zx := 0; zx < zonesX; zx++ {
			biomes[ct.zones[zy][zx].biome.kind()]++
		}
	}
	walkable := 0
	for r := 0; r < w.Rows; r++ {
		for c := 0; c < w.Cols; c++ {
			if w.WalkableTile(c, r) {
				walkable++
			}
		}
	}
	fmt.Printf("clara_mundi: %dx%d tiles (%d zones), %d regions, %d sim regions\n",
		mapCols, mapRows, zonesX*zonesY, len(w.Regions), len(w.SimulationRegions))
	fmt.Printf("  settlements=%d save_points=%d job_masters=%d npcs=%d\n",
		len(ct.saves), len(w.SavePoints), len(w.JobChangers), len(w.NPCPatrols))
	fmt.Printf("  walkable=%.1f%%  biomes=%v\n",
		100*float64(walkable)/float64(mapCols*mapRows), biomes)
}

// edgeDryTiles counts non-water cells on the outermost tile ring. Frozen
// sea (ice GID) counts as water here — an iced-over ocean edge still reads
// as the world continuing past the boundary.
func edgeDryTiles(ct *continent) int {
	dry := 0
	water := func(col, r int) bool {
		g := ct.canvas.ground[ct.canvas.idx(col, r)]
		return isWaterGID(g) || g == game.MundiGIDIce
	}
	for col := 0; col < mapCols; col++ {
		if !water(col, 0) {
			dry++
		}
		if !water(col, mapRows-1) {
			dry++
		}
	}
	for r := 1; r < mapRows-1; r++ {
		if !water(0, r) {
			dry++
		}
		if !water(mapCols-1, r) {
			dry++
		}
	}
	return dry
}

// printASCII renders the painted canvas at ~1 char per 10×10 tiles so the
// continent shape can be eyeballed without booting the client. A block shows
// water/rock if it contains ANY (keeps rivers and outcrops visible).
func printASCII(ct *continent) {
	const step = 10
	for r := 0; r < mapRows; r += step {
		var b strings.Builder
		for col := 0; col < mapCols; col += step {
			counts := map[byte]int{}
			for rr := r; rr < r+step && rr < mapRows; rr++ {
				for cc := col; cc < col+step && cc < mapCols; cc++ {
					ch, ok := game.CharFromPipoyaGroundGID(ct.canvas.ground[ct.canvas.idx(cc, rr)])
					if !ok {
						ch = '.'
					}
					counts[ch]++
				}
			}
			var ch byte
			switch {
			case counts['~'] > 0:
				ch = '~'
			case counts['I'] > 0:
				ch = 'I'
			case counts['#'] > 0:
				ch = '#'
			case counts['H'] > 0:
				ch = 'H'
			case counts['T'] > 4:
				ch = 'T'
			case counts[','] > 4:
				ch = ','
			case counts['D'] > 4:
				ch = 'D'
			case counts['S'] > 4:
				ch = 'S'
			default:
				ch = '.'
			}
			b.WriteByte(ch)
		}
		fmt.Println(b.String())
	}
}
