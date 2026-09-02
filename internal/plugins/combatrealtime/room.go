package combatrealtime

import (
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/plugins/contracts"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/store"
)

const (
	pluginID   = "combat.realtime"
	frontendID = "combat.realtime"

	arenaW = 720.0
	arenaH = 480.0

	playerRadius  = 18.0
	enemyRadius   = 20.0
	playerSpeed   = 220.0
	enemySpeed    = 90.0
	attackRange   = 42.0
	meleeStopDist = attackRange
	attackArc     = 0.85
	allySkillRange = game.AllySkillRange
	attackDamage  = 18
	contactDamage     = 8
	enemyAttackCD     = 1200 * time.Millisecond // 50% longer than the original 800ms swing
	gcdDuration       = 2500 * time.Millisecond
	tickInterval      = 50 * time.Millisecond
	npcHoldSlack      = 10.0 // stay put until the player pulls this far past melee
	npcOverlapPad     = 4.0  // ignore overlaps shallower than this (stops oscillation)
	npcBlockCone      = 0.55 // cos of half-angle: NPCs ahead count as blockers
	npcBlockRange     = enemyRadius * 3.2
	castMoveCancel    = 4.0 // px: moving this far interrupts a cast
)

type Room struct {
	id    string
	level int
	host  contracts.CombatHost
	rng   *rand.Rand

	mu       sync.Mutex
	entities []*entity
	ended    bool
	quit     chan struct{}
}

func newRoom(id string, level int, host contracts.CombatHost, primaryKind string) *Room {
	r := &Room{
		id: id, level: level, host: host,
		rng:  rand.New(rand.NewSource(time.Now().UnixNano())),
		quit: make(chan struct{}),
	}
	r.spawnEnemies(primaryKind)
	return r
}

func (r *Room) spawnEnemies(primaryKind string) {
	templates := []struct {
		kind, name string
		hp         int
	}{
		{"goblin", "Goblin", 70},
		{"dire_wolf", "Dire Wolf", 55},
		{"stone_imp", "Stone Imp", 95},
	}
	count := 2 + r.rng.Intn(2)
	for i := 0; i < count; i++ {
		idx := r.rng.Intn(len(templates))
		if i == 0 && primaryKind != "" {
			for j, t := range templates {
				if t.kind == primaryKind {
					idx = j
					break
				}
			}
		}
		tpl := templates[idx]
		scale := 1.0 + float64(r.level-1)*0.15
		maxHP := int(float64(tpl.hp) * scale)
		side := 1.0
		if i%2 == 1 {
			side = -1
		}
		r.entities = append(r.entities, &entity{
			id: fmt.Sprintf("%s-enemy-%d", r.id, i+1),
			name: tpl.name, kind: tpl.kind, isPlayer: false,
			x: 520 + float64(i*40), y: 120 + float64(i*80),
			hp: maxHP, maxHP: maxHP, alive: true,
			facingX: -1, avoidSide: side,
		})
	}
}

func (r *Room) Run() {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			r.tick()
		case <-r.quit:
			return
		}
	}
}

func (r *Room) Close() { close(r.quit) }

func (r *Room) Join(clientID string, profile store.Profile) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ended {
		return
	}
	for _, e := range r.entities {
		if e.id == clientID {
			return
		}
	}
	loadout := profile.ActiveLoadout()
	hp, mp, str, mag, agi := game.ComputeJobStats(
		game.JobID(profile.MainJob), profile.MainJobLevel(),
		game.JobID(profile.SubJob), profile.SubJobEffectiveLevel(),
		profile.EquippedItems(),
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
	slot := len(r.playerIDs(false))
	targetID := ""
	for _, e := range r.entities {
		if !e.isPlayer && e.alive {
			targetID = e.id
			break
		}
	}
	r.entities = append(r.entities, &entity{
		id: clientID, name: profile.Name, isPlayer: true,
		profileName: profile.Name,
		weapon: profile.WeaponType(), subWeapon: profile.SubWeaponType(),
		mainJob: game.JobID(profile.MainJob), subJob: game.JobID(profile.SubJob),
		level: profile.MainJobLevel(),
		x: 80 + float64(slot*50), y: arenaH/2 + float64(slot*20),
		hp: hp, maxHP: hp, mp: mp, maxMP: mp,
		str: str, mag: mag, agi: agi,
		alive: true, targetID: targetID, facingX: 1,
		skillLevels: skillLevels, unlocked: unlocked,
		pendingSkillUses: map[string]int{},
	})
	r.broadcastState()
}

func (r *Room) Leave(clientID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, e := range r.entities {
		if e.id == clientID {
			if e.isPlayer {
				r.persistSkillUsage(e)
			}
			r.entities = append(r.entities[:i], r.entities[i+1:]...)
			break
		}
	}
	if r.ended {
		return
	}
	if len(r.playerIDs(false)) == 0 {
		r.ended = true
		r.host.FinishBattle(r.id, nil, false)
		return
	}
	r.broadcastState()
}

