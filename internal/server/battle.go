package server

import (
	"fmt"
	"math/rand"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

// BattleRoom is an isolated, ephemeral combat instance implementing the GDD's
// Action Window system:
//
//  1. ACTION_REQUESTs arriving during the window are buffered in order.
//  2. When the window closes (the tick), the whole queue is processed:
//     validated (MP, targets, ATB readiness) and resolved.
//  3. A single atomic battle_event broadcast carries every result, so all
//     clients animate the batch deterministically.
//
// ATB bars fill from Agility each tick; an entity may only act on a full bar.

const (
	DefaultTickWindow = 200 * time.Millisecond
	atbMax            = 100.0
)

// roomHost abstracts the hub so battle logic is testable in isolation.
type roomHost interface {
	SendToClients(ids []string, msg []byte)
	FinishBattle(roomID string, participantIDs []string)
	Profiles() *store.Store
	BuildVictoryRewards(roomID string, fighters []battleFighter, totalXP, level, lootBonus int, rng *rand.Rand) []protocol.PlayerReward
	NotifyPassiveRewards(rewards []protocol.PlayerReward)
}

type battleEntity struct {
	ID          string
	Name        string
	IsPlayer    bool
	Weapon      game.WeaponType
	SubWeapon   game.WeaponType
	ProfileName string // players only: persistence key
	Level       int
	HP, MaxHP   int
	MP, MaxMP   int
	Str, Mag    int
	Agi         int
	AutoATB     float64 // weapon swing (FFXIV auto-attack)
	SkillATB    float64 // GCD (skills + consumables)
	AutoAttack  bool
	TargetID    string
	Alive       bool

	// Skill usage earned this battle (players only).
	pendingSkillUses map[string]int
	skillLevels      map[string]int
	mainJob          game.JobID
	subJob           game.JobID
	// Skills snapshotted at join.
	unlocked map[string]bool
	statuses []game.ActiveStatus
}

// battleFighter links a combat client to its persistence profile.
type battleFighter struct {
	ClientID string
	Name     string
}

func (b *BattleRoom) fighters() []battleFighter {
	var out []battleFighter
	for _, e := range b.entities {
		if e.IsPlayer {
			out = append(out, battleFighter{ClientID: e.ID, Name: e.ProfileName})
		}
	}
	return out
}

type queuedAction struct {
	ActorID string
	Action  protocol.ActionPayload
}

type joinRequest struct {
	ClientID string
	Profile  store.Profile
}

type autoCmd struct {
	ClientID string
	Enabled  *bool
}

type targetCmd struct {
	ClientID string
	TargetID string
}

type BattleRoom struct {
	ID    string
	Level int

	host roomHost

	joinCh   chan joinRequest
	leaveCh  chan string
	actionCh chan queuedAction
	autoCh   chan autoCmd
	targetCh chan targetCmd
	quitCh   chan struct{}

	// Fields below are owned by the Run goroutine (or the test driver).
	entities  []*battleEntity
	pending   []queuedAction
	lootBonus int
	rng       *rand.Rand
	ended     bool
}

var enemyTemplates = []struct {
	Name string
	HP   int
	Str  int
	Agi  int
}{
	{"Goblin", 80, 9, 11},
	{"Dire Wolf", 65, 8, 17},
	{"Stone Imp", 110, 11, 8},
}

func NewBattleRoom(id string, level int, host roomHost) *BattleRoom {
	b := &BattleRoom{
		ID:       id,
		Level:    level,
		host:     host,
		joinCh:   make(chan joinRequest, 16),
		leaveCh:  make(chan string, 16),
		actionCh: make(chan queuedAction, 64),
		autoCh:   make(chan autoCmd, 16),
		targetCh: make(chan targetCmd, 16),
		quitCh:   make(chan struct{}),
		rng:      rand.New(rand.NewSource(time.Now().UnixNano())),
	}
	b.spawnEnemies()
	return b
}

func (b *BattleRoom) spawnEnemies() {
	count := 2 + b.rng.Intn(2) // 2-3 enemies per encounter
	for i := 0; i < count; i++ {
		tpl := enemyTemplates[b.rng.Intn(len(enemyTemplates))]
		scale := 1.0 + float64(b.Level-1)*0.18
		e := &battleEntity{
			ID:       fmt.Sprintf("%s-enemy-%d", b.ID, i+1),
			Name:     tpl.Name,
			IsPlayer: false,
			Level:    b.Level,
			MaxHP:    int(float64(tpl.HP) * scale),
			Str:      int(float64(tpl.Str) * scale),
			Agi:        tpl.Agi,
			AutoAttack: true,
			Alive:      true,
		}
		e.HP = e.MaxHP
		b.entities = append(b.entities, e)
	}
}

// Join / Leave / QueueAction are the thread-safe entry points used by the hub.
func (b *BattleRoom) Join(clientID string, profile store.Profile) {
	b.joinCh <- joinRequest{ClientID: clientID, Profile: profile}
}

func (b *BattleRoom) Leave(clientID string) {
	b.leaveCh <- clientID
}

func (b *BattleRoom) QueueAction(clientID string, action protocol.ActionPayload) {
	select {
	case b.actionCh <- queuedAction{ActorID: clientID, Action: action}:
	default:
		// Buffer full: drop rather than block the hub.
	}
}

func (b *BattleRoom) ToggleAuto(clientID string, enabled *bool) {
	select {
	case b.autoCh <- autoCmd{ClientID: clientID, Enabled: enabled}:
	default:
	}
}

func (b *BattleRoom) SetTarget(clientID, targetID string) {
	select {
	case b.targetCh <- targetCmd{ClientID: clientID, TargetID: targetID}:
	default:
	}
}

// Run drives the room's event loop: buffering actions as they arrive and
// resolving the batch at the close of each action window.
func (b *BattleRoom) Run(window time.Duration) {
	ticker := time.NewTicker(window)
	defer ticker.Stop()
	for {
		select {
		case req := <-b.joinCh:
			b.addPlayer(req.ClientID, req.Profile)
		case clientID := <-b.leaveCh:
			b.removePlayer(clientID)
		case qa := <-b.actionCh:
			b.pending = append(b.pending, qa)
		case cmd := <-b.autoCh:
			if e := b.find(cmd.ClientID); e != nil && e.Alive {
				if cmd.Enabled != nil {
					e.AutoAttack = *cmd.Enabled
				} else {
					e.AutoAttack = !e.AutoAttack
				}
				b.broadcast(protocol.Encode(protocol.TypeBattleState, b.statePayload()))
			}
		case cmd := <-b.targetCh:
			if e := b.find(cmd.ClientID); e != nil {
				if t := b.find(cmd.TargetID); t != nil && t.Alive {
					e.TargetID = t.ID
					b.broadcast(protocol.Encode(protocol.TypeBattleState, b.statePayload()))
				}
			}
		case <-ticker.C:
			b.tick()
		case <-b.quitCh:
			return
		}
	}
}

func (b *BattleRoom) Close() {
	close(b.quitCh)
}

// ---- internal state (Run-goroutine owned) ----

func (b *BattleRoom) addPlayer(clientID string, p store.Profile) {
	if b.ended {
		return
	}
	if e := b.find(clientID); e != nil {
		return
	}
	loadout := p.ActiveLoadout()
	hp, mp, str, mag, agi := game.ComputeJobStats(
		game.JobID(p.MainJob), p.MainJobLevel(),
		game.JobID(p.SubJob), p.SubJobEffectiveLevel(),
		p.EquippedItems(),
	)
	skillLevels := map[string]int{}
	for id, lvl := range loadout.SkillLevels {
		skillLevels[id] = lvl
	}
	unlocked := map[string]bool{}
	for id, lvl := range skillLevels {
		if lvl > 0 {
			unlocked[id] = true
		}
	}
	e := &battleEntity{
		ID:          clientID,
		Name:        p.Name,
		IsPlayer:    true,
		Weapon:      p.WeaponType(),
		SubWeapon:   p.SubWeaponType(),
		ProfileName: p.Name,
		Level:       p.MainJobLevel(),
		MaxHP:       hp, HP: hp,
		MaxMP: mp, MP: mp,
		Str: str, Mag: mag, Agi: agi,
		Alive:       true,
		AutoAttack:  true,
		TargetID:    b.firstLivingEnemyID(),
		pendingSkillUses: map[string]int{},
		skillLevels: skillLevels,
		mainJob:     game.JobID(p.MainJob),
		subJob:      game.JobID(p.SubJob),
		unlocked:    unlocked,
	}
	b.entities = append(b.entities, e)
	b.broadcast(protocol.Encode(protocol.TypeBattleState, b.statePayload()))
}

func (b *BattleRoom) removePlayer(clientID string) {
	for i, e := range b.entities {
		if e.ID == clientID {
			// Skill usage still counts even when fleeing mid-battle.
			b.persistSkillUsage(e)
			b.entities = append(b.entities[:i], b.entities[i+1:]...)
			break
		}
	}
	if b.ended {
		return
	}
	if len(b.playerIDs(false)) == 0 {
		// Last player left: dissolve the instance without a battle_end.
		b.ended = true
		b.host.FinishBattle(b.ID, nil)
		return
	}
	b.broadcast(protocol.Encode(protocol.TypeBattleState, b.statePayload()))
}

func (b *BattleRoom) find(id string) *battleEntity {
	for _, e := range b.entities {
		if e.ID == id {
			return e
		}
	}
	return nil
}

// playerIDs returns client IDs of player entities; aliveOnly filters the dead.
func (b *BattleRoom) playerIDs(aliveOnly bool) []string {
	var out []string
	for _, e := range b.entities {
		if e.IsPlayer && (!aliveOnly || e.Alive) {
			out = append(out, e.ID)
		}
	}
	return out
}

func (b *BattleRoom) broadcast(msg []byte) {
	if msg == nil {
		return
	}
	b.host.SendToClients(b.playerIDs(false), msg)
}

func (b *BattleRoom) statePayload() protocol.BattleStatePayload {
	entities := make([]protocol.BattleEntity, 0, len(b.entities))
	for _, e := range b.entities {
		entities = append(entities, protocol.BattleEntity{
			ID: e.ID, Name: e.Name, IsPlayer: e.IsPlayer, Weapon: string(e.Weapon),
			Level: e.Level, HP: e.HP, MaxHP: e.MaxHP, MP: e.MP, MaxMP: e.MaxMP,
			Agility: e.Agi, AutoATB: e.AutoATB, SkillATB: e.SkillATB, ATB: e.SkillATB,
			AutoAttack: e.AutoAttack, TargetID: e.TargetID, Alive: e.Alive,
			Statuses: game.Snapshots(e.statuses),
		})
	}
	return protocol.BattleStatePayload{BattleID: b.ID, Entities: entities}
}

// tick closes the current action window: fills ATB bars, resolves the entire
// queued batch, lets ready NPCs act, then broadcasts one atomic update.
func (b *BattleRoom) tick() {
	if b.ended {
		return
	}

	// 1. Status ticks (HoT/DoT) then ATB fill.
	for _, e := range b.entities {
		if !e.Alive {
			continue
		}
		tickPower := max(1, e.MaxHP/20)
		if e.IsPlayer {
			tickPower = max(1, (e.Str+e.Mag)/4)
		}
		heal, poison := game.TickStatuses(&e.statuses, e.MaxHP, tickPower)
		if heal > 0 {
			e.HP += heal
			if e.HP > e.MaxHP {
				e.HP = e.MaxHP
			}
		}
		if poison > 0 {
			e.HP -= poison
			if e.HP <= 0 {
				e.HP = 0
				e.Alive = false
			}
		}
	}
	for _, e := range b.entities {
		if !e.Alive {
			continue
		}
		mult := game.ATBMultiplier(e.statuses)
		e.AutoATB += (3.0 + float64(e.Agi)*0.22) * mult
		e.SkillATB += (4.2 + float64(e.Agi)*0.32) * mult
		if e.AutoATB > atbMax {
			e.AutoATB = atbMax
		}
		if e.SkillATB > atbMax {
			e.SkillATB = atbMax
		}
	}

	var results []protocol.ActionResult

	// 2. Batch-process GCD actions (skills / items). Auto-attack is not queued.
	batch := b.pending
	b.pending = nil
	for _, qa := range batch {
		results = append(results, b.resolveAction(qa))
	}

	// 3. Auto-attacks: players swing at their target; enemies swing at the party.
	for _, e := range b.entities {
		if !e.Alive || !e.AutoAttack || e.AutoATB < atbMax || game.IsStunned(e.statuses) {
			continue
		}
		var target *battleEntity
		if e.IsPlayer {
			target = b.autoTarget(e)
		} else {
			target = b.randomAlivePlayer()
		}
		if target == nil {
			continue
		}
		results = append(results, b.performAutoAttack(e, target))
	}

	// 4. Atomic broadcast of the batch.
	if len(results) > 0 {
		b.broadcast(protocol.Encode(protocol.TypeBattleEvent, protocol.BattleEventPayload{
			Results:   results,
			Entities:  b.entityUpdates(),
			Timestamp: time.Now().UnixMilli(),
		}))
	} else {
		auto, gcd := map[string]float64{}, map[string]float64{}
		hp, alive, statuses := map[string]int{}, map[string]bool{}, map[string][]game.StatusSnapshot{}
		for _, e := range b.entities {
			auto[e.ID] = e.AutoATB
			gcd[e.ID] = e.SkillATB
			hp[e.ID] = e.HP
			alive[e.ID] = e.Alive
			if s := game.Snapshots(e.statuses); len(s) > 0 {
				statuses[e.ID] = s
			}
		}
		b.broadcast(protocol.Encode(protocol.TypeBattleTick, protocol.BattleTickPayload{
			AutoATB: auto, SkillATB: gcd, ATB: gcd,
			HP: hp, Alive: alive, Statuses: statuses,
		}))
	}

	// 5. Victory / defeat resolution.
	b.checkEnd()
}

// resolveAction validates one queued request (actor alive, ATB full, skill
// unlocked in the armory, weapon requirement, MP available, target legal)
// and applies its effect. Failures still produce a result so clients can
// play the "fizzle" animation.
func (b *BattleRoom) resolveAction(qa queuedAction) protocol.ActionResult {
	res := protocol.ActionResult{
		ActorID:  qa.ActorID,
		ActionID: qa.Action.ActionID,
		TargetID: qa.Action.TargetID,
	}
	actor := b.find(qa.ActorID)
	if actor == nil || !actor.Alive {
		res.Message = "Actor is unable to act."
		return res
	}
	if game.IsStunned(actor.statuses) {
		res.Message = "Stunned."
		return res
	}

	// Consumables share the skill GCD, not the auto-attack swing.
	if qa.Action.ActionID == "use_item" {
		return b.resolveItemUse(qa, actor, res)
	}

	skill, ok := game.FindSkill(qa.Action.ActionID)
	if !ok {
		res.Message = "Unknown ability."
		return res
	}
	res.ActionName = skill.Name

	// "Attack" is the auto-attack toggle / engage, not a GCD weaponskill.
	if skill.ID == game.BasicAttack.ID {
		return b.resolveEngage(qa, actor, res)
	}

	category := skill.Category
	skillJob := skill.Job

	if skill.ID != game.BasicAttack.ID && actor.skillLevels[skill.ID] < 1 {
		res.Message = "Skill not learned."
		return res
	}
	if skill.WeaponReq != "" && skill.WeaponReq != actor.weaponForSkill(skill) {
		res.Message = "Requires a " + string(skill.WeaponReq) + "."
		return res
	}
	if actor.SkillATB < atbMax {
		res.Message = "Not ready."
		return res
	}
	if actor.MP < skill.MPCost {
		res.Message = "Not enough MP."
		return res
	}
	target := b.find(qa.Action.TargetID)
	if target == nil || !target.Alive {
		res.Message = "Invalid target."
		return res
	}
	if game.SkillTargetsAlly(skill) && !target.IsPlayer {
		res.Message = "Must target an ally."
		return res
	}
	if !game.SkillTargetsAlly(skill) && target.IsPlayer {
		res.Message = "Must target an enemy."
		return res
	}

	actor.MP -= skill.MPCost
	actor.SkillATB = 0
	res.Success = true

	stat := actor.Str
	if skill.UsesMagic {
		stat = actor.Mag
	}
	power := skill.Power
	skillLvl := actor.skillLevels[skill.ID]
	if skillLvl < 1 {
		skillLvl = 1
	}
	power *= game.SkillLevelPotency(skillLvl)
	subjobSkill := skillJob != "" && skillJob == actor.subJob && skillJob != actor.mainJob
	if subjobSkill {
		power *= game.SubjobEffectRatio
	}
	if category != "" {
		power *= game.WeaponSynergy(category, actor.weaponForSkill(skill))
	}
	amount := b.rollDamage(stat, power)
	amount = game.ModifyDamageDealt(actor.statuses, amount)

	if skill.Heals {
		target.HP += amount
		if target.HP > target.MaxHP {
			target.HP = target.MaxHP
		}
		res.Heal = amount
	} else if !skill.Buffs {
		amount = game.ModifyDamageTaken(&target.statuses, amount)
		target.HP -= amount
		if target.HP <= 0 {
			target.HP = 0
			target.Alive = false
		}
		res.Damage = amount
	}

	b.applySkillStatuses(actor, target, skill, amount, &res)

	if actor.IsPlayer && skill.ID != game.BasicAttack.ID && actor.pendingSkillUses != nil {
		actor.pendingSkillUses[skill.ID]++
	}

	// Mug improves the rarity weighting of the victory loot pool.
	if skill.LootBonus {
		b.lootBonus++
	}
	return res
}

func (b *BattleRoom) applySkillStatuses(actor, target *battleEntity, skill game.Skill, power int, res *protocol.ActionResult) {
	effects := game.StatusesForSkill(skill.ID)
	if len(effects) == 0 {
		return
	}
	shieldAmt := maxInt(1, int(float64(actor.Mag)*skill.Power*2))
	for _, def := range effects {
		recipient := target
		if def.OnCaster {
			recipient = actor
		}
		shield := 0
		if def.Kind == game.StatusShield {
			shield = shieldAmt
		}
		game.ApplyStatus(&recipient.statuses, def, actor.ID, shield)
		res.StatusApplied = append(res.StatusApplied, game.StatusSnapshot{
			Kind:      string(def.Kind),
			Potency:   def.Potency,
			Remaining: def.Duration,
			ShieldHP:  shield,
		})
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (b *BattleRoom) resolveItemUse(qa queuedAction, actor *battleEntity, res protocol.ActionResult) protocol.ActionResult {
	res.ActionName = "Item"
	res.ItemID = qa.Action.ItemID
	if actor.SkillATB < atbMax {
		res.Message = "Not ready."
		return res
	}
	item, ok := b.host.Profiles().FindItem(actor.ProfileName, qa.Action.ItemID)
	if !ok || item.Kind != game.KindConsumable {
		res.Message = "No such item."
		return res
	}
	target := b.find(qa.Action.TargetID)
	if target == nil || !target.Alive || !target.IsPlayer {
		res.Message = "Invalid target."
		return res
	}
	hp, mp := game.ConsumableEffect(item)
	if hp == 0 && mp == 0 {
		res.Message = "This item has no effect."
		return res
	}
	if _, ok := b.host.Profiles().UseConsumable(actor.ProfileName, item.ID); !ok {
		res.Message = "No such item."
		return res
	}

	res.ActionName = item.Name
	actor.SkillATB = 0
	res.Success = true
	if hp > 0 {
		target.HP += hp
		if target.HP > target.MaxHP {
			target.HP = target.MaxHP
		}
		res.Heal = hp
	}
	if mp > 0 {
		target.MP += mp
		if target.MP > target.MaxMP {
			target.MP = target.MaxMP
		}
		res.MPRestored = mp
	}

	// Push the reduced inventory so the actor's hotbar counts stay honest.
	if profile, ok := b.host.Profiles().Get(actor.ProfileName); ok {
		b.host.SendToClients([]string{actor.ID}, protocol.Encode(protocol.TypeWelcome, protocol.WelcomePayload{
			PlayerID: actor.ID,
			Profile:  profileInfo(profile),
		}))
	}
	return res
}

// persistSkillUsage flushes a player's earned skill uses to the store.
func (b *BattleRoom) persistSkillUsage(e *battleEntity) {
	if !e.IsPlayer || e.ProfileName == "" {
		return
	}
	if len(e.pendingSkillUses) == 0 {
		return
	}
	b.host.Profiles().AddBattleTraining(e.ProfileName, e.pendingSkillUses)
	e.pendingSkillUses = map[string]int{}
}

func (e *battleEntity) weaponForSkill(skill game.Skill) game.WeaponType {
	if skill.Job != "" && skill.Job == e.subJob && skill.Job != e.mainJob {
		return e.SubWeapon
	}
	return e.Weapon
}

func (b *BattleRoom) rollDamage(stat int, power float64) int {
	base := float64(stat) * power
	dmg := int(base * (0.85 + b.rng.Float64()*0.3))
	if dmg < 1 {
		dmg = 1
	}
	return dmg
}

func (b *BattleRoom) randomAlivePlayer() *battleEntity {
	var alive []*battleEntity
	for _, e := range b.entities {
		if e.IsPlayer && e.Alive {
			alive = append(alive, e)
		}
	}
	if len(alive) == 0 {
		return nil
	}
	return alive[b.rng.Intn(len(alive))]
}

func (b *BattleRoom) entityUpdates() []protocol.EntityUpdate {
	out := make([]protocol.EntityUpdate, 0, len(b.entities))
	for _, e := range b.entities {
		out = append(out, protocol.EntityUpdate{
			ID: e.ID, HP: e.HP, MP: e.MP,
			AutoATB: e.AutoATB, SkillATB: e.SkillATB, ATB: e.SkillATB,
			AutoAttack: e.AutoAttack, TargetID: e.TargetID, Alive: e.Alive,
			Statuses: game.Snapshots(e.statuses),
		})
	}
	return out
}

func (b *BattleRoom) firstLivingEnemyID() string {
	for _, e := range b.entities {
		if !e.IsPlayer && e.Alive {
			return e.ID
		}
	}
	return ""
}

func (b *BattleRoom) autoTarget(actor *battleEntity) *battleEntity {
	if t := b.find(actor.TargetID); t != nil && t.Alive && !t.IsPlayer {
		return t
	}
	id := b.firstLivingEnemyID()
	actor.TargetID = id
	return b.find(id)
}

func (b *BattleRoom) performAutoAttack(actor, target *battleEntity) protocol.ActionResult {
	dmg := b.rollDamage(actor.Str, 1.0)
	dmg = game.ModifyDamageDealt(actor.statuses, dmg)
	dmg = game.ModifyDamageTaken(&target.statuses, dmg)
	target.HP -= dmg
	if target.HP <= 0 {
		target.HP = 0
		target.Alive = false
	}
	actor.AutoATB = 0
	return protocol.ActionResult{
		ActorID: actor.ID, ActionID: "attack", ActionName: "Auto-attack",
		TargetID: target.ID, Success: true, Damage: dmg,
	}
}

func (b *BattleRoom) resolveEngage(qa queuedAction, actor *battleEntity, res protocol.ActionResult) protocol.ActionResult {
	actor.AutoAttack = true
	if qa.Action.TargetID != "" {
		if t := b.find(qa.Action.TargetID); t != nil && t.Alive && !t.IsPlayer {
			actor.TargetID = t.ID
		}
	}
	if actor.AutoATB >= atbMax {
		if t := b.autoTarget(actor); t != nil {
			return b.performAutoAttack(actor, t)
		}
	}
	res.Success = true
	res.ActionName = "Auto-attack"
	res.Message = "Auto-attack on."
	return res
}

func (b *BattleRoom) checkEnd() {
	enemiesAlive, playersAlive := 0, 0
	hasPlayers := false
	for _, e := range b.entities {
		if e.IsPlayer {
			hasPlayers = true
			if e.Alive {
				playersAlive++
			}
		} else if e.Alive {
			enemiesAlive++
		}
	}
	if !hasPlayers {
		return
	}

	if enemiesAlive == 0 {
		b.finish(true)
	} else if playersAlive == 0 {
		b.finish(false)
	}
}

func (b *BattleRoom) finish(victory bool) {
	b.ended = true

	// Skill usage persists on victory AND defeat.
	for _, e := range b.entities {
		b.persistSkillUsage(e)
	}

	// Rewards must marshal as [] (not null) so clients can iterate safely.
	payload := protocol.BattleEndPayload{Victory: victory, Rewards: []protocol.PlayerReward{}}

	if victory {
		totalXP := 0
		for _, e := range b.entities {
			if !e.IsPlayer {
				totalXP += e.Level*45 + 30
			}
		}
		fighters := b.fighters()
		payload.Rewards = b.host.BuildVictoryRewards(b.ID, fighters, totalXP, b.Level, b.lootBonus, b.rng)
		b.host.NotifyPassiveRewards(payload.Rewards)
	}

	b.broadcast(protocol.Encode(protocol.TypeBattleEnd, payload))
	b.host.FinishBattle(b.ID, b.playerIDs(false))
}
