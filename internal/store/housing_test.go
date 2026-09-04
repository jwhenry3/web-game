package store

import (
	"testing"

	"clara-mundi/internal/game"
)

func TestHouseStorageDepositWithdraw(t *testing.T) {
	s := Load("")
	p := s.GetOrCreate("Camper", game.StartingJobs[0])
	if len(p.Inventory) == 0 {
		t.Fatal("expected starter inventory")
	}
	var item game.Item
	for _, it := range p.Inventory {
		equipped := false
		for _, id := range p.ActiveLoadout().Equipped {
			if id == it.ID {
				equipped = true
				break
			}
		}
		if !equipped {
			item = it
			break
		}
	}
	if item.ID == "" {
		t.Fatal("need an unequipped inventory item")
	}
	beforeInv := len(p.Inventory)
	p2, errMsg := s.DepositHouseStorage("Camper", item.ID, 1)
	if errMsg != "" {
		t.Fatalf("deposit: %s", errMsg)
	}
	if len(p2.HouseStorage) < 1 {
		t.Fatal("expected item in house storage")
	}
	if len(p2.Inventory) > beforeInv {
		t.Fatal("inventory should not grow after deposit")
	}
	stored := p2.HouseStorage[0]
	p3, errMsg := s.WithdrawHouseStorage("Camper", stored.ID, 1)
	if errMsg != "" {
		t.Fatalf("withdraw: %s", errMsg)
	}
	if len(p3.HouseStorage) != 0 {
		t.Fatalf("storage should be empty, got %d", len(p3.HouseStorage))
	}
}

func TestHouseStorageRejectsEquippedDeposit(t *testing.T) {
	s := Load("")
	p := s.GetOrCreate("EquippedCamper", game.StartingJobs[0])
	var itemID string
	for _, it := range p.Inventory {
		if it.Kind == game.KindEquipment {
			itemID = it.ID
			break
		}
	}
	if itemID == "" {
		t.Fatal("need equipment in starter inventory")
	}
	if _, errMsg := s.Equip("EquippedCamper", itemID, ""); errMsg != "" {
		t.Fatalf("equip: %s", errMsg)
	}
	_, errMsg := s.DepositHouseStorage("EquippedCamper", itemID, 1)
	if errMsg == "" {
		t.Fatal("expected deposit of equipped item to fail")
	}
}

func TestHouseFurniturePlacePick(t *testing.T) {
	s := Load("")
	p := s.GetOrCreate("Decorator", game.StartingJobs[0])
	var itemID string
	for _, it := range p.Inventory {
		if it.Kind == game.KindConsumable {
			itemID = it.ID
			break
		}
	}
	if itemID == "" {
		t.Fatal("need a consumable to place")
	}
	col0, row0 := game.HouseWalkOrigin()
	p2, furn, errMsg := s.PlaceHouseFurniture("Decorator", itemID, col0+1, row0+1)
	if errMsg != "" {
		t.Fatalf("place: %s", errMsg)
	}
	if furn.ID == "" || len(p2.HouseFurniture) != 1 {
		t.Fatalf("furniture not recorded: %+v", furn)
	}
	p3, errMsg := s.PickHouseFurniture("Decorator", furn.ID)
	if errMsg != "" {
		t.Fatalf("pick: %s", errMsg)
	}
	if len(p3.HouseFurniture) != 0 {
		t.Fatal("expected furniture cleared")
	}
}

func TestSetCampSkin(t *testing.T) {
	s := Load("")
	s.GetOrCreate("Skinner", game.StartingJobs[0])
	if got := s.CampSkinFor("Skinner"); got != game.DefaultCampSkin {
		t.Fatalf("default skin = %q, want %q", got, game.DefaultCampSkin)
	}
	p, errMsg := s.SetCampSkin("Skinner", "crimson")
	if errMsg != "" {
		t.Fatal(errMsg)
	}
	if p.CampSkin != "crimson" {
		t.Fatalf("camp skin = %q, want crimson", p.CampSkin)
	}
	p2, errMsg := s.SetCampSkin("Skinner", "nope")
	if errMsg != "" {
		t.Fatal(errMsg)
	}
	if p2.CampSkin != game.DefaultCampSkin {
		t.Fatalf("invalid skin should normalize, got %q", p2.CampSkin)
	}
}
