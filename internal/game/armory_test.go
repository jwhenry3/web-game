package game

import "testing"

func TestVanguardSkillTree(t *testing.T) {
	if SkillPrereq("van_cuneus") != "" {
		t.Fatal("root should have no prereq")
	}
	if SkillPrereq("van_furor_linea") != "van_cuneus" || SkillPrereq("van_clamor_castra") != "van_cuneus" {
		t.Fatal("Vanguard should branch from Wedge Guard")
	}
	if SkillPrereq("van_impetus_acies") != "van_clamor_castra" {
		t.Fatal("Line Hold should sit under War Cry")
	}
}

func TestHexwrightSkillTree(t *testing.T) {
	if SkillPrereq("hex_ignis_maius") != "hex_gelu_hex" {
		t.Fatal("Inferno should be on the Frost Brand branch")
	}
}

func TestSkillIsRanged(t *testing.T) {
	if SkillIsRanged(BasicAttack) {
		t.Fatal("basic attack is melee")
	}
	fire, ok := FindSkill("hex_ignis_hex")
	if !ok || !SkillIsRanged(fire) {
		t.Fatal("hex fire should be ranged")
	}
	jump, ok := FindSkill("lnc_saltus_hasta")
	if !ok || !jump.Ranged || !SkillIsRanged(jump) {
		t.Fatal("spear leap should be ranged")
	}
	if SkillMaxRange(jump) != SpellSkillRange {
		t.Fatalf("jump range %v", SkillMaxRange(jump))
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
