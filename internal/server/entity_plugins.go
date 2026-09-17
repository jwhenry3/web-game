package server

import (
	"log"
	"math"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// ---------------------------------------------------------------- player

// clientControl marks a player entity: movement comes from the client (the
// `move` handler writes X/Y/Facing via clampMove), and all player-only state
// lives here instead of on the shared entity core.
type clientControl struct {
	weapon, subWeapon game.WeaponType
	mainJob, subJob   game.JobID
	skillLevels       map[string]int
	pendingSkillUses  map[string]int

	stamina      float64
	staminaAt    time.Time
	dodgeReadyAt time.Time
	dodgedAt     time.Time
	lastMoveAt   time.Time
	lastMoveDX   float64
	lastMoveDY   float64
	inCombat     bool
	regenAcc     float64

	// World presence details (formerly protocol.WorldPlayer fields).
	weaponName  string
	race        string
	mainJobName string
	subJobName  string
	appearance  protocol.CharacterAppearance
	inHouse     bool
	houseOwner  string
	immuneUntil int64 // unix millis

	// Field cast (Teleport): client interpolates from receipt + castTimeMs.
	fieldCastSkillID string
	fieldCastTimeMs  int
	fieldCastEndsAt  int64
}

func newClientControl() *clientControl {
	return &clientControl{
		stamina:          staminaMax,
		staminaAt:        time.Now(),
		skillLevels:      map[string]int{},
		pendingSkillUses: map[string]int{},
	}
}

// staminaNow lazily regenerates stamina to `now`.
func (cc *clientControl) staminaNow(now time.Time) float64 {
	if cc.staminaAt.IsZero() {
		return cc.stamina
	}
	cc.stamina = math.Min(staminaMax, cc.stamina+staminaRegenRate*now.Sub(cc.staminaAt).Seconds())
	cc.staminaAt = now
	return cc.stamina
}

func (cc *clientControl) weaponForSkill(skill game.Skill) game.WeaponType {
	if skill.Job != "" && skill.Job == cc.subJob && skill.Job != cc.mainJob {
		return cc.subWeapon
	}
	return cc.weapon
}

func (cc *clientControl) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	e.hidden = cc.inHouse
	cc.staminaNow(now)
}

// OnDeath: player defeat → respawn at save point (defeatPlayer).
func (cc *clientControl) OnDeath(h *Hub, e *entity, killer *entity) {
	h.defeatPlayer(e.ID)
}

// ---------------------------------------------------------------- npc

// wander drives idle patrol movement while the NPC has no target. Steps run on
// the legacy npcTickSec cadence via a dt accumulator so movement speed and
// broadcast rate are unchanged.
type wander struct {
	patrol     game.Patrol
	region     game.Region
	path       []game.Vec2
	pathI      int
	idleUntil  time.Time
	wanderStep int
	ow         *game.Overworld
	acc        float64
}

func (w *wander) idleDuration() time.Duration {
	if w.ow != nil {
		return w.ow.WanderIdleDuration()
	}
	return game.WanderIdleDuration()
}

func (w *wander) begin(e *entity) {
	home := game.TileCenter(w.patrol.Home)
	e.X, e.Y = home.X, home.Y
	w.path = nil
	w.pathI = 0
	w.wanderStep = 0
	w.idleUntil = time.Now().Add(w.idleDuration())
}

func (w *wander) arrive() {
	w.path = nil
	w.pathI = 0
	w.idleUntil = time.Now().Add(w.idleDuration())
}

func (w *wander) pickNextPath(e *entity) bool {
	from := game.WorldToTile(e.X, e.Y)
	walkable := game.WalkableTile
	if w.ow != nil {
		walkable = w.ow.WalkableTile
	}
	if !walkable(from.C, from.R) {
		home := game.TileCenter(w.patrol.Home)
		e.X, e.Y = home.X, home.Y
		from = w.patrol.Home
	}
	if w.ow != nil {
		w.path = w.ow.PickRandomWanderPath(e.ID, w.region, from, w.wanderStep)
	} else {
		w.path = game.PickRandomWanderPath(e.ID, w.region, from, w.wanderStep)
	}
	w.pathI = 0
	w.wanderStep++
	return len(w.path) > 0
}

