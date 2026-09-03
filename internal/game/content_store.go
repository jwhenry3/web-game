package game

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ContentDir holds shared Game Designer catalogs (entities, prefabs, tilesets).
func ContentDir() string {
	return filepath.Join("data", "content")
}

var validContentKinds = map[string]bool{
	"entities": true,
	"prefabs":  true,
	"tileset":  true,
	"items":    true,
	"quests":   true,
	"jobs":     true,
	"skills":   true,
}

// ValidContentKind reports whether kind is a supported content catalog name.
func ValidContentKind(kind string) bool {
	return validContentKinds[kind]
}

func contentPath(kind string) string {
	return filepath.Join(ContentDir(), kind+".json")
}

type contentEnvelope struct {
	Kind      string          `json:"kind"`
	UpdatedAt string          `json:"updated_at"`
	Data      json.RawMessage `json:"data"`
}

func defaultContent(kind string) json.RawMessage {
	switch kind {
	case "tileset":
		return json.RawMessage("null")
	default:
		return json.RawMessage("[]")
	}
}

func unwrapContent(data []byte) json.RawMessage {
	var env contentEnvelope
	if err := json.Unmarshal(data, &env); err == nil && env.Data != nil {
		return env.Data
	}
	return json.RawMessage(data)
}

// LoadContent reads a content catalog JSON file. Missing files return defaults without error.
func LoadContent(kind string) (json.RawMessage, error) {
	if !ValidContentKind(kind) {
		return nil, fmt.Errorf("unknown content kind %q", kind)
	}
	data, err := os.ReadFile(contentPath(kind))
	if err != nil {
		if os.IsNotExist(err) {
			return defaultContent(kind), nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return defaultContent(kind), nil
	}
	return unwrapContent(data), nil
}

// SaveContent writes catalog JSON to disk.
func SaveContent(kind string, body json.RawMessage) error {
	if !ValidContentKind(kind) {
		return fmt.Errorf("unknown content kind %q", kind)
	}
	if !json.Valid(body) {
		return fmt.Errorf("invalid json")
	}
	if err := os.MkdirAll(ContentDir(), 0o755); err != nil {
		return err
	}
	env := contentEnvelope{
		Kind:      kind,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		Data:      body,
	}
	out, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(contentPath(kind), out, 0o644)
}
