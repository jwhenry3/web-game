package combatatb

import (
	"encoding/json"
	"math/rand"
	"sync"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/plugins/contracts"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

func TestMain(m *testing.M) {
	// Tests assert FinishBattle synchronously after checkEnd/finish.
	ResultsGracePeriod = 0
	m.Run()
}

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
	fighters []contracts.BattleFighter,
	totalXP, level, lootBonus int,
	dropPoolIDs []string,
	rng *rand.Rand,
) []protocol.PlayerReward {
	converted := make([]battleFighter, len(fighters))
	for i, f := range fighters {
		converted[i] = battleFighter{ClientID: f.ClientID, Name: f.Name}
	}
	share := totalXP
	if len(fighters) > 1 {
		share = totalXP / len(fighters)
	}
	var out []protocol.PlayerReward
	for _, f := range converted {
		loot := game.GenerateVictoryLoot(rng, level, lootBonus, dropPoolIDs)
		hasSub := false
		if profile, ok := m.store.Get(f.Name); ok && profile.SubJob != "" {
			hasSub = true
		}
		mainXP, subXP := game.DistributeJobXP(share, hasSub)
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

func (m *mockHost) SendToClient(_ string, msg []byte) { m.SendToClients(nil, msg) }
func (m *mockHost) SendError(_ string, _ string)      {}
func (m *mockHost) Broadcast(msg []byte)             { m.SendToClients(nil, msg) }
func (m *mockHost) SendProfileUpdate(_ string, _ store.Profile) {}
func (m *mockHost) TickWindow() int64                { return int64(DefaultTickWindow / time.Millisecond) }
func (m *mockHost) EnterBattle(_, _ string)            {}
func (m *mockHost) ReleaseFromBattle(_ string)         {}
func (m *mockHost) BroadcastBattleList()               {}
func (m *mockHost) SyncPlayer(_ *protocol.WorldPlayer) {}
func (m *mockHost) PromptPartyForBattle(_, _ string, _, _ float64) {}
func (m *mockHost) ClearBattleInvite(_ string)         {}
func (m *mockHost) ParticipantCount(_ string) int      { return 0 }
func (m *mockHost) MaxPartySize() int                  { return 4 }
func (m *mockHost) ProfileFor(_ string) (store.Profile, bool) { return store.Profile{}, false }
func (m *mockHost) ClientName(_ string) string         { return "" }
func (m *mockHost) WorldPlayer(_ string) *protocol.WorldPlayer { return nil }
func (m *mockHost) NextBattleID() string               { return "battle-test" }

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
	profile := host.store.GetOrCreate("Bartz", game.JobVAN)
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
	player.skillLevels["van_cuneus"] = 1

	room.pending = append(room.pending,
		queuedAction{ActorID: "client-1", Action: protocol.ActionPayload{ActionID: "van_cuneus", TargetID: enemyID}},
		queuedAction{ActorID: "client-1", Action: protocol.ActionPayload{ActionID: "van_cuneus", TargetID: enemyID}},
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
	player.skillLevels["van_cuneus"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "van_cuneus", TargetID: enemyID},
	})
	if res.Success {
		t.Fatal("expected van_cuneus to fail with 0 MP")
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

// Alive pets must not prevent defeat when the human player falls.
func TestDefeatIgnoresAlivePet(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	room.entities = append(room.entities, &battleEntity{
		ID: "pet-1", Name: "Wolf", Kind: "dire_wolf",
		IsAlly: true, OwnerClientID: "client-1",
		Alive: true, HP: 40, MaxHP: 40, Level: 1,
	})
	player := room.find("client-1")
	player.HP = 0
	player.Alive = false
	room.checkEnd()
	if !room.ended {
		t.Fatal("expected defeat while pet still alive")
	}
	ends := host.messagesOfType(protocol.TypeBattleEnd)
	if len(ends) != 1 {
		t.Fatalf("expected battle_end, got %d", len(ends))
	}
	var payload protocol.BattleEndPayload
	_ = json.Unmarshal(ends[0].Payload, &payload)
	if payload.Victory {
		t.Fatal("expected defeat")
	}
}

// Skills auto-unlock by job level; battle use trains skill levels.
func TestSkillUsageAndUnlocks(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	player := room.find("client-1")
	enemyID := firstEnemyID(room)

	// Furious Advance unlocks at job level 5; Vanguard starts at 1.
	player.SkillATB = 100
	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "van_clamor_castra", TargetID: enemyID},
	})
	if res.Success {
		t.Fatal("van_clamor_castra should be locked until job level 5")
	}
	if res.Message != "Skill not learned." {
		t.Errorf("unexpected lock message: %q", res.Message)
	}

	// Rogue skills are not in the Vanguard job kit.
	res = room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "cut_surripere", TargetID: enemyID},
	})
	if res.Success {
		t.Fatal("cut_surripere should not be usable on Vanguard")
	}

	player.SkillATB = 100
	res = room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "van_cuneus", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("van_cuneus should be usable for Vanguard: %+v", res)
	}
	if player.pendingSkillUses["van_cuneus"] != 1 {
		t.Fatalf("expected 1 pending use, got %d", player.pendingSkillUses["van_cuneus"])
	}

	player.HP = 0
	player.Alive = false
	room.checkEnd()

	profile, _ := host.store.Get("Bartz")
	loadout := profile.ActiveLoadout()
	if loadout.SkillUsage["van_cuneus"] != 1 {
		t.Errorf("skill usage not persisted: %v", loadout.SkillUsage)
	}
}

