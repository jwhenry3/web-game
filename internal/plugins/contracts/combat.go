package contracts

import (
	"encoding/json"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// NPCSnapshot is the combat-relevant NPC view used when starting fights.
type NPCSnapshot struct {
	ID        string
	Name      string
	Kind      string
	Level     int
	X, Y      float64
	InBattle  bool
	BattleID  string
	Encounter game.EncounterConfig
}

// CombatPlugin implements one combat ruleset (ATB, realtime, etc.).
type CombatPlugin interface {
	ID() string
	FrontendID() string

	Init(host CombatHost, config map[string]any) error

	OwnsMessage(msg protocol.MessageType) bool
	HandleMessage(clientID string, msg protocol.MessageType, payload json.RawMessage) bool

	StartFromNPC(clientID string, wp *protocol.WorldPlayer, npc NPCSnapshot) (battleID string, ok bool)
	Join(clientID string, battleID string) error
	Leave(clientID string)
	OnDisconnect(clientID string)
	CloseRoom(battleID string)

	BattleInfos(counts map[string]int) []protocol.BattleInfo
	RoomExists(battleID string) bool
	RoomLevel(battleID string) int
}
