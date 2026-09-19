package main

import (
	"fmt"
	"math"
)

// ---- deterministic value noise ----

func lattice(seed uint64, x, y int) float64 {
	h := hash2(seed, uint64(int64(x)), uint64(int64(y)))
	return float64(h%10007) / 10007.0
}

func vnoise(seed uint64, x, y float64) float64 {
	xi, yi := int(math.Floor(x)), int(math.Floor(y))
	xf, yf := x-float64(xi), y-float64(yi)
	u := xf * xf * (3 - 2*xf)
	v := yf * yf * (3 - 2*yf)
	a := lattice(seed, xi, yi)
	b := lattice(seed, xi+1, yi)
	cc := lattice(seed, xi, yi+1)
	d := lattice(seed, xi+1, yi+1)
	return a*(1-u)*(1-v) + b*u*(1-v) + cc*(1-u)*v + d*u*v
}

// fbm layers value noise octaves; result is normalized to ~0..1.
func fbm(seed uint64, x, y float64, octaves int) float64 {
	amp, freq, sum, norm := 0.5, 1.0, 0.0, 0.0
	for i := 0; i < octaves; i++ {
		sum += amp * vnoise(seed, x*freq, y*freq)
		norm += amp
		amp *= 0.5
		freq *= 2
	}
	return sum / norm
}

// ---- biomes ----

type biomeID int

const (
	biomeOcean biomeID = iota
	biomeCoast
	biomeGlacier
	biomeTundra
	biomeTaiga
	biomeCrags
	biomeMire
	biomeForest
	biomeWeald
	biomeMeadow
	biomeJungle
	biomeSavanna
	biomeDunes
)

func (b biomeID) String() string {
	return [...]string{
		"ocean", "coast", "glacier", "tundra", "taiga", "crags",
		"mire", "forest", "weald", "meadow", "jungle", "savanna", "dunes",
	}[b]
}

// biomeKind is the gameplay Region.Kind written for each zone.
func (b biomeID) kind() string { return b.String() }

// ---- zone naming ----

var biomeNames = map[biomeID]struct{ pre, post []string }{
	biomeOcean:   {[]string{"azure", "sunless", "silent", "deep"}, []string{"sea", "deep", "sound", "reach"}},
	biomeCoast:   {[]string{"salt", "gull", "foam", "coral", "wind"}, []string{"shore", "strand", "coast", "cape"}},
	biomeGlacier: {[]string{"rime", "pale", "hoar", "winter"}, []string{"frost", "glacier", "expanse", "crown"}},
	biomeTundra:  {[]string{"gray", "howling", "barren", "north"}, []string{"waste", "steppe", "flats", "moor"}},
	biomeTaiga:   {[]string{"pine", "frost", "shadow", "elk"}, []string{"taiga", "wood", "thicket", "vale"}},
	biomeCrags:   {[]string{"broken", "thunder", "eagle", "granite"}, []string{"crag", "spine", "reach", "teeth"}},
	biomeMire:    {[]string{"black", "bog", "mist", "fen", "still"}, []string{"mire", "marsh", "swamp", "fen"}},
	biomeForest:  {[]string{"elder", "green", "moss", "briar", "whisper"}, []string{"wood", "veil", "hollow", "shade", "reach"}},
	biomeWeald:   {[]string{"amber", "autumn", "russet", "golden"}, []string{"weald", "grove", "field", "fall"}},
	biomeMeadow:  {[]string{"clover", "high", "lark", "fair", "sun"}, []string{"meadow", "field", "downs", "plain"}},
	biomeJungle:  {[]string{"emerald", "wild", "rain", "serpent"}, []string{"jungle", "tangle", "wilds", "canopy"}},
	biomeSavanna: {[]string{"dust", "lion", "amber", "dry"}, []string{"savanna", "steppe", "flats", "range"}},
	biomeDunes:   {[]string{"shifting", "burning", "red", "mirage"}, []string{"dunes", "sands", "desert", "waste"}},
}

// zoneName picks a deterministic unique-ish name; callers dedupe collisions.
func zoneName(seed uint64, zx, zy int, b biomeID) string {
	return zoneNameVariant(seed, zx, zy, b, 0)
}

// zoneNameVariant mixes an attempt counter into the pick so collision retries
// yield different pre/post combos rather than "name2" suffixes.
func zoneNameVariant(seed uint64, zx, zy int, b biomeID, attempt int) string {
	pool := biomeNames[b]
	h := hash2(seed^0x9a9e^uint64(attempt)*0x9e3779b9, uint64(zx), uint64(zy))
	pre := pool.pre[h%uint64(len(pool.pre))]
	post := pool.post[(h>>8)%uint64(len(pool.post))]
	return fmt.Sprintf("%s_%s", pre, post)
}

// ---- enemy tables ----

type enemyEntry struct {
	kind string
	name string
}

// biomeEnemies lists the foe kinds/names each biome spawns. Kinds must exist
// in the server's enemyTemplates (goblin / dire_wolf / stone_imp).
var biomeEnemies = map[biomeID][]enemyEntry{
	biomeCoast:   {{"goblin", "Shore Goblin"}, {"stone_imp", "Salt Imp"}, {"dire_wolf", "Beach Hound"}},
	biomeGlacier: {{"stone_imp", "Glacier Imp"}, {"dire_wolf", "Ice Wolf"}, {"goblin", "Frost Raider"}},
	biomeTundra:  {{"dire_wolf", "Snow Wolf"}, {"stone_imp", "Rime Imp"}, {"goblin", "Tundra Goblin"}},
	biomeTaiga:   {{"dire_wolf", "Taiga Wolf"}, {"goblin", "Pine Goblin"}, {"stone_imp", "Hoarfrost Imp"}},
	biomeCrags:   {{"stone_imp", "Crag Imp"}, {"goblin", "Cliff Goblin"}, {"dire_wolf", "Crag Wolf"}},
	biomeMire:    {{"goblin", "Mire Goblin"}, {"stone_imp", "Bog Imp"}, {"dire_wolf", "Marsh Hound"}},
	biomeForest:  {{"goblin", "Wood Goblin"}, {"dire_wolf", "Grey Wolf"}, {"stone_imp", "Thicket Imp"}},
	biomeWeald:   {{"dire_wolf", "Auburn Wolf"}, {"goblin", "Weald Goblin"}, {"stone_imp", "Hollow Imp"}},
	biomeMeadow:  {{"goblin", "Field Goblin"}, {"dire_wolf", "Prairie Wolf"}},
	biomeJungle:  {{"goblin", "Jungle Goblin"}, {"stone_imp", "Canopy Imp"}, {"dire_wolf", "Dire Panther"}},
	biomeSavanna: {{"dire_wolf", "Savanna Hound"}, {"goblin", "Dust Goblin"}, {"stone_imp", "Sun Imp"}},
	biomeDunes:   {{"stone_imp", "Mirage Imp"}, {"goblin", "Dune Raider"}, {"dire_wolf", "Sand Wolf"}},
}
