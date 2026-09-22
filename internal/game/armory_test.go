package game

import "testing"

func TestVanguardSkillTree(t *testing.T) {
	if SkillPrereq("van_cuneus") != "" {
		t.Fatal("root should have no prereq")
	}
	if SkillPrereq("van_furor_linea") != "van_cuneus" || SkillPrereq("van_clamor_castra") != "van_cuneus" {
		t.Fatal("Vanguard should branch from Wedge Guard")
	}
	if SkillPrereq("van_impetus_acies") != "van_clamor_castra" {
		t.Fatal("Line Hold should sit under War Cry")
	}
}

func TestHexwrightSkillTree(t *testing.T) {
	if SkillPrereq("hex_ignis_maius") != "hex_gelu_hex" {
		t.Fatal("Inferno should be on the Frost Brand branch")
	}
}

func TestSkillIsRanged(t *testing.T) {
	if SkillIsRanged(BasicAttack) {
		t.Fatal("basic attack is melee")
	}
	fire, ok := FindSkill("hex_ignis_hex")
	if !ok || !SkillIsRanged(fire) {
		t.Fatal("hex fire should be ranged")
	}
	jump, ok := FindSkill("lnc_saltus_hasta")
	if !ok || !jump.Ranged || !SkillIsRanged(jump) {
		t.Fatal("spear leap should be ranged")
	}
	if SkillMaxRange(jump) != SpellSkillRange {
		t.Fatalf("jump range %v", SkillMaxRange(jump))
	}
}

func TestEquippedClothLook(t *testing.T) {
	armor := func(slot, class string, level int) Item {
		return Item{ID: slot + "-" + class, Kind: KindEquipment, Slot: slot, Type: class, Level: level}
	}
	cases := []struct {
		name         string
		items        []Item
		cloth, color string
	}{
		{"no items", nil, BaseCloth, BaseClothColor},
		{"weapons only", []Item{StarterWeapon(WeaponSword)}, BaseCloth, BaseClothColor},
		{"light boots", []Item{armor(SlotFeet, ArmorLight, 1)}, "cloth10", "c1"},
		{"heavy chest", []Item{armor(SlotChest, ArmorHeavy, 1)}, "cloth15", "c2"},
		{
			"chest wins over higher-level piece",
			[]Item{armor(SlotLegs, ArmorLight, 10), armor(SlotChest, ArmorHeavy, 1)},
			"cloth15", "c2",
		},
		{
			"highest level wins without chest",
			[]Item{armor(SlotLegs, ArmorLight, 5), armor(SlotFeet, ArmorMedium, 10)},
			"cloth4", "c6",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cloth, color := EquippedClothLook(tc.items)
			if cloth != tc.cloth || color != tc.color {
				t.Fatalf("got %s/%s, want %s/%s", cloth, color, tc.cloth, tc.color)
			}
		})
	}
}

func TestCatalogCoversAllJobs(t *testing.T) {
	for _, job := range AllJobs() {
		skills := SkillsForJob(job.ID)
		if len(skills) != 5 {
			t.Fatalf("%s should have 5 skills, got %d", job.ID, len(skills))
		}
		if skills[4].Passive == nil {
			t.Fatalf("%s fifth skill should be passive", job.ID)
		}
	}
}