// step advances one wander step of `distStep` px; reports whether the NPC moved.
func (w *wander) step(e *entity, distStep float64) bool {
	if !w.idleUntil.IsZero() && time.Now().Before(w.idleUntil) {
		return false
	}
	if !w.idleUntil.IsZero() {
		w.idleUntil = time.Time{}
		if !w.pickNextPath(e) {
			w.idleUntil = time.Now().Add(time.Second)
		}
		return len(w.path) > 0
	}
	if len(w.path) == 0 {
		if !w.pickNextPath(e) {
			w.idleUntil = time.Now().Add(time.Second)
			return false
		}
	}
	if w.pathI >= len(w.path) {
		w.arrive()
		return true
	}
	dest := w.path[w.pathI]
	dx, dy := dest.X-e.X, dest.Y-e.Y
	d := math.Hypot(dx, dy)
	if d < 6 {
		w.pathI++
		if w.pathI >= len(w.path) {
			w.arrive()
		}
		return true
	}
	e.X += dx / d * distStep
	e.Y += dy / d * distStep
	ok := false
	if w.ow != nil {
		ok = w.ow.WalkableAt(e.X, e.Y)
	} else {
		ok = game.WalkableAt(e.X, e.Y)
	}
	if !ok {
		e.X, e.Y = dest.X, dest.Y
	}
	return true
}

func (w *wander) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	if !e.presentAndAlive() || e.targetID != "" {
		w.acc = 0
		return
	}
	w.acc += dt
	if w.acc < npcTickSec {
		return
	}
	w.acc -= npcTickSec
	speed := game.WanderSpeed()
	if h.overworld != nil {
		speed = h.overworld.WanderSpeed()
	}
	if w.step(e, speed*npcTickSec) {
		h.entityDirty = true
	}
}

// npcEngage owns engagement: proximity aggro, pack assist, leash anchor,
// drop range, retargeting, and disengage. `engaged` is the wire Engaged flag.
type npcEngage struct {
	engaged        bool
	leashX, leashY float64
	leashSet       bool
	avoidSide      float64 // -1/+1 stable detour side around pack-mates
	aggroAcc       float64 // proximity scan runs on the legacy npcTickSec cadence
}

func npcEngageOf(e *entity) *npcEngage {
	var ng *npcEngage
	if e != nil && e.plugin(&ng) {
		return ng
	}
	return nil
}

// engage pulls e (and nearby pack-mates) into a fight against target.
func (h *Hub) engage(e, target *entity) {
	ng := npcEngageOf(e)
	if ng == nil || !h.canAttack(e, target) {
		return
	}
	if !ng.engaged {
		ng.engaged = true
		e.targetID = target.ID
		ng.leashX, ng.leashY = e.X, e.Y
		ng.leashSet = true
		if e.contributors == nil {
			e.contributors = map[string]int{}
		}
		if ng.avoidSide == 0 {
			ng.avoidSide = 1
		}
		h.entityDirty = true
	}
	if owner := h.ownerOf(target); owner != nil {
		h.markPlayerCombat(owner.ID)
	} else if target.Kind == kindPlayer {
		h.markPlayerCombat(target.ID)
	}
	// Nearby allies assist.
	h.eachEntity(kindNPC, func(m *entity) {
		mg := npcEngageOf(m)
		if m == e || mg == nil || mg.engaged || !h.canAttack(m, target) {
			return
		}
		if dist(m.X, m.Y, e.X, e.Y) <= assistRadius {
			mg.engaged = true
			m.targetID = target.ID
			mg.leashX, mg.leashY = m.X, m.Y
			mg.leashSet = true
			if m.contributors == nil {
				m.contributors = map[string]int{}
			}
			if mg.avoidSide == 0 {
				mg.avoidSide = -1
			}
			h.entityDirty = true
		}
	})
}

// disengage releases an NPC from combat. leashed=true resets it to full
// health and snaps it back to the leash anchor (or patrol home).
func (h *Hub) disengage(e *entity, leashed bool) {
	ng := npcEngageOf(e)
	if ng == nil || !ng.engaged {
		return
	}
	ng.engaged = false
	e.targetID = ""
	e.contributors = nil
	e.statuses = nil
	var ch *chaseTarget
	if e.plugin(&ch) {
		ch.path = nil
	}
	if leashed {
		e.hp = e.maxHP
		var w *wander
		if e.plugin(&w) {
			if ng.leashSet {
				e.X, e.Y = ng.leashX, ng.leashY
				w.path = nil
				w.pathI = 0
				w.idleUntil = time.Now().Add(w.idleDuration())
			} else {
				w.begin(e)
			}
		}
	}
	ng.leashSet = false
	h.clearTargeting(e.ID)
	h.entityDirty = true
}

