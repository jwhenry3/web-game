package game

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	if err := LoadOverworld(defaultOverworldPath()); err != nil {
		panic("game tests: " + err.Error())
	}
	os.Exit(m.Run())
}
