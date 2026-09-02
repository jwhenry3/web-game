package server

import (
	"encoding/json"
	"math/rand"
	"sync"
	"testing"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

// mockHost captures broadcasts so battle logic can be tested synchronously,
// without a hub or real websocket clients.
type mockHost struct {
	mu       sync.Mutex
	store    *store.Store
	messages []protocol.Envelope
	finished bool
}

func newMockHost() *mockHost {
	return &mockHost{store: store.Load("")} // empty path: in-memory only
}

func (m *mockHost) SendToClients(ids []string, msg []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var env protocol.Envelope
	if err := json.Unmarshal(msg, &env); err == nil {
		m.messages = append(m.messages, env)
	}
}

func (m *mockHost) FinishBattle(roomID string, participantIDs []string, victory bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.finished = true
}

func (m *mockHost) Profiles() *store.Store { return m.store }

func (m *mockHost) BuildVictoryRewards(
	_ string,
	fighters []battleFighter,
	totalXP, level, lootBonus int,
	rng *rand.Rand,
) []protocol.PlayerReward {
	share := totalXP
	if len(fighters) > 1 {
		share = totalXP / len(fighters)
	}
	var out []protocol.PlayerReward
	for _, f := range fighters {
		loot := game.GenerateLoot(rng, level, lootBonus)
		mainXP := share
		subXP := 0
		if profile, ok := m.store.Get(f.Name); ok && profile.SubJob != "" {
			mainXP, subXP = game.JobXPSplit(share, profile.MainJobLevel(), profile.SubJobEffectiveLevel())
		}
		profile, levels, _ := m.store.AwardJobVictory(f.Name, mainXP, subXP, loot)
		out = append(out, protocol.PlayerReward{
			PlayerID: f.ClientID, XP: mainXP, SubXP: subXP, LevelsGained: levels,
			NewLevel: profile.MainJobLevel(), NewXP: profile.Jobs[profile.MainJob].XP,
			MaxXP: game.XPToNext(profile.MainJobLevel()), Loot: loot,
		})
	}
	return out
}

func (m *mockHost) NotifyPassiveRewards(_ []protocol.PlayerReward) {}

func (m *mockHost) BattleSpeed() float64 { return DefaultBattleSpeed }

func (m *mockHost) messagesOfType(t protocol.MessageType) []protocol.Envelope {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []protocol.Envelope
	for _, env := range m.messages {
		if env.Type == t {
			out = append(out, env)
		}
	}
	return out
}

func newTestRoom(t *testing.T, host *mockHost) *BattleRoom {
	t.Helper()
	room := NewBattleRoom("test-battle", 1, host)
	profile := host.store.GetOrCreate("Bartz", game.JobWAR)
	room.addPlayer("client-1", profile)
	return room
}

func firstEnemyID(room *BattleRoom) string {
	for _, e := range room.entities {
		if !e.IsPlayer {
			return e.ID
		}
	}
	return ""
}

// The GDD's Action Window: requests buffered during the window must be
// processed as one batch and broadcast in a single atomic battle_event.
func TestActionWindowBatchesActions(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)

	enemyID := firstEnemyID(room)

	player := room.find("client-1")
	player.SkillATB = 100
	player.skillLevels["war_heavy_swing"] = 1

	room.pending = append(room.pending,
		queuedAction{ActorID: "client-1", Action: protocol.ActionPayload{ActionID: "war_heavy_swing", TargetID: enemyID}},
		queuedAction{ActorID: "client-1", Action: protocol.ActionPayload{ActionID: "war_heavy_swing", TargetID: enemyID}},
	)
	room.tick()

	events := host.messagesOfType(protocol.TypeBattleEvent)
	if len(events) != 1 {
		t.Fatalf("expected exactly 1 atomic battle_event broadcast, got %d", len(events))
	}
	var payload protocol.BattleEventPayload
	if err := json.Unmarshal(events[0].Payload, &payload); err != nil {
		t.Fatalf("unmarshal battle_event: %v", err)
	}
	if len(payload.Results) < 2 {
		t.Fatalf("expected both buffered actions in the batch, got %d results", len(payload.Results))
	}
	if !payload.Results[0].Success {
		t.Errorf("first fire should succeed: %+v", payload.Results[0])
	}
	// Second GCD must fail: the skill ATB was consumed by the first.
	if payload.Results[1].Success {
		t.Errorf("second fire should fail (GCD spent), got success")
	}
	if payload.Timestamp == 0 {
		t.Error("expected non-zero timestamp")
	}
	if len(room.pending) != 0 {
		t.Errorf("action buffer should be drained after the tick, has %d", len(room.pending))
	}
}

