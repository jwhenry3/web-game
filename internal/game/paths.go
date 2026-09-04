package game

import (
	"os"
	"path/filepath"
	"runtime"
)

func DefaultOverworldPath() string {
	return defaultOverworldPath()
}

func defaultOverworldPath() string {
	if p := os.Getenv("OVERWORLD_DATA"); p != "" {
		return p
	}
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return "data/maps/greenwood.map.json"
	}
	return filepath.Join(filepath.Dir(file), "..", "..", "data", "maps", "greenwood.map.json")
}
