package game

import (
	"encoding/json"
	"os"
	"testing"
)

func TestSaveAndLoadContentRoundTrip(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	tmp := t.TempDir()
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })

	payload := json.RawMessage(`[{"id":"ent-test"}]`)
	if err := SaveContent("entities", payload); err != nil {
		t.Fatal(err)
	}
	got, err := LoadContent("entities")
	if err != nil {
		t.Fatal(err)
	}
	var gotArr, wantArr []map[string]string
	if err := json.Unmarshal(got, &gotArr); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(payload, &wantArr); err != nil {
		t.Fatal(err)
	}
	if len(gotArr) != 1 || gotArr[0]["id"] != "ent-test" {
		t.Fatalf("LoadContent = %s", got)
	}
}

func TestValidContentKind(t *testing.T) {
	if !ValidContentKind("prefabs") {
		t.Fatal("prefabs should be valid")
	}
	if !ValidContentKind("items") {
		t.Fatal("items should be valid")
	}
	if !ValidContentKind("quests") {
		t.Fatal("quests should be valid")
	}
	if !ValidContentKind("jobs") {
		t.Fatal("jobs should be valid")
	}
	if !ValidContentKind("skills") {
		t.Fatal("skills should be valid")
	}
	if ValidContentKind("races") {
		t.Fatal("races not implemented yet")
	}
}
