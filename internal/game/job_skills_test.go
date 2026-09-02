package game

import "testing"

func TestGeneralFieldSkillsInCatalog(t *testing.T) {
	ret, ok := FindSkill(SkillIDReturn)
	if !ok || !ret.WorldOnly {
		t.Fatal("return should be a world-only skill")
	}
	tp, ok := FindSkill(SkillIDTeleport)
	if !ok || !tp.WorldOnly {
		t.Fatal("teleport should be a world-only skill")
	}
	if SkillCastTime(tp) != TeleportCastTimeMs {
		t.Fatalf("teleport cast %d, want %d", SkillCastTime(tp), TeleportCastTimeMs)
	}
}

func TestRootSkillID(t *testing.T) {
	cases := map[JobID]string{
		JobWAR: "war_heavy_swing",
		JobBLM: "blm_fire",
		JobBRD: "brd_minne",
		JobWHM: "whm_cure",
		JobTHF: "thf_steal",
	}
	for job, want := range cases {
		if got := RootSkillID(job); got != want {
			t.Errorf("RootSkillID(%s) = %q, want %q", job, got, want)
		}
	}
}
