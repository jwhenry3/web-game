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
func FacingFromExit(e MapExit) string {
	if (e.MinC+e.MaxC)/2 >= OverworldCols/2 {
		return FacingRight
	}
	return FacingLeft
}

// Overworld is one map's terrain, spawns, and exits. Each map server holds its own.
type Overworld struct {
	Path       string
	Regions    []Region
	NPCPatrols []Patrol
	Cells      []string
	SavePoints []SavePoint
	Wander     wanderSettings
	Exits      []MapExit
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
	Wander = o.Wander
	loadedOverworldPath = o.Path
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

func (o *Overworld) Cell(c, r int) byte {
	if o == nil || r < 0 || r >= OverworldRows || c < 0 || c >= OverworldCols || r >= len(o.Cells) {
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
	case TileHaven, TileGrass, TilePath, TileRuins:
		return true
	default:
		return false
	}
}

func (o *Overworld) WalkableAt(x, y float64) bool {
	t := WorldToTile(x, y)
	return o.WalkableTile(t.C, t.R)
}

func (o *Overworld) BoundsWalkableAt(cx, cy, halfW, halfH float64) bool {
	left := cx - halfW
	right := cx + halfW
	top := cy - halfH
	bottom := cy
	c0 := int(math.Floor(left / TileSize))
	c1 := int(math.Floor(right / TileSize))
	r0 := int(math.Floor(top / TileSize))
	r1 := int(math.Floor(bottom / TileSize))
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

func (o *Overworld) SpawnPosition(savePointID string) (float64, float64) {
	if sp, ok := o.SavePointByID(savePointID); ok {
		c := TileCenter(sp.Tile)
		return c.X, c.Y
	}
	return DefaultSpawnX, DefaultSpawnY
}

func (o *Overworld) MapPayload() (tile, cols, rows int, cells string) {
	if o == nil {
		return TileSize, OverworldCols, OverworldRows, ""
	}
	out := make([]byte, 0, OverworldCols*OverworldRows)
	for _, row := range o.Cells {
		out = append(out, row...)
	}
	return TileSize, OverworldCols, OverworldRows, string(out)
}

func (o *Overworld) ExitAt(x, y float64) (MapExit, bool) {
	if o == nil {
		return MapExit{}, false
	}
	t := WorldToTile(x, y)
	for _, e := range o.Exits {
		if t.C >= e.MinC && t.C <= e.MaxC && t.R >= e.MinR && t.R <= e.MaxR {
			return e, true
		}
	}
	return MapExit{}, false
}

func (o *Overworld) Pathfind(from, to Tile, region Region) []Vec2 {
	return pathfindWith(o.WalkableTile, from, to, region)
}

func (o *Overworld) PickRandomWanderPath(id string, region Region, from Tile, step int) []Vec2 {
	return pickWanderPath(o.WalkableTile, o.Wander, id, region, from, step)
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
