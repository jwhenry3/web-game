package store

// Appearance is the persisted Heroes 99 sprite configuration for a character.
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

// DefaultAppearanceForRace returns a sensible starter look when none is saved.
func DefaultAppearanceForRace(race string) Appearance {
	presets := map[string]Appearance{
		"humanus": {Skin: "c1", Face: "c1", Hair: "m1", HairColor: "c2", Cloth: "cloth1", ClothColor: "c1", Weapon: "weapon1", WeaponColor: "c1"},
		"altus":   {Skin: "c1", Face: "c2", Hair: "f2", HairColor: "c8", Cloth: "cloth10", ClothColor: "c2", Weapon: "weapon1", WeaponColor: "c1"},
		"parvus":  {Skin: "c3", Face: "c3", Hair: "m5", HairColor: "c5", Cloth: "cloth5", ClothColor: "c4", Weapon: "weapon5", WeaponColor: "c1"},
		"felis":   {Skin: "c4", Face: "c4", Hair: "f3", HairColor: "c1", Cloth: "cloth3", ClothColor: "c6", Weapon: "weapon3", WeaponColor: "c1"},
		"saxum":   {Skin: "c6", Face: "c5", Hair: "m2", HairColor: "c1", Cloth: "cloth12", ClothColor: "c3", Weapon: "weapon2", WeaponColor: "c1"},
		// Legacy race IDs (pre Clara Mundi) map to the same presets.
		"hume":     {Skin: "c1", Face: "c1", Hair: "m1", HairColor: "c2", Cloth: "cloth1", ClothColor: "c1", Weapon: "weapon1", WeaponColor: "c1"},
		"elvaan":   {Skin: "c1", Face: "c2", Hair: "f2", HairColor: "c8", Cloth: "cloth10", ClothColor: "c2", Weapon: "weapon1", WeaponColor: "c1"},
		"tarutaru": {Skin: "c3", Face: "c3", Hair: "m5", HairColor: "c5", Cloth: "cloth5", ClothColor: "c4", Weapon: "weapon5", WeaponColor: "c1"},
		"mithra":   {Skin: "c4", Face: "c4", Hair: "f3", HairColor: "c1", Cloth: "cloth3", ClothColor: "c6", Weapon: "weapon3", WeaponColor: "c1"},
		"galka":    {Skin: "c6", Face: "c5", Hair: "m2", HairColor: "c1", Cloth: "cloth12", ClothColor: "c3", Weapon: "weapon2", WeaponColor: "c1"},
	}
	if p, ok := presets[race]; ok {
		return p
	}
	return presets["humanus"]
}

// NormalizeAppearance fills missing fields with race defaults.
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
	return a
}