// Server-side validation: actions must be rejected when MP is insufficient,
// producing a failure result (the client-side "fizzle").
func TestActionValidationRejectsInsufficientMP(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	enemyID := firstEnemyID(room)

	player := room.find("client-1")
	player.SkillATB = 100
	player.MP = 0
	player.skillLevels["war_heavy_swing"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "war_heavy_swing", TargetID: enemyID},
	})
	if res.Success {
		t.Fatal("expected war_heavy_swing to fail with 0 MP")
	}
	if res.Message != "Not enough MP." {
		t.Errorf("unexpected failure message: %q", res.Message)
	}
}

// Victory resolution: defeating all enemies awards XP, levels, and
// procedurally generated loot, persisted to the profile store.
func TestVictoryAwardsXPAndLoot(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)

	// Slay all enemies directly.
	for _, e := range room.entities {
		if !e.IsPlayer {
			e.HP = 0
			e.Alive = false
		}
	}
	room.checkEnd()

	if !room.ended {
		t.Fatal("room should be ended after all enemies die")
	}
	if !host.finished {
		t.Fatal("host.FinishBattle should have been called")
	}
	ends := host.messagesOfType(protocol.TypeBattleEnd)
	if len(ends) != 1 {
		t.Fatalf("expected 1 battle_end, got %d", len(ends))
	}
	var payload protocol.BattleEndPayload
	if err := json.Unmarshal(ends[0].Payload, &payload); err != nil {
		t.Fatalf("unmarshal battle_end: %v", err)
	}
	if !payload.Victory {
		t.Fatal("expected victory")
	}
	if len(payload.Rewards) != 1 {
		t.Fatalf("expected 1 reward entry, got %d", len(payload.Rewards))
	}
	r := payload.Rewards[0]
	if r.XP <= 0 {
		t.Error("expected positive XP reward")
	}
	if len(r.Loot) == 0 {
		t.Error("expected at least one procedurally generated loot drop")
	}

	profile, ok := host.store.Get("Bartz")
	if !ok {
		t.Fatal("profile should exist")
	}
	if profile.Jobs[profile.MainJob].XP != r.NewXP || profile.MainJobLevel() != r.NewLevel {
		t.Errorf("persisted profile (%d xp, lv %d) does not match reward (%d xp, lv %d)",
			profile.Jobs[profile.MainJob].XP, profile.MainJobLevel(), r.NewXP, r.NewLevel)
	}
	if !inventoryContainsLoot(profile.Inventory, r.Loot) {
		t.Errorf("loot not persisted to inventory: have %d items, loot %d", len(profile.Inventory), len(r.Loot))
	}
}

// Defeat resolution: all players dead ends the battle without rewards.
func TestDefeatEndsBattleWithoutRewards(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)

	player := room.find("client-1")
	player.HP = 0
	player.Alive = false
	room.checkEnd()

	ends := host.messagesOfType(protocol.TypeBattleEnd)
	if len(ends) != 1 {
		t.Fatalf("expected 1 battle_end, got %d", len(ends))
	}
	var payload protocol.BattleEndPayload
	if err := json.Unmarshal(ends[0].Payload, &payload); err != nil {
		t.Fatalf("unmarshal battle_end: %v", err)
	}
	if payload.Victory {
		t.Fatal("expected defeat")
	}
	if len(payload.Rewards) != 0 {
		t.Errorf("defeat should carry no rewards, got %d", len(payload.Rewards))
	}

	// Regression: rewards must serialize as [] (not null) or clients crash
	// iterating it on the defeat screen.
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(ends[0].Payload, &raw); err != nil {
		t.Fatalf("unmarshal raw battle_end: %v", err)
	}
	if string(raw["rewards"]) != "[]" {
		t.Errorf(`rewards must marshal as [], got %s`, raw["rewards"])
	}
}

