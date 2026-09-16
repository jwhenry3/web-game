package server

import (
	"encoding/json"
	"fmt"
	"math"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// Overworld realtime combat. One serialized simulation on the hub loop: NPCs
// and players fight in the open world; combat ticks run only while at least
// one fight is active, and snapshots/events are broadcast per-client on an
// area-of-interest radius instead of map-wide.
const (
	combatTickInterval = 50 * time.Millisecond

	aggroRadius   = 110.0 // proximity pull: walking this close to a foe starts combat
	assistRadius  = 150.0 // nearby hostile NPCs join a fight their ally is in
	leashRadius   = 380.0 // from patrol home; beyond → reset and walk home
	dropRange     = 460.0 // target this far from the NPC → it gives up
	combatAoIDist = 900.0 // combat ticks/events reach clients within this of a fight

	enemySpeedWorld = 90.0
	enemyAttackCDW  = 1200 * time.Millisecond
	contactDamageW  = 8
	petDamage       = 8
	attackRangeW    = 70.0
	enemyRadiusW    = 20.0
	meleeStopDistW  = attackRangeW
	npcHoldSlackW   = 10.0
	npcOverlapPadW  = 4.0
	gcdDuration     = 2500 * time.Millisecond
	castMoveCancel  = 4.0
	dodgeMoveGrace  = 250 * time.Millisecond
	dodgeCooldown   = 500 * time.Millisecond
	// dodgeDashDist mirrors the client's two-tile dash; dodgeLandingWindow
	// covers the tween + latency for the post-dash position report.
	dodgeDashDist      = 64.0
	dodgeLandingWindow = 600 * time.Millisecond
	staminaMax         = 100.0
	staminaRegenRate   = 35.0 // per second
	dodgeStaminaCost   = 25.0
)

var enemyTemplates = map[string]int{ // kind -> base hp
	"goblin":    70,
	"dire_wolf": 55,
	"stone_imp": 95,
}

var petTemplates = map[string]struct{ hp, str, agi int }{
	"goblin": {70, 9, 11}, "dire_wolf": {55, 8, 17}, "stone_imp": {95, 11, 8},
}

type activeCast struct {
	SkillID  string
	TargetID string
	Progress float64
}

// combatant is a player's authoritative combat state in the overworld.
type combatant struct {
	clientID string

	level                  int
	hp, maxHP, mp, maxMP   int
	str, mag, agi          int
	weapon, subWeapon      game.WeaponType
	mainJob, subJob        game.JobID
	skillLevels            map[string]int
	pendingSkillUses       map[string]int
	statuses               []game.ActiveStatus
	casting                *activeCast
	castX, castY           float64
	gcdReadyAt             time.Time
	lastMoveAt             time.Time
	dodgeReadyAt           time.Time
	dodgedAt               time.Time
	stamina                float64
	staminaAt              time.Time
	lastMoveDX, lastMoveDY float64
	targetID               string
	inCombat               bool
	petCD                  time.Time
	statusTick             int
	regenAcc               float64
}

func (c *combatant) gcdProgress(now time.Time) float64 {
	if c.gcdReadyAt.IsZero() || !now.Before(c.gcdReadyAt) {
		return 100
	}
	elapsed := gcdDuration - time.Until(c.gcdReadyAt)
	if elapsed < 0 {
		return 0
	}
	return math.Min(100, 100*elapsed.Seconds()/gcdDuration.Seconds())
}

func (c *combatant) gcdReady(now time.Time) bool {
	return c.gcdReadyAt.IsZero() || !now.Before(c.gcdReadyAt)
}

func (c *combatant) startGCD(now time.Time) { c.gcdReadyAt = now.Add(gcdDuration) }

// staminaNow lazily regenerates stamina to `now`.
func (c *combatant) staminaNow(now time.Time) float64 {
	if c.staminaAt.IsZero() {
		return c.stamina
	}
	c.stamina = math.Min(staminaMax, c.stamina+staminaRegenRate*now.Sub(c.staminaAt).Seconds())
	c.staminaAt = now
	return c.stamina
}

func (c *combatant) weaponForSkill(skill game.Skill) game.WeaponType {
	if skill.Job != "" && skill.Job == c.subJob && skill.Job != c.mainJob {
		return c.subWeapon
	}
	return c.weapon
}

// ensureCombatant returns the player's combat state, creating it from the
// profile on first use.
func (h *Hub) ensureCombatant(c *Client) *combatant {
	if pc, ok := h.combatants[c.ID]; ok {
		return pc
	}
	pc := &combatant{
		clientID:         c.ID,
		stamina:          staminaMax,
		staminaAt:        time.Now(),
		skillLevels:      map[string]int{},
		pendingSkillUses: map[string]int{},
	}
	h.combatants[c.ID] = pc
	h.refreshCombatStats(c, pc)
	return pc
}

// refreshCombatStats recomputes stats from the profile. Called on join and on
// each combat entry so level/equipment changes apply to the next fight.
func (h *Hub) refreshCombatStats(c *Client, pc *combatant) {
	profile, ok := h.store.Get(c.Name)
	if !ok {
		return
	}
	loadout := profile.ActiveLoadout()
	hp, mp, str, mag, agi := game.ComputeJobStats(
		game.JobID(profile.MainJob), profile.MainJobLevel(),
		game.JobID(profile.SubJob), profile.SubJobEffectiveLevel(),
		profile.EquippedItems(),
	)
	pc.level = profile.MainJobLevel()
	pc.maxHP, pc.maxMP = hp, mp
	if pc.hp <= 0 || pc.hp > hp {
		pc.hp = hp
	}
	if pc.mp > mp {
		pc.mp = mp
	}
	pc.str, pc.mag, pc.agi = str, mag, agi
	pc.weapon = profile.WeaponType()
	pc.subWeapon = profile.SubWeaponType()
	pc.mainJob = game.JobID(profile.MainJob)
	pc.subJob = game.JobID(profile.SubJob)
	pc.skillLevels = map[string]int{}
	for id, lvl := range loadout.SkillLevels {
		pc.skillLevels[id] = lvl
	}
	if pc.pendingSkillUses == nil {
		pc.pendingSkillUses = map[string]int{}
	}
}

// flushSkillUsage persists accumulated battle training for a player.
func (h *Hub) flushSkillUsage(pc *combatant) {
	if pc == nil || len(pc.pendingSkillUses) == 0 {
		return
	}
	if c := h.clients[pc.clientID]; c != nil && c.Name != "" {
		h.store.AddBattleTraining(c.Name, pc.pendingSkillUses)
	}
	pc.pendingSkillUses = map[string]int{}
}

// syncWorldPlayer copies combat state onto the wire-visible world player.
func (h *Hub) syncWorldPlayer(wp *protocol.WorldPlayer, pc *combatant) {
	if wp == nil || pc == nil {
		return
	}
	wp.InCombat = pc.inCombat
	wp.HP, wp.MaxHP = pc.hp, pc.maxHP
	wp.MP, wp.MaxMP = pc.mp, pc.maxMP
	wp.Stamina = pc.staminaNow(time.Now())
	wp.TargetID = pc.targetID
}

func (h *Hub) sendPlayerSync(wp *protocol.WorldPlayer) {
	h.broadcastAll(protocol.Encode(protocol.TypePlayerSync, *wp))
}

// ---- engagement ----

func (n *worldNPC) hostile() bool { return n != nil && n.maxHP > 0 }

// engageNPC pulls an NPC (and its nearby allies) into combat with a player.
func (h *Hub) engageNPC(n *worldNPC, clientID string) {
	if !n.onWorld() || !n.hostile() {
		return
	}
	if !n.Engaged {
		n.Engaged = true
		n.targetID = clientID
		n.leashX, n.leashY = n.X, n.Y
		n.leashSet = true
		if n.contributors == nil {
			n.contributors = map[string]int{}
		}
		if n.avoidSide == 0 {
			n.avoidSide = 1
		}
		h.broadcastNPCs()
	}
	h.markPlayerCombat(clientID)
	// Nearby allies assist.
	for _, m := range h.npcs {
		if m == n || !m.onWorld() || !m.hostile() || m.Engaged {
			continue
		}
		if dist(m.X, m.Y, n.X, n.Y) <= assistRadius {
			m.Engaged = true
			m.targetID = clientID
			m.leashX, m.leashY = m.X, m.Y
			m.leashSet = true
			if m.contributors == nil {
				m.contributors = map[string]int{}
			}
			if m.avoidSide == 0 {
				m.avoidSide = -1
			}
		}
	}
}

// markPlayerCombat recomputes a player's combat stats on first engagement.
func (h *Hub) markPlayerCombat(clientID string) {
	h.mu.RLock()
	c := h.clients[clientID]
	h.mu.RUnlock()
	if c == nil || !c.Joined {
		return
	}
	pc := h.ensureCombatant(c)
	if !pc.inCombat {
		h.refreshCombatStats(c, pc)
		pc.inCombat = true
		if wp := h.world[clientID]; wp != nil {
			h.syncWorldPlayer(wp, pc)
			h.sendPlayerSync(wp)
		}
	}
}

// disengageNPC releases an NPC from combat. leashed=true resets it to full
// health and snaps it back to where the fight started (its leash anchor, or
// patrol home for NPCs engaged before anchors existed); otherwise it resumes
// wandering where it stands.
func (h *Hub) disengageNPC(n *worldNPC, leashed bool) {
	if !n.Engaged {
		return
	}
	n.Engaged = false
	n.targetID = ""
	n.contributors = nil
	n.statuses = nil
	n.chasePath = nil
	if leashed {
		n.hp = n.maxHP
		if n.leashSet {
			n.X, n.Y = n.leashX, n.leashY
			n.path = nil
			n.pathI = 0
			n.idleUntil = time.Now().Add(n.wanderIdle())
		} else {
			n.beginWander()
		}
	}
	n.leashSet = false
	h.broadcastNPCs()
}

// checkAggroAt starts fights when a hostile NPC sits within aggro range of a
// vulnerable player position.
func (h *Hub) checkAggroAt(clientID string, x, y float64) {
	wp := h.world[clientID]
	if wp == nil || wp.InHouse || battleImmune(wp) {
		return
	}
	if h.overworld != nil && h.overworld.SanctuaryAtWorld(x, y) {
		return
	}
	for _, n := range h.npcs {
		if !n.onWorld() || !n.hostile() || n.Engaged {
			continue
		}
		if dist(x, y, n.X, n.Y) <= aggroRadius {
			h.engageNPC(n, clientID)
		}
	}
}

// checkProximityAggro runs after NPC wander steps: an NPC that walks into a
// player pulls the fight.
func (h *Hub) checkProximityAggro() {
	for _, n := range h.npcs {
		if !n.onWorld() || !n.hostile() || n.Engaged {
			continue
		}
		for _, wp := range h.world {
			if wp.InHouse || battleImmune(wp) {
				continue
			}
			if h.overworld != nil && h.overworld.SanctuaryAtWorld(wp.X, wp.Y) {
				continue
			}
			if dist(wp.X, wp.Y, n.X, n.Y) <= aggroRadius {
				h.engageNPC(n, wp.ID)
				break
			}
		}
	}
}

// ---- combat tick ----

func (h *Hub) combatActive() bool {
	for _, n := range h.npcs {
		if n.Engaged && n.onWorld() {
			return true
		}
	}
	for _, pc := range h.combatants {
		if pc.inCombat || pc.casting != nil || pc.targetID != "" ||
			len(pc.statuses) > 0 || !pc.gcdReady(time.Now()) {
			return true
		}
	}
	return false
}

// tickCombat runs the detailed combat simulation on the 50ms cast ticker, but
// only while a fight is actually active. Status effects tick regardless so
// DoTs/HoTs keep working outside combat. All state is hub-owned (the loop
// already serializes it), so no locks are needed here.
func (h *Hub) tickCombat(now time.Time) {
	h.tickPlayerStatuses(now)
	if !h.combatActive() {
		if len(h.aoi) > 0 {
			h.clearAoI()
		}
		return
	}

	h.advanceCasts(now)
	h.tickEngagedNPCs(now)
	h.tickBattlePets(now)
	h.updateCombatFlags(now)
	h.broadcastCombatTick()
}

// npcTarget resolves an engaged NPC's current target to a live player.
func (h *Hub) npcTarget(n *worldNPC) (*protocol.WorldPlayer, *combatant) {
	wp := h.world[n.targetID]
	pc := h.combatants[n.targetID]
	if wp == nil || pc == nil || pc.hp <= 0 || wp.InHouse {
		return nil, nil
	}
	return wp, pc
}

// retargetNPC picks a new victim: the nearest contributor, then the nearest
// player within aggro reach.
func (h *Hub) retargetNPC(n *worldNPC) string {
	best := ""
	bestD := math.MaxFloat64
	for id := range n.contributors {
		wp := h.world[id]
		pc := h.combatants[id]
		if wp == nil || pc == nil || pc.hp <= 0 || wp.InHouse {
			continue
		}
		if d := dist(n.X, n.Y, wp.X, wp.Y); d < bestD {
			bestD, best = d, id
		}
	}
	if best != "" {
		return best
	}
	for id, wp := range h.world {
		pc := h.combatants[id]
		if pc == nil || pc.hp <= 0 || wp.InHouse || battleImmune(wp) {
			continue
		}
		if h.overworld != nil && h.overworld.SanctuaryAtWorld(wp.X, wp.Y) {
			continue
		}
		if d := dist(n.X, n.Y, wp.X, wp.Y); d < bestD && d <= dropRange {
			bestD, best = d, id
		}
	}
	return best
}

func (h *Hub) tickEngagedNPCs(now time.Time) {
	step := enemySpeedWorld * combatTickInterval.Seconds()
	npcMoved := false
	for _, n := range h.npcs {
		if !n.Engaged || !n.onWorld() {
			continue
		}
		// Leash when the fight is dragged too far from where it began. NPCs
		// engaged before leash anchors (legacy/tests) fall back to patrol home.
		anchorX, anchorY := n.leashX, n.leashY
		if !n.leashSet {
			home := game.TileCenter(n.patrol.Home)
			anchorX, anchorY = home.X, home.Y
		}
		if dist(n.X, n.Y, anchorX, anchorY) > leashRadius {
			h.disengageNPC(n, true)
			continue
		}
		wp, pc := h.npcTarget(n)
		if wp == nil {
			if id := h.retargetNPC(n); id != "" {
				n.targetID = id
				wp, pc = h.npcTarget(n)
			}
			if wp == nil {
				h.disengageNPC(n, false)
				continue
			}
		}
		if dist(n.X, n.Y, wp.X, wp.Y) > dropRange {
			h.disengageNPC(n, false)
			continue
		}
		// DoT/HoT: statuses are authored in 200ms units, so tick them every 4th
		// 50ms combat tick to keep the ATB cadence.
		n.statusTick++
		if n.statusTick%4 == 0 {
			heal, poison := game.TickStatuses(&n.statuses, n.maxHP, max(1, n.maxHP/20))
			if heal > 0 {
				n.hp = min(n.maxHP, n.hp+heal)
			}
			if poison > 0 {
				n.hp -= poison
				if n.hp <= 0 {
					n.hp = 0
					h.killNPC(n, "")
					continue
				}
			}
		}

		dx, dy := wp.X-n.X, wp.Y-n.Y
		d := math.Hypot(dx, dy)
		if d < 0.01 {
			continue
		}
		inMelee := d <= meleeStopDistW+npcHoldSlackW && !h.npcHardOverlap(n)
		if !inMelee && d <= meleeStopDistW {
			inMelee = true
		}
		if inMelee {
			if now.After(n.attackCD) {
				dmg := game.ModifyDamageTaken(&pc.statuses, contactDamageW)
				pc.hp -= dmg
				if pc.hp < 0 {
					pc.hp = 0
				}
				n.attackCD = now.Add(enemyAttackCDW)
				h.sendCombatEvent(protocol.CombatEventPayload{
					AttackerID: n.ID, TargetID: wp.ID,
					Damage: dmg, Hit: true, Success: true,
					ActionID: game.BasicAttack.ID, ActionName: game.BasicAttack.Name,
					Message: fmt.Sprintf("%s struck %s", n.Name, wp.Name),
				}, n.X, n.Y)
				if pc.hp <= 0 {
					h.defeatPlayer(wp.ID)
				}
			}
			h.npcUnstick(n, step)
			continue
		}
		// Chase. A blocking pack-mate adds a perpendicular detour.
		vx, vy := dx/d, dy/d
		if h.npcBlocksPath(n, vx, vy) {
			vx += -vy * n.avoidSide
			vy += (dx / d) * n.avoidSide
		}
		vm := math.Hypot(vx, vy)
		if vm < 0.01 {
			continue
		}
		move := math.Min(step, d-meleeStopDistW)
		if move <= 0 {
			continue
		}
		nx, ny := n.X+vx/vm*move, n.Y+vy/vm*move
		// Once on an A* route, commit to it — greedy direct steps would pull
		// the NPC back into the wall and oscillate against the waypoint.
		if len(n.chasePath) > 0 && h.chaseAlongPath(n, wp, step) {
			continue
		}
		if h.walkableAt(nx, ny) {
			n.X, n.Y = nx, ny
		} else if h.chaseAlongPath(n, wp, step) {
			// terrain-blocked: A* around it
		} else if h.walkableAt(nx, n.Y) {
			n.X = nx
		} else if h.walkableAt(n.X, ny) {
			n.Y = ny
		} else {
			h.disengageNPC(n, false) // unreachable (e.g. target inside sanctuary)
			continue
		}
	}
	_ = npcMoved
	// NPC positions during combat ship in combat_tick (AoI). The world-state
	// NPC list updates on engagement changes only.
}

// npcHardOverlap reports whether n deeply overlaps another engaged NPC.
func (h *Hub) npcHardOverlap(n *worldNPC) bool {
	_, _, deep := h.npcHardOverlapVec(n)
	return deep
}

func (h *Hub) npcHardOverlapVec(n *worldNPC) (float64, float64, bool) {
	limit := enemyRadiusW*2 - npcOverlapPadW
	var sx, sy float64
	deep := false
	for _, o := range h.npcs {
		if o == n || !o.onWorld() || !o.Engaged {
			continue
		}
		d := dist(n.X, n.Y, o.X, o.Y)
		if d >= limit || d < 0.01 {
			continue
		}
		deep = true
		w := (limit - d) / limit
		sx += (n.X - o.X) / d * w
		sy += (n.Y - o.Y) / d * w
	}
	return sx, sy, deep
}

func (h *Hub) npcBlocksPath(n *worldNPC, fx, fy float64) bool {
	const blockRange = enemyRadiusW * 3.2
	const cone = 0.55
	for _, o := range h.npcs {
		if o == n || !o.onWorld() || !o.Engaged {
			continue
		}
		ox, oy := o.X-n.X, o.Y-n.Y
		d := math.Hypot(ox, oy)
		if d >= blockRange || d < 0.01 {
			continue
		}
		if (ox*fx+oy*fy)/d >= cone {
			return true
		}
	}
	return false
}

// npcUnstick slides an in-melee NPC sideways when it overlaps a pack-mate.
func (h *Hub) npcUnstick(n *worldNPC, step float64) {
	ox, oy, deep := h.npcHardOverlapVec(n)
	if !deep {
		return
	}
	wp := h.world[n.targetID]
	if wp == nil {
		return
	}
	dx, dy := wp.X-n.X, wp.Y-n.Y
	d := math.Hypot(dx, dy)
	if d < 0.01 {
		return
	}
	rx, ry := dx/d, dy/d
	radial := ox*rx + oy*ry
	tx, ty := ox-radial*rx, oy-radial*ry
	tm := math.Hypot(tx, ty)
	if tm < 0.15 {
		tx, ty = -ry*n.avoidSide, rx*n.avoidSide
		tm = 1
	}
	slide := step * 0.45
	nx, ny := n.X+tx/tm*slide, n.Y+ty/tm*slide
	if h.walkableAt(nx, ny) {
		n.X, n.Y = nx, ny
	}
}

func (h *Hub) walkableAt(x, y float64) bool {
	if h.overworld != nil {
		return h.overworld.WalkableAt(x, y)
	}
	return game.WalkableAt(x, y)
}

// chaseRepathInterval throttles A* recomputation while pursuing a target.
const chaseRepathInterval = 350 * time.Millisecond

// chaseAlongPath moves an engaged NPC along an A* route when the direct chase
// step is terrain-blocked. Paths use NPCWalkableTile, so a target standing in
// a sanctuary is unreachable and the caller disengages.
func (h *Hub) chaseAlongPath(n *worldNPC, wp *protocol.WorldPlayer, step float64) bool {
	if h.overworld == nil {
		return false
	}
	now := time.Now()
	from := h.overworld.WorldToTile(n.X, n.Y)
	goal := h.overworld.WorldToTile(wp.X, wp.Y)
	if len(n.chasePath) == 0 || (n.chaseGoal != goal && now.After(n.repathAt)) {
		n.chasePath = h.overworld.Pathfind(from, goal, game.Region{})
		n.chaseI = 0
		n.chaseGoal = goal
		n.repathAt = now.Add(chaseRepathInterval)
		// The first node is the NPC's own tile — don't walk back to its center.
		if len(n.chasePath) > 1 {
			n.chaseI = 1
		}
	}
	for n.chaseI < len(n.chasePath) {
		w := n.chasePath[n.chaseI]
		dx, dy := w.X-n.X, w.Y-n.Y
		d := math.Hypot(dx, dy)
		if d <= step {
			if h.walkableAt(w.X, w.Y) {
				n.X, n.Y = w.X, w.Y
			}
			n.chaseI++
			continue
		}
		nx, ny := n.X+dx/d*step, n.Y+dy/d*step
		if !h.walkableAt(nx, ny) {
			n.chasePath = nil // waypoint became blocked; repath next tick
			return true
		}
		n.X, n.Y = nx, ny
		return true
	}
	n.chasePath = nil // exhausted; next blocked step recomputes
	return false
}

// tickBattlePets lets each combatant's battle pet attack the owner's target.
func (h *Hub) tickBattlePets(now time.Time) {
	for _, pc := range h.combatants {
		if pc.hp <= 0 || pc.targetID == "" || !now.After(pc.petCD) {
			continue
		}
		c := h.clients[pc.clientID]
		wp := h.world[pc.clientID]
		if c == nil || wp == nil {
			continue
		}
		profile, ok := h.store.Get(c.Name)
		if !ok || profile.BattlePetID == "" {
			continue
		}
		pet, ok := profile.FindPet(profile.BattlePetID)
		if !ok {
			continue
		}
		n := h.npcs[pc.targetID]
		if n == nil || !n.onWorld() || !n.hostile() {
			continue
		}
		if dist(wp.X, wp.Y, n.X, n.Y) > meleeStopDistW+60 {
			continue
		}
		pc.petCD = now.Add(enemyAttackCDW)
		n.hp -= petDamage
		if n.hp < 0 {
			n.hp = 0
		}
		if n.contributors == nil {
			n.contributors = map[string]int{}
		}
		n.contributors[pc.clientID] += petDamage
		petEntID := petEntityID(pc.clientID)
		h.sendCombatEvent(protocol.CombatEventPayload{
			AttackerID: petEntID, TargetID: n.ID,
			Damage: petDamage, Hit: true, Success: true,
			ActionID: game.BasicAttack.ID, ActionName: game.BasicAttack.Name,
			Message: fmt.Sprintf("%s struck %s", pet.Name, n.Name),
		}, n.X, n.Y)
		if n.hp <= 0 {
			h.killNPC(n, pc.clientID)
		}
	}
}

func petEntityID(ownerID string) string { return "pet-" + ownerID }

// tickPlayerStatuses applies DoT/HoT to players on the ATB-cadence (every 4th
// 50ms tick ≈ 200ms). Runs outside combat too so effects persist after a
// fight ends; non-combat hp changes go out over player_sync.
func (h *Hub) tickPlayerStatuses(now time.Time) {
	for _, pc := range h.combatants {
		if pc.hp <= 0 {
			continue
		}
		if !pc.inCombat && len(pc.statuses) == 0 {
			continue
		}
		pc.statusTick++
		if pc.statusTick%4 != 0 {
			continue
		}
		tickPower := max(1, (pc.str+pc.mag)/4)
		heal, poison := game.TickStatuses(&pc.statuses, pc.maxHP, tickPower)
		if heal > 0 {
			pc.hp = min(pc.maxHP, pc.hp+heal)
		}
		if poison > 0 {
			pc.hp -= poison
			if pc.hp <= 0 {
				pc.hp = 0
				if wp := h.world[pc.clientID]; wp != nil {
					h.defeatPlayer(pc.clientID)
				}
				continue
			}
		}
		if (heal > 0 || poison > 0) && !pc.inCombat {
			if wp := h.world[pc.clientID]; wp != nil {
				h.syncWorldPlayer(wp, pc)
				h.sendPlayerSync(wp)
			}
		}
	}
}

// updateCombatFlags recomputes in_combat per player and broadcasts
// player_sync on transitions.
func (h *Hub) updateCombatFlags(now time.Time) {
	for id, pc := range h.combatants {
		engaged := pc.casting != nil
		if !engaged {
			for _, n := range h.npcs {
				if !n.Engaged || !n.onWorld() {
					continue
				}
				if n.targetID == id {
					engaged = true
					break
				}
				if n.contributors[id] > 0 {
					engaged = true
					break
				}
			}
		}
		if pc.hp <= 0 {
			engaged = false
		}
		if engaged == pc.inCombat {
			continue
		}
		pc.inCombat = engaged
		if !engaged {
			h.flushSkillUsage(pc)
			// Statuses, casting, and target persist — they expire naturally
			// or are consumed by combat ticks. Only the inCombat flag (which
			// gates teleport/equip) clears here.
		}
		if wp := h.world[id]; wp != nil {
			h.syncWorldPlayer(wp, pc)
			h.sendPlayerSync(wp)
		}
		if partyID, ok := h.clientParty[id]; ok {
			h.broadcastPartySocial(h.parties[partyID])
		}
	}
}

// ---- AoI broadcast ----

// combatSnapshots builds the entity list for AoI clients: engaged NPCs,
// fighting players, and active battle pets.
func (h *Hub) combatSnapshots(now time.Time) []protocol.CombatEntity {
	out := []protocol.CombatEntity{}
	for _, n := range h.npcs {
		if !n.Engaged || !n.onWorld() {
			continue
		}
		out = append(out, protocol.CombatEntity{
			ID: n.ID, Name: n.Name, Kind: n.Kind, Level: n.Level,
			X: n.X, Y: n.Y, HP: n.hp, MaxHP: n.maxHP,
			TargetID: n.targetID, Alive: n.hp > 0, Capturable: n.capturable,
			Statuses: game.Snapshots(n.statuses),
		})
	}
	for id, pc := range h.combatants {
		// Include any player who is actively fighting: has a target, GCD
		// running, casting, or statuses applied — not just the inCombat flag
		// (which only tracks whether an engaged NPC references this player).
		active := pc.inCombat || pc.targetID != "" || pc.casting != nil ||
			len(pc.statuses) > 0 || !pc.gcdReady(now)
		if !active {
			continue
		}
		wp := h.world[id]
		if wp == nil {
			continue
		}
		c := h.clients[id]
		name := id
		if c != nil {
			name = c.Name
		}
		ent := protocol.CombatEntity{
			ID: id, Name: name, IsPlayer: true, Level: pc.level,
			X: wp.X, Y: wp.Y,
			HP: pc.hp, MaxHP: pc.maxHP, MP: pc.mp, MaxMP: pc.maxMP,
			SkillATB: pc.gcdProgress(now), TargetID: pc.targetID,
			Alive: pc.hp > 0, Statuses: game.Snapshots(pc.statuses),
		}
		if pc.casting != nil {
			ent.CastingSkillID = pc.casting.SkillID
			ent.CastTargetID = pc.casting.TargetID
			ent.CastProgress = pc.casting.Progress
			if sk, ok := game.FindSkill(pc.casting.SkillID); ok {
				ent.CastTimeMs = game.SkillCastTime(sk)
			}
		}
		out = append(out, ent)
		// Battle pet rides along as an ally entity.
		if c != nil && pc.hp > 0 {
			if profile, ok := h.store.Get(c.Name); ok && profile.BattlePetID != "" {
				if pet, ok := profile.FindPet(profile.BattlePetID); ok {
					px, py := followOffset(wp.X, wp.Y, wp.Facing)
					tpl, ok := petTemplates[pet.Kind]
					if !ok {
						tpl = petTemplates["goblin"]
					}
					php, _, _ := game.PetCombatStats(tpl.hp, tpl.str, tpl.agi, pet.Level)
					out = append(out, protocol.CombatEntity{
						ID: petEntityID(id), Name: pet.Name, Kind: pet.Kind,
						IsAlly: true, OwnerID: id, Level: pet.Level,
						X: px, Y: py, HP: php, MaxHP: php,
						TargetID: pc.targetID, Alive: true,
					})
				}
			}
		}
	}
	return out
}

// broadcastCombatTick sends snapshots only to clients whose AoI overlaps a
// fight; clients leaving the AoI get one empty tick so their HUD clears.
func (h *Hub) broadcastCombatTick() {
	now := time.Now()
	entities := h.combatSnapshots(now)
	if len(entities) == 0 {
		h.clearAoI()
		return
	}
	newAoI := map[string]bool{}
	msg := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{Entities: entities})
	for id, wp := range h.world {
		if wp.InHouse {
			continue
		}
		in := false
		if pc := h.combatants[id]; pc != nil && (pc.inCombat || pc.targetID != "" || pc.casting != nil || len(pc.statuses) > 0 || !pc.gcdReady(now)) {
			in = true
		} else {
			for _, e := range entities {
				if dist(wp.X, wp.Y, e.X, e.Y) <= combatAoIDist {
					in = true
					break
				}
			}
		}
		if !in {
			continue
		}
		newAoI[id] = true
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, msg)
		}
	}
	// Clients that left the AoI get one empty tick so their combat UI clears.
	if len(h.aoi) > 0 {
		var empty []byte
		for id := range h.aoi {
			if newAoI[id] {
				continue
			}
			if empty == nil {
				empty = protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{})
			}
			h.mu.RLock()
			c := h.clients[id]
			h.mu.RUnlock()
			if c != nil && c.Joined {
				h.sendRaw(c, empty)
			}
		}
	}
	h.aoi = newAoI
}

