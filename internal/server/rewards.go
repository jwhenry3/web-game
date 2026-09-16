package server

// Combat reward tuning shared by combat.go's per-kill award path.
const (
	partyBattleRange          = 320.0 // ~8 tiles; must be near the kill for passive XP
	partyInCombatBonusPercent = 25    // +25% XP when 2+ party members fight together
	partyPassiveXPPercent     = 35    // passive share for nearby party mates who skip the fight
)
