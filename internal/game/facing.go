package game

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
)

// Facing yaw is a continuous Y-axis rotation in radians (Three.js model space).
//
//	0      north (−map Y / −world Z)
//	−π/2   east  (+map X)
//	 π     south (+map Y)
//	 π/2   west  (−map X)
const (
	FacingYawNorth   = 0.0
	FacingYawEast    = -math.Pi / 2
	FacingYawSouth   = math.Pi
	FacingYawWest    = math.Pi / 2
	FacingYawDefault = FacingYawSouth
)

// Legacy string constants — only for profile migration / old tests.
const (
	FacingLeft      = "left"
	FacingRight     = "right"
	FacingUp        = "up"
	FacingDown      = "down"
	FacingUpLeft    = "up-left"
	FacingUpRight   = "up-right"
	FacingDownLeft  = "down-left"
	FacingDownRight = "down-right"
)

// NormalizeYaw wraps to (−π, π].
func NormalizeYaw(yaw float64) float64 {
	if math.IsNaN(yaw) || math.IsInf(yaw, 0) {
		return FacingYawDefault
	}
	const twoPi = 2 * math.Pi
	yaw = math.Mod(yaw+math.Pi, twoPi)
	if yaw < 0 {
		yaw += twoPi
	}
	return yaw - math.Pi
}

// FacingYawFromDelta derives model yaw from map-space motion (+x right, +y down).
// Zero motion keeps current (default south).
func FacingYawFromDelta(dx, dy, current float64) float64 {
	if math.Hypot(dx, dy) < 1e-9 {
		return NormalizeYaw(current)
	}
	// Match Three.js facingYaw used by KayKit: modelYaw = −atan2(dx, −dy).
	return NormalizeYaw(-math.Atan2(dx, -dy))
}

// ResolveFacingYaw prefers a client-supplied yaw when hasClient is true.
func ResolveFacingYaw(dx, dy float64, clientYaw float64, hasClient bool, current float64) float64 {
	if hasClient {
		return NormalizeYaw(clientYaw)
	}
	return FacingYawFromDelta(dx, dy, current)
}

// FacingDir returns the unit map vector for a model yaw (+x right, +y down).
func FacingDir(yaw float64) (fx, fy float64) {
	yaw = NormalizeYaw(yaw)
	return -math.Sin(yaw), -math.Cos(yaw)
}

// FacingYawFromExit is the traveler's yaw when crossing a zone line.
func FacingYawFromExit(e MapExit, cols int) float64 {
	if cols <= 0 {
		cols = OverworldCols
	}
	if (e.MinC+e.MaxC)/2 >= cols/2 {
		return FacingYawEast
	}
	return FacingYawWest
}

// FacingYawFromLegacy maps old left/right/8-way strings to radians.
func FacingYawFromLegacy(s string) float64 {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case FacingUp, "north":
		return FacingYawNorth
	case FacingUpRight:
		return NormalizeYaw(-math.Pi / 4)
	case FacingRight, "east":
		return FacingYawEast
	case FacingDownRight:
		return NormalizeYaw(-3 * math.Pi / 4)
	case FacingDown, "south", "":
		return FacingYawSouth
	case FacingDownLeft:
		return NormalizeYaw(3 * math.Pi / 4)
	case FacingLeft, "west":
		return FacingYawWest
	case FacingUpLeft:
		return NormalizeYaw(math.Pi / 4)
	default:
		if v, err := strconv.ParseFloat(s, 64); err == nil {
			return NormalizeYaw(v)
		}
		return FacingYawDefault
	}
}

// ParseFacingYawJSON accepts a JSON number or legacy string.
func ParseFacingYawJSON(raw json.RawMessage, fallback float64) float64 {
	if len(raw) == 0 || string(raw) == "null" {
		return NormalizeYaw(fallback)
	}
	if raw[0] == '"' {
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return NormalizeYaw(fallback)
		}
		return FacingYawFromLegacy(s)
	}
	var v float64
	if err := json.Unmarshal(raw, &v); err != nil {
		return NormalizeYaw(fallback)
	}
	return NormalizeYaw(v)
}

// FacingYaw is a profile/persistable yaw with legacy string support.
type FacingYaw float64

func (f FacingYaw) Radians() float64 { return NormalizeYaw(float64(f)) }

func (f FacingYaw) MarshalJSON() ([]byte, error) {
	return json.Marshal(f.Radians())
}

func (f *FacingYaw) UnmarshalJSON(data []byte) error {
	*f = FacingYaw(ParseFacingYawJSON(data, FacingYawDefault))
	return nil
}
