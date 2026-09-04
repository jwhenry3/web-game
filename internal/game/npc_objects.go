package game

import (
	"fmt"
	"strings"
)

const combatNpcRole = "combat"

func isNpcObjectType(t string) bool {
	switch t {
	case "npc", "interactable_npc", "job_changer":
		return true
	default:
		return false
	}
}

func npcRolesFromObject(obj OverrideObject) []string {
	switch obj.Type {
	case "job_changer":
		return []string{"job_master"}
	case "interactable_npc":
		return splitNpcRoles(tiledPropString(obj.Properties, "roles"))
	case "npc":
		roles := splitNpcRoles(tiledPropString(obj.Properties, "roles"))
		if len(roles) == 0 && isLegacyCombatNpc(obj) {
			return []string{combatNpcRole}
		}
		return roles
	default:
		return nil
	}
}

func isLegacyCombatNpc(obj OverrideObject) bool {
	return tiledPropString(obj.Properties, "region") != "" ||
		tiledPropString(obj.Properties, "kind") != ""
}

func splitNpcRoles(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func npcRolesContain(roles []string, role string) bool {
	for _, r := range roles {
		if r == role {
			return true
		}
	}
	return false
}

func overrideObjectTile(obj OverrideObject, tileSize int) Tile {
	ts := float64(tileSize)
	c := int(obj.X / ts)
	r := int(obj.Y/ts) - 1
	if obj.Point {
		r = int(obj.Y / ts)
	}
	return Tile{C: c, R: r}
}

func npcEntitiesFromObjects(ow *Overworld, objects []OverrideObject) error {
	var patrols []Patrol
	var jobChangers []JobChanger
	for _, obj := range objects {
		if !isNpcObjectType(obj.Type) {
			continue
		}
		roles := npcRolesFromObject(obj)
		tile := overrideObjectTile(obj, ow.TileSize)

		if npcRolesContain(roles, combatNpcRole) || (obj.Type == "npc" && len(roles) == 0 && isLegacyCombatNpc(obj)) {
			id := tiledPropString(obj.Properties, "id")
			region := tiledPropString(obj.Properties, "region")
			if id == "" || region == "" {
				return fmt.Errorf("combat npc %s missing id or region", obj.Name)
			}
			patrols = append(patrols, Patrol{
				ID:        id,
				Kind:      tiledPropString(obj.Properties, "kind"),
				Name:      tiledPropString(obj.Properties, "name"),
				Level:     tiledPropInt(obj.Properties, "level"),
				Region:    region,
				Home:      tile,
				Encounter: EncounterFromProps(obj.Properties),
			})
		}

		if npcRolesContain(roles, "job_master") || obj.Type == "job_changer" {
			id := tiledPropString(obj.Properties, "id")
			name := tiledPropString(obj.Properties, "name")
			if id == "" || name == "" {
				return fmt.Errorf("job master npc %s missing id or name", obj.Name)
			}
			if !ow.WalkableTile(tile.C, tile.R) {
				return fmt.Errorf("job changer %s tile (%d,%d) blocked", id, tile.C, tile.R)
			}
			jobChangers = append(jobChangers, JobChanger{ID: id, Name: name, Tile: tile})
		}
	}
	ow.NPCPatrols = patrols
	ow.JobChangers = jobChangers
	return nil
}

func hasNpcObjects(objects []OverrideObject) bool {
	for _, obj := range objects {
		if isNpcObjectType(obj.Type) {
			return true
		}
	}
	return false
}