// Skills auto-unlock by job level; battle use trains skill levels.
func TestSkillUsageAndUnlocks(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	player := room.find("client-1")
	enemyID := firstEnemyID(room)

	// Berserk unlocks at job level 5; WAR starts at 1.
	player.SkillATB = 100
	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "war_berserk", TargetID: enemyID},
	})
	if res.Success {
		t.Fatal("war_berserk should be locked until job level 5")
	}
	if res.Message != "Skill not learned." {
		t.Errorf("unexpected lock message: %q", res.Message)
	}

	// THF skills are not in the WAR job kit.
	res = room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "thf_steal", TargetID: enemyID},
	})
	if res.Success {
		t.Fatal("thf_steal should not be usable on WAR")
	}

	player.SkillATB = 100
	res = room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "war_heavy_swing", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("war_heavy_swing should be usable for WAR: %+v", res)
	}
	if player.pendingSkillUses["war_heavy_swing"] != 1 {
		t.Fatalf("expected 1 pending use, got %d", player.pendingSkillUses["war_heavy_swing"])
	}

	player.HP = 0
	player.Alive = false
	room.checkEnd()

	profile, _ := host.store.Get("Bartz")
	loadout := profile.ActiveLoadout()
	if loadout.SkillUsage["war_heavy_swing"] != 1 {
		t.Errorf("skill usage not persisted: %v", loadout.SkillUsage)
	}
}

func TestSkillLevelUpgrades(t *testing.T) {
	s := store.Load("")
	p := s.GetOrCreate("Bartz", game.JobWAR)
	if !p.HasSkill("war_heavy_swing") {
		t.Fatal("war_heavy_swing should auto-unlock for WAR at level 1")
	}
	if p.SkillLevel("war_heavy_swing") != 1 {
		t.Fatal("war_heavy_swing should start at level 1")
	}

	uses := game.SkillUsagePerLevel
	s.AddBattleTraining("Bartz", map[string]int{"war_heavy_swing": uses})
	p, _ = s.Get("Bartz")
	if p.SkillLevel("war_heavy_swing") != 2 {
		t.Fatalf("war_heavy_swing should reach level 2 after %d uses, got %d", uses, p.SkillLevel("war_heavy_swing"))
	}

	if p.HasSkill("war_rampage") {
		t.Fatal("war_rampage should not unlock until job level 9")
	}

	s.AwardJobVictory("Bartz", 1200, 0, nil)
	p, _ = s.Get("Bartz")
	if !p.HasSkill("war_berserk") {
		t.Fatal("war_berserk should auto-unlock at job level 5")
	}

	s.AddBattleTraining("Bartz", map[string]int{"war_berserk": game.SkillUsagePerLevel})
	p, _ = s.Get("Bartz")
	if p.SkillLevel("war_berserk") != 2 {
		t.Fatal("war_berserk should upgrade to level 2 through use")
	}
}

func TestSubWeaponEnablesSubjobSkills(t *testing.T) {
	host := newMockHost()
	host.store.GetOrCreate("Bartz", game.JobWAR)
	host.store.AwardJobVictory("Bartz", 2000, 0, nil)
	_, errMsg := host.store.SetJobs("Bartz", game.JobWAR, game.JobTHF)
	if errMsg != "" {
		t.Fatalf("set jobs: %s", errMsg)
	}
	profile, _ := host.store.Get("Bartz")
	loadout := profile.ActiveLoadout()
	if loadout.Equipped[game.SlotSubWeapon] == "" {
		t.Fatal("sub weapon should be equipped for THF subjob")
	}

	room := NewBattleRoom("sub-weapon-test", 1, host)
	room.addPlayer("client-1", profile)
	player := room.find("client-1")
	enemyID := firstEnemyID(room)

	if player.SubWeapon != game.WeaponDagger {
		t.Fatalf("expected dagger sub weapon, got %s", player.SubWeapon)
	}

	player.SkillATB = 100
	player.skillLevels["thf_steal"] = 1
	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "thf_steal", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("thf_steal should work with sub weapon equipped: %+v", res)
	}
}