func (h *Hub) clearAoI() {
	if len(h.aoi) == 0 {
		return
	}
	empty := protocol.Encode(protocol.TypeCombatTick, protocol.CombatTickPayload{})
	for id := range h.aoi {
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, empty)
		}
	}
	h.aoi = nil
}

// sendCombatEvent delivers an action event to every client in the AoI (set)
// plus anyone within radius of the event origin who isn't tracked yet.
func (h *Hub) sendCombatEvent(ev protocol.CombatEventPayload, x, y float64) {
	ev.Entities = h.combatSnapshots(time.Now())
	msg := protocol.Encode(protocol.TypeCombatEvent, ev)
	for id, wp := range h.world {
		if wp.InHouse {
			continue
		}
		if !h.aoi[id] && dist(wp.X, wp.Y, x, y) > combatAoIDist {
			continue
		}
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c != nil && c.Joined {
			h.sendRaw(c, msg)
		}
	}
}

// ---- player actions ----

func (h *Hub) handleAction(c *Client, raw json.RawMessage) {
	var action protocol.ActionPayload
	if err := json.Unmarshal(raw, &action); err != nil {
		return
	}
	wp := h.world[c.ID]
	if wp == nil || wp.InHouse {
		return
	}
	pc := h.ensureCombatant(c)
	h.resolveAction(c, wp, pc, action)
}

