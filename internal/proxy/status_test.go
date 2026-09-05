package proxy

import (
	"testing"
	"time"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/game"
)

func TestBuildStatusSnapshotNoMapsRunning(t *testing.T) {
	p := New(
		cluster.Config{
			Proxy: cluster.ProxyConfig{Name: "Test Cluster"},
			Exp:   game.DefaultExpRates(),
			Maps: []cluster.MapSpec{
				{ID: "greenwood", Name: "Greenwood"},
				{ID: "frostkeep", Name: "Frostkeep", Enabled: cluster.BoolPtr(false)},
			},
		},
		"",
		nil,
		nil,
		nil,
		"",
	)
	p.startedAt = time.Now().Add(-90 * time.Second)

	snap := p.buildStatusSnapshot()
	if !snap.OK {
		t.Fatal("expected ok")
	}
	if snap.Name != "Test Cluster" {
		t.Fatalf("name = %q", snap.Name)
	}
	if snap.UptimeSec < 89 {
		t.Fatalf("uptime %d", snap.UptimeSec)
	}
	if snap.Players != 0 || snap.Battles != 0 {
		t.Fatalf("players/battles = %d/%d", snap.Players, snap.Battles)
	}
	if len(snap.Maps) != 2 {
		t.Fatalf("maps len %d", len(snap.Maps))
	}
	if snap.Maps[0].Running || !snap.Maps[0].Enabled {
		t.Fatalf("greenwood entry = %+v", snap.Maps[0])
	}
	if snap.Maps[1].Enabled {
		t.Fatalf("frostkeep should be disabled: %+v", snap.Maps[1])
	}
	if snap.Exp.Rate != 1.0 {
		t.Fatalf("exp rate %v", snap.Exp.Rate)
	}
}
