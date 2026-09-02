package game

import "testing"

func TestWarSkillTree(t *testing.T) {
	if SkillPrereq("war_heavy_swing") != "" {
		t.Fatal("root should have no prereq")
	}
	if SkillPrereq("war_berserk") != "war_heavy_swing" || SkillPrereq("war_war_cry") != "war_heavy_swing" {
		t.Fatal("WAR should branch from heavy_swing")
	}
	if SkillPrereq("war_rampage") != "war_berserk" {
		t.Fatal("war_rampage should sit under berserk")
	}
	sk, ok := FindSkill("war_heavy_swing")
	if !ok || sk.Job != JobWAR {
		t.Fatal("war_heavy_swing should belong to WAR")
	}
}

func TestBLMSkillTree(t *testing.T) {
	if SkillPrereq("blm_firaga") != "blm_blizzard" {
		t.Fatal("blm_firaga should be on the blizzard branch")
	}
}

func TestSkillIsRanged(t *testing.T) {
	if SkillIsRanged(BasicAttack) {
		t.Fatal("basic attack is melee")
	}
	if !SkillIsRanged(Skill{ID: "fire", UsesMagic: true}) {
		t.Fatal("magic should be ranged")
	}
	if !SkillIsRanged(Skill{ID: "cure", Heals: true}) {
		t.Fatal("heals should be ranged")
	}
	if !SkillIsRanged(Skill{ID: "throw", Ranged: true}) {
		t.Fatal("explicit throw/missile skills should be ranged")
	}
	if SkillIsRanged(Skill{ID: "war_heavy_swing"}) {
		t.Fatal("physical melee skills without Ranged should stay melee")
	}
	jump, ok := FindSkill("drg_jump")
	if !ok || !jump.Ranged || !SkillIsRanged(jump) {
		t.Fatal("drg_jump should be ranged even with a melee weapon")
	}
	fire, ok := FindSkill("blm_fire")
	if !ok {
		t.Fatal("blm_fire missing")
	}
	if SkillMaxRange(jump) != SpellSkillRange || SkillMaxRange(jump) != SkillMaxRange(fire) {
		t.Fatalf("jump range %v should match spell range %v", SkillMaxRange(jump), SkillMaxRange(fire))
	}
}

func TestCatalogCoversAllJobs(t *testing.T) {
	for _, job := range AllJobs() {
		skills := SkillsForJob(job.ID)
		if len(skills) != 4 {
			t.Fatalf("%s should have 4 skills, got %d", job.ID, len(skills))
		}
	}
}
