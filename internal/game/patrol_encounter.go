package game

func encounterFromPatrolFile(n patrolFile) EncounterConfig {
	if n.Encounter != nil {
		return NormalizeEncounter(*n.Encounter, n.Kind, n.Level)
	}
	return DefaultEncounter(n.Kind, n.Level)
}
