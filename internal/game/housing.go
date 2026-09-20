package game

import (
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
	Target:      TargetNone,
	Effects:     []SkillEffect{{Kind: EffectWorld, World: "camp"}},
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
	return (float64(col) + 0.5) * HouseTileSize, (float64(row) + 0.5) * HouseTileSize
}

// NewHouseOverworld builds the instance overworld for a house interior: a
// HouseMapCols×HouseMapRows rock map with the walkable island at
// HouseWalkOrigin. House hubs run it through SetMap, so movement, collision,
// pathfinding, and pet wander all use the standard Overworld machinery.
func NewHouseOverworld() *Overworld {
	cells := make([]string, HouseMapRows)
	for r := 0; r < HouseMapRows; r++ {
		row := make([]byte, HouseMapCols)
		for c := 0; c < HouseMapCols; c++ {
			if HouseWalkable(c, r) {
				row[c] = TileGrass
			} else {
				row[c] = TileRock
			}
		}
		cells[r] = string(row)
	}
	return &Overworld{
		Path:     "house",
		Cols:     HouseMapCols,
		Rows:     HouseMapRows,
		TileSize: HouseTileSize,
		WorldW:   HouseMapCols * HouseTileSize,
		WorldH:   HouseMapRows * HouseTileSize,
		Cells:    cells,
	}
}
