package game

// Clara Mundi playable races (cosmetic + minor stat flavor).

type RaceID string

const (
	RaceHumanus RaceID = "humanus"
	RaceAltus   RaceID = "altus"
	RaceParvus  RaceID = "parvus"
	RaceFelis   RaceID = "felis"
	RaceSaxum   RaceID = "saxum"
)

type RaceDef struct {
	ID          RaceID
	Name        string
	Description string
}

var Races = []RaceDef{
	{ID: RaceHumanus, Name: "Humanus", Description: "Balanced and adaptable."},
	{ID: RaceAltus, Name: "Altus", Description: "Proud and resilient."},
	{ID: RaceParvus, Name: "Parvus", Description: "Small, clever, and magical."},
	{ID: RaceFelis, Name: "Felis", Description: "Agile hunters of the wild."},
	{ID: RaceSaxum, Name: "Saxum", Description: "Stalwart giants of the north."},
}

func ValidRace(id RaceID) bool {
	for _, r := range Races {
		if r.ID == id {
			return true
		}
	}
	return false
}

func RaceName(id RaceID) string {
	for _, r := range Races {
		if r.ID == id {
			return r.Name
		}
	}
	return string(id)
}
