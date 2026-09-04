package combatrealtime

import (
	"testing"
	"time"

	"ffv-web-game/internal/game"
)

func TestInterruptCastRefundsMPAndResetsGCD(t *testing.T) {
	fire, ok := game.FindSkill("blm_fire")
	if !ok {
		t.Fatal("blm_fire missing")
	}
	e := &entity{
		name:  "Mage",
		mp:    20,
		maxMP: 50,
		casting: &activeCast{
			SkillID:  fire.ID,
			TargetID: "enemy-1",
		},
	}
	e.mp -= fire.MPCost
	e.startGCD(time.Now())

	if got := e.abortCast(); got != fire.ID {
		t.Fatalf("abortCast() = %q, want %q", got, fire.ID)
	}

	if e.casting != nil {
		t.Fatal("casting should be cleared")
	}
	if e.mp != 20 {
		t.Fatalf("mp = %d, want 20 after refund", e.mp)
	}
	if !e.gcdReady(time.Now()) {
		t.Fatal("gcd should be reset after interrupt")
	}
}

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
