package game

import "testing"

func TestNpcRolesFromObject(t *testing.T) {
	legacy := OverrideObject{
		Type: "npc",
		Properties: []tiledProp{
			{Name: "kind", Value: "slime"},
			{Name: "region", Value: "greenwood"},
		},
	}
	roles := npcRolesFromObject(legacy)
	if len(roles) != 1 || roles[0] != combatNpcRole {
		t.Fatalf("legacy combat npc roles = %v, want [combat]", roles)
	}

	combat := OverrideObject{
		Type: "npc",
		Properties: []tiledProp{
			{Name: "roles", Value: "combat"},
		},
	}
	if !npcRolesContain(npcRolesFromObject(combat), combatNpcRole) {
		t.Fatal("expected combat role")
	}

	service := OverrideObject{
		Type: "interactable_npc",
		Properties: []tiledProp{
			{Name: "roles", Value: "job_master,shop"},
		},
	}
	got := npcRolesFromObject(service)
	if len(got) != 2 || got[0] != "job_master" || got[1] != "shop" {
		t.Fatalf("service roles = %v", got)
	}
}

func TestNpcEntitiesFromObjects(t *testing.T) {
	collision := make([]int, 100)
	ground := make([]int, 100)
	ow := &Overworld{
		TileSize: 32,
		Cols:     10,
		Rows:     10,
		Cells:    buildCellsFromLayers(collision, ground, 10, 10),
	}
	objects := []OverrideObject{
		{
			Type:  "npc",
			Name:  "slime_1",
			X:     48,
			Y:     48,
			Point: true,
			Properties: []tiledProp{
				{Name: "id", Value: "slime_1"},
				{Name: "name", Value: "Slime"},
				{Name: "kind", Value: "slime"},
				{Name: "level", Value: float64(1)},
				{Name: "region", Value: "greenwood"},
				{Name: "roles", Value: "combat"},
			},
		},
		{
			Type:  "npc",
			Name:  "job_master_1",
			X:     80,
			Y:     80,
			Point: true,
			Properties: []tiledProp{
				{Name: "id", Value: "job_master_1"},
				{Name: "name", Value: "Job Master"},
				{Name: "roles", Value: "job_master"},
			},
		},
	}
	if err := npcEntitiesFromObjects(ow, objects); err != nil {
		t.Fatal(err)
	}
	if len(ow.NPCPatrols) != 1 || ow.NPCPatrols[0].ID != "slime_1" {
		t.Fatalf("patrols = %+v", ow.NPCPatrols)
	}
	if len(ow.JobChangers) != 1 || ow.JobChangers[0].ID != "job_master_1" {
		t.Fatalf("job changers = %+v", ow.JobChangers)
	}
}
