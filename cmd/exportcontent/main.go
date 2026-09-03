package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"ffv-web-game/internal/game"
)

type jobSkillTreeExport struct {
	SkillID       string `json:"skill_id"`
	PrereqSkillID string `json:"prereq_skill_id,omitempty"`
}

type jobExport struct {
	ID             string               `json:"id"`
	Name           string               `json:"name"`
	Abbr           string               `json:"abbr"`
	Category       string               `json:"category"`
	Weapon         string               `json:"weapon"`
	AllowedWeapons []string             `json:"allowed_weapons,omitempty"`
	StatMults      struct {
		HP  float64 `json:"hp,omitempty"`
		MP  float64 `json:"mp,omitempty"`
		STR float64 `json:"str,omitempty"`
		MAG float64 `json:"mag,omitempty"`
		AGI float64 `json:"agi,omitempty"`
	} `json:"stat_mults"`
	Starting  bool                 `json:"starting"`
	SkillTree []jobSkillTreeExport `json:"skill_tree"`
}

type skillExport struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Category    string  `json:"category,omitempty"`
	WeaponReq   string  `json:"weapon_req,omitempty"`
	MPCost      int     `json:"mp_cost"`
	Power       float64 `json:"power"`
	Magic       bool    `json:"magic"`
	Heals       bool    `json:"heals"`
	Buffs       bool    `json:"buffs"`
	Loot        bool    `json:"loot"`
	Ranged      bool    `json:"ranged"`
	WorldOnly   bool    `json:"world_only"`
	CastTimeMs  int     `json:"cast_time_ms"`
	Description string  `json:"description"`
}

type itemExport struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Kind          string         `json:"kind"`
	Description   string         `json:"description,omitempty"`
	Target        string         `json:"target,omitempty"`
	Effects       *itemEffects   `json:"effects,omitempty"`
	Stackable     bool           `json:"stackable,omitempty"`
	MaxStack      int            `json:"max_stack,omitempty"`
	Slot          string         `json:"slot,omitempty"`
	AllowedSlots  []string       `json:"allowed_slots,omitempty"`
	WeaponType    string         `json:"weapon_type,omitempty"`
	Rarity        string         `json:"rarity,omitempty"`
	Level         int            `json:"level,omitempty"`
	Stats         map[string]int `json:"stats,omitempty"`
}

type itemEffects struct {
	HealHP    int `json:"heal_hp,omitempty"`
	RestoreMP int `json:"restore_mp,omitempty"`
	PerLevel  int `json:"per_level,omitempty"`
}

func exportConsumables() []itemExport {
	ids := make([]string, 0, len(game.ConsumableDefs))
	for id := range game.ConsumableDefs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]itemExport, 0, len(ids))
	for _, id := range ids {
		def := game.ConsumableDefs[id]
		row := itemExport{
			ID:          def.ID,
			Name:        def.Name,
			Kind:        game.KindConsumable,
			Description: def.Description,
			Target:      "ally",
			Stackable:   true,
			MaxStack:    99,
		}
		row.Effects = &itemEffects{
			HealHP:    def.HealHP,
			RestoreMP: def.RestoreMP,
			PerLevel:  def.PerLevel,
		}
		out = append(out, row)
	}
	return out
}

func exportEquipmentItem(item game.Item) itemExport {
	row := itemExport{
		ID:          item.ID,
		Name:        item.Name,
		Kind:        game.KindEquipment,
		Slot:        item.Slot,
		Rarity:      string(item.Rarity),
		Level:       item.Level,
		Stats:       item.Stats,
		Description: equipmentDescription(item),
	}
	if item.Slot == game.SlotWeapon {
		row.AllowedSlots = []string{game.SlotWeapon, game.SlotSubWeapon}
		row.WeaponType = item.Type
	} else {
		row.AllowedSlots = []string{item.Slot}
	}
	return row
}

func equipmentDescription(item game.Item) string {
	if item.Slot == game.SlotWeapon {
		return "Starter weapon issued to new heroes."
	}
	return "Basic worn armor template using common loot naming."
}

func exportItems() []itemExport {
	out := exportConsumables()
	for _, item := range game.CatalogEquipment() {
		out = append(out, exportEquipmentItem(item))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Kind != out[j].Kind {
			return out[i].Kind < out[j].Kind
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func exportJobs() []jobExport {
	starting := map[game.JobID]bool{}
	for _, id := range game.StartingJobs {
		starting[id] = true
	}
	out := make([]jobExport, 0, len(game.Jobs))
	for _, def := range game.AllJobs() {
		allowed := make([]string, len(def.AllowedWeapons))
		for i, w := range def.AllowedWeapons {
			allowed[i] = string(w)
		}
		row := jobExport{
			ID:             string(def.ID),
			Name:           def.Name,
			Abbr:           def.Abbr,
			Category:       string(def.Category),
			Weapon:         string(def.Weapon),
			AllowedWeapons: allowed,
			Starting:       starting[def.ID],
		}
		row.StatMults.HP = def.HPMult
		row.StatMults.MP = def.MPMult
		row.StatMults.STR = def.STRMult
		row.StatMults.MAG = def.MAGMult
		row.StatMults.AGI = def.AGIMult
		for _, node := range game.JobSkillTree(def.ID) {
			row.SkillTree = append(row.SkillTree, jobSkillTreeExport{
				SkillID:       node.SkillID,
				PrereqSkillID: node.PrereqSkillID,
			})
		}
		out = append(out, row)
	}
	return out
}

func exportSkills() []skillExport {
	out := make([]skillExport, 0, len(game.Catalog)+1)
	out = append(out, exportSkill(game.BasicAttack))
	for _, sk := range game.Catalog {
		out = append(out, exportSkill(sk))
	}
	return out
}

func exportSkill(sk game.Skill) skillExport {
	return skillExport{
		ID:          sk.ID,
		Name:        sk.Name,
		Category:    string(sk.Category),
		WeaponReq:   string(sk.WeaponReq),
		MPCost:      sk.MPCost,
		Power:       sk.Power,
		Magic:       sk.UsesMagic,
		Heals:       sk.Heals,
		Buffs:       sk.Buffs,
		Loot:        sk.LootBonus,
		Ranged:      sk.Ranged,
		WorldOnly:   sk.WorldOnly,
		CastTimeMs:  sk.CastTimeMs,
		Description: sk.Description,
	}
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

func main() {
	outDir := flag.String("out", "", "write jobs.json, skills.json, and items.json to this directory")
	flag.Parse()

	jobs := exportJobs()
	skills := exportSkills()
	items := exportItems()

	if *outDir != "" {
		if err := os.MkdirAll(*outDir, 0o755); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := writeJSON(filepath.Join(*outDir, "jobs.json"), jobs); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := writeJSON(filepath.Join(*outDir, "skills.json"), skills); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := writeJSON(filepath.Join(*outDir, "items.json"), items); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "exported %d jobs, %d skills, and %d items to %s\n", len(jobs), len(skills), len(items), *outDir)
		return
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(map[string]any{"jobs": jobs, "skills": skills, "items": items})
}
