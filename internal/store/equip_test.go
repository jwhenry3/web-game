package store

import (
	"path/filepath"
	"testing"

	"clara-mundi/internal/game"
)

func testStore(t *testing.T) *Store {
	t.Helper()
	return Load(filepath.Join(t.TempDir(), "profiles.json"))
}

func testProfile(name string, mainJob, subJob game.JobID, inv []game.Item) *Profile {
	p := &Profile{
		Name:      name,
		MainJob:   string(mainJob),
		SubJob:    string(subJob),
		Jobs:      map[string]game.JobProgress{string(mainJob): {Level: 10}},
		Inventory: inv,
		Loadouts:  map[string]JobLoadout{},
	}
	if subJob != "" {
		p.Jobs[string(subJob)] = game.JobProgress{Level: 5}
	}
	p.ensureLoadout()
	return p
}

func TestEquipWeaponMatchingJob(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobHEX, game.JobCAN, []game.Item{
		{ID: "staff1", Name: "Staff", Kind: game.KindEquipment, Slot: game.SlotWeapon, Type: "staff", Rarity: game.RarityCommon, Level: 1},
	})

	if _, err := s.Equip("Hero", "staff1", "weapon"); err != "" {
		t.Fatalf("equip staff to HEX main failed: %s", err)
	}
	if _, err := s.Equip("Hero", "staff1", "sub_weapon"); err != "" {
		t.Fatalf("equip staff to CAN sub failed: %s", err)
	}
}

func TestEquipWeaponWrongTypeFails(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobHEX, "", []game.Item{
		{ID: "sword1", Name: "Sword", Kind: game.KindEquipment, Slot: game.SlotWeapon, Type: "sword", Rarity: game.RarityCommon, Level: 1},
	})

	if _, err := s.Equip("Hero", "sword1", "weapon"); err == "" {
		t.Fatal("equip sword to HEX main should fail")
	}
}

func TestEquipCutpurseDagger(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobCUT, "", []game.Item{
		{ID: "dagger1", Name: "Dagger", Kind: game.KindEquipment, Slot: game.SlotWeapon, Type: "dagger", Rarity: game.RarityCommon, Level: 1},
	})

	if _, err := s.Equip("Hero", "dagger1", "weapon"); err != "" {
		t.Fatalf("equip dagger to CUT main failed: %s", err)
	}
}

func TestEquipSubWeaponRequiresSubJob(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobHEX, "", []game.Item{
		{ID: "staff1", Name: "Staff", Kind: game.KindEquipment, Slot: game.SlotWeapon, Type: "staff", Rarity: game.RarityCommon, Level: 1},
	})

	if _, err := s.Equip("Hero", "staff1", "sub_weapon"); err == "" {
		t.Fatal("equip sub weapon without sub job should fail")
	}
}

func TestUnequipWeaponStaysUnequipped(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobVAN, "", []game.Item{
		{ID: "sword1", Name: "Sword", Kind: game.KindEquipment, Slot: game.SlotWeapon, Type: "sword", Rarity: game.RarityCommon, Level: 1},
	})

	if _, ok := s.Unequip("Hero", game.SlotWeapon); !ok {
		t.Fatal("unequip failed")
	}
	// Any ActiveLoadout read (stats refresh, weapon-type lookup, profile
	// projection) used to re-equip a job weapon into the empty slot — the
	// unequip must stick.
	_ = s.profiles["Hero"].WeaponType()
	l := s.profiles["Hero"].ActiveLoadout()
	if got := l.Equipped[game.SlotWeapon]; got != "" {
		t.Fatalf("weapon slot re-equipped itself: %q", got)
	}
	// Display reads the real item ("" = bare hands); combat keeps the job's
	// innate weapon via the fallback.
	if got := s.profiles["Hero"].EquippedWeaponType(); got != "" {
		t.Fatalf("EquippedWeaponType = %q, want unarmed", got)
	}
	if got := s.profiles["Hero"].WeaponType(); got == "" {
		t.Fatal("WeaponType should fall back to the job's innate weapon")
	}
}

func TestEquipArmorIgnoresSlotParam(t *testing.T) {
	s := testStore(t)
	s.profiles["Hero"] = testProfile("Hero", game.JobVAN, "", []game.Item{
		{ID: "helm1", Name: "Helm", Kind: game.KindEquipment, Slot: game.SlotHead, Rarity: game.RarityCommon, Level: 1},
	})

	if _, err := s.Equip("Hero", "helm1", ""); err != "" {
		t.Fatalf("equip armor failed: %s", err)
	}
	l := s.profiles["Hero"].ActiveLoadout()
	if l.Equipped[game.SlotHead] != "helm1" {
		t.Fatalf("head slot = %q, want helm1", l.Equipped[game.SlotHead])
	}
}
