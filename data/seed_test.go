package data_test

import (
	"os"
	"path/filepath"
	"testing"

	"clara-mundi/data"
)

func TestMaterializeWritesMissingFiles(t *testing.T) {
	root := t.TempDir()
	if err := data.Materialize(root); err != nil {
		t.Fatal(err)
	}
	cluster := filepath.Join(root, "data", "cluster.json")
	if _, err := os.Stat(cluster); err != nil {
		t.Fatalf("expected cluster.json: %v", err)
	}
	mapPath := filepath.Join(root, "data", "maps", "greenwood.map.json")
	if _, err := os.Stat(mapPath); err != nil {
		t.Fatalf("expected greenwood map: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "data", "accounts.json")); !os.IsNotExist(err) {
		t.Fatal("accounts.json must not be seeded from the binary")
	}

	// Second pass must not overwrite local edits.
	marker := []byte(`{"proxy":{"name":"local-edit"}}`)
	if err := os.WriteFile(cluster, marker, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := data.Materialize(root); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(cluster)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(marker) {
		t.Fatalf("materialize overwrote existing cluster.json")
	}
}
