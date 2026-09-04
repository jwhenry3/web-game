package store

import (
	"testing"

	"clara-mundi/internal/game"
)

func TestPetCollectionFollowBattleRelease(t *testing.T) {
	s := Load("")
	p := s.GetOrCreate("PetOwner", game.StartingJobs[0])
	p2, pet, errMsg := s.AddPet(p.Name, "goblin", "Goblin", 3)
	if errMsg != "" {
		t.Fatalf("add: %s", errMsg)
	}
	if len(p2.Pets) != 1 || pet.Level != 3 {
		t.Fatalf("pet not stored: %+v", p2.Pets)
	}
	p3, errMsg := s.SetFollowPet(p.Name, pet.ID)
	if errMsg != "" || p3.FollowPetID != pet.ID {
		t.Fatalf("follow: %s %+v", errMsg, p3)
	}
	p4, errMsg := s.SetBattlePet(p.Name, pet.ID)
	if errMsg != "" || p4.BattlePetID != pet.ID {
		t.Fatalf("battle: %s %+v", errMsg, p4)
	}
	p5, errMsg := s.ReleasePet(p.Name, pet.ID)
	if errMsg != "" {
		t.Fatalf("release: %s", errMsg)
	}
	if len(p5.Pets) != 0 || p5.FollowPetID != "" || p5.BattlePetID != "" {
		t.Fatalf("release should clear slots: %+v", p5)
	}
}

func TestAddPetRejectsEquippedCap(t *testing.T) {
	s := Load("")
	name := "PetHoarder"
	s.GetOrCreate(name, game.StartingJobs[0])
	for i := 0; i < game.MaxPets; i++ {
		if _, _, err := s.AddPet(name, "goblin", "G", 1); err != "" {
			t.Fatalf("fill %d: %s", i, err)
		}
	}
	if _, _, err := s.AddPet(name, "goblin", "G", 1); err == "" {
		t.Fatal("expected full collection error")
	}
}
