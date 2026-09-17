package mapnode

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/store"
)

func TestStartWorldMissingConfig(t *testing.T) {
	spec := cluster.WorldSpec{
		ID:     "missing",
		Name:   "Missing",
		Config: "testdata/does-not-exist.server.json",
	}
	_, err := StartWorld(spec, store.Load(""), store.LoadAccounts(""))
	if err == nil {
		t.Fatalf("expected error for missing server config")
	}
}

func TestStartWorld(t *testing.T) {
	tmp := t.TempDir()
	overworld := filepath.Join(tmp, "world.json")
	ow := `{
  "regions": [
    {"id": "all", "minC": 0, "minR": 0, "maxC": 10, "maxR": 10}
  ],
  "wander": {"minDistance": 8, "pauseSec": 5, "speed": 28},
  "map": {}
}`
	if err := os.WriteFile(overworld, []byte(ow), 0o644); err != nil {
		t.Fatal(err)
	}

	serverPath := filepath.Join(tmp, "server.json")
	payload := fmt.Sprintf(`{"server":{"overworld":%q}}`, overworld)
	if err := os.WriteFile(serverPath, []byte(payload), 0o644); err != nil {
		t.Fatal(err)
	}

	spec := cluster.WorldSpec{
		ID:     "singletest",
		Name:   "Single Test",
		Config: serverPath,
	}
	node, err := StartWorld(spec, store.Load(""), store.LoadAccounts(""))
	if err != nil {
		t.Fatalf("StartWorld: %v", err)
	}
	defer node.Stop()

	if node.World == nil {
		t.Fatalf("expected node.World to be set")
	}
	if node.OW == nil {
		t.Fatalf("expected node.OW to be set")
	}
	if node.Hub == nil {
		t.Fatalf("expected node.Hub to be set")
	}
	if node.OW != node.World.Overworld {
		t.Errorf("expected hub to be configured with the same overworld from the world definition")
	}
	if len(node.World.SimulationRegions) == 0 {
		t.Fatalf("expected at least one simulation region in world mode")
	}
	if node.Spec.ID != spec.ID {
		t.Errorf("Spec.ID = %q, want %q", node.Spec.ID, spec.ID)
	}
	if node.WorldSpec.ID != spec.ID {
		t.Errorf("WorldSpec.ID = %q, want %q", node.WorldSpec.ID, spec.ID)
	}
	if node.Hub.MapID() != spec.ID {
		t.Errorf("Hub.MapID() = %q, want %q", node.Hub.MapID(), spec.ID)
	}
}