func TestSkillLevelUpgrades(t *testing.T) {
	s := store.Load("")
	p := s.GetOrCreate("Bartz", game.JobVAN)
	if !p.HasSkill("van_cuneus") {
		t.Fatal("van_cuneus should auto-unlock for Vanguard at level 1")
	}
	if p.SkillLevel("van_cuneus") != 1 {
		t.Fatal("van_cuneus should start at level 1")
	}

	uses := game.SkillUsagePerLevel
	s.AddBattleTraining("Bartz", map[string]int{"van_cuneus": uses})
	p, _ = s.Get("Bartz")
	if p.SkillLevel("van_cuneus") != 2 {
		t.Fatalf("van_cuneus should reach level 2 after %d uses, got %d", uses, p.SkillLevel("van_cuneus"))
	}

	if p.HasSkill("van_impetus_acies") {
		t.Fatal("van_impetus_acies should not unlock until job level 9")
	}

	s.AwardJobVictory("Bartz", 1200, 0, nil)
	p, _ = s.Get("Bartz")
	if !p.HasSkill("van_clamor_castra") {
		t.Fatal("van_clamor_castra should auto-unlock at job level 5")
	}

	s.AddBattleTraining("Bartz", map[string]int{"van_clamor_castra": game.SkillUsagePerLevel})
	p, _ = s.Get("Bartz")
	if p.SkillLevel("van_clamor_castra") != 2 {
		t.Fatal("van_clamor_castra should upgrade to level 2 through use")
	}
}

func TestSubWeaponEnablesSubjobSkills(t *testing.T) {
	host := newMockHost()
	host.store.GetOrCreate("Bartz", game.JobVAN)
	host.store.AwardJobVictory("Bartz", 2000, 0, nil)
	_, errMsg := host.store.SetJobs("Bartz", game.JobVAN, game.JobCUT)
	if errMsg != "" {
		t.Fatalf("set jobs: %s", errMsg)
	}
	profile, _ := host.store.Get("Bartz")
	loadout := profile.ActiveLoadout()
	if loadout.Equipped[game.SlotSubWeapon] == "" {
		t.Fatal("sub weapon should be equipped for Rogue subjob")
	}

	room := NewBattleRoom("sub-weapon-test", 1, host)
	room.addPlayer("client-1", profile)
	player := room.find("client-1")
	enemyID := firstEnemyID(room)

	if player.SubWeapon != game.WeaponDagger {
		t.Fatalf("expected dagger sub weapon, got %s", player.SubWeapon)
	}

	player.SkillATB = 100
	player.skillLevels["cut_surripere"] = 1
	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "cut_surripere", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("cut_surripere should work with sub weapon equipped: %+v", res)
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
		if item.Consumable == "potio" {
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
		if item.Consumable == "potio" {
			qty += game.ItemQty(item)
		}
	}
	if qty != 2 {
		t.Fatalf("starter potions should decrement 3 → 2, got %d", qty)
	}
}

func TestConsumableRejectsKOAlly(t *testing.T) {
	host := newMockHost()
	room := newTestRoom(t, host)
	allyProfile := host.store.GetOrCreate("Lenna", game.JobSAN)
	room.addPlayer("client-2", allyProfile)
	ally := room.find("client-2")
	ally.HP = 0
	ally.Alive = false

	player := room.find("client-1")
	player.SkillATB = 100

	profile, _ := host.store.Get("Bartz")
	var potion game.Item
	for _, item := range profile.Inventory {
		if item.Consumable == "potio" {
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
	if res.Success {
		t.Fatalf("potion should not target KO ally: %+v", res)
	}
}

func TestSpellCastTime(t *testing.T) {
	host := newMockHost()
	room := NewBattleRoom("cast-test", 1, host)
	profile := host.store.GetOrCreate("Vivi", game.JobHEX)
	room.addPlayer("client-1", profile)
	room.tickWindow = DefaultTickWindow

	player := room.find("client-1")
	enemyID := firstEnemyID(room)
	enemy := room.find(enemyID)
	enemyHP := enemy.HP

	player.SkillATB = 100
	player.skillLevels["hex_ignis_hex"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "hex_ignis_hex", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("hex_ignis_hex should begin casting: %+v", res)
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
	player.skillLevels["van_cuneus"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "van_cuneus", TargetID: ""},
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
	player.skillLevels["van_cuneus"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "van_cuneus", TargetID: ""},
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
	player.skillLevels["van_cuneus"] = 1

	res := room.resolveAction(queuedAction{
		ActorID: "client-1",
		Action:  protocol.ActionPayload{ActionID: "van_cuneus", TargetID: enemyID},
	})
	if !res.Success {
		t.Fatalf("van_cuneus should resolve instantly: %+v", res)
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
	profile := host.store.GetOrCreate("Bartz", game.JobVAN)
	_, _, baseStr, _, _ := game.JobBaseStats(game.JobVAN, profile.MainJobLevel())

	room := NewBattleRoom("gear-test", 1, host)
	room.addPlayer("client-1", profile)
	e := room.find("client-1")

	// Starter sword grants +2 str and nothing else.
	if e.Str != baseStr+2 {
		t.Errorf("expected str %d (base+starter), got %d", baseStr+2, e.Str)
	}
	hp, _, _, _, _ := game.ComputeJobStats(game.JobVAN, profile.MainJobLevel(), "", 0, profile.EquippedItems())
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
