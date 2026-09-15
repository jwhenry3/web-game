package game

import "encoding/json"

// CharacterLook mirrors the wire shape of a stored character appearance
// (snake_case to match store.Appearance and the client protocol).
type CharacterLook struct {
	Skin        string `json:"skin"`
	Face        string `json:"face"`
	Hair        string `json:"hair"`
	HairColor   string `json:"hair_color"`
	Cloth       string `json:"cloth"`
	ClothColor  string `json:"cloth_color"`
	Weapon      string `json:"weapon"`
	WeaponColor string `json:"weapon_color"`
}

// CharacterSlot is one layer of a paper doll, ordered bottom-to-top by Depth.
type CharacterSlot struct {
	ID    string `json:"id"`
	Depth int    `json:"depth"`
}

// CharacterSheet describes the sprite-sheet grid every layer of a doll shares.
type CharacterSheet struct {
	FrameW int `json:"frame_w"`
	FrameH int `json:"frame_h"`
	Cols   int `json:"cols"`
	Rows   int `json:"rows"`
}

// CharacterPivot anchors the doll to its entity position (foot point in
// source pixels).
type CharacterPivot struct {
	FootX float64 `json:"foot_x"`
	FootY float64 `json:"foot_y"`
}

// CharacterMotion offsets the whole sprite on one animation frame. Layers
// holds per-slot overrides with the same fields — the cheap substitute for
// skeletal animation (e.g. hair lagging a run cycle).
type CharacterMotion struct {
	DX     float64                     `json:"dx,omitempty"`
	DY     float64                     `json:"dy,omitempty"`
	Rot    float64                     `json:"rot,omitempty"`
	Scale  float64                     `json:"scale,omitempty"`
	Layers map[string]*CharacterMotion `json:"layers,omitempty"`
}

// CharacterAnim is a named frame sequence on a doll sheet.
type CharacterAnim struct {
	Frames     []int             `json:"frames"`
	MsPerFrame int               `json:"ms_per_frame"`
	Motion     []CharacterMotion `json:"motion,omitempty"`
}

// CharacterDoll is a paper-doll template: shared sheet geometry, slots, and
// animation table that every part drawn for this doll conforms to.
type CharacterDoll struct {
	ID      string                   `json:"id"`
	Sheet   CharacterSheet           `json:"sheet"`
	Pivot   CharacterPivot           `json:"pivot"`
	Facings []string                 `json:"facings"`
	Slots   []CharacterSlot          `json:"slots"`
	Anims   map[string]CharacterAnim `json:"anims"`
}

// CharacterPart is one wardrobe entry. Group is the appearance field it fills
// (skin, face, hair, cloth, weapon); Sheets maps doll slot IDs to path
// templates where {id} and {variant} are substituted.
type CharacterPart struct {
	ID       string            `json:"id"`
	Group    string            `json:"group"`
	Slots    []string          `json:"slots"`
	Variants []string          `json:"variants,omitempty"`
	Tags     []string          `json:"tags,omitempty"`
	Sheets   map[string]string `json:"sheets,omitempty"`
}

// CharacterCatalog is the "characters" content document: doll templates,
// wardrobe parts, and per-race default looks. Edited by the character
// editor; read by the server (appearance defaults/validation) and the client
// (rendering) so both share one source of truth.
type CharacterCatalog struct {
	Dolls []CharacterDoll          `json:"dolls,omitempty"`
	Parts []CharacterPart          `json:"parts,omitempty"`
	Races map[string]CharacterLook `json:"races,omitempty"`
}

// LoadCharacterCatalog reads data/content/characters.json. A missing or empty
// catalog returns nil so callers can fall back to compiled-in data.
func LoadCharacterCatalog() (*CharacterCatalog, error) {
	raw, err := LoadContent("characters")
	if err != nil {
		return nil, err
	}
	var cat CharacterCatalog
	if err := json.Unmarshal(raw, &cat); err != nil {
		return nil, err
	}
	if len(cat.Dolls) == 0 && len(cat.Parts) == 0 && len(cat.Races) == 0 {
		return nil, nil
	}
	return &cat, nil
}

// RacePreset returns the catalog's default look for a race, if defined.
func (c *CharacterCatalog) RacePreset(race string) (CharacterLook, bool) {
	look, ok := c.Races[race]
	return look, ok
}

// PartInGroup reports whether id is a catalog part assigned to group.
func (c *CharacterCatalog) PartInGroup(group, id string) bool {
	for _, p := range c.Parts {
		if p.Group == group && p.ID == id {
			return true
		}
	}
	return false
}

// ValidVariant reports whether variant is allowed on partID. Parts without a
// variant list accept any value; unknown parts accept any value (PartInGroup
// is the authority on part validity).
func (c *CharacterCatalog) ValidVariant(partID, variant string) bool {
	for _, p := range c.Parts {
		if p.ID != partID {
			continue
		}
		if len(p.Variants) == 0 {
			return true
		}
		for _, v := range p.Variants {
			if v == variant {
				return true
			}
		}
		return false
	}
	return true
}
