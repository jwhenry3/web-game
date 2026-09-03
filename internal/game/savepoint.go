package game

// Default spawn when no save point is set (haven plaza, tile ~22,22 on scaled map).
const DefaultSpawnX = 720.0
const DefaultSpawnY = 720.0

// SavePoint is an interactable respawn location on the overworld.
type SavePoint struct {
	ID   string
	Name string
	Tile Tile
}

var SavePoints []SavePoint

func SavePointByID(id string) (SavePoint, bool) {
	for _, sp := range SavePoints {
		if sp.ID == id {
			return sp, true
		}
	}
	return SavePoint{}, false
}

// SpawnPosition returns the world coordinates for a profile's save point.
func SpawnPosition(savePointID string) (float64, float64) {
	if savePointID != "" {
		if sp, ok := SavePointByID(savePointID); ok {
			c := TileCenter(sp.Tile)
			return c.X, c.Y
		}
	}
	return DefaultSpawnX, DefaultSpawnY
}