func (r *Room) Move(clientID string, x, y float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e := r.find(clientID)
	if e == nil || !e.alive {
		return
	}
	prevX, prevY := e.x, e.y
	e.x = clamp(x, playerRadius, arenaW-playerRadius)
	e.y = clamp(y, playerRadius, arenaH-playerRadius)
	if dx, dy := e.x-prevX, e.y-prevY; math.Hypot(dx, dy) > 0.5 {
		mag := math.Hypot(dx, dy)
		e.facingX = dx / mag
		e.facingY = dy / mag
	}
	if e.casting != nil && dist(e.x, e.y, prevX, prevY) >= castMoveCancel {
		r.interruptCast(e)
	}
}

func (r *Room) Attack(clientID string, facingX, facingY float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	attacker := r.find(clientID)
	if attacker == nil || !attacker.alive {
		return
	}
	mag := math.Hypot(facingX, facingY)
	if mag < 0.01 {
		facingX, facingY = attacker.facingX, attacker.facingY
		if math.Hypot(facingX, facingY) < 0.01 {
			facingX, facingY = 1, 0
		}
	} else {
		facingX /= mag
		facingY /= mag
	}
	attacker.facingX = facingX
	attacker.facingY = facingY
	if !attacker.gcdReady(time.Now()) {
		return
	}
	target := r.autoTarget(attacker)
	if target == nil {
		return
	}
	if !inMeleeArc(attacker, target, attackArc) {
		ev := protocol.RTBattleEventPayload{
			AttackerID: attacker.id, Hit: false, Success: false,
			ActionID: game.BasicAttack.ID, ActionName: game.BasicAttack.Name,
			Message:  fmt.Sprintf("%s missed", attacker.name),
			Entities: r.snapshots(),
		}
		r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleEvent, ev))
		return
	}
	res := r.applySkillEffect(attacker, target, game.BasicAttack, protocol.ActionResult{
		ActorID: attacker.id, ActionID: game.BasicAttack.ID,
		ActionName: game.BasicAttack.Name, TargetID: target.id,
	})
	ev := r.eventFromResult(attacker, res)
	r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleEvent, *ev))
	r.checkEnd()
}

func (r *Room) tick() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ended {
		return
	}
	now := time.Now()
	r.advanceCasts(now)

	for _, e := range r.entities {
		if !e.alive || e.isPlayer {
			continue
		}
		target := r.nearestPlayer(e)
		if target == nil {
			continue
		}
		dx := target.x - e.x
		dy := target.y - e.y
		d := math.Hypot(dx, dy)
		if d < 0.01 {
			continue
		}
		e.facingX = dx / d
		e.facingY = dy / d
		if e.avoidSide == 0 {
			e.avoidSide = 1
		}

		step := enemySpeed * tickInterval.Seconds()
		inMelee := d <= meleeStopDist
		if !inMelee && d <= meleeStopDist+npcHoldSlack && !r.npcHardOverlap(e) {
			inMelee = true
		}

		if inMelee {
			if now.After(e.attackCD) {
				target.hp -= contactDamage
				if target.hp <= 0 {
					target.hp = 0
					target.alive = false
				}
				e.attackCD = now.Add(enemyAttackCD)
				ev := protocol.RTBattleEventPayload{
					AttackerID: e.id, TargetID: target.id,
					Damage: contactDamage, Hit: true, Success: true,
					ActionID: game.BasicAttack.ID, ActionName: game.BasicAttack.Name,
					Message:  fmt.Sprintf("%s struck %s", e.name, target.name),
					Entities: r.snapshots(),
				}
				r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleEvent, ev))
			}
			// Only unstick when clearly overlapping another NPC; otherwise stand still.
			if ox, oy, deep := r.npcHardOverlapVec(e); deep {
				rx, ry := dx/d, dy/d
				radial := ox*rx + oy*ry
				tx, ty := ox-radial*rx, oy-radial*ry
				tm := math.Hypot(tx, ty)
				if tm < 0.15 {
					tx, ty = -ry*e.avoidSide, rx*e.avoidSide
					tm = 1
				}
				slide := step * 0.45
				e.x = clamp(e.x+tx/tm*slide, enemyRadius, arenaW-enemyRadius)
				e.y = clamp(e.y+ty/tm*slide, enemyRadius, arenaH-enemyRadius)
			}
			continue
		}

		vx, vy := dx/d, dy/d
		if r.npcBlocksPath(e, vx, vy) {
			vx += -e.facingY * e.avoidSide
			vy += e.facingX * e.avoidSide
		}
		vm := math.Hypot(vx, vy)
		if vm < 0.01 {
			continue
		}
		allowed := d - meleeStopDist
		if step > allowed {
			step = allowed
		}
		if step <= 0 {
			continue
		}
		e.x = clamp(e.x+vx/vm*step, enemyRadius, arenaW-enemyRadius)
		e.y = clamp(e.y+vy/vm*step, enemyRadius, arenaH-enemyRadius)
	}

	r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleTick, protocol.RTBattleTickPayload{
		Entities: r.snapshots(),
	}))
	r.checkEnd()
}

