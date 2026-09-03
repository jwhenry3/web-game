package server

import (
	"encoding/json"
	"testing"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
)

func TestSetJobsRequiresJobChangerProximity(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	if len(game.JobChangers) == 0 {
		t.Fatal("expected job changers from overworld data")
	}
	jc := game.JobChangers[0]
	center := game.TileCenter(jc.Tile)

	payload := protocol.SetJobsPayload{
		MainJob:      string(game.JobBLM),
		SubJob:       "",
		JobChangerID: jc.ID,
	}
	raw, _ := json.Marshal(payload)
	h.handleSetJobs(c, raw)
	if profile, ok := h.store.Get(c.Name); ok && profile.MainJob == string(game.JobBLM) {
		t.Fatal("should not change jobs from far away")
	}

	wp.X, wp.Y = center.X, center.Y
	h.handleSetJobs(c, raw)
	profile, ok := h.store.Get(c.Name)
	if !ok || profile.MainJob != string(game.JobBLM) {
		t.Fatalf("expected main job BLM near job changer, got %+v", profile)
	}
}

func TestSetJobsRequiresJobChangerID(t *testing.T) {
	h, c, wp := testHubWithPlayer(t, 400, 400)
	if len(game.JobChangers) == 0 {
		t.Fatal("expected job changers")
	}
	jc := game.JobChangers[0]
	center := game.TileCenter(jc.Tile)
	wp.X, wp.Y = center.X, center.Y

	raw, _ := json.Marshal(protocol.SetJobsPayload{MainJob: string(game.JobMNK), SubJob: ""})
	h.handleSetJobs(c, raw)
	profile, ok := h.store.Get(c.Name)
	if !ok {
		t.Fatal("profile missing")
	}
	if profile.MainJob == string(game.JobMNK) {
		t.Fatal("set_jobs without job_changer_id should be rejected")
	}
}
