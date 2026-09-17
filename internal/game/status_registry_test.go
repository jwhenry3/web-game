package game

import (
	"strings"
	"testing"
)

func TestAllKindsRegistered(t *testing.T) {
	kinds := []StatusKind{
		StatusDefenseUp, StatusDefenseDown,
		StatusAttackUp, StatusAttackDown,
		StatusShield, StatusRegen, StatusPoison,
		StatusHaste, StatusStun,
	}
	for _, k := range kinds {
		if lookupDef(k) == nil {
			t.Errorf("StatusKind %q not registered", k)
		}
	}
}

func TestRegistryDisplayNames(t *testing.T) {
	want := map[StatusKind]string{
		StatusDefenseUp:   "Protect",
		StatusDefenseDown: "Weaken",
		StatusAttackUp:    "Boost",
		StatusAttackDown:  "Sap",
		StatusShield:      "Shield",
		StatusRegen:       "Regen",
		StatusPoison:      "Poison",
		StatusHaste:       "Haste",
		StatusStun:        "Stun",
	}
	for kind, expected := range want {
		if got := StatusDisplayName(kind); got != expected {
			t.Errorf("StatusDisplayName(%q) = %q, want %q", kind, got, expected)
		}
	}
}

func TestUnregisteredKindFallback(t *testing.T) {
	got := StatusDisplayName(StatusKind("unknown_thing"))
	if got != "unknown_thing" {
		t.Errorf("expected fallback to kind string, got %q", got)
	}
}

func TestRegistryDescribe(t *testing.T) {
	s := ActiveStatus{Kind: StatusDefenseUp, Potency: 0.30, Remaining: 25}
	desc := StatusDescribe(s)
	if !strings.Contains(desc, "Protect") || !strings.Contains(desc, "30%") {
		t.Errorf("unexpected describe output: %s", desc)
	}
}

func TestRegistryPoisonTick(t *testing.T) {
	list := []ActiveStatus{{Kind: StatusPoison, Potency: 0.5, Remaining: 3}}
	_, dmg := TickStatuses(&list, 100, 20)
	if dmg != 10 {
		t.Errorf("expected poison damage 10, got %d", dmg)
	}
}

func TestRegistryRegenTick(t *testing.T) {
	list := []ActiveStatus{{Kind: StatusRegen, Potency: 0.5, Remaining: 3}}
	heal, _ := TickStatuses(&list, 100, 20)
	if heal != 10 {
		t.Errorf("expected regen heal 10, got %d", heal)
	}
}

func TestRegistryShieldFlagOnApply(t *testing.T) {
	var list []ActiveStatus
	ApplyStatus(&list, StatusEffectDef{Kind: StatusShield, Duration: 10, Potency: 1}, "src", 50)
	if len(list) != 1 || list[0].ShieldHP != 50 {
		t.Fatalf("shield apply failed: %+v", list)
	}
}

func TestRegistryATBModComposition(t *testing.T) {
	list := []ActiveStatus{
		{Kind: StatusHaste, Potency: 0.20, Remaining: 5},
		{Kind: StatusHaste, Potency: 0.10, Remaining: 5},
	}
	if got := ATBMultiplier(list); got != 1.30 {
		t.Errorf("expected ATB 1.30, got %v", got)
	}
}