func (r *Room) persistSkillUsage(e *entity) {
	if !e.isPlayer || e.profileName == "" || len(e.pendingSkillUses) == 0 {
		return
	}
	r.host.Profiles().AddBattleTraining(e.profileName, e.pendingSkillUses)
	e.pendingSkillUses = map[string]int{}
}

func (r *Room) checkEnd() {
	playersAlive := 0
	enemiesAlive := 0
	for _, e := range r.entities {
		if !e.alive {
			continue
		}
		if e.isPlayer {
			playersAlive++
		} else {
			enemiesAlive++
		}
	}
	if enemiesAlive == 0 && playersAlive > 0 {
		r.finish(true)
	} else if playersAlive == 0 {
		r.finish(false)
	}
}

func (r *Room) finish(victory bool) {
	if r.ended {
		return
	}
	r.ended = true
	for _, e := range r.entities {
		if e.isPlayer {
			r.persistSkillUsage(e)
		}
	}
	fighters := make([]contracts.BattleFighter, 0)
	for _, id := range r.playerIDs(true) {
		if e := r.find(id); e != nil {
			fighters = append(fighters, contracts.BattleFighter{ClientID: id, Name: r.host.ClientName(id)})
		}
	}
	totalXP := 40 + r.level*25
	rewards := r.host.BuildVictoryRewards(r.id, fighters, totalXP, r.level, 0, r.rng)
	if victory {
		r.host.NotifyPassiveRewards(rewards)
	}
	r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleEnd, protocol.RTBattleEndPayload{
		Victory: victory, Rewards: rewards,
	}))
	r.host.FinishBattle(r.id, r.playerIDs(false), victory)
}

func (r *Room) broadcastState() {
	r.host.SendToClients(r.playerIDs(false), protocol.Encode(protocol.TypeRTBattleState, protocol.RTBattleStatePayload{
		BattleID: r.id, Entities: r.snapshots(), Mode: pluginID,
	}))
}

func (r *Room) snapshots() []protocol.RTBattleEntity {
	now := time.Now()
	out := make([]protocol.RTBattleEntity, 0, len(r.entities))
	for _, e := range r.entities {
		ent := protocol.RTBattleEntity{
			ID: e.id, Name: e.name, Kind: e.kind, IsPlayer: e.isPlayer,
			X: e.x, Y: e.y, HP: e.hp, MaxHP: e.maxHP, Alive: e.alive,
		}
		castSkill, castTarget, castProg, castMs := castFields(e)
		ent.CastingSkillID = castSkill
		ent.CastTargetID = castTarget
		ent.CastProgress = castProg
		ent.CastTimeMs = castMs
		if e.isPlayer {
			ent.MP = e.mp
			ent.MaxMP = e.maxMP
			ent.SkillATB = e.gcdProgress(now)
			ent.TargetID = e.targetID
			if s := game.Snapshots(e.statuses); len(s) > 0 {
				ent.Statuses = s
			}
		}
		out = append(out, ent)
	}
	return out
}

func (r *Room) find(id string) *entity {
	for _, e := range r.entities {
		if e.id == id {
			return e
		}
	}
	return nil
}

func (r *Room) playerIDs(aliveOnly bool) []string {
	var out []string
	for _, e := range r.entities {
		if e.isPlayer && (!aliveOnly || e.alive) {
			out = append(out, e.id)
		}
	}
	return out
}

func (r *Room) npcHardOverlap(e *entity) bool {
	_, _, deep := r.npcHardOverlapVec(e)
	return deep
}

func (r *Room) npcHardOverlapVec(e *entity) (float64, float64, bool) {
	limit := enemyRadius*2 - npcOverlapPad
	var sx, sy float64
	deep := false
	for _, other := range r.entities {
		if other.id == e.id || other.isPlayer || !other.alive {
			continue
		}
		d := dist(e.x, e.y, other.x, other.y)
		if d >= limit || d < 0.01 {
			continue
		}
		deep = true
		w := (limit - d) / limit
		sx += (e.x - other.x) / d * w
		sy += (e.y - other.y) / d * w
	}
	return sx, sy, deep
}

func (r *Room) npcBlocksPath(e *entity, fx, fy float64) bool {
	for _, other := range r.entities {
		if other.id == e.id || other.isPlayer || !other.alive {
			continue
		}
		ox := other.x - e.x
		oy := other.y - e.y
		d := math.Hypot(ox, oy)
		if d >= npcBlockRange || d < 0.01 {
			continue
		}
		if (ox*fx+oy*fy)/d >= npcBlockCone {
			return true
		}
	}
	return false
}

func (r *Room) nearestPlayer(e *entity) *entity {
	var best *entity
	bestD := math.MaxFloat64
	for _, p := range r.entities {
		if !p.alive || !p.isPlayer {
			continue
		}
		d := dist(e.x, e.y, p.x, p.y)
		if d < bestD {
			bestD = d
			best = p
		}
	}
	return best
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func dist(ax, ay, bx, by float64) float64 {
	return math.Hypot(ax-bx, ay-by)
}
