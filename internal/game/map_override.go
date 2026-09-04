package game

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// MapTileOverrides stores sparse tile patches and optional object overrides for a map.
type MapTileOverrides struct {
	MapID     string                    `json:"map_id"`
	Layers    map[string]map[string]int `json:"layers"`
	Objects   []OverrideObject          `json:"objects,omitempty"`
	UpdatedAt string                    `json:"updated_at,omitempty"`
}

// OverrideObject mirrors Tiled object JSON used in the objects layer.
type OverrideObject struct {
	ID         int         `json:"id,omitempty"`
	Name       string      `json:"name,omitempty"`
	Type       string      `json:"type"`
	X          float64     `json:"x"`
	Y          float64     `json:"y"`
	Width      float64     `json:"width"`
	Height     float64     `json:"height"`
	Point      bool        `json:"point,omitempty"`
	Polygon    []Vec2      `json:"polygon,omitempty"`
	Properties []tiledProp `json:"properties,omitempty"`
}

// OverridesDir is where per-map override JSON files are stored.
func OverridesDir() string {
	return filepath.Join("data", "maps", "overrides")
}

func overridePath(mapID string) string {
	return filepath.Join(OverridesDir(), mapID+".json")
}

// MapIDFromPath extracts "greenwood" from "data/maps/greenwood.map.json" or similar.
func MapIDFromPath(path string) string {
	base := filepath.Base(path)
	if strings.HasSuffix(strings.ToLower(base), ".map.json") {
		return strings.TrimSuffix(base, ".map.json")
	}
	return strings.TrimSuffix(base, filepath.Ext(base))
}

// LoadMapOverride reads overrides for a map, or nil if none exist.
func LoadMapOverride(mapID string) (*MapTileOverrides, error) {
	if mapID == "" {
		return nil, nil
	}
	data, err := os.ReadFile(overridePath(mapID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var o MapTileOverrides
	if err := json.Unmarshal(data, &o); err != nil {
		return nil, fmt.Errorf("parse override %s: %w", mapID, err)
	}
	if o.Layers == nil {
		o.Layers = map[string]map[string]int{}
	}
	o.MapID = mapID
	return &o, nil
}

// SaveMapOverride writes overrides to disk.
func SaveMapOverride(o *MapTileOverrides) error {
	if o == nil || o.MapID == "" {
		return fmt.Errorf("override missing map_id")
	}
	if o.Layers == nil {
		o.Layers = map[string]map[string]int{}
	}
	o.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := os.MkdirAll(OverridesDir(), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(o, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(overridePath(o.MapID), data, 0o644)
}

// DeleteMapOverride removes override file for a map.
func DeleteMapOverride(mapID string) error {
	err := os.Remove(overridePath(mapID))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// ApplyMapOverride patches tile layer data in place.
func ApplyMapOverride(layers map[string][]int, override *MapTileOverrides) {
	if override == nil || len(override.Layers) == 0 {
		return
	}
	for layerName, patches := range override.Layers {
		data, ok := layers[layerName]
		if !ok || len(data) == 0 {
			continue
		}
		for idxStr, gid := range patches {
			idx, err := strconv.Atoi(idxStr)
			if err != nil || idx < 0 || idx >= len(data) {
				continue
			}
			data[idx] = gid
		}
	}
}

// DiffMapOverride returns sparse patches where current differs from base.
func DiffMapOverride(mapID string, base, current map[string][]int) *MapTileOverrides {
	out := &MapTileOverrides{
		MapID:  mapID,
		Layers: map[string]map[string]int{},
	}
	for layerName, cur := range current {
		baseLayer, ok := base[layerName]
		if !ok {
			continue
		}
		if len(cur) != len(baseLayer) {
			continue
		}
		patches := map[string]int{}
		for i, gid := range cur {
			if gid != baseLayer[i] {
				patches[strconv.Itoa(i)] = gid
			}
		}
		if len(patches) > 0 {
			out.Layers[layerName] = patches
		}
	}
	return out
}

// CloneLayerMap copies layer slices for diffing.
func CloneLayerMap(src map[string][]int) map[string][]int {
	out := make(map[string][]int, len(src))
	for name, data := range src {
		dup := make([]int, len(data))
		copy(dup, data)
		out[name] = dup
	}
	return out
}
