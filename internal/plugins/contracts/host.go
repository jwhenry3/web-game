package contracts

import (
	"math/rand"

	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

// BattleFighter links a combat client to its persistence profile.
type BattleFighter struct {
	ClientID string
	Name     string
}

// CombatHost is the hub surface combat plugins may call. It keeps plugins
// decoupled from the server package while preserving thread-safe teardown.
type CombatHost interface {
	SendToClients(ids []string, msg []byte)
	SendToClient(clientID string, msg []byte)
	SendError(clientID, message string)
	Broadcast(msg []byte)
	SendProfileUpdate(clientID string, profile store.Profile)

	Profiles() *store.Store
	BattleSpeed() float64
	TickWindow() int64 // milliseconds

	EnterBattle(clientID, battleID string)
	ReleaseFromBattle(clientID string)
	BroadcastBattleList()
	SyncPlayer(wp *protocol.WorldPlayer)
	PromptPartyForBattle(triggerID, battleID string, x, y float64)
	ClearBattleInvite(clientID string)

	FinishBattle(roomID string, participantIDs []string, victory bool)
	BuildVictoryRewards(roomID string, fighters []BattleFighter, totalXP, level, lootBonus int, dropPoolIDs []string, rng *rand.Rand) []protocol.PlayerReward
	NotifyPassiveRewards(rewards []protocol.PlayerReward)

	ParticipantCount(battleID string) int
	MaxPartySize() int
	ProfileFor(clientID string) (store.Profile, bool)
	ClientName(clientID string) string
	WorldPlayer(clientID string) *protocol.WorldPlayer
	NextBattleID() string
}
