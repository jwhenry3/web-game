package game

import (
	"math"
	"strings"
	"sync"
	"time"
)

// MapExit is a server-only portal between map processes. It is never sent to clients.
type MapExit struct {
	DestMap      string
	MinC, MinR   int
	MaxC, MaxR   int
	DestX, DestY float64
}

// BorderEdge names a map edge that links to a neighboring map.
type BorderEdge string

const (
	EdgeNorth BorderEdge = "north"
	EdgeSouth BorderEdge = "south"
	EdgeWest  BorderEdge = "west"
	EdgeEast  BorderEdge = "east"
)

// Opposite returns the edge a neighbor crosses back over.
func (e BorderEdge) Opposite() BorderEdge {
	switch e {
	case EdgeNorth:
		return EdgeSouth
	case EdgeSouth:
		return EdgeNorth
	case EdgeWest:
		return EdgeEast
	case EdgeEast:
		return EdgeWest
	}
	return ""
}

// Valid reports whether e is a known edge name.
func (e BorderEdge) Valid() bool { return e.Opposite() != "" }

// MapBorder declares that this map's edge adjoins the given map. Walking into
// the outer walkable band of a bordered edge transfers the player to the
// neighbor's opposite edge at a mirrored position.
type MapBorder struct {
	Edge BorderEdge
	Map  string
}

// BorderBandTiles is how deep into the map (in tiles) a bordered edge triggers
// a transfer. Players land at least this far inside the destination edge so
// arrivals never sit inside the trigger band.
const BorderBandTiles = 2

// Overworld is one map's terrain, spawns, and exits. Each map server holds its own.
type Overworld struct {
	Path              string
	TiledMap          string // client asset path, e.g. maps/greenwood.tmj
	Cols              int
	Rows              int
	TileSize          int
	WorldW            int
	WorldH            int
	Regions           []Region
	SimulationRegions []Region // optional ownership boundaries; falls back to one full-map region
	NPCPatrols        []Patrol
	Cells             []string
	SavePoints        []SavePoint
	JobChangers       []JobChanger
	Wander            wanderSettings
	Exits             []MapExit
	Borders           []MapBorder       // edge adjacency; validated symmetric at boot
	Ground            []int             // composed ground GIDs after overrides
	Collision         []int             // composed collision layer after overrides
	TileOverrides     *MapTileOverrides // sparse tile patches applied on top of the base config
	Objects           []OverrideObject  // composed object layer (base config + override)
	Scene3D           *Scene3D          // authored terrain, prefabs and volumetric collision

	sanctuaryOnce sync.Once
	sanctuaryMask []bool // cols*rows; built lazily — SanctuaryAt runs in NPC workers
}

var loadedOverworld *Overworld

// Loaded returns the overworld installed by LoadOverworld (tests / single-map).
func Loaded() *Overworld { return loadedOverworld }

func (o *Overworld) install() {
	if o == nil {
		return
	}
	loadedOverworld = o
	Regions = o.Regions
	NPCPatrols = o.NPCPatrols
	OverworldCells = o.Cells
	SavePoints = o.SavePoints
	JobChangers = o.JobChangers
	Wander = o.Wander
	loadedOverworldPath = o.Path
	if o.TileSize > 0 {
		TileSize = o.TileSize
	}
	if o.Cols > 0 {
		OverworldCols = o.Cols
	}
	if o.Rows > 0 {
		OverworldRows = o.Rows
	}
	if o.WorldW > 0 {
		OverworldW = o.WorldW
	} else if o.Cols > 0 && o.TileSize > 0 {
		OverworldW = o.Cols * o.TileSize
	}
	if o.WorldH > 0 {
		OverworldH = o.WorldH
	} else if o.Rows > 0 && o.TileSize > 0 {
		OverworldH = o.Rows * o.TileSize
	}
}

func (o *Overworld) RegionByID(id string) (Region, bool) {
	if o == nil {
		return Region{}, false
	}
	for _, r := range o.Regions {
		if r.ID == id {
			return r, true
		}
	}
	return Region{}, false
}

func (o *Overworld) dims() (cols, rows int) {
	cols, rows = o.Cols, o.Rows
	if cols <= 0 {
		cols = OverworldCols
	}
	if rows <= 0 {
		rows = OverworldRows
	}
	return cols, rows
}

