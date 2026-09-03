package game

import (
	"path/filepath"
	"testing"
)

func TestNewBlankMapConfigLoads(t *testing.T) {
	cfg, err := NewBlankMapConfig(16, 16, 32)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.SavePoints) == 0 {
		t.Fatal("blank map needs a save point inside the sanctuary")
	}
	objs := EditorObjectsFromConfig(cfg)
	if len(objs) < 2 {
		t.Fatalf("expected region + save point objects, got %d", len(objs))
	}
	path := filepath.Join(t.TempDir(), "blank.map.json")
	if err := SaveMapConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOverworldFromMapConfig(path); err != nil {
		t.Fatalf("load blank map: %v", err)
	}
}
