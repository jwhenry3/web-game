package game

// JobChanger is a stationary NPC location where heroes may change main/sub jobs.
type JobChanger struct {
	ID   string
	Name string
	Tile Tile
}

var JobChangers []JobChanger

func JobChangerByID(id string) (JobChanger, bool) {
	for _, jc := range JobChangers {
		if jc.ID == id {
			return jc, true
		}
	}
	return JobChanger{}, false
}