func (o *Overworld) tileSz() int {
	if o != nil && o.TileSize > 0 {
		return o.TileSize
	}
	return TileSize
}

func (o *Overworld) TileSizePx() int { return o.tileSz() }

// SanctuaryAt reports whether tile (c,r) is inside any sanctuary region. The
// per-tile mask is built once — NPC walkability checks call this from worker
// goroutines, and a linear region scan per tile does not scale to large maps.
func (o *Overworld) SanctuaryAt(c, r int) bool {
	if o == nil {
		return false
	}
	cols, rows := o.dims()
	if c < 0 || r < 0 || c >= cols || r >= rows {
		return false
	}
	o.sanctuaryOnce.Do(func() {
		mask := make([]bool, cols*rows)
		for _, reg := range o.Regions {
			if !reg.Sanctuary {
				continue
			}
			for rr := maxInt(reg.MinR, 0); rr <= minInt(reg.MaxR, rows-1); rr++ {
				for cc := maxInt(reg.MinC, 0); cc <= minInt(reg.MaxC, cols-1); cc++ {
					if reg.Contains(cc, rr) {
						mask[rr*cols+cc] = true
					}
				}
			}
		}
		o.sanctuaryMask = mask
	})
	return o.sanctuaryMask[r*cols+c]
}

func (o *Overworld) SanctuaryAtWorld(x, y float64) bool {
	ts := float64(o.tileSz())
	c := int(math.Floor(x / ts))
	r := int(math.Floor(y / ts))
	return o.SanctuaryAt(c, r)
}

func (o *Overworld) NPCWalkableTile(c, r int) bool {
	if o.SanctuaryAt(c, r) {
		return false
	}
	return o.WalkableTile(c, r)
}

func (o *Overworld) Cell(c, r int) byte {
	cols, rows := o.dims()
	if o == nil || r < 0 || r >= rows || c < 0 || c >= cols || r >= len(o.Cells) {
		return TileRock
	}
	row := o.Cells[r]
	if c < 0 || c >= len(row) {
		return TileRock
	}
	return row[c]
}

func (o *Overworld) WalkableTile(c, r int) bool {
	switch o.Cell(c, r) {
	case TileHaven, TileGrass, TilePath, TileRuins, TileTree, TileSnow, TileSand, TileIce:
		return true
	default:
		return false
	}
}

func (o *Overworld) WalkableAt(x, y float64) bool {
	t := o.WorldToTile(x, y)
	return o.WalkableTile(t.C, t.R)
}

func (o *Overworld) WorldToTile(x, y float64) Tile {
	ts := float64(o.tileSz())
	return Tile{C: int(math.Floor(x / ts)), R: int(math.Floor(y / ts))}
}

func (o *Overworld) TileCenter(t Tile) Vec2 {
	ts := float64(o.tileSz())
	return Vec2{X: (float64(t.C) + 0.5) * ts, Y: (float64(t.R) + 0.5) * ts}
}

// CircleWalkableAt reports whether a feet-centered circle of radius r sits
// entirely on walkable tiles inside the map.
func (o *Overworld) CircleWalkableAt(cx, cy, radius float64) bool {
	ts := float64(o.tileSz())
	if cx-radius < 0 || cy-radius < 0 ||
		cx+radius > float64(o.WorldW) || cy+radius > float64(o.WorldH) {
		return false
	}
	c0 := int(math.Floor((cx - radius) / ts))
	c1 := int(math.Floor((cx + radius) / ts))
	r0 := int(math.Floor((cy - radius) / ts))
	r1 := int(math.Floor((cy + radius) / ts))
	for r := r0; r <= r1; r++ {
		for c := c0; c <= c1; c++ {
			if o.WalkableTile(c, r) {
				continue
			}
			if circleOverlapsCell(cx, cy, radius, c, r, ts) {
				return false
			}
		}
	}
	return true
}

func (o *Overworld) SlideMovePlayer(fromX, fromY, toX, toY float64) (float64, float64) {
	if o.CircleWalkableAt(toX, toY, PlayerCollisionRadius) {
		return toX, toY
	}
	if o.CircleWalkableAt(toX, fromY, PlayerCollisionRadius) {
		return toX, fromY
	}
	if o.CircleWalkableAt(fromX, toY, PlayerCollisionRadius) {
		return fromX, toY
	}
	return fromX, fromY
}

