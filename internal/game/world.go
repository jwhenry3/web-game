package game

import (
	"math"
	"strings"
	"time"
)

const (
	FacingLeft  = "left"
	FacingRight = "right"
)

// MapExit is a server-only portal between map processes. It is never sent to clients.
type MapExit struct {
	DestMap      string
	MinC, MinR   int
	MaxC, MaxR   int
	DestX, DestY float64
}

// FacingFromDeltaX keeps the last left/right facing when there is no horizontal motion.
func FacingFromDeltaX(dx float64, current string) string {
	if dx > 0 {
		return FacingRight
	}
	if dx < 0 {
		return FacingLeft
	}
	if current == FacingLeft {
		return FacingLeft
	}
	return FacingRight
}

// FacingFromExit is the direction a traveler is walking when they cross this zone line.
func FacingFromExit(e MapExit, cols int) string {
	if cols <= 0 {
		cols = OverworldCols
	}
	if (e.MinC+e.MaxC)/2 >= cols/2 {
		return FacingRight
	}
	return FacingLeft
}

// Overworld is one map's terrain, spawns, and exits. Each map server holds its own.
type Overworld struct {
	Path       string
	TiledMap   string // client asset path, e.g. maps/greenwood.tmj
	Cols       int
	Rows       int
	TileSize   int
	WorldW     int
	WorldH     int
	Regions    []Region
	NPCPatrols []Patrol
	Cells      []string
	SavePoints  []SavePoint
	JobChangers []JobChanger
	Wander      wanderSettings
	Exits         []MapExit
	TileOverrides *MapTileOverrides // sparse client/server tile patches
	Ground        []int             // composed ground GIDs after overrides
	Collision     []int             // composed collision layer after overrides
	Objects       []OverrideObject  // composed object layer (base config + override)
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

func (o *Overworld) SanctuaryAt(c, r int) bool {
	if o == nil {
		return false
	}
	for _, reg := range o.Regions {
		if reg.Sanctuary && reg.Contains(c, r) {
			return true
		}
	}
	return false
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
	case TileHaven, TileGrass, TilePath, TileRuins, TileTree:
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

func (o *Overworld) BoundsWalkableAt(cx, cy, halfW, halfH float64) bool {
	ts := float64(o.tileSz())
	left := cx - halfW
	right := cx + halfW
	top := cy - halfH
	bottom := cy
	c0 := int(math.Floor(left / ts))
	c1 := int(math.Floor(right / ts))
	r0 := int(math.Floor(top / ts))
	r1 := int(math.Floor(bottom / ts))
	for r := r0; r <= r1; r++ {
		for c := c0; c <= c1; c++ {
			if !o.WalkableTile(c, r) {
				return false
			}
		}
	}
	return true
}

func (o *Overworld) SlideMovePlayer(fromX, fromY, toX, toY float64) (float64, float64) {
	if o.BoundsWalkableAt(toX, toY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		return toX, toY
	}
	if o.BoundsWalkableAt(toX, fromY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		return toX, fromY
	}
	if o.BoundsWalkableAt(fromX, toY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
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

func (o *Overworld) Pathfind(from, to Tile, region Region) []Vec2 {
	return pathfindWith(o.NPCWalkableTile, from, to, region)
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
