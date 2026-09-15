package combatrealtime

import (
	"testing"
	"time"

	"clara-mundi/internal/game"
)

func TestInterruptCastRefundsMPAndResetsGCD(t *testing.T) {
	fire, ok := game.FindSkill("hex_ignis_hex")
	if !ok {
		t.Fatal("hex_ignis_hex missing")
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

func TestMeleeIgnoresFacing(t *testing.T) {
	r := &Room{}
	actor := &entity{x: 0, y: 0, facingX: 1} // facing +x
	behind := &entity{x: -50, y: 0}          // inside melee reach, behind actor
	beyond := &entity{x: -(attackRange + enemyRadius + 1), y: 0}

	if !r.skillHitsTarget(actor, behind, game.BasicAttack) {
		t.Fatal("melee should hit a target inside reach regardless of facing")
	}
	if r.skillHitsTarget(actor, beyond, game.BasicAttack) {
		t.Fatal("melee should miss beyond attackRange+enemyRadius")
	}
}

func TestFaceToward(t *testing.T) {
	actor := &entity{x: 0, y: 0, facingX: 1}
	target := &entity{x: -30, y: 40}
	faceToward(actor, target)
	if actor.facingX >= 0 || actor.facingY <= 0 {
		t.Fatalf("actor should face the target, got (%v, %v)", actor.facingX, actor.facingY)
	}
}

func TestSpellAndSpearRange(t *testing.T) {
	jump, ok := game.FindSkill("lnc_saltus_hasta")
	if !ok {
		t.Fatal("lnc_saltus_hasta missing")
	}
	fire, ok := game.FindSkill("hex_ignis_hex")
	if !ok {
		t.Fatal("hex_ignis_hex missing")
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
