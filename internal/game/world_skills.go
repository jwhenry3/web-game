package game

import "sync"

const (
	SkillIDReturn   = "return"
	SkillIDTeleport = "teleport"

	// TeleportCastTimeMs is the field-cast duration; moving interrupts it.
	TeleportCastTimeMs = 3000
)

// SkillReturn warps a hero to their set save crystal. All jobs learn it.
var SkillReturn = Skill{
	ID:          SkillIDReturn,
	Name:        "Return",
	Description: "Warp to your set save crystal. Use from the hotbar in the field.",
	WorldOnly:   true,
}

// SkillTeleport opens fast travel to crystals the hero has attuned.
var SkillTeleport = Skill{
	ID:          SkillIDTeleport,
	Name:        "Teleport",
	Description: "Fast travel to a save crystal you have attuned. Takes 3 seconds; moving cancels the cast.",
	WorldOnly:   true,
	CastTimeMs:  TeleportCastTimeMs,
}

// RegisteredSavePoint is a crystal known to the cluster, including which map owns it.
type RegisteredSavePoint struct {
	ID      string
	Name    string
	MapID   string
	MapName string
	X, Y    float64
}

var (
	savePointMu  sync.RWMutex
	savePointReg = map[string]RegisteredSavePoint{}
)

// RegisterSavePoints indexes one map's crystals for Return / Teleport.
func RegisterSavePoints(mapID, mapName string, points []SavePoint) {
	if mapID == "" {
		return
	}
	savePointMu.Lock()
	defer savePointMu.Unlock()
	for _, sp := range points {
		c := TileCenter(sp.Tile)
		savePointReg[sp.ID] = RegisteredSavePoint{
			ID: sp.ID, Name: sp.Name, MapID: mapID, MapName: mapName, X: c.X, Y: c.Y,
		}
	}
}

// UnregisterSavePointsForMap removes crystals owned by mapID from the cluster index.
func UnregisterSavePointsForMap(mapID string) {
	if mapID == "" {
		return
	}
	savePointMu.Lock()
	defer savePointMu.Unlock()
	for id, sp := range savePointReg {
		if sp.MapID == mapID {
			delete(savePointReg, id)
		}
	}
}

// LookupSavePoint returns a registered crystal by id.
func LookupSavePoint(id string) (RegisteredSavePoint, bool) {
	savePointMu.RLock()
	defer savePointMu.RUnlock()
	sp, ok := savePointReg[id]
	return sp, ok
}
