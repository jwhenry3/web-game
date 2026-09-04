package server

import (
	"fmt"
	"math/rand"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

const (
	partyBattleRange          = 320.0 // ~8 tiles; must be near the fight to be prompted or earn passive XP
	partyInBattleBonusPercent = 25    // +25% XP when 2+ party members fight together
	partyPassiveXPPercent     = 35    // passive share for nearby party mates who skip the fight
)

type battleMeta struct {
	partyID         string
	passiveEligible map[string]string // clientID -> profile name
}

type battleFighter struct {
	ClientID string
	Name     string
}

// buildVictoryRewards splits XP/loot among fighters and awards passive XP to
// nearby party mates who stayed out of the instance.
func (h *Hub) buildVictoryRewards(
	roomID string,
	fighters []battleFighter,
	totalXP int,
	level int,
	lootBonus int,
	dropPoolIDs []string,
	rng *rand.Rand,
) []protocol.PlayerReward {
	participantIDs := make([]string, len(fighters))
	for i, f := range fighters {
		participantIDs[i] = f.ClientID
	}

	share := totalXP
	if len(fighters) > 1 {
		share = totalXP / len(fighters)
	}
	if share < 1 {
		share = 1
	}

	meta := h.battleMeta[roomID]
	partyMates := 0
	if meta != nil && meta.partyID != "" {
		partyMates = h.partyMatesInBattle(meta.partyID, participantIDs)
	}
	bonus := partyMates >= 2

	fought := map[string]bool{}
	var rewards []protocol.PlayerReward

	for _, f := range fighters {
		xp := share
		if bonus {
			xp = share * (100 + partyInBattleBonusPercent) / 100
		}
		hasSub := false
		if profile, ok := h.store.Get(f.Name); ok && profile.SubJob != "" {
			hasSub = true
		}
		mainXP, subXP := game.DistributeJobXP(xp, hasSub)
		loot := game.GenerateVictoryLoot(rng, level, lootBonus, dropPoolIDs)
		updated, mainLevels, subLevels := h.store.AwardJobVictory(f.Name, mainXP, subXP, loot)
		reward := protocol.PlayerReward{
			PlayerID:        f.ClientID,
			XP:              mainXP,
			SubXP:           subXP,
			LevelsGained: mainLevels,
			SubLevelsGained: subLevels,
			NewLevel:     updated.MainJobLevel(),
			NewXP:        updated.Jobs[updated.MainJob].XP,
			MaxXP:        game.XPToNext(updated.MainJobLevel()),
			Loot:         loot,
			PartyBonus:   bonus,
		}
		if updated.SubJob != "" {
			if prog, ok := updated.Jobs[updated.SubJob]; ok {
				reward.SubNewLevel = prog.Level
				reward.SubNewXP = prog.XP
				reward.SubMaxXP = game.XPToNext(prog.Level)
			}
		}
		rewards = append(rewards, reward)
		fought[f.ClientID] = true
	}

	if meta != nil {
		passiveXP := share * partyPassiveXPPercent / 100
		if passiveXP < 1 {
			passiveXP = 1
		}
		for clientID, name := range meta.passiveEligible {
			if fought[clientID] {
				continue
			}
			hasSub := false
			if profile, ok := h.store.Get(name); ok && profile.SubJob != "" {
				hasSub = true
			}
			passiveMain, passiveSub := game.DistributeJobXP(passiveXP, hasSub)
			updated, mainLevels, subLevels := h.store.AwardJobVictory(name, passiveMain, passiveSub, nil)
			reward := protocol.PlayerReward{
				PlayerID:        clientID,
				XP:              passiveMain,
				SubXP:           passiveSub,
				LevelsGained:    mainLevels,
				SubLevelsGained: subLevels,
				NewLevel:        updated.MainJobLevel(),
				NewXP:           updated.Jobs[updated.MainJob].XP,
				MaxXP:           game.XPToNext(updated.MainJobLevel()),
				Loot:            []game.Item{},
				Passive:         true,
			}
			if updated.SubJob != "" {
				if prog, ok := updated.Jobs[updated.SubJob]; ok {
					reward.SubNewLevel = prog.Level
					reward.SubNewXP = prog.XP
					reward.SubMaxXP = game.XPToNext(prog.Level)
				}
			}
			rewards = append(rewards, reward)
		}
	}

	return rewards
}

func (h *Hub) partyMatesInBattle(partyID string, participantIDs []string) int {
	party := h.parties[partyID]
	if party == nil {
		return 0
	}
	inBattle := map[string]bool{}
	for _, id := range participantIDs {
		inBattle[id] = true
	}
	n := 0
	for _, id := range party.MemberIDs {
		if inBattle[id] {
			n++
		}
	}
	return n
}

func (h *Hub) notifyPassiveRewards(rewards []protocol.PlayerReward) {
	for _, r := range rewards {
		if !r.Passive {
			continue
		}
		h.mu.RLock()
		c := h.clients[r.PlayerID]
		h.mu.RUnlock()
		if c == nil {
			continue
		}
		profile, ok := h.store.Get(c.Name)
		if !ok {
			continue
		}
		h.sendWelcome(c, profile)
		h.send(c, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
			XP: r.XP, Passive: true, Victory: true,
			Message: fmt.Sprintf("Party victory — +%d passive EXP (you stayed out of combat).", r.XP),
		})
	}
}

func (h *Hub) NotifyPassiveRewards(rewards []protocol.PlayerReward) {
	h.notifyPassiveRewards(rewards)
}
