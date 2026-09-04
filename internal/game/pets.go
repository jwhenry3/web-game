package game

import (
	"math"
	"time"
)

const (
	MaxPets            = 20
	CaptureHPThreshold = 0.20
	CaptureChanceMin   = 0.05
	CaptureChanceMax   = 0.85
	CaptureChanceBase  = 0.35
	CaptureChancePerLvl = 0.04

	ActionIDCapture = "capture"
)

// SkillCapture attempts to bind a weakened enemy as a pet. Always available in battle.
var SkillCapture = Skill{
	ID:          ActionIDCapture,
	Name:        "Capture",
	Description: "Attempt to capture a capturable foe below 20% HP. Success chance scales with your level vs theirs.",
}

// PetRecord is one captured companion on a profile.
type PetRecord struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	Level    int    `json:"level"`
	CaughtAt int64  `json:"caught_at,omitempty"` // unix millis
}

// PetDisplayName returns a readable label for a kind.
func PetDisplayName(kind string) string {
	switch kind {
	case "goblin":
		return "Goblin"
	case "dire_wolf":
		return "Dire Wolf"
	case "stone_imp":
		return "Stone Imp"
	default:
		if kind == "" {
			return "Pet"
		}
		return kind
	}
}

// CaptureChance returns success probability for capturing an enemy.
// base = 0.35 + 0.04*(playerLvl - enemyLvl), clamped to [0.05, 0.85].
func CaptureChance(playerLvl, enemyLvl int) float64 {
	if playerLvl < 1 {
		playerLvl = 1
	}
	if enemyLvl < 1 {
		enemyLvl = 1
	}
	p := CaptureChanceBase + CaptureChancePerLvl*float64(playerLvl-enemyLvl)
	if p < CaptureChanceMin {
		return CaptureChanceMin
	}
	if p > CaptureChanceMax {
		return CaptureChanceMax
	}
	return p
}

// EligibleForCapture reports whether an enemy may be captured right now.
func EligibleForCapture(capturable bool, alive bool, hp, maxHP int) bool {
	if !capturable || !alive || maxHP < 1 || hp < 1 {
		return false
	}
	return float64(hp)/float64(maxHP) < CaptureHPThreshold
}

// NewPetRecord builds a pet from a captured enemy.
func NewPetRecord(id, kind, name string, level int) PetRecord {
	if level < 1 {
		level = 1
	}
	if name == "" {
		name = PetDisplayName(kind)
	}
	return PetRecord{
		ID:       id,
		Kind:     kind,
		Name:     name,
		Level:    level,
		CaughtAt: time.Now().UnixMilli(),
	}
}

// PetCombatStats scales enemy template stats for a pet ally at the given level.
func PetCombatStats(baseHP, baseStr, baseAgi, level int) (hp, str, agi int) {
	if level < 1 {
		level = 1
	}
	scale := 1.0 + float64(level-1)*0.18
	hp = int(math.Round(float64(baseHP) * scale))
	str = int(math.Round(float64(baseStr) * scale))
	agi = baseAgi
	if hp < 1 {
		hp = 1
	}
	if str < 1 {
		str = 1
	}
	if agi < 1 {
		agi = 1
	}
	return
}
