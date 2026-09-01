package game

// FFXI-inspired playable races (cosmetic + minor stat flavor).

type RaceID string

const (
	RaceHume     RaceID = "hume"
	RaceElvaan   RaceID = "elvaan"
	RaceTarutaru RaceID = "tarutaru"
	RaceMithra   RaceID = "mithra"
	RaceGalka    RaceID = "galka"
)

type RaceDef struct {
	ID          RaceID
	Name        string
	Description string
}

var Races = []RaceDef{
	{ID: RaceHume, Name: "Hume", Description: "Balanced and adaptable."},
	{ID: RaceElvaan, Name: "Elvaan", Description: "Proud and resilient."},
	{ID: RaceTarutaru, Name: "Tarutaru", Description: "Small, clever, and magical."},
	{ID: RaceMithra, Name: "Mithra", Description: "Agile hunters of the wild."},
	{ID: RaceGalka, Name: "Galka", Description: "Stalwart giants of the north."},
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
