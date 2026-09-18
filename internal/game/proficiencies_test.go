package game

import "testing"

func TestWeaponProficiencyMapping(t *testing.T) {
	cases := map[WeaponType]Proficiency{
		WeaponSword:    ProfSwords,
		WeaponHammer:   ProfMaces,
		WeaponAxe:      ProfAxes,
		WeaponSpear:    ProfSpears,
		WeaponKatana:   ProfKatanas,
		WeaponStaff:    ProfStaves,
		WeaponDagger:   ProfOneHanded,
		WeaponKnuckles: ProfOneHanded,
		WeaponWand:     ProfOneHanded,
		WeaponType(""): ProfOther,
	}
	for w, want := range cases {
		if got := WeaponProficiency(w); got != want {
			t.Fatalf("WeaponProficiency(%q) = %q, want %q", w, got, want)
		}
	}
}

func TestMagicProficiencySchools(t *testing.T) {
	heal := Skill{Heals: true, Power: 1}
	if got := MagicProficiency(heal); got != ProfHealing {
		t.Fatalf("heal skill = %q, want healing", got)
	}
	buff := Skill{Buffs: true, UsesMagic: true, Power: 1}
	if got := MagicProficiency(buff); got != ProfSupport {
		t.Fatalf("buff skill = %q, want support", got)
	}
	enfeeble := Skill{UsesMagic: true, Power: 1, Effects: []SkillEffect{{
		Kind:   EffectStatus,
		Status: &StatusEffectDef{Kind: "weakened", Duration: 10, Potency: 0.2},
	}}}
	if got := MagicProficiency(enfeeble); got != ProfWeakening {
		t.Fatalf("target-status skill = %q, want weakening", got)
	}
	blast := Skill{UsesMagic: true, Power: 2}
	if got := MagicProficiency(blast); got != ProfElemental {
		t.Fatalf("damage skill = %q, want elemental", got)
	}
}

func TestSkillProficiencyDispatch(t *testing.T) {
	if got := SkillProficiency(BasicAttack, WeaponSword); got != ProfSwords {
		t.Fatalf("attack with a sword = %q, want swords", got)
	}
	if got := SkillProficiency(BasicAttack, WeaponDagger); got != ProfOneHanded {
		t.Fatalf("attack with a dagger = %q, want one_handed", got)
	}
	if got := SkillProficiency(SkillDodge, WeaponSword); got != "" {
		t.Fatalf("dodge trains nothing, got %q", got)
	}
	passive := Skill{ID: "p", Passive: &PassiveEffect{EffectMultiplier: 0.1}}
	if got := SkillProficiency(passive, WeaponSword); got != "" {
		t.Fatalf("passives train nothing, got %q", got)
	}
	world := Skill{ID: "w", WorldOnly: true}
	if got := SkillProficiency(world, WeaponSword); got != "" {
		t.Fatalf("field skills train nothing, got %q", got)
	}
}

func TestProficiencyCurve(t *testing.T) {
	if ProfExpToNext(0) != 100 {
		t.Fatalf("untrained level-up cost = %d, want 100", ProfExpToNext(0))
	}
	if ProfExpToNext(5) != 600 {
		t.Fatalf("level 5 level-up cost = %d, want 600", ProfExpToNext(5))
	}
	if got := ProfAccuracyBonus(10); got != 0.10 {
		t.Fatalf("accuracy bonus at 10 = %v, want 0.10", got)
	}
}
