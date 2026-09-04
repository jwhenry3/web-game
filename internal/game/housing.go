package game

import (
	"math"
	"strings"
)

// Housing / camp constants. Camp is a world skill that opens a personal house
// instance; the walkable footprint can grow later via upgrades.

const (
	SkillIDCamp = "camp"

	HouseMapCols = 100
	HouseMapRows = 100
	// Starter walkable island (future upgrades expand this).
	HouseWalkCols = 20
	HouseWalkRows = 20

	HouseTileSize = 32

	DefaultHouseStorageCapacity = 40
	DefaultCampSkin             = "basic"
)

// CampSkin is a selectable overworld tent appearance.
type CampSkin struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// CampSkins is the catalog of tent graphics players can choose in their house.
var CampSkins = []CampSkin{
	{ID: "basic", Name: "Canvas"},
	{ID: "crimson", Name: "Crimson"},
	{ID: "azure", Name: "Azure"},
	{ID: "verdant", Name: "Verdant"},
	{ID: "dusk", Name: "Dusk"},
	{ID: "snow", Name: "Snow"},
}

// NormalizeCampSkin returns a known skin id, defaulting to DefaultCampSkin.
func NormalizeCampSkin(id string) string {
	id = strings.TrimSpace(strings.ToLower(id))
	if id == "" {
		return DefaultCampSkin
	}
	for _, s := range CampSkins {
		if s.ID == id {
			return id
		}
	}
	return DefaultCampSkin
}

// SkillCamp pitches a personal camp just south of the caster.
var SkillCamp = Skill{
	ID:          SkillIDCamp,
	Name:        "Camp",
	Description: "Pitch your camp nearby. Interact with the tent to enter your house. Only one camp can be active at a time.",
	WorldOnly:   true,
	CastTimeMs:  1500,
}

// HouseFurniture is a decoration (or future crafting unit) placed inside a house.
type HouseFurniture struct {
	ID    string `json:"id"`
	Col   int    `json:"col"`
	Row   int    `json:"row"`
	Owner string `json:"owner,omitempty"`
	Item  Item   `json:"item"`
}

// HouseWalkOrigin returns the top-left tile of the starter walkable island,
// centered in the 100×100 house map.
func HouseWalkOrigin() (col0, row0 int) {
	col0 = (HouseMapCols - HouseWalkCols) / 2
	row0 = (HouseMapRows - HouseWalkRows) / 2
	return
}

// HouseWalkable reports whether a tile is inside the current walkable footprint.
func HouseWalkable(col, row int) bool {
	col0, row0 := HouseWalkOrigin()
	return col >= col0 && col < col0+HouseWalkCols &&
		row >= row0 && row < row0+HouseWalkRows
}

// HouseDoorTile is the exit interact point near the south edge of the walkable area.
func HouseDoorTile() (col, row int) {
	col0, row0 := HouseWalkOrigin()
	return col0 + HouseWalkCols/2, row0 + HouseWalkRows - 2
}

// HouseStorageTile is the chest interact point near the door.
func HouseStorageTile() (col, row int) {
	dc, dr := HouseDoorTile()
	return dc - 2, dr
}

// HouseSpawnCenter is where players appear when entering the house.
func HouseSpawnCenter() (x, y float64) {
	col0, row0 := HouseWalkOrigin()
	col := col0 + HouseWalkCols/2
	row := row0 + HouseWalkRows/2
	return (float64(col)+0.5)*HouseTileSize, (float64(row)+0.5)*HouseTileSize
}

// ClampHousePos keeps a foot-anchored player position inside the walkable island.
func ClampHousePos(x, y float64) (float64, float64) {
	col0, row0 := HouseWalkOrigin()
	ts := float64(HouseTileSize)
	minX := float64(col0)*ts + PlayerCollisionHalfW
	maxX := float64(col0+HouseWalkCols)*ts - PlayerCollisionHalfW
	minY := float64(row0)*ts + PlayerCollisionHalfH
	maxY := float64(row0+HouseWalkRows) * ts
	if x < minX {
		x = minX
	}
	if x > maxX {
		x = maxX
	}
	if y < minY {
		y = minY
	}
	if y > maxY {
		y = maxY
	}
	return x, y
}

// HouseBoundsWalkableAt checks a foot-anchored box against the walkable house footprint.
func HouseBoundsWalkableAt(cx, cy, halfW, halfH float64) bool {
	ts := float64(HouseTileSize)
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
			if !HouseWalkable(c, r) {
				return false
			}
		}
	}
	return true
}

// SlideMoveHousePlayer applies the player collision box inside the house walkable area.
func SlideMoveHousePlayer(fromX, fromY, toX, toY float64) (float64, float64) {
	if HouseBoundsWalkableAt(toX, toY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		return toX, toY
	}
	if HouseBoundsWalkableAt(toX, fromY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		return toX, fromY
	}
	if HouseBoundsWalkableAt(fromX, toY, PlayerCollisionHalfW, PlayerCollisionHalfH) {
		return fromX, toY
	}
	return fromX, fromY
}

// HousePixelToTile converts house-world pixels to tile indices.
func HousePixelToTile(x, y float64) (col, row int) {
	col = int(x) / HouseTileSize
	row = int(y) / HouseTileSize
	return
}
