package game

import "sync"

// ExpRates is the cluster-wide experience multiplier and main/sub split.
// Configured once from data/cluster.json and shared by every map server.
type ExpRates struct {
	// Rate multiplies all job EXP gains (1.0 = normal). Values < 0 fall back to 1.0.
	Rate float64 `json:"rate"`
	// MainPercent is the share of EXP that goes to the main job when a subjob is set.
	MainPercent int `json:"main_percent"`
	// SubPercent is the share of EXP that goes to the subjob when a subjob is set.
	SubPercent int `json:"sub_percent"`
	// SubjobUnlockLevel is the main-job level required before a subjob may be equipped.
	SubjobUnlockLevel int `json:"subjob_unlock_level"`
}

const (
	DefaultExpRate        = 1.0
	DefaultExpMainPercent = 75
	DefaultExpSubPercent  = 25
)

var (
	expMu    sync.RWMutex
	expRates = DefaultExpRates()
)

// DefaultExpRates returns the built-in cluster defaults.
func DefaultExpRates() ExpRates {
	return ExpRates{
		Rate:              DefaultExpRate,
		MainPercent:       DefaultExpMainPercent,
		SubPercent:        DefaultExpSubPercent,
		SubjobUnlockLevel: DefaultSubjobUnlockLevel,
	}
}

// NormalizeExpRates fills missing/invalid fields.
func NormalizeExpRates(r ExpRates) ExpRates {
	if r.Rate < 0 {
		r.Rate = DefaultExpRate
	}
	if r.MainPercent+r.SubPercent <= 0 {
		r.MainPercent = DefaultExpMainPercent
		r.SubPercent = DefaultExpSubPercent
	}
	if r.MainPercent < 0 {
		r.MainPercent = 0
	}
	if r.SubPercent < 0 {
		r.SubPercent = 0
	}
	if r.SubjobUnlockLevel < 1 {
		r.SubjobUnlockLevel = DefaultSubjobUnlockLevel
	}
	return r
}

// ConfigureExp installs cluster-wide EXP rates and subjob unlock level.
func ConfigureExp(r ExpRates) {
	r = NormalizeExpRates(r)
	expMu.Lock()
	expRates = r
	expMu.Unlock()
	SubjobUnlockLevel = r.SubjobUnlockLevel
}

// CurrentExpRates returns a copy of the active EXP rates.
func CurrentExpRates() ExpRates {
	expMu.RLock()
	defer expMu.RUnlock()
	return expRates
}

// ScaleXP applies the global EXP rate to a base award.
func ScaleXP(baseXP int) int {
	if baseXP < 1 {
		return 0
	}
	r := CurrentExpRates()
	if r.Rate == 0 {
		return 0
	}
	scaled := int(float64(baseXP)*r.Rate + 1e-9)
	if scaled < 1 && r.Rate > 0 {
		scaled = 1
	}
	return scaled
}

// JobXPSplit divides scaled XP between main and sub using configured percents.
// When hasSub is false, all XP goes to main. Percents are normalized to their sum.
func JobXPSplit(totalXP int, hasSub bool) (mainXP, subXP int) {
	if totalXP < 1 {
		return 0, 0
	}
	if !hasSub {
		return totalXP, 0
	}
	r := CurrentExpRates()
	mainP, subP := r.MainPercent, r.SubPercent
	sum := mainP + subP
	if sum <= 0 {
		return totalXP, 0
	}
	mainXP = totalXP * mainP / sum
	subXP = totalXP - mainXP
	if mainP > 0 && mainXP < 1 && totalXP >= 1 {
		mainXP = 1
		subXP = totalXP - mainXP
	}
	if subP > 0 && subXP < 1 && totalXP > mainXP {
		subXP = 1
		mainXP = totalXP - subXP
	}
	if mainXP < 0 {
		mainXP = 0
	}
	if subXP < 0 {
		subXP = 0
	}
	return mainXP, subXP
}

// DistributeJobXP scales base XP by the global rate, then splits main/sub.
// All job EXP awards (battle, passive party share, etc.) should go through this.
func DistributeJobXP(baseXP int, hasSub bool) (mainXP, subXP int) {
	return JobXPSplit(ScaleXP(baseXP), hasSub)
}
