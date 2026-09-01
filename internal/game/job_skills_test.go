package game

import "testing"

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
