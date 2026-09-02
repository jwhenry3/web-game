package game

import (
	"os"
	"path/filepath"
	"runtime"
)

func defaultOverworldPath() string {
	if p := os.Getenv("OVERWORLD_DATA"); p != "" {
		return p
	}
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return "config/overworld.json"
	}
	return filepath.Join(filepath.Dir(file), "..", "..", "config", "overworld.json")
}
