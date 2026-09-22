package game

import "testing"

func TestApplyScene3DMaterializesGameplayComponents(t *testing.T) {
	ow := &Overworld{Cols: 4, Rows: 4, TileSize: 32, Cells: []string{"....", "....", "....", "...."}, Regions: []Region{{ID: "field", MinC: 0, MinR: 0, MaxC: 3, MaxR: 3}}}
	s := EmptyScene3D("test")
	s.Terrain.Cells["0,0"] = "#"
	s.Objects = []SceneObject{
		{ID: "npc", Name: "Guard", Visible: true, Transform: SceneTransform{Position: [3]float64{3, 0, 3}, Scale: [3]float64{1, 1, 1}}, Components: SceneComponents{NPC: &SceneNPC{Enabled: true, Archetype: "goblin", Level: 4, Hostile: true}}},
		{ID: "save", Name: "Shrine", Visible: true, Transform: SceneTransform{Position: [3]float64{1, 0, 1}, Scale: [3]float64{1, 1, 1}}, Components: SceneComponents{POI: &ScenePOI{Enabled: true, Type: "save_point", Label: "Shrine"}}},
		{ID: "jobs", Name: "Mentor", Visible: true, Transform: SceneTransform{Position: [3]float64{5, 0, 1}, Scale: [3]float64{1, 1, 1}}, Components: SceneComponents{POI: &ScenePOI{Enabled: true, Type: "job_changer", Label: "Mentor"}}},
	}
	ow.ApplyScene3D(s)
	if ow.Cell(0, 0) != TileRock {
		t.Fatalf("terrain override was not composed")
	}
	if len(ow.NPCPatrols) != 1 || ow.NPCPatrols[0].ID != "scene:npc" || ow.NPCPatrols[0].Home != (Tile{C: 1, R: 1}) {
		t.Fatalf("NPC prefab not materialized: %+v", ow.NPCPatrols)
	}
	if len(ow.SavePoints) != 1 || ow.SavePoints[0].Tile != (Tile{C: 0, R: 0}) {
		t.Fatalf("save POI not materialized: %+v", ow.SavePoints)
	}
	if len(ow.JobChangers) != 1 || ow.JobChangers[0].Tile != (Tile{C: 2, R: 0}) {
		t.Fatalf("job POI not materialized: %+v", ow.JobChangers)
	}
}

func TestHouseSceneUsesSharedSceneAndFurnitureCollision(t *testing.T) {
	ow := NewHouseOverworld()
	f := HouseFurniture{ID: "chair-1", Col: 49, Row: 50, Item: Item{ID: "chair"}}
	ow.SetHouseFurniture3D([]HouseFurniture{f})
	if ow.Scene3D == nil || len(ow.Scene3D.Objects) < 3 {
		t.Fatal("house must be a scene-backed map instance")
	}
	if len(ow.SceneColliders3D()) != 1 {
		t.Fatalf("furniture should contribute one solid collider")
	}
}
