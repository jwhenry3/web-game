package server

import (
	"os"
	"testing"

	"clara-mundi/internal/game"
)

func TestMain(m *testing.M) {
	if game.OverworldPath() == "" {
		if err := game.LoadOverworld(game.DefaultOverworldPath()); err != nil {
			panic("server tests: " + err.Error())
		}
	}
	os.Exit(m.Run())
}