func (ng *npcEngage) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	if !e.presentAndAlive() {
		return
	}
	if !ng.engaged {
		// Proximity aggro on the wander cadence: an NPC that wanders into an
		// attackable target pulls the fight (matches legacy checkProximityAggro).
		ng.aggroAcc += dt
		if ng.aggroAcc < npcTickSec {
			return
		}
		ng.aggroAcc = 0
		if t := h.nearestAttackable(e, aggroRadius); t != nil {
			h.engage(e, t)
		}
		return
	}
	// Leash when dragged too far from where the fight began.
	anchorX, anchorY := ng.leashX, ng.leashY
	if !ng.leashSet {
		var w *wander
		if e.plugin(&w) {
			home := game.TileCenter(w.patrol.Home)
			anchorX, anchorY = home.X, home.Y
		}
	}
	if dist(e.X, e.Y, anchorX, anchorY) > leashRadius {
		h.disengage(e, true)
		return
	}
	t := h.validTarget(e)
	if t == nil {
		t = h.retarget(e)
		if t == nil {
			h.disengage(e, false)
			return
		}
		e.targetID = t.ID
	}
	if dist(e.X, e.Y, t.X, t.Y) > dropRange {
		h.disengage(e, false)
	}
}

// OnDamaged: a hit from an attackable source engages the NPC.
func (ng *npcEngage) OnDamaged(h *Hub, e *entity, from *entity, dmg int) {
	if from == nil || !e.alive {
		return
	}
	if !ng.engaged {
		h.engage(e, from)
	} else if owner := h.ownerOf(from); owner != nil {
		h.markPlayerCombat(owner.ID)
	} else if from.Kind == kindPlayer {
		h.markPlayerCombat(from.ID)
	}
}

// retarget picks a new victim: the nearest contributor first, then the
// nearest attackable entity within dropRange.
func (h *Hub) retarget(e *entity) *entity {
	var best *entity
	bestD := math.MaxFloat64
	for id := range e.contributors {
		t := h.ent(id)
		if !h.canAttack(e, t) {
			continue
		}
		if d := dist(e.X, e.Y, t.X, t.Y); d < bestD {
			bestD, best = d, t
		}
	}
	if best != nil {
		return best
	}
	return h.nearestAttackable(e, dropRange)
}

// chaseTarget moves toward the current target until within stopDist.
// pathfind enables pack-mate avoidance, unstick and A* around terrain (NPCs);
// pets take the straight line to petAttackPos.
type chaseTarget struct {
	speed    float64
	stopDist float64
	pathfind bool

	path     []game.Vec2
	pathI    int
	goal     game.Tile
	repathAt time.Time
}

func (ch *chaseTarget) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	if !e.presentAndAlive() {
		return
	}
	t := h.validTarget(e)
	if t == nil {
		ch.path = nil
		return
	}
	step := ch.speed * dt
	gx, gy := t.X, t.Y
	if e.Kind == kindPet {
		if owner := h.ownerOf(e); owner != nil {
			gx, gy = petAttackPos(owner.X, owner.Y, t.X, t.Y)
		}
		moveToward(e, gx, gy, step)
		return
	}
	dx, dy := t.X-e.X, t.Y-e.Y
	d := math.Hypot(dx, dy)
	if d < 0.01 {
		return
	}
	if h.inMelee(e, t) {
		if ch.pathfind {
			h.npcUnstick(e, t, step)
		}
		return
	}
	if !ch.pathfind {
		moveToward(e, gx, gy, math.Min(step, d-ch.stopDist))
		return
	}
	vx, vy := dx/d, dy/d
	ng := npcEngageOf(e)
	side := 1.0
	if ng != nil && ng.avoidSide != 0 {
		side = ng.avoidSide
	}
	if h.npcBlocksPath(e, vx, vy) {
		vx += -vy * side
		vy += (dx / d) * side
	}
	vm := math.Hypot(vx, vy)
	if vm < 0.01 {
		return
	}
	move := math.Min(step, d-ch.stopDist)
	if move <= 0 {
		return
	}
	nx, ny := e.X+vx/vm*move, e.Y+vy/vm*move
	// Once on an A* route, commit to it.
	if len(ch.path) > 0 && h.chaseAlongPath(e, ch, t, step) {
		return
	}
	if h.walkableAt(nx, ny) {
		e.X, e.Y = nx, ny
	} else if h.chaseAlongPath(e, ch, t, step) {
		// terrain-blocked: A* around it
	} else if h.walkableAt(nx, e.Y) {
		e.X = nx
	} else if h.walkableAt(e.X, ny) {
		e.Y = ny
	} else {
		h.disengage(e, false) // unreachable (e.g. target inside sanctuary)
	}
}