func (o *Overworld) SavePointByID(id string) (SavePoint, bool) {
	if o == nil || id == "" {
		return SavePoint{}, false
	}
	for _, sp := range o.SavePoints {
		if sp.ID == id {
			return sp, true
		}
	}
	return SavePoint{}, false
}

func (o *Overworld) JobChangerByID(id string) (JobChanger, bool) {
	if o == nil || id == "" {
		return JobChanger{}, false
	}
	for _, jc := range o.JobChangers {
		if jc.ID == id {
			return jc, true
		}
	}
	return JobChanger{}, false
}

func (o *Overworld) SpawnPosition(savePointID string) (float64, float64) {
	if sp, ok := o.SavePointByID(savePointID); ok {
		c := o.TileCenter(sp.Tile)
		return c.X, c.Y
	}
	if len(o.SavePoints) > 0 {
		c := o.TileCenter(o.SavePoints[0].Tile)
		return c.X, c.Y
	}
	return DefaultSpawnX, DefaultSpawnY
}

func (o *Overworld) MapPayload() (tile, cols, rows int, cells string) {
	if o == nil {
		return TileSize, OverworldCols, OverworldRows, ""
	}
	cols, rows = o.dims()
	out := make([]byte, 0, cols*rows)
	for _, row := range o.Cells {
		out = append(out, row...)
	}
	return o.tileSz(), cols, rows, string(out)
}

func (o *Overworld) ExitAt(x, y float64) (MapExit, bool) {
	if o == nil {
		return MapExit{}, false
	}
	t := o.WorldToTile(x, y)
	for _, e := range o.Exits {
		if t.C >= e.MinC && t.C <= e.MaxC && t.R >= e.MinR && t.R <= e.MaxR {
			return e, true
		}
	}
	return MapExit{}, false
}

// BorderCrossingAt reports the map border the player is crossing at (x,y): the
// tile must be walkable and inside the outer band of a bordered edge. Returns
// the neighbor map, the edge crossed on THIS map, and t — the fractional
// position along the edge (0..1, west→east for N/S edges, north→south for
// W/E edges) so the destination can mirror the landing.
func (o *Overworld) BorderCrossingAt(x, y float64) (destMap string, edge BorderEdge, t float64, ok bool) {
	if o == nil || len(o.Borders) == 0 {
		return "", "", 0, false
	}
	tile := o.WorldToTile(x, y)
	cols, rows := o.dims()
	for _, b := range o.Borders {
		var inBand bool
		switch b.Edge {
		case EdgeNorth:
			inBand = tile.R < BorderBandTiles
		case EdgeSouth:
			inBand = tile.R >= rows-BorderBandTiles
		case EdgeWest:
			inBand = tile.C < BorderBandTiles
		case EdgeEast:
			inBand = tile.C >= cols-BorderBandTiles
		}
		if !inBand || !o.WalkableTile(tile.C, tile.R) {
			continue
		}
		if b.Edge == EdgeNorth || b.Edge == EdgeSouth {
			t = x / float64(o.WorldW)
		} else {
			t = y / float64(o.WorldH)
		}
		if t < 0 {
			t = 0
		}
		if t > 1 {
			t = 1
		}
		return b.Map, b.Edge, t, true
	}
	return "", "", 0, false
}

