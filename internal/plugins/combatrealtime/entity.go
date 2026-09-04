package combatrealtime

import (
	"time"

	"ffv-web-game/internal/game"
)

type activeCast struct {
	SkillID  string
	TargetID string
	Progress float64
}

type entity struct {
	id, name, kind string
	isPlayer       bool
	x, y           float64
	facingX        float64
	facingY        float64
	hp, maxHP      int
	mp, maxMP      int
	str, mag, agi  int
	weapon         game.WeaponType
	subWeapon      game.WeaponType
	profileName    string
	level          int
	alive          bool
	targetID       string

	skillLevels      map[string]int
	mainJob          game.JobID
	subJob           game.JobID
	unlocked         map[string]bool
	pendingSkillUses map[string]int
	statuses         []game.ActiveStatus
	casting          *activeCast

	gcdReadyAt time.Time
	attackCD   time.Time
	avoidSide  float64 // -1 or +1, stable detour around other NPCs
	dropPoolID string
}

func (e *entity) gcdProgress(now time.Time) float64 {
	if e.gcdReadyAt.IsZero() || !now.Before(e.gcdReadyAt) {
		return 100
	}
	elapsed := gcdDuration - time.Until(e.gcdReadyAt)
	if elapsed < 0 {
		return 0
	}
	pct := 100 * elapsed.Seconds() / gcdDuration.Seconds()
	if pct > 100 {
		return 100
	}
	if pct < 0 {
		return 0
	}
	return pct
}

func (e *entity) gcdReady(now time.Time) bool {
	return e.gcdReadyAt.IsZero() || !now.Before(e.gcdReadyAt)
}

func (e *entity) startGCD(now time.Time) {
	e.gcdReadyAt = now.Add(gcdDuration)
}

func (e *entity) resetGCD() {
	e.gcdReadyAt = time.Time{}
}

func (e *entity) weaponForSkill(skill game.Skill) game.WeaponType {
	if skill.Job != "" && skill.Job == e.subJob && skill.Job != e.mainJob {
		return e.subWeapon
	}
	return e.weapon
}

func castFields(e *entity) (skillID, targetID string, progress float64, castMs int) {
	if e.casting == nil {
		return "", "", 0, 0
	}
	skill, ok := game.FindSkill(e.casting.SkillID)
	if !ok {
		return e.casting.SkillID, e.casting.TargetID, e.casting.Progress, 0
	}
	return e.casting.SkillID, e.casting.TargetID, e.casting.Progress, game.SkillCastTime(skill)
}
