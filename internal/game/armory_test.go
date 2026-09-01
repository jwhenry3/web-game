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

func TestCatalogCoversAllJobs(t *testing.T) {
	for _, job := range AllJobs() {
		skills := SkillsForJob(job.ID)
		if len(skills) != 4 {
			t.Fatalf("%s should have 4 skills, got %d", job.ID, len(skills))
		}
	}
}
