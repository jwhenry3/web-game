package server

import (
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// projector converts authoritative simulation entities into the wire
// protocol.WorldEntity snapshot. It is owned by Hub and must only be used
// from the Hub Run goroutine, matching the serialization of entity state.
type projector struct{}

func newProjector() *projector {
	return &projector{}
}

// project builds the canonical protocol.WorldEntity for e at time now.
// Kind-specific fields (player presence, npc engagement, pet ownership)
// come from the entity's attached components.
func (pr *projector) project(e *entity, now time.Time) protocol.WorldEntity {
	we := protocol.WorldEntity{
		ID: e.ID, Name: e.Name, Kind: string(e.Kind), Sprite: e.Sprite,
		OwnerID: e.OwnerID, Level: e.Level,
		X: e.X, Y: e.Y, Facing: e.Facing,
		HP: e.hp, MaxHP: e.maxHP, MP: e.mp, MaxMP: e.maxMP,
		Alive: e.alive, TargetID: e.targetID,
		Statuses: game.Snapshots(e.statuses),
	}
	switch e.Kind {
	case kindPlayer:
		if cc := clientControlOf(e); cc != nil {
			we.Weapon, we.MainJob, we.SubJob = cc.weaponName, cc.mainJobName, cc.subJobName
			we.Appearance = cc.appearance
			we.Engaged = cc.inCombat
			we.Stamina = cc.staminaNow(now)
			we.InHouse, we.HouseOwner = cc.inHouse, cc.houseOwner
			we.ImmuneUntil = cc.immuneUntil
			we.CastingSkillID = cc.fieldCastSkillID
			we.CastTimeMs = cc.fieldCastTimeMs
			we.CastEndsAt = cc.fieldCastEndsAt
		}
		we.SkillATB = e.gcdProgress(now)
		if e.casting != nil {
			we.CastingSkillID = e.casting.SkillID
			we.CastTargetID = e.casting.TargetID
			we.CastProgress = e.casting.Progress
			we.CastEndsAt = 0
			if sk, ok := game.FindSkill(e.casting.SkillID); ok {
				we.CastTimeMs = game.SkillCastTime(sk)
			}
		}
	case kindNPC:
		if ng := npcEngageOf(e); ng != nil {
			we.Engaged = ng.engaged
		}
		if r := respawnOf(e); r != nil {
			we.Capturable = r.capturable
		}
	case kindPet:
		we.IsAlly = true
	}
	return we
}