func (h *Hub) handleSetTarget(c *Client, raw json.RawMessage) {
	var p protocol.SetTargetPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	pc := h.ensureCombatant(c)
	pc.targetID = p.TargetID
}

func (h *Hub) handleDodge(c *Client) {
	wp := h.world[c.ID]
	if wp == nil || wp.InHouse {
		return
	}
	pc := h.ensureCombatant(c)
	h.resolveDodge(c, wp, pc)
}

// resolveDodge performs the universal dash. It needs recent movement (the
// client dashes along its current heading), costs stamina, and has its own
// 500ms cooldown — independent of the GCD. Dodging interrupts a cast.
func (h *Hub) resolveDodge(c *Client, wp *protocol.WorldPlayer, pc *combatant) {
	now := time.Now()
	if pc.hp <= 0 || now.Sub(pc.lastMoveAt) > dodgeMoveGrace || now.Before(pc.dodgeReadyAt) {
		return
	}
	stam := pc.staminaNow(now)
	if stam < dodgeStaminaCost {
		return
	}
	pc.stamina = stam - dodgeStaminaCost
	pc.staminaAt = now
	pc.dodgeReadyAt = now.Add(dodgeCooldown)
	pc.dodgedAt = now
	if pc.casting != nil {
		h.interruptCast(pc)
	}

	// Authoritative dash: move the player immediately on the server so we don't
	// depend on a follow-up client move that may be clamped or arrive late.
	dx, dy := pc.lastMoveDX, pc.lastMoveDY
	if d := math.Hypot(dx, dy); d > 0.001 {
		dx /= d
		dy /= d
	} else {
		dx, dy = game.FacingDir(wp.Facing)
	}
	prevX, prevY := wp.X, wp.Y
	worldW, worldH := h.worldSize()
	tx := clamp(wp.X+dx*dodgeDashDist, game.PlayerCollisionHalfW, worldW-game.PlayerCollisionHalfW)
	ty := clamp(wp.Y+dy*dodgeDashDist, game.PlayerCollisionHalfH, worldH)
	if h.overworld != nil {
		wp.X, wp.Y = h.overworld.SlideMovePlayer(prevX, prevY, tx, ty)
	} else {
		wp.X, wp.Y = game.SlideMovePlayer(prevX, prevY, tx, ty)
	}
	wp.Facing = game.ResolveFacingYaw(wp.X-prevX, wp.Y-prevY, 0, false, wp.Facing)

	h.syncWorldPlayer(wp, pc)
	h.send(c, protocol.TypePlayerSync, *wp)
	h.broadcastAll(protocol.Encode(protocol.TypePlayerMoved, protocol.PlayerMovedPayload{
		ID: c.ID, X: wp.X, Y: wp.Y, Facing: wp.Facing,
	}))
	h.persistWorldLocation(c, wp, false)
	h.checkAggroAt(c.ID, wp.X, wp.Y)
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: c.ID, ActionID: game.ActionIDDodge,
		ActionName: game.SkillDodge.Name, Success: true, Hit: true,
		Message: fmt.Sprintf("%s dodges", wp.Name),
	}, wp.X, wp.Y)
}