// inMelee mirrors the legacy NPC melee test (hold slack unless deeply
// overlapping a pack-mate).
func (h *Hub) inMelee(e, t *entity) bool {
	d := dist(e.X, e.Y, t.X, t.Y)
	if d <= meleeStopDistW {
		return true
	}
	return d <= meleeStopDistW+npcHoldSlackW && !h.npcHardOverlap(e)
}

// attackTarget lands a basic melee hit on the target when in range and off
// cooldown. damage is kind-specific.
type attackTarget struct {
	cooldown time.Duration
	damage   func(h *Hub, e, t *entity) int
	inRange  float64 // melee reach; 0 = use inMelee()
}

func (at *attackTarget) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	if !e.presentAndAlive() || !now.After(e.attackCD) {
		return
	}
	t := h.validTarget(e)
	if t == nil {
		return
	}
	if at.inRange > 0 {
		if dist(e.X, e.Y, t.X, t.Y) > at.inRange {
			return
		}
	} else if !h.inMelee(e, t) {
		return
	}
	e.attackCD = now.Add(at.cooldown)
	h.applyDamage(e, t, at.damage(h, e, t), basicAttackEvent())
}

func npcContactDamage(h *Hub, e, t *entity) int { return contactDamageW }

// respawn hides a dead NPC, pays out rewards, and brings it back later.
type respawn struct {
	respawnAt  time.Time
	dropPoolID string
	capturable bool
	captured   bool // set by captureNPC before kill: XP only, no loot
}

func respawnOf(e *entity) *respawn {
	var r *respawn
	if e != nil && e.plugin(&r) {
		return r
	}
	return nil
}

func (r *respawn) OnDeath(h *Hub, e *entity, killer *entity) {
	if ng := npcEngageOf(e); ng != nil {
		ng.engaged = false
		ng.leashSet = false
	}
	var ch *chaseTarget
	if e.plugin(&ch) {
		ch.path = nil
	}
	if r.captured {
		h.awardKillXPOnly(e)
	} else {
		h.awardKill(e)
	}
	r.captured = false
	e.hidden = true
	r.respawnAt = time.Now().Add(game.RespawnDelay(e.Sprite, e.ID))
	h.entityDirty = true
}

func (r *respawn) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	if !e.hidden || e.alive || r.respawnAt.IsZero() || now.Before(r.respawnAt) {
		return
	}
	e.hidden = false
	e.alive = true
	r.respawnAt = time.Time{}
	e.hp = e.maxHP
	e.contributors = nil
	e.statuses = nil
	e.targetID = ""
	var w *wander
	if e.plugin(&w) {
		w.begin(e)
		log.Printf("%s respawned in %s", e.Name, w.region.ID)
	}
	h.entityDirty = true
}

// ---------------------------------------------------------------- pet

// followOwner derives the pet's target from its owner each tick and, when it
// has none, trails behind the owner with deceleration near the rest point.
type followOwner struct{}

func (f *followOwner) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	owner := h.ownerOf(e)
	if owner == nil || owner.hidden {
		if !e.hidden {
			e.hidden = true
			h.entityDirty = true
		}
		e.targetID = ""
		return
	}
	if e.hidden {
		e.hidden = false
		h.entityDirty = true
	}
	if !e.alive {
		return
	}
	// Target: the owner's committed attack (engageID — selecting a target
	// alone doesn't count), else whoever is attacking us or the owner.
	// A heeled pet (petHold) never acquires a target — it just follows.
	if e.petHold {
		e.targetID = ""
	} else if t := h.ent(owner.engageID); t != nil && h.canAttack(owner, t) {
		e.targetID = t.ID
	} else {
		owner.engageID = "" // stale engage (target died, leashed, or left)
		if h.validTarget(e) == nil {
			e.targetID = ""
			for _, o := range h.entities {
				if (o.targetID == e.ID || o.targetID == owner.ID) && h.canAttack(e, o) &&
					dist(e.X, e.Y, o.X, o.Y) <= dropRange {
					e.targetID = o.ID
					break
				}
			}
		}
	}
	if e.targetID != "" {
		return // chaseTarget/attackTarget take over
	}
	gx, gy := followOffset(owner.X, owner.Y, owner.Facing)
	d := dist(e.X, e.Y, gx, gy)
	step := petSpeed * dt
	if d < petFollowDist {
		step *= d / petFollowDist
	}
	if d < 1 {
		if e.X != gx || e.Y != gy {
			e.X, e.Y = gx, gy
			h.entityDirty = true
		}
		return
	}
	if moveToward(e, gx, gy, step) > 0 {
		h.entityDirty = true
	}
	e.Facing = owner.Facing
}