func TestConsumableUseHeals(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	player := room.find("client-1")
	player.SkillATB = 100
	player.HP = 40

	profile, _ := host.store.Get("Bartz")
	var potion game.Item
	for _, item := range profile.Inventory {
		if item.Consumable == "potion" {
			potion = item
			break
		}
	}
	if potion.ID == "" {
		t.Fatal("starter kit should include a potion")
	}

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "use_item", TargetID: "client-1", ItemID: potion.ID},
	})
	if !res.Success {
		t.Fatalf("potion should succeed: %+v", res)
	}
	if player.HP <= 40 {
		t.Fatalf("potion should restore HP, got %d", player.HP)
	}
	after, _ := host.store.Get("Bartz")
	qty := 0
	for _, item := range after.Inventory {
		if item.Consumable == "potion" {
			qty += game.ItemQty(item)
		}
	}
	if qty != 2 {
		t.Fatalf("starter potions should decrement 3 → 2, got %d", qty)
	}
}

func TestConsumableRevivesKOAlly(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	allyProfile := host.store.GetOrCreate("Lenna", game.JobWHM)
	room.addPlayer("client-2", allyProfile)
	ally := room.find("client-2")
	ally.HP = 0
	ally.Alive = false

	player := room.find("client-1")
	player.SkillATB = 100

	profile, _ := host.store.Get("Bartz")
	var potion game.Item
	for _, item := range profile.Inventory {
		if item.Consumable == "potion" {
			potion = item
			break
		}
	}
	if potion.ID == "" {
		t.Fatal("starter kit should include a potion")
	}

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "use_item", TargetID: "client-2", ItemID: potion.ID},
	})
	if !res.Success {
		t.Fatalf("potion should revive ally: %+v", res)
	}
	if !ally.Alive || ally.HP <= 0 {
		t.Fatalf("ally should be alive with HP after potion, got alive=%v hp=%d", ally.Alive, ally.HP)
	}
}

func TestSpellCastTime(t *testing.T) {
	host := newMockHost()
	room := NewBattleRoom("cast-test", 1, host)
	profile := host.store.GetOrCreate("Vivi", game.JobBLM)
	room.addPlayer("client-1", profile)
	room.tickWindow = DefaultTickWindow

	player := room.find("client-1")
	enemyID := firstEnemyID(room)
	enemy := room.find(enemyID)
	enemyHP := enemy.HP

	player.SkillATB = 100
	player.skillLevels["blm_fire"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "blm_fire", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("blm_fire should begin casting: %+v", res)
	}
	if !res.CastStarted {
		t.Fatal("expected CastStarted on spell begin")
	}
	if res.Damage != 0 {
		t.Fatalf("spell should not deal damage immediately, got %d", res.Damage)
	}
	if enemy.HP != enemyHP {
		t.Fatalf("enemy HP should be unchanged during cast start, %d -> %d", enemyHP, enemy.HP)
	}
	if player.casting == nil {
		t.Fatal("player should have active cast")
	}
	if player.SkillATB != 0 {
		t.Fatalf("GCD should be spent when cast begins, skill ATB=%f", player.SkillATB)
	}

	for i := 0; i < 20 && player.casting != nil; i++ {
		room.tick()
	}
	if player.casting != nil {
		t.Fatal("cast should complete within 20 ticks")
	}
	if enemy.HP >= enemyHP {
		t.Fatalf("fire spell should damage enemy after cast, HP %d -> %d", enemyHP, enemy.HP)
	}
}

func TestEnemySkillAutoTargets(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	player := room.find("client-1")
	player.SkillATB = 100
	player.TargetID = ""
	player.skillLevels["war_heavy_swing"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "war_heavy_swing", TargetID: ""},
	})
	if !res.Success {
		t.Fatalf("enemy skill should auto-target: %+v", res)
	}
	if res.TargetID == "" {
		t.Fatal("expected auto-selected enemy target")
	}
	target := room.find(res.TargetID)
	if target == nil || target.IsPlayer || !target.Alive {
		t.Fatalf("target should be a living enemy, got %+v", target)
	}
	if player.TargetID != target.ID {
		t.Fatalf("player focus should sync to auto-target %q, got %q", target.ID, player.TargetID)
	}
}

