package game

import "testing"

func TestSkillEffectsSynthesizeLegacyFlags(t *testing.T) {
	// A flag-less combat skill synthesizes one damage component at skill power.
	effs := SkillEffects(BasicAttack)
	if len(effs) != 1 || effs[0].Kind != EffectDamage || effs[0].Power != BasicAttack.Power {
		t.Fatalf("attack effects = %+v, want a single damage component", effs)
	}
	heal, ok := FindSkill("san_sanare")
	if !ok {
		t.Fatal("san_sanare not found")
	}
	effs = SkillEffects(heal)
	if len(effs) != 1 || effs[0].Kind != EffectHeal || effs[0].Power != heal.Power {
		t.Fatalf("heal effects = %+v, want a single heal component", effs)
	}
	// Passives never execute — they synthesize no components.
	passive, ok := FindSkill("van_ripostis")
	if !ok || passive.Passive == nil {
		t.Fatal("van_ripostis passive not found")
	}
	if effs := SkillEffects(passive); len(effs) != 0 {
		t.Fatalf("passive effects = %+v, want none", effs)
	}
}

func TestSkillEffectsExplicitList(t *testing.T) {
	umbo, ok := FindSkill("aeg_umbo")
	if !ok {
		t.Fatal("aeg_umbo not found")
	}
	effs := SkillEffects(umbo)
	if len(effs) != 2 || effs[0].Kind != EffectDamage {
		t.Fatalf("umbo effects = %+v, want damage + status", effs)
	}
	if effs[1].Kind != EffectStatus || effs[1].Status == nil || effs[1].Status.Kind != StatusStun {
		t.Fatalf("umbo status component = %+v, want stun", effs[1])
	}
}

func TestTargetRuleResolution(t *testing.T) {
	cases := []struct {
		id   string
		want TargetRule
	}{
		{"attack", TargetEnemy},
		{"san_sanare", TargetAlly},       // Heals flag
		{"can_carmen_tutus", TargetAlly}, // Buffs flag
		{"aeg_tegimen", TargetAlly},      // non-caster status
		{"aeg_umbo", TargetEnemy},        // explicit enemy beats non-caster status
		{"san_lux_mitis", TargetEnemy},   // explicit enemy debuff
		{SkillIDReturn, TargetNone},      // field skill
		{"van_furor_linea", TargetEnemy}, // damage + caster status
	}
	for _, tc := range cases {
		s, ok := FindSkill(tc.id)
		if !ok {
			t.Fatalf("%s not found", tc.id)
		}
		if got := s.TargetRule(); got != tc.want {
			t.Errorf("%s target = %q, want %q", tc.id, got, tc.want)
		}
	}
}

func TestStatusesForSkillReadsComponents(t *testing.T) {
	defs := StatusesForSkill("can_carmen_tutus")
	if len(defs) != 1 || defs[0].Kind != StatusDefenseUp || defs[0].Duration != 40 || defs[0].Potency != 0.30 {
		t.Fatalf("carmen_tutus statuses = %+v", defs)
	}
	// On-caster statuses resolve through the same path.
	defs = StatusesForSkill("van_clamor_castra")
	if len(defs) != 1 || !defs[0].OnCaster {
		t.Fatalf("clamor_castra statuses = %+v", defs)
	}
}

func TestWorldSkillAction(t *testing.T) {
	for id, want := range map[string]string{
		SkillIDReturn: "return",
		SkillIDPort:   "port",
		SkillIDCamp:   "camp",
	} {
		s, ok := FindSkill(id)
		if !ok {
			t.Fatalf("%s not found", id)
		}
		if got := WorldSkillAction(s); got != want {
			t.Errorf("%s world action = %q, want %q", id, got, want)
		}
	}
	if got := WorldSkillAction(BasicAttack); got != "" {
		t.Errorf("attack world action = %q, want empty", got)
	}
}

func TestSkillValidate(t *testing.T) {
	bad := []Skill{
		{ID: "a", Target: "everybody"},
		{ID: "b", Effects: []SkillEffect{{Kind: "explode"}}},
		{ID: "c", Effects: []SkillEffect{{Kind: EffectDamage, Stat: "luck"}}},
		{ID: "d", Effects: []SkillEffect{{Kind: EffectDamage, World: "return"}}},
		{ID: "e", Effects: []SkillEffect{{Kind: EffectStatus}}},
		{ID: "f", Effects: []SkillEffect{{Kind: EffectWorld}}},
	}
	for _, s := range bad {
		if err := s.Validate(); err == nil {
			t.Errorf("skill %s should fail validation", s.ID)
		}
	}
	good := Skill{ID: "g", Target: TargetEnemy, Effects: []SkillEffect{
		{Kind: EffectDamage, Stat: "mag", Power: 1.2}, // legacy alias → int
		{Kind: EffectDamage, Stat: StatDex, Power: 0.5},
		{Kind: EffectStatus, Status: &StatusEffectDef{Kind: StatusPoison, Duration: 5}},
	}}
	if err := good.Validate(); err != nil {
		t.Fatalf("valid skill rejected: %v", err)
	}
}

