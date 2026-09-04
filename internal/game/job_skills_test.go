package game

import "testing"

func TestGeneralFieldSkillsInCatalog(t *testing.T) {
	ret, ok := FindSkill(SkillIDReturn)
	if !ok || !ret.WorldOnly {
		t.Fatal("return should be a world-only skill")
	}
	tp, ok := FindSkill(SkillIDPort)
	if !ok || !tp.WorldOnly {
		t.Fatal("port should be a world-only skill")
	}
	camp, ok := FindSkill(SkillIDCamp)
	if !ok || !camp.WorldOnly {
		t.Fatal("camp should be a world-only skill")
	}
	if SkillCastTime(tp) != FieldCastTimeMs {
		t.Fatalf("port cast %d, want %d", SkillCastTime(tp), FieldCastTimeMs)
	}
	if SkillCastTime(ret) != FieldCastTimeMs {
		t.Fatalf("return cast %d, want %d", SkillCastTime(ret), FieldCastTimeMs)
	}
}

func TestRootSkillID(t *testing.T) {
	cases := map[JobID]string{
		JobVAN: "van_cuneus",
		JobHEX: "hex_ignis_hex",
		JobCAN: "can_carmen_tutus",
		JobSAN: "san_sanare",
		JobCUT: "cut_surripere",
	}
	for job, want := range cases {
		if got := RootSkillID(job); got != want {
			t.Errorf("RootSkillID(%s) = %q, want %q", job, got, want)
		}
	}
}
