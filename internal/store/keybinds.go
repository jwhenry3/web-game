package store

import (
	"strings"

	"ffv-web-game/internal/game"
)

// Known keybind action ids (movement, interact, hotbar slots, game windows).
var knownKeybindActions map[string]bool

func init() {
	knownKeybindActions = map[string]bool{
		"move_up": true, "move_down": true, "move_left": true, "move_right": true,
		"interact": true,
		"window:character": true, "window:equipment": true, "window:inventory": true,
		"window:skills": true, "window:social": true, "window:map": true,
	}
	for _, slot := range game.HotbarSlotIDs() {
		knownKeybindActions["hotbar:"+slot] = true
	}
}

func DefaultKeybinds() map[string]string {
	out := map[string]string{
		"move_up":          "w",
		"move_down":        "s",
		"move_left":        "a",
		"move_right":       "d",
		"interact":         "Space",
		"window:character": "c",
		"window:equipment": "e",
		"window:inventory": "i",
		"window:skills":    "k",
		"window:social":    "o",
		"window:map":       "m",
	}
	for _, slot := range game.HotbarSlotIDs() {
		switch {
		case strings.HasPrefix(slot, "ctrl+"):
			out["hotbar:"+slot] = "Control+" + strings.TrimPrefix(slot, "ctrl+")
		case strings.HasPrefix(slot, "shift+"):
			out["hotbar:"+slot] = "Shift+" + strings.TrimPrefix(slot, "shift+")
		default:
			out["hotbar:"+slot] = slot
		}
	}
	return out
}

func MergeKeybinds(custom map[string]string) map[string]string {
	out := DefaultKeybinds()
	for k, v := range custom {
		if !knownKeybindActions[k] {
			continue
		}
		v = strings.TrimSpace(v)
		if v != "" {
			out[k] = v
		}
	}
	return out
}

func (p *Profile) KeybindMap() map[string]string {
	if p.Keybinds == nil {
		return DefaultKeybinds()
	}
	return MergeKeybinds(p.Keybinds)
}

func validateKeybinds(binds map[string]string) bool {
	for k, v := range binds {
		if !knownKeybindActions[k] {
			return false
		}
		if strings.TrimSpace(v) == "" {
			return false
		}
	}
	return true
}

func (s *Store) SetKeybinds(name string, binds map[string]string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	if binds == nil {
		binds = map[string]string{}
	}
	if !validateKeybinds(binds) {
		return Profile{}, false
	}
	p.Keybinds = map[string]string{}
	for k, v := range binds {
		p.Keybinds[k] = strings.TrimSpace(v)
	}
	s.save()
	return *p, true
}
