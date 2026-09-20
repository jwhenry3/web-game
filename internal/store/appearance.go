package store

import "clara-mundi/internal/game"

// Appearance is the persisted sprite configuration for a character.
// Values are catalog part IDs / variant IDs from data/content/characters.json.
type Appearance struct {
	Skin        string `json:"skin"`
	Face        string `json:"face"`
	Hair        string `json:"hair"`
	HairColor   string `json:"hair_color"`
	Cloth       string `json:"cloth"`
	ClothColor  string `json:"cloth_color"`
	Weapon      string `json:"weapon"`
	WeaponColor string `json:"weapon_color"`
}

func (a Appearance) IsZero() bool {
	return a.Skin == "" && a.Face == "" && a.Hair == "" && a.Cloth == ""
}

// fallbackRacePresets preserve the pre-catalog defaults for when no
// characters content catalog is installed.
var fallbackRacePresets = map[string]Appearance{
	"humanus": {Skin: "c1", Face: "ms1", Hair: "m1", HairColor: "c2", Cloth: "cloth1", ClothColor: "c1", Weapon: "weapon1", WeaponColor: "c1"},
	"altus":   {Skin: "c1", Face: "ms3", Hair: "f2", HairColor: "c8", Cloth: "cloth10", ClothColor: "c2", Weapon: "weapon1", WeaponColor: "c1"},
	"parvus":  {Skin: "c3", Face: "ms5", Hair: "m5", HairColor: "c5", Cloth: "cloth5", ClothColor: "c4", Weapon: "weapon5", WeaponColor: "c1"},
	"felis":   {Skin: "c4", Face: "ms7", Hair: "f3", HairColor: "c1", Cloth: "cloth3", ClothColor: "c6", Weapon: "weapon3", WeaponColor: "c1"},
	"saxum":   {Skin: "c6", Face: "ms9", Hair: "m2", HairColor: "c1", Cloth: "cloth12", ClothColor: "c3", Weapon: "weapon2", WeaponColor: "c1"},
	// Legacy race IDs (pre Clara Mundi) map to the same presets.
	"hume":     {Skin: "c1", Face: "ms1", Hair: "m1", HairColor: "c2", Cloth: "cloth1", ClothColor: "c1", Weapon: "weapon1", WeaponColor: "c1"},
	"elvaan":   {Skin: "c1", Face: "ms3", Hair: "f2", HairColor: "c8", Cloth: "cloth10", ClothColor: "c2", Weapon: "weapon1", WeaponColor: "c1"},
	"tarutaru": {Skin: "c3", Face: "ms5", Hair: "m5", HairColor: "c5", Cloth: "cloth5", ClothColor: "c4", Weapon: "weapon5", WeaponColor: "c1"},
	"mithra":   {Skin: "c4", Face: "ms7", Hair: "f3", HairColor: "c1", Cloth: "cloth3", ClothColor: "c6", Weapon: "weapon3", WeaponColor: "c1"},
	"galka":    {Skin: "c6", Face: "ms9", Hair: "m2", HairColor: "c1", Cloth: "cloth12", ClothColor: "c3", Weapon: "weapon2", WeaponColor: "c1"},
}

func appearanceFromLook(l game.CharacterLook) Appearance {
	return Appearance{
		Skin:        l.Skin,
		Face:        l.Face,
		Hair:        l.Hair,
		HairColor:   l.HairColor,
		Cloth:       l.Cloth,
		ClothColor:  l.ClothColor,
		Weapon:      l.Weapon,
		WeaponColor: l.WeaponColor,
	}
}

// DefaultAppearanceForRace returns a sensible starter look when none is saved.
// Reads race presets from the characters catalog; falls back to the compiled
// table when the catalog is absent or has no entry for the race.
func DefaultAppearanceForRace(race string) Appearance {
	if cat, err := game.LoadCharacterCatalog(); err == nil && cat != nil {
		if look, ok := cat.RacePreset(race); ok {
			return appearanceFromLook(look)
		}
	}
	if p, ok := fallbackRacePresets[race]; ok {
		return p
	}
	return fallbackRacePresets["humanus"]
}

// NormalizeAppearance fills missing fields with race defaults, then clamps any
// part/variant IDs that the characters catalog doesn't define.
func NormalizeAppearance(race string, a Appearance) Appearance {
	def := DefaultAppearanceForRace(race)
	if a.Skin == "" {
		a.Skin = def.Skin
	}
	if a.Face == "" {
		a.Face = def.Face
	}
	if a.Hair == "" {
		a.Hair = def.Hair
	}
	if a.HairColor == "" {
		a.HairColor = def.HairColor
	}
	if a.Cloth == "" {
		a.Cloth = def.Cloth
	}
	if a.ClothColor == "" {
		a.ClothColor = def.ClothColor
	}
	if a.Weapon == "" {
		a.Weapon = def.Weapon
	}
	if a.WeaponColor == "" {
		a.WeaponColor = def.WeaponColor
	}

	cat, err := game.LoadCharacterCatalog()
	if err != nil || cat == nil || len(cat.Parts) == 0 {
		return a
	}
	a.Skin = partOrDefault(cat, "skin", a.Skin, def.Skin)
	a.Face = partOrDefault(cat, "face", a.Face, def.Face)
	a.Hair = partOrDefault(cat, "hair", a.Hair, def.Hair)
	a.Cloth = partOrDefault(cat, "cloth", a.Cloth, def.Cloth)
	a.Weapon = partOrDefault(cat, "weapon", a.Weapon, def.Weapon)
	if !cat.ValidVariant(a.Hair, a.HairColor) {
		a.HairColor = def.HairColor
	}
	if !cat.ValidVariant(a.Cloth, a.ClothColor) {
		a.ClothColor = def.ClothColor
	}
	if !cat.ValidVariant(a.Weapon, a.WeaponColor) {
		a.WeaponColor = def.WeaponColor
	}
	return a
}

func partOrDefault(cat *game.CharacterCatalog, group, value, fallback string) string {
	if cat.PartInGroup(group, value) {
		return value
	}
	return fallback
}
