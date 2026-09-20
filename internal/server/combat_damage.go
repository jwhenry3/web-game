package server

import (
	"fmt"
	"time"

	"clara-mundi/internal/protocol"
)

// Enmity bookkeeping and player defeat: threat splashing for ally-targeted
// actions, top-enmity lookups for NPC retargeting, and the respawn flow when
// a player falls. The damage-application chain itself (applyDamage,
// applyDamageMsg, applyHeal, kill) lives with the entity core in entity.go.

// splashEnmity credits threat on every engaged enemy that considers `e`
// attackable — self/ally actions (cures, buffs, items) raise enmity with the
// whole fight, not just one target.
func (h *Hub) splashEnmity(e *entity, amount int) {
	if e == nil || amount <= 0 {
		return
	}
	h.eachEntity(kindNPC, func(n *entity) {
		ng := npcEngageOf(n)
		if ng == nil || !ng.engaged || !h.canAttack(n, e) {
			return
		}
		h.addEnmity(n, e, amount)
	})
}

// topEnmity returns the attackable entity holding the most threat on e's
// enmity table, or nil when the table is empty or fully stale.
func (h *Hub) topEnmity(e *entity) *entity {
	var best *entity
	bestV := 0
	for id, v := range e.enmity {
		t := h.ent(id)
		if !h.canAttack(e, t) {
			continue
		}
		if v > bestV || best == nil {
			best, bestV = t, v
		}
	}
	return best
}

// defeatPlayer respawns a fallen player at their save point and drops them
// from every fight. Invoked from clientControl.OnDeath (via h.kill).
func (h *Hub) defeatPlayer(clientID string) {
	e := h.playerEnt(clientID)
	cc := clientControlOf(e)
	if e == nil || cc == nil {
		return
	}
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: clientID, TargetID: clientID,
		Message: fmt.Sprintf("%s was defeated", e.Name),
	}, e.X, e.Y)
	e.casting = nil
	e.statuses = nil
	e.targetID = ""
	e.engageID = ""
	cc.inCombat = false
	wasMounted := cc.mounted
	cc.mounted, cc.mountSprite = false, ""
	if wasMounted {
		h.petSyncDirty = true // resummon the stabled battle pet
	}
	h.flushSkillUsage(e)
	for _, n := range h.entities {
		if n.Kind == kindNPC {
			delete(n.contributors, clientID)
			delete(n.enmity, clientID)
		}
	}
	// Restore and respawn.
	e.alive = true
	e.hp = e.maxHP
	e.mp = e.maxMP
	cc.stamina = staminaMax
	cc.staminaAt = time.Now()
	h.respawnAtSavePoint(clientID)
	h.grantBattleImmunity(e)
	if wasMounted {
		// Every observer must drop the mount visual, not just owner+party.
		h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, h.entitySync(e)))
	} else {
		h.sendPlayerSync(e)
	}
	h.mu.RLock()
	c := h.clients[clientID]
	h.mu.RUnlock()
	if c != nil {
		if profile, ok := h.store.Get(c.Name); ok {
			h.sendProfileRefresh(c, profile)
		}
	}
}
