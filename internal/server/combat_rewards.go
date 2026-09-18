package server

import (
	"fmt"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// ---- rewards ----

// awardKill splits XP/loot among everyone who damaged the NPC, plus a passive
// share for nearby party members who stayed out of the fight.
func (h *Hub) awardKill(n *entity) {
	h.awardKillInternal(n, true)
}

func (h *Hub) awardKillXPOnly(n *entity) {
	h.awardKillInternal(n, false)
}

func (h *Hub) awardKillInternal(n *entity, loot bool) {
	if len(n.contributors) == 0 {
		return
	}
	totalXP := 20 + n.Level*15
	contributors := make([]string, 0, len(n.contributors))
	for id := range n.contributors {
		contributors = append(contributors, id)
	}
	share := totalXP / len(contributors)
	if share < 1 {
		share = 1
	}

	// Party bonus: 2+ members of one party contributing.
	partyCount := map[string]int{}
	for _, id := range contributors {
		if p := h.clientParty[id]; p != "" {
			partyCount[p]++
		}
	}
	bonusParty := ""
	for p, n2 := range partyCount {
		if n2 >= 2 {
			bonusParty = p
			break
		}
	}

	var pools []string
	if r := respawnOf(n); loot && r != nil && r.dropPoolID != "" {
		pools = []string{r.dropPoolID}
	}

	for _, id := range contributors {
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c == nil {
			continue
		}
		xp := share
		if bonusParty != "" && h.clientParty[id] == bonusParty {
			xp = share * (100 + partyInCombatBonusPercent) / 100
		}
		hasSub := false
		if profile, ok := h.store.Get(c.Name); ok && profile.SubJob != "" {
			hasSub = true
		}
		mainXP, subXP := game.DistributeJobXP(xp, hasSub)
		items := game.GenerateVictoryLoot(h.rng, n.Level, 0, pools)
		updated, _, _ := h.store.AwardJobVictory(c.Name, mainXP, subXP, items)
		h.sendWelcome(c, updated)
		msg := fmt.Sprintf("Defeated %s — +%d EXP", n.Name, xp)
		if len(items) > 0 {
			msg += fmt.Sprintf(", found %s", items[0].Name)
		}
		h.send(c, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
			XP: xp, Victory: true, Message: msg,
		})
		// Refresh world level after a level-up.
		if p := h.playerEnt(id); p != nil {
			p.Level = updated.MainJobLevel()
		}
		// Award XP to the battle pet (same base share as the player).
		h.awardPetXP(c, xp)
	}

	// Passive party share for nearby members who didn't fight.
	partyIDs := map[string]bool{}
	for _, id := range contributors {
		if p := h.clientParty[id]; p != "" {
			partyIDs[p] = true
		}
	}
	fought := map[string]bool{}
	for _, id := range contributors {
		fought[id] = true
	}
	passiveXP := share * partyPassiveXPPercent / 100
	if passiveXP < 1 {
		passiveXP = 1
	}
	for pid := range partyIDs {
		party := h.parties[pid]
		if party == nil {
			continue
		}
		for _, memberID := range party.MemberIDs {
			if fought[memberID] {
				continue
			}
			p := h.playerEnt(memberID)
			if p == nil || p.hidden || dist(p.X, p.Y, n.X, n.Y) > partyBattleRange {
				continue
			}
			h.mu.RLock()
			mc := h.clients[memberID]
			h.mu.RUnlock()
			if mc == nil {
				continue
			}
			hasSub := false
			if profile, ok := h.store.Get(mc.Name); ok && profile.SubJob != "" {
				hasSub = true
			}
			pm, ps := game.DistributeJobXP(passiveXP, hasSub)
			updated, _, _ := h.store.AwardJobVictory(mc.Name, pm, ps, nil)
			h.sendWelcome(mc, updated)
			h.send(mc, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
				XP: pm, Passive: true, Victory: true,
				Message: fmt.Sprintf("Party victory — +%d passive EXP (you stayed out of combat).", pm),
			})
		}
	}
}
