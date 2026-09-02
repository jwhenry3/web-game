package combatrealtime

import (
	"testing"

	"ffv-web-game/internal/game"
)

func TestJumpRangeMatchesSpell(t *testing.T) {
	jump, ok := game.FindSkill("drg_jump")
	if !ok {
		t.Fatal("drg_jump missing")
	}
	fire, ok := game.FindSkill("blm_fire")
	if !ok {
		t.Fatal("blm_fire missing")
	}
	r := &Room{}
	actor := &entity{x: 0, y: 0, facingX: 1}
	near := &entity{x: game.SpellSkillRange - 1, y: 0}
	far := &entity{x: game.SpellSkillRange + 1, y: 0}

	if !r.skillHitsTarget(actor, near, fire) || !r.skillHitsTarget(actor, near, jump) {
		t.Fatal("jump and fire should both reach just inside spell range")
	}
	if r.skillHitsTarget(actor, far, fire) || r.skillHitsTarget(actor, far, jump) {
		t.Fatal("jump and fire should both miss just outside spell range")
	}
}