// petLevelSync caps the pet's effective level at the owner's level, keeps
// max HP in step, and restores the pet when the owner leaves combat.
type petLevelSync struct{}

func petTemplate(kind string) struct{ hp, str, agi int } {
	if tpl, ok := petTemplates[kind]; ok {
		return tpl
	}
	return petTemplates["goblin"]
}

func petStr(h *Hub, e, t *entity) int {
	tpl := petTemplate(e.Sprite)
	_, s, _ := game.PetCombatStats(tpl.hp, tpl.str, tpl.agi, e.Level)
	return max(1, s)
}

func (p *petLevelSync) Tick(h *Hub, e *entity, now time.Time, dt float64) {
	owner := h.ownerOf(e)
	if owner == nil {
		return
	}
	c := h.clients[owner.ID]
	if c == nil {
		return
	}
	prof, ok := h.store.Get(c.Name)
	if !ok {
		return
	}
	rec, ok := prof.FindPet(e.ID)
	if !ok {
		return
	}
	eff := rec.Level
	if owner.Level > 0 && eff > owner.Level {
		eff = owner.Level
	}
	e.Level = eff
	e.Name = rec.Name
	e.Sprite = rec.Kind
	tpl := petTemplate(rec.Kind)
	newMax, _, _ := game.PetCombatStats(tpl.hp, tpl.str, tpl.agi, eff)
	switch {
	case e.maxHP == 0:
		e.hp, e.maxHP = newMax, newMax
	case newMax != e.maxHP:
		e.hp = int(math.Round(float64(e.hp) * float64(newMax) / float64(e.maxHP)))
		e.maxHP = newMax
		if e.hp > e.maxHP {
			e.hp = e.maxHP
		}
	}
}

func (p *petLevelSync) OnLeaveCombat(h *Hub, e *entity) {
	e.hp = e.maxHP
	e.alive = true
	e.statuses = nil
	e.targetID = ""
}

// ---------------------------------------------------------------- factories

func newPlayerEntity(clientID string) *entity {
	return &entity{
		ID: clientID, Kind: kindPlayer, Faction: factionAlly, alive: true,
		plugins: []entityPlugin{newClientControl()},
	}
}

func newNPCEntity(p game.Patrol, reg game.Region, ow *game.Overworld) *entity {
	start := game.TileCenter(p.Home)
	kind, level, maxHP, dropPoolID, capturable := npcCombatProfile(p)
	fac := factionHostile
	if maxHP <= 0 {
		fac = factionNeutral
	}
	w := &wander{patrol: p, region: reg, ow: ow}
	e := &entity{
		ID: p.ID, Name: p.Name, Kind: kindNPC, Sprite: kind, Level: level,
		X: start.X, Y: start.Y, Faction: fac,
		hp: maxHP, maxHP: maxHP, alive: true,
		plugins: []entityPlugin{
			w,
			&npcEngage{},
			&chaseTarget{speed: enemySpeedWorld, stopDist: meleeStopDistW, pathfind: true},
			&attackTarget{cooldown: enemyAttackCDW, damage: npcContactDamage},
			&respawn{dropPoolID: dropPoolID, capturable: capturable},
		},
	}
	w.begin(e)
	return e
}

func newPetEntity(rec game.PetRecord, owner *entity) *entity {
	x, y := followOffset(owner.X, owner.Y, owner.Facing)
	return &entity{
		ID: rec.ID, Name: rec.Name, Kind: kindPet, Sprite: rec.Kind, Level: rec.Level,
		X: x, Y: y, Facing: owner.Facing, Faction: factionAlly, OwnerID: owner.ID, alive: true,
		plugins: []entityPlugin{
			&followOwner{},
			&petLevelSync{},
			&chaseTarget{speed: petSpeed, stopDist: petStandoff, pathfind: false},
			&attackTarget{cooldown: enemyAttackCDW, damage: petStr, inRange: meleeStopDistW + 30},
		},
	}
}