func (h *Hub) resolveAction(c *Client, wp *protocol.WorldPlayer, pc *combatant, action protocol.ActionPayload) {
	now := time.Now()
	if pc.hp <= 0 {
		return
	}
	if game.IsStunned(pc.statuses) {
		h.sendCombatEvent(protocol.CombatEventPayload{
			AttackerID: c.ID, ActionID: action.ActionID, Message: "Stunned.",
		}, wp.X, wp.Y)
		return
	}
	if pc.casting != nil {
		h.sendCombatEvent(protocol.CombatEventPayload{
			AttackerID: c.ID, ActionID: action.ActionID, Message: "Already casting.",
		}, wp.X, wp.Y)
		return
	}
	if !pc.gcdReady(now) {
		return // silent: client already shows the GCD sweep
	}

	if action.ActionID == "use_item" {
		h.resolveItemUse(c, wp, pc, action)
		return
	}
	if action.ActionID == game.ActionIDCapture {
		h.resolveCapture(c, wp, pc, action)
		return
	}
	if action.ActionID == game.ActionIDDodge {
		h.resolveDodge(c, wp, pc)
		return
	}

	skill, ok := game.FindSkill(action.ActionID)
	if !ok {
		return
	}
	res := protocol.CombatEventPayload{
		AttackerID: c.ID, ActionID: skill.ID, ActionName: skill.Name, TargetID: action.TargetID,
	}
	if !game.SkillAlwaysUnlocked(skill.ID) && pc.skillLevels[skill.ID] < 1 {
		res.Message = "Skill not learned."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	if skill.WorldOnly {
		res.Message = "Cannot use that here."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	if skill.WeaponReq != "" && skill.WeaponReq != pc.weaponForSkill(skill) {
		res.Message = "Requires a " + string(skill.WeaponReq) + "."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	if pc.mp < skill.MPCost {
		res.Message = "Not enough MP."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}

	if game.SkillTargetsAlly(skill) {
		// Ally-targeted skills hit players (or self when unarmed target).
		tgtID := action.TargetID
		if tgtID == "" {
			tgtID = c.ID
		}
		twp := h.world[tgtID]
		tpc := h.combatants[tgtID]
		if twp == nil || tpc == nil || tpc.hp <= 0 || twp.InHouse {
			res.Message = "Invalid target."
			h.sendCombatEvent(res, wp.X, wp.Y)
			return
		}
		if dist(wp.X, wp.Y, twp.X, twp.Y) > allySkillRangeW {
			res.Message = "Target out of range."
			h.sendCombatEvent(res, wp.X, wp.Y)
			return
		}
		res.TargetID = tgtID
		if game.SkillCastTime(skill) > 0 {
			pc.mp -= skill.MPCost
			if pc.inCombat {
				pc.startGCD(now)
			}
			pc.casting = &activeCast{SkillID: skill.ID, TargetID: tgtID}
			pc.castX, pc.castY = wp.X, wp.Y
			res.Success = true
			res.CastStarted = true
			h.sendCombatEvent(res, wp.X, wp.Y)
			return
		}
		h.applySkillToPlayer(c, wp, pc, tpc, skill, res)
		return
	}

	// Enemy-targeted: resolve to an NPC.
	n := h.npcs[action.TargetID]
	if n == nil || !n.onWorld() || !n.hostile() {
		n = h.autoTargetNPC(c.ID)
	}
	if n == nil {
		res.Message = "No valid target."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	pc.targetID = n.ID
	if !h.skillHitsNPC(pc, wp, n, skill) {
		res.Message = "Target out of range."
		res.TargetID = n.ID
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	res.TargetID = n.ID
	if game.SkillCastTime(skill) > 0 {
		pc.mp -= skill.MPCost
		pc.startGCD(now)
		pc.casting = &activeCast{SkillID: skill.ID, TargetID: n.ID}
		pc.castX, pc.castY = wp.X, wp.Y
		res.Success = true
		res.CastStarted = true
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	h.applySkillToNPC(c, wp, pc, n, skill, res)
}

func (h *Hub) autoTargetNPC(clientID string) *worldNPC {
	pc := h.combatants[clientID]
	wp := h.world[clientID]
	if pc == nil || wp == nil {
		return nil
	}
	if n := h.npcs[pc.targetID]; n != nil && n.onWorld() && n.hostile() {
		return n
	}
	var best *worldNPC
	bestD := math.MaxFloat64
	for _, n := range h.npcs {
		if !n.onWorld() || !n.hostile() {
			continue
		}
		if d := dist(wp.X, wp.Y, n.X, n.Y); d < bestD {
			bestD, best = d, n
		}
	}
	if best != nil {
		pc.targetID = best.ID
	}
	return best
}

func (h *Hub) skillHitsNPC(pc *combatant, wp *protocol.WorldPlayer, n *worldNPC, skill game.Skill) bool {
	d := dist(wp.X, wp.Y, n.X, n.Y)
	if mx := game.SkillMaxRange(skill); mx > 0 {
		return d <= mx
	}
	return d <= attackRangeW+enemyRadiusW
}

const allySkillRangeW = game.AllySkillRange

// applySkillToNPC resolves an instant or finished-cast skill against an NPC.
func (h *Hub) applySkillToNPC(c *Client, wp *protocol.WorldPlayer, pc *combatant, n *worldNPC, skill game.Skill, res protocol.CombatEventPayload) {
	now := time.Now()
	if pc.casting == nil && game.SkillCastTime(skill) == 0 {
		pc.mp -= skill.MPCost
		pc.startGCD(now)
	}
	res.Success = true

	amount := h.rollDamage(pc, skill)
	amount = game.ModifyDamageDealt(pc.statuses, amount)
	amount = game.ModifyDamageTaken(&n.statuses, amount)
	n.hp -= amount
	if n.hp < 0 {
		n.hp = 0
	}
	res.Damage = amount
	if n.contributors == nil {
		n.contributors = map[string]int{}
	}
	n.contributors[c.ID] += amount
	if !n.Engaged {
		h.engageNPC(n, c.ID) // attack-aggro + assist pull
	}
	h.applyStatusesToNPC(pc, n, skill, amount, &res)
	h.trackSkillUse(pc, skill)
	res.Message = fmt.Sprintf("%s hits %s for %d", wp.Name, n.Name, amount)
	h.sendCombatEvent(res, wp.X, wp.Y)
	if n.hp <= 0 {
		h.killNPC(n, c.ID)
	}
}

// applySkillToPlayer resolves heals/buffs aimed at a friendly player.
func (h *Hub) applySkillToPlayer(c *Client, wp *protocol.WorldPlayer, pc, tpc *combatant, skill game.Skill, res protocol.CombatEventPayload) {
	now := time.Now()
	if pc.casting == nil && game.SkillCastTime(skill) == 0 {
		pc.mp -= skill.MPCost
		if pc.inCombat {
			pc.startGCD(now)
		}
	}
	res.Success = true
	amount := h.rollDamage(pc, skill)
	amount = game.ModifyDamageDealt(pc.statuses, amount)
	if skill.Heals {
		tpc.hp = min(tpc.maxHP, tpc.hp+amount)
		res.Heal = amount
	}
	h.applyStatusesToPlayer(pc, tpc, skill, &res)
	h.trackSkillUse(pc, skill)
	twp := h.world[tpc.clientID]
	name := res.TargetID
	if twp != nil {
		name = twp.Name
		h.syncWorldPlayer(twp, tpc)
	}
	res.Message = fmt.Sprintf("%s heals %s for %d", wp.Name, name, amount)
	h.sendCombatEvent(res, wp.X, wp.Y)
}

func (h *Hub) rollDamage(pc *combatant, skill game.Skill) int {
	stat := pc.str
	if skill.UsesMagic {
		stat = pc.mag
	}
	power := skill.Power
	skillLvl := pc.skillLevels[skill.ID]
	if skillLvl < 1 {
		skillLvl = 1
	}
	power *= game.SkillLevelPotency(skillLvl)
	if skill.Job != "" && skill.Job == pc.subJob && skill.Job != pc.mainJob {
		power *= game.SubjobEffectRatio
	}
	cat := skill.Category
	if skill.ID == game.BasicAttack.ID {
		cat = game.WeaponCategory(pc.weapon)
	}
	if cat != "" {
		power *= game.WeaponSynergy(cat, pc.weaponForSkill(skill))
	}
	dmg := int(float64(stat) * power * (0.85 + h.rng.Float64()*0.3))
	if dmg < 1 {
		dmg = 1
	}
	return dmg
}

func (h *Hub) applyStatusesToNPC(pc *combatant, n *worldNPC, skill game.Skill, power int, res *protocol.CombatEventPayload) {
	for _, def := range game.StatusesForSkill(skill.ID) {
		shield := 0
		var list *[]game.ActiveStatus
		if def.OnCaster {
			list = &pc.statuses
		} else {
			list = &n.statuses
		}
		if def.Kind == game.StatusShield {
			shield = max(1, int(float64(pc.mag)*skill.Power*2))
		}
		game.ApplyStatus(list, def, pc.clientID, shield)
	}
}

func (h *Hub) applyStatusesToPlayer(pc, tpc *combatant, skill game.Skill, res *protocol.CombatEventPayload) {
	for _, def := range game.StatusesForSkill(skill.ID) {
		shield := 0
		list := &tpc.statuses
		if def.OnCaster {
			list = &pc.statuses
		}
		if def.Kind == game.StatusShield {
			shield = max(1, int(float64(pc.mag)*skill.Power*2))
		}
		game.ApplyStatus(list, def, pc.clientID, shield)
	}
}

func (h *Hub) trackSkillUse(pc *combatant, skill game.Skill) {
	if game.SkillAlwaysUnlocked(skill.ID) {
		return
	}
	pc.pendingSkillUses[skill.ID]++
}

// resolveItemUse consumes a potion-type item on self or a party member.
func (h *Hub) resolveItemUse(c *Client, wp *protocol.WorldPlayer, pc *combatant, action protocol.ActionPayload) {
	res := protocol.CombatEventPayload{AttackerID: c.ID, ActionID: "use_item", ActionName: "Item"}
	item, ok := h.store.FindItem(c.Name, action.ItemID)
	if !ok || item.Kind != game.KindConsumable {
		res.Message = "No such item."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	tgtID := action.TargetID
	if tgtID == "" {
		tgtID = c.ID
	}
	twp := h.world[tgtID]
	tpc := h.combatants[tgtID]
	if twp == nil || tpc == nil || tpc.hp <= 0 {
		res.Message = "Invalid target."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	if dist(wp.X, wp.Y, twp.X, twp.Y) > allySkillRangeW {
		res.Message = "Target out of range."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	hp, mp := game.ConsumableEffect(item)
	if hp == 0 && mp == 0 {
		res.Message = "This item has no effect."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	if _, ok := h.store.UseConsumable(c.Name, item.ID); !ok {
		res.Message = "No such item."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	res.ActionName = item.Name
	res.TargetID = tgtID
	if pc.inCombat {
		pc.startGCD(time.Now())
	}
	res.Success = true
	if hp > 0 {
		tpc.hp = min(tpc.maxHP, tpc.hp+hp)
		res.Heal = hp
	}
	if mp > 0 {
		tpc.mp = min(tpc.maxMP, tpc.mp+mp)
		res.MPRestored = mp
	}
	h.syncWorldPlayer(twp, tpc)
	if profile, ok := h.store.Get(c.Name); ok {
		h.sendWelcome(c, profile)
	}
	res.Message = fmt.Sprintf("%s uses %s", wp.Name, item.Name)
	h.sendCombatEvent(res, wp.X, wp.Y)
}

// resolveCapture attempts to capture a weakened NPC.
func (h *Hub) resolveCapture(c *Client, wp *protocol.WorldPlayer, pc *combatant, action protocol.ActionPayload) {
	res := protocol.CombatEventPayload{
		AttackerID: c.ID, ActionID: game.ActionIDCapture, ActionName: "Capture", TargetID: action.TargetID,
	}
	n := h.npcs[action.TargetID]
	if n == nil || !n.onWorld() || !n.hostile() {
		res.Message = "Invalid target."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	if !game.EligibleForCapture(n.capturable, true, n.hp, n.maxHP) {
		res.Message = "Target is not weak enough to capture."
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	pc.startGCD(time.Now())
	chance := game.CaptureChance(pc.level, n.Level)
	if h.rng.Float64() >= chance {
		res.Message = fmt.Sprintf("Capture failed (%.0f%%).", chance*100)
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	profile, _, errMsg := h.store.AddPet(c.Name, n.Kind, n.Name, n.Level)
	if errMsg != "" {
		res.Message = errMsg
		h.sendCombatEvent(res, wp.X, wp.Y)
		return
	}
	res.Success = true
	res.Hit = true
	res.Message = fmt.Sprintf("Captured %s!", n.Name)
	h.sendCombatEvent(res, wp.X, wp.Y)
	h.sendWelcome(c, profile)
	h.captureNPC(n)
}

// killNPC awards rewards to contributors, despawns the NPC, and schedules a
// respawn.
func (h *Hub) killNPC(n *worldNPC, killerID string) {
	n.Engaged = false
	n.targetID = ""
	n.statuses = nil
	n.chasePath = nil
	h.awardKill(n)
	n.despawned = true
	n.respawnAt = time.Now().Add(game.RespawnDelay(n.Kind, n.ID))
	h.broadcastNPCs()
}

// captureNPC removes a caught NPC (no loot, XP still awarded).
func (h *Hub) captureNPC(n *worldNPC) {
	n.Engaged = false
	n.targetID = ""
	n.statuses = nil
	n.chasePath = nil
	h.awardKillXPOnly(n)
	n.despawned = true
	n.respawnAt = time.Now().Add(game.RespawnDelay(n.Kind, n.ID))
	h.broadcastNPCs()
}

// defeatPlayer respawns a fallen player at their save point and drops them
// from every fight.
func (h *Hub) defeatPlayer(clientID string) {
	pc := h.combatants[clientID]
	wp := h.world[clientID]
	if pc == nil || wp == nil {
		return
	}
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: clientID, TargetID: clientID,
		Message: fmt.Sprintf("%s was defeated", wp.Name),
	}, wp.X, wp.Y)
	pc.casting = nil
	pc.statuses = nil
	pc.targetID = ""
	pc.inCombat = false
	h.flushSkillUsage(pc)
	for _, n := range h.npcs {
		if n.Engaged && n.targetID == clientID {
			n.targetID = "" // retarget next tick
		}
		delete(n.contributors, clientID)
	}
	// Restore and respawn.
	pc.hp = pc.maxHP
	pc.mp = pc.maxMP
	pc.stamina = staminaMax
	pc.staminaAt = time.Now()
	h.respawnAtSavePoint(clientID)
	h.grantBattleImmunity(wp)
	h.syncWorldPlayer(wp, pc)
	h.sendPlayerSync(wp)
	h.mu.RLock()
	c := h.clients[clientID]
	h.mu.RUnlock()
	if c != nil {
		if profile, ok := h.store.Get(c.Name); ok {
			h.sendWelcome(c, profile)
		}
	}
}

// advanceCasts progresses player casts; on completion the skill resolves.
func (h *Hub) advanceCasts(now time.Time) {
	for id, pc := range h.combatants {
		if pc.casting == nil || pc.hp <= 0 {
			continue
		}
		wp := h.world[id]
		if wp == nil || wp.InHouse {
			pc.casting = nil
			continue
		}
		skill, ok := game.FindSkill(pc.casting.SkillID)
		if !ok || game.SkillCastTime(skill) <= 0 {
			pc.casting = nil
			continue
		}
		castMs := game.SkillCastTime(skill)
		pc.casting.Progress += 100.0 * combatTickInterval.Seconds() / (float64(castMs) / 1000.0)
		if pc.casting.Progress < 100 {
			continue
		}
		cast := pc.casting
		pc.casting = nil
		res := protocol.CombatEventPayload{
			AttackerID: id, ActionID: skill.ID, ActionName: skill.Name,
			TargetID: cast.TargetID, Success: true,
		}
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c == nil {
			continue
		}
		if game.SkillTargetsAlly(skill) {
			tpc := h.combatants[cast.TargetID]
			if tpc == nil || tpc.hp <= 0 {
				continue
			}
			h.applySkillToPlayer(c, wp, pc, tpc, skill, res)
		} else {
			n := h.npcs[cast.TargetID]
			if n == nil || !n.onWorld() || !n.hostile() {
				continue
			}
			h.applySkillToNPC(c, wp, pc, n, skill, res)
		}
	}
}

// interruptCast cancels an in-progress cast, refunding MP and GCD.
func (h *Hub) interruptCast(pc *combatant) {
	if pc.casting == nil {
		return
	}
	skillID := pc.casting.SkillID
	if skill, ok := game.FindSkill(skillID); ok {
		pc.mp += skill.MPCost
		if pc.mp > pc.maxMP {
			pc.mp = pc.maxMP
		}
	}
	pc.casting = nil
	pc.gcdReadyAt = time.Time{}
	name := skillID
	if skill, ok := game.FindSkill(skillID); ok {
		name = skill.Name
	}
	wp := h.world[pc.clientID]
	x, y := 0.0, 0.0
	if wp != nil {
		x, y = wp.X, wp.Y
	}
	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID:    pc.clientID,
		ActionID:      skillID,
		ActionName:    name,
		CastCancelled: true,
		Message:       fmt.Sprintf("%s's %s was interrupted", h.nameOf(pc.clientID), name),
	}, x, y)
}

func (h *Hub) nameOf(id string) string {
	if wp := h.world[id]; wp != nil {
		return wp.Name
	}
	if n := h.npcs[id]; n != nil {
		return n.Name
	}
	return id
}

// ---- rewards ----

// awardKill splits XP/loot among everyone who damaged the NPC, plus a passive
// share for nearby party members who stayed out of the fight.
func (h *Hub) awardKill(n *worldNPC) {
	h.awardKillInternal(n, true)
}

func (h *Hub) awardKillXPOnly(n *worldNPC) {
	h.awardKillInternal(n, false)
}

func (h *Hub) awardKillInternal(n *worldNPC, loot bool) {
	if len(n.contributors) == 0 {
		return
	}
	totalXP := 20 + n.Level*15
	contributors := make([]string, 0, len(n.contributors))
	for id := range n.contributors {
		contributors = append(contributors, id)
	}
	share := totalXP / len(contributors)
	if share < 1 {
		share = 1
	}

	// Party bonus: 2+ members of one party contributing.
	partyCount := map[string]int{}
	for _, id := range contributors {
		if p := h.clientParty[id]; p != "" {
			partyCount[p]++
		}
	}
	bonusParty := ""
	for p, n2 := range partyCount {
		if n2 >= 2 {
			bonusParty = p
			break
		}
	}

	var pools []string
	if loot && n.dropPoolID != "" {
		pools = []string{n.dropPoolID}
	}

	for _, id := range contributors {
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c == nil {
			continue
		}
		xp := share
		if bonusParty != "" && h.clientParty[id] == bonusParty {
			xp = share * (100 + partyInCombatBonusPercent) / 100
		}
		hasSub := false
		if profile, ok := h.store.Get(c.Name); ok && profile.SubJob != "" {
			hasSub = true
		}
		mainXP, subXP := game.DistributeJobXP(xp, hasSub)
		items := game.GenerateVictoryLoot(h.rng, n.Level, 0, pools)
		updated, _, _ := h.store.AwardJobVictory(c.Name, mainXP, subXP, items)
		h.sendWelcome(c, updated)
		msg := fmt.Sprintf("Defeated %s — +%d EXP", n.Name, xp)
		if len(items) > 0 {
			msg += fmt.Sprintf(", found %s", items[0].Name)
		}
		h.send(c, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
			XP: xp, Victory: true, Message: msg,
		})
		// Refresh world level after a level-up.
		if wp := h.world[id]; wp != nil {
			wp.Level = updated.MainJobLevel()
		}
	}

	// Passive party share for nearby members who didn't fight.
	partyIDs := map[string]bool{}
	for _, id := range contributors {
		if p := h.clientParty[id]; p != "" {
			partyIDs[p] = true
		}
	}
	fought := map[string]bool{}
	for _, id := range contributors {
		fought[id] = true
	}
	passiveXP := share * partyPassiveXPPercent / 100
	if passiveXP < 1 {
		passiveXP = 1
	}
	for pid := range partyIDs {
		party := h.parties[pid]
		if party == nil {
			continue
		}
		for _, memberID := range party.MemberIDs {
			if fought[memberID] {
				continue
			}
			wp := h.world[memberID]
			if wp == nil || wp.InHouse || dist(wp.X, wp.Y, n.X, n.Y) > partyBattleRange {
				continue
			}
			h.mu.RLock()
			mc := h.clients[memberID]
			h.mu.RUnlock()
			if mc == nil {
				continue
			}
			hasSub := false
			if profile, ok := h.store.Get(mc.Name); ok && profile.SubJob != "" {
				hasSub = true
			}
			pm, ps := game.DistributeJobXP(passiveXP, hasSub)
			updated, _, _ := h.store.AwardJobVictory(mc.Name, pm, ps, nil)
			h.sendWelcome(mc, updated)
			h.send(mc, protocol.TypeRewardNotice, protocol.RewardNoticePayload{
				XP: pm, Passive: true, Victory: true,
				Message: fmt.Sprintf("Party victory — +%d passive EXP (you stayed out of combat).", pm),
			})
		}
	}
}

// outOfCombatRegen slowly restores hp/mp/stamina for players not fighting.
// Runs on the 250ms NPC tick so idle players don't need the combat tick.
func (h *Hub) outOfCombatRegen() {
	now := time.Now()
	for id, pc := range h.combatants {
		wp := h.world[id]
		if wp == nil || wp.InHouse {
			continue
		}
		changed := false
		stam := pc.staminaNow(now)
		if math.Abs(stam-wp.Stamina) >= 0.5 {
			wp.Stamina = stam
			changed = true
		}
		if !pc.inCombat && pc.hp > 0 && (pc.hp < pc.maxHP || pc.mp < pc.maxMP) {
			pc.regenAcc += npcTickSec
			if pc.regenAcc >= 1 {
				pc.regenAcc = 0
				pc.hp = min(pc.maxHP, pc.hp+max(1, pc.maxHP/12))
				pc.mp = min(pc.maxMP, pc.mp+max(1, pc.maxMP/12))
				changed = true
			}
		}
		if changed {
			h.syncWorldPlayer(wp, pc)
			h.mu.RLock()
			c := h.clients[id]
			h.mu.RUnlock()
			if c != nil {
				h.send(c, protocol.TypePlayerSync, *wp)
			}
		}
	}
}