// EntryPoint computes where a player lands when entering this map across the
// given edge at fraction t along it. The point sits just inside the edge
// (past the trigger band) and is nudged along the edge to the nearest
// walkable tile. Falls back to the map spawn if nothing on the edge works.
func (o *Overworld) EntryPoint(edge BorderEdge, t float64) (x, y float64) {
	cols, rows := o.dims()
	ts := float64(o.tileSz())
	if t < 0 {
		t = 0
	}
	if t > 1 {
		t = 1
	}
	// along = tile index along the edge; inset = tiles inward from the rim.
	var along, span int
	var horizontal bool // edge runs horizontally (N/S) or vertically (W/E)
	switch edge {
	case EdgeWest, EdgeEast:
		horizontal = false
		span = rows
		along = int(t * float64(rows-1))
	default:
		horizontal = true
		span = cols
		along = int(t * float64(cols-1))
	}
	insetFor := func(depth int) int {
		// depth tiles inward from the rim on this edge.
		switch edge {
		case EdgeWest:
			return depth
		case EdgeEast:
			return cols - 1 - depth
		case EdgeNorth:
			return depth
		case EdgeSouth:
			return rows - 1 - depth
		}
		return depth
	}
	// Walkable check: (c,r) for horizontal edges is (along-axis, edge-axis).
	// The player collision circle must fit at the tile center, not just the
	// point — otherwise a crossing could land inside blocked geometry.
	walkableAt := func(a, depth int) bool {
		if horizontal {
			return o.CircleWalkableAt((float64(a)+0.5)*ts, (float64(insetFor(depth))+0.5)*ts, PlayerCollisionRadius)
		}
		return o.CircleWalkableAt((float64(insetFor(depth))+0.5)*ts, (float64(a)+0.5)*ts, PlayerCollisionRadius)
	}
	// Nearest walkable along the edge: expand outward from the mirrored index,
	// landing just past the trigger band (depth BorderBandTiles..+2).
	const maxDepth = BorderBandTiles + 3
	for dAlong := 0; dAlong < span; dAlong++ {
		for _, a := range []int{along + dAlong, along - dAlong} {
			if a < 0 || a >= span {
				continue
			}
			for depth := BorderBandTiles; depth <= maxDepth; depth++ {
				if !walkableAt(a, depth) {
					continue
				}
				if horizontal {
					return (float64(a) + 0.5) * ts, (float64(insetFor(depth)) + 0.5) * ts
				}
				return (float64(insetFor(depth)) + 0.5) * ts, (float64(a) + 0.5) * ts
			}
		}
	}
	sx, sy := o.SpawnPosition("")
	return sx, sy
}

// BorderPortalRects returns display rects for the client: the contiguous runs
// of walkable tiles inside each bordered edge's trigger band, so the world map
// / portal glow only marks tiles that actually transfer.
func (o *Overworld) BorderPortalRects() [][4]int {
	var out [][4]int
	cols, rows := o.dims()
	for _, b := range o.Borders {
		// Merge contiguous along-axis indices that have a walkable band tile.
		flush := func(start, end int) {
			if start < 0 || end < start {
				return
			}
			switch b.Edge {
			case EdgeNorth:
				out = append(out, [4]int{start, 0, end, BorderBandTiles - 1})
			case EdgeSouth:
				out = append(out, [4]int{start, rows - BorderBandTiles, end, rows - 1})
			case EdgeWest:
				out = append(out, [4]int{0, start, BorderBandTiles - 1, end})
			case EdgeEast:
				out = append(out, [4]int{cols - BorderBandTiles, start, cols - 1, end})
			}
		}
		span := cols
		if b.Edge == EdgeWest || b.Edge == EdgeEast {
			span = rows
		}
		start, prev := -1, -1
		for a := 0; a < span; a++ {
			open := false
			for d := 0; d < BorderBandTiles; d++ {
				var c, r int
				switch b.Edge {
				case EdgeNorth:
					c, r = a, d
				case EdgeSouth:
					c, r = a, rows-1-d
				case EdgeWest:
					c, r = d, a
				case EdgeEast:
					c, r = cols-1-d, a
				}
				if o.WalkableTile(c, r) {
					open = true
					break
				}
			}
			if open {
				if start < 0 {
					start = a
				}
				prev = a
			} else if start >= 0 {
				flush(start, prev)
				start = -1
			}
		}
		if start >= 0 {
			flush(start, prev)
		}
	}
	return out
}

func (o *Overworld) Pathfind(from, to Tile, region Region) []Vec2 {
	return pathfindWith(o.NPCWalkableTile, from, to, region)
}

// PetPathfind routes a companion under player walk rules: unlike NPCs, pets
// may enter sanctuaries their owner retreats into.
func (o *Overworld) PetPathfind(from, to Tile, region Region) []Vec2 {
	return pathfindWith(o.WalkableTile, from, to, region)
}

func (o *Overworld) PickRandomWanderPath(id string, region Region, from Tile, step int) []Vec2 {
	return pickWanderPath(o.NPCWalkableTile, o.Wander, id, region, from, step)
}

func (o *Overworld) WanderIdleDuration() time.Duration {
	sec := o.Wander.PauseSec
	if sec <= 0 {
		sec = defaultWanderPause
	}
	return time.Duration(sec * float64(time.Second))
}

func (o *Overworld) WanderSpeed() float64 {
	if o.Wander.Speed > 0 {
		return o.Wander.Speed
	}
	return defaultWanderSpeed
}

func normalizeDestMap(id string) string {
	return strings.TrimSpace(id)
}