func TestEnemySkillUsesSelectedTarget(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	player := room.find("client-1")
	enemyID := firstEnemyID(room)
	var otherEnemyID string
	for _, e := range room.entities {
		if !e.IsPlayer && e.Alive && e.ID != enemyID {
			otherEnemyID = e.ID
			break
		}
	}
	if otherEnemyID == "" {
		t.Skip("need multiple enemies for this test")
	}

	player.SkillATB = 100
	player.TargetID = otherEnemyID
	player.skillLevels["war_heavy_swing"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "war_heavy_swing", TargetID: ""},
	})
	if !res.Success {
		t.Fatalf("enemy skill should succeed: %+v", res)
	}
	if res.TargetID != otherEnemyID {
		t.Fatalf("expected selected enemy %q, got %q", otherEnemyID, res.TargetID)
	}
}

func TestAttackUsesGCD(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	enemyID := firstEnemyID(room)
	enemy := room.find(enemyID)
	enemyHP := enemy.HP

	player := room.find("client-1")
	player.SkillATB = 100

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "attack", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("attack should succeed: %+v", res)
	}
	if res.Damage <= 0 {
		t.Fatal("attack should deal damage")
	}
	if enemy.HP >= enemyHP {
		t.Fatalf("enemy should take damage, HP %d -> %d", enemyHP, enemy.HP)
	}
	if player.SkillATB != 0 {
		t.Fatalf("attack should spend the GCD, skill ATB=%f", player.SkillATB)
	}
}

func TestEnemyAttackOnGCD(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	player := room.find("client-1")
	playerHP := player.HP

	var enemy *battleEntity
	for _, e := range room.entities {
		if !e.IsPlayer {
			enemy = e
			break
		}
	}
	enemy.SkillATB = 100

	room.tick()
	if player.HP >= playerHP {
		t.Fatal("enemy should attack on the shared GCD")
	}
	if enemy.SkillATB != 0 {
		t.Fatalf("enemy attack should spend GCD, skill ATB=%f", enemy.SkillATB)
	}
}

func TestPhysicalSkillInstant(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	enemyID := firstEnemyID(room)
	enemy := room.find(enemyID)
	enemyHP := enemy.HP

	player := room.find("client-1")
	player.SkillATB = 100
	player.skillLevels["war_heavy_swing"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "war_heavy_swing", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("war_heavy_swing should resolve instantly: %+v", res)
	}
	if res.CastStarted {
		t.Fatal("physical skill should not start a cast")
	}
	if res.Damage <= 0 {
		t.Fatal("physical skill should deal damage immediately")
	}
	if enemy.HP >= enemyHP {
		t.Fatalf("enemy should take damage immediately, HP %d -> %d", enemyHP, enemy.HP)
	}
	if player.casting != nil {
		t.Fatal("player should not be casting after instant skill")
	}
}

func inventoryContainsLoot(inv, loot []game.Item) bool {
	for _, drop := range loot {
		found := false
		for _, item := range inv {
			if drop.Kind == game.KindEquipment {
				if item.ID == drop.ID {
					found = true
					break
				}
			} else if item.Consumable == drop.Consumable && item.Level == drop.Level {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// Only equipped gear contributes stats; loose inventory does not.
func TestOnlyEquippedGearApplies(t *testing.T) {
	host := newMockHost()
	profile := host.store.GetOrCreate("Bartz", game.JobWAR)
	_, _, baseStr, _, _ := game.JobBaseStats(game.JobWAR, profile.MainJobLevel())

	room := NewBattleRoom("gear-test", 1, host)
	room.addPlayer("client-1", profile)
	e := room.find("client-1")

	// Starter sword grants +2 str and nothing else.
	if e.Str != baseStr+2 {
		t.Errorf("expected str %d (base+starter), got %d", baseStr+2, e.Str)
	}
	hp, _, _, _, _ := game.ComputeJobStats(game.JobWAR, profile.MainJobLevel(), "", 0, profile.EquippedItems())
	if e.MaxHP != hp {
		t.Errorf("expected hp %d (job+gear), got %d", hp, e.MaxHP)
	}
}

// ATB pacing: the GCD bar fills from Agility each tick and caps at 100.
func TestATBFillsWithAgility(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	player := room.find("client-1")
	player.SkillATB = 0

	room.tick()
	if player.SkillATB <= 0 {
		t.Fatal("GCD should fill on tick")
	}
	for i := 0; i < 100; i++ {
		room.tick()
		if room.ended {
			break
		}
	}
	if player.SkillATB > 100 {
		t.Errorf("SkillATB must cap at 100, got %f", player.SkillATB)
	}
}