func TestEffectStatAndClass(t *testing.T) {
	magic := Skill{ID: "hex", UsesMagic: true}
	phys := Skill{ID: "slash"}
	heal := Skill{ID: "cure", Heals: true}
	dmg := SkillEffect{Kind: EffectDamage}
	if got := EffectStat(magic, dmg); got != StatInt {
		t.Errorf("magic damage stat = %q, want int", got)
	}
	if got := EffectStat(phys, dmg); got != StatStr {
		t.Errorf("phys damage stat = %q, want str", got)
	}
	if got := EffectStat(heal, SkillEffect{Kind: EffectHeal}); got != StatMD {
		t.Errorf("heal stat = %q, want md", got)
	}
	if got := EffectStat(phys, SkillEffect{Kind: EffectDamage, Stat: "agi"}); got != StatDex {
		t.Errorf("legacy agi override = %q, want dex", got)
	}
	if got := EffectDamageClass(magic, dmg); got != ClassElemental {
		t.Errorf("magic damage class = %q, want elemental", got)
	}
	if got := EffectDamageClass(phys, dmg); got != ClassPhysical {
		t.Errorf("phys damage class = %q, want physical", got)
	}
}

func TestStatHelpers(t *testing.T) {
	if HitChance(20, 20) != 0.85 {
		t.Errorf("even dex hit chance = %v, want 0.85", HitChance(20, 20))
	}
	if HitChance(100, 0) < 0.97 {
		t.Error("overwhelming dex should near-cap hit chance")
	}
	if HitChance(0, 100) > 0.5 {
		t.Error("hopeless dex should floor at 50%")
	}
	if Mitigation(0) != 0 || Mitigation(120) != 0.5 {
		t.Errorf("mitigation curve off: 0→%v 120→%v", Mitigation(0), Mitigation(120))
	}
	if AttackSpeedScale(0) != 1 || AttackSpeedScale(100) != 0.65 {
		t.Errorf("speed scale off: 0→%v 100→%v", AttackSpeedScale(0), AttackSpeedScale(100))
	}
}

// Every catalog skill must pass component validation — this guards future
// defs as much as current ones.
func TestCatalogSkillsValidate(t *testing.T) {
	for _, s := range append([]Skill{BasicAttack, SkillCapture, SkillDodge}, Catalog...) {
		if err := s.Validate(); err != nil {
			t.Errorf("skill %s: %v", s.ID, err)
		}
	}
}

func TestBranchResolution(t *testing.T) {
	// attack: step 0 falls through to the base list, later steps hit their
	// named branches with power overrides.
	base := BasicAttack.Resolve(SkillContext{ComboStep: 0})
	if base.Name != "Attack" || len(base.Effects) != 0 {
		t.Fatalf("step 0 = %+v, want base skill (synthesized damage)", base.Name)
	}
	r := BasicAttack.Resolve(SkillContext{ComboStep: 3})
	if r.Name != "Attack IV" || len(r.Effects) != 1 || r.Effects[0].Power != 1.70 {
		t.Fatalf("step 3 = %+v, want Attack IV at 1.70", r)
	}
}

func TestConditionPredicates(t *testing.T) {
	s := Skill{ID: "x", Power: 1, Branches: []SkillBranch{
		{Effects: []SkillEffect{{Kind: EffectDamage, Power: 2}}, When: &EffectCondition{TargetHPBelow: 0.3}},
		{Effects: []SkillEffect{{Kind: EffectDamage, Power: 1.5}}, When: &EffectCondition{MinComboStack: 2}},
	}}
	powerOf := func(ctx SkillContext) float64 {
		return SkillEffects(s.Resolve(ctx))[0].Power
	}
	// No predicate met → the base (synthesized) damage at skill power.
	if got := powerOf(SkillContext{TargetHPFraction: 0.5}); got != 1 {
		t.Fatalf("default branch power = %v, want 1", got)
	}
	// Execute-phase: low target HP picks the first matching branch.
	if got := powerOf(SkillContext{TargetHPFraction: 0.2}); got != 2 {
		t.Fatalf("execute branch power = %v, want 2", got)
	}
	// Combo-stack gate fires on its own.
	if got := powerOf(SkillContext{TargetHPFraction: 0.5, ComboStack: 3}); got != 1.5 {
		t.Fatalf("combo branch power = %v, want 1.5", got)
	}
	// First match wins: low HP beats the stack branch even with both true.
	if got := powerOf(SkillContext{TargetHPFraction: 0.2, ComboStack: 3}); got != 2 {
		t.Fatalf("first-match-wins power = %v, want 2", got)
	}
}
