package server

import (
	"fmt"
	"math/rand"

	"ffv-web-game/internal/plugins/contracts"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

func (h *Hub) SendToClient(clientID string, msg []byte) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if ok && c.Joined {
		h.sendRaw(c, msg)
	}
}

func (h *Hub) Broadcast(msg []byte) { h.broadcastAll(msg) }

func (h *Hub) SendProfileUpdate(clientID string, profile store.Profile) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	h.sendWelcome(c, profile)
}

func (h *Hub) SendError(clientID, message string) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if ok {
		h.sendError(c, message)
	}
}

func (h *Hub) TickWindow() int64 { return h.tickWindow.Milliseconds() }

func (h *Hub) EnterBattle(clientID, battleID string) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	wp, ok := h.world[clientID]
	if !ok {
		return
	}
	c.BattleID = battleID
	wp.InBattle = true
	wp.BattleID = battleID
	wp.ImmuneUntil = 0
	h.cancelWorldCast(c, wp, "")
	delete(h.battleInvites, clientID)
	if meta := h.battleMeta[battleID]; meta != nil {
		delete(meta.passiveEligible, clientID)
	}
}

func (h *Hub) ReleaseFromBattle(clientID string) { h.releaseFromBattle(clientID) }

func (h *Hub) SyncPlayer(wp *protocol.WorldPlayer) {
	if wp != nil {
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
	}
}

func (h *Hub) ClearBattleInvite(clientID string) { delete(h.battleInvites, clientID) }

func (h *Hub) ParticipantCount(battleID string) int {
	n := 0
	for _, wp := range h.world {
		if wp.InBattle && wp.BattleID == battleID {
			n++
		}
	}
	return n
}

func (h *Hub) MaxPartySize() int { return maxPartySize }

func (h *Hub) ProfileFor(clientID string) (store.Profile, bool) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		return store.Profile{}, false
	}
	p, ok := h.store.Get(c.Name)
	return p, ok
}

func (h *Hub) ClientName(clientID string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if c, ok := h.clients[clientID]; ok {
		return c.Name
	}
	return ""
}

func (h *Hub) WorldPlayer(clientID string) *protocol.WorldPlayer {
	return h.world[clientID]
}

func (h *Hub) NextBattleID() string {
	h.battleSeq++
	return fmt.Sprintf("battle-%d", h.battleSeq)
}

func (h *Hub) BuildVictoryRewards(
	roomID string,
	fighters []contracts.BattleFighter,
	totalXP, level, lootBonus int,
	rng *rand.Rand,
) []protocol.PlayerReward {
	converted := make([]battleFighter, len(fighters))
	for i, f := range fighters {
		converted[i] = battleFighter{ClientID: f.ClientID, Name: f.Name}
	}
	return h.buildVictoryRewards(roomID, converted, totalXP, level, lootBonus, rng)
}

func (h *Hub) BroadcastBattleList() { h.broadcastBattleList() }

func (h *Hub) PromptPartyForBattle(triggerID, battleID string, x, y float64) {
	h.promptPartyForBattle(triggerID, battleID, x, y)
}
