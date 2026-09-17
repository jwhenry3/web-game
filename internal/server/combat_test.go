package server

import (
	"encoding/json"
	"math"
	"math/rand"
	"strings"
	"testing"
	"time"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// ---- test helpers ----

// addWorldClient attaches a second joined client + player entity to a test hub.
func addWorldClient(h *Hub, id, name string, x, y float64) (*Client, *entity) {
	c := &Client{
		ID:     id,
		Name:   name,
		Joined: true,
		Send:   make(chan []byte, 256),
		Hub:    h,
	}
	h.clients[c.ID] = c
	h.store.GetOrCreate(name, game.JobVAN)
	e := h.ensurePlayer(c)
	e.X, e.Y = x, y
	return c, e
}

// drainClient pops every queued frame from the client's send buffer. All hub
// sends in these tests are synchronous, so anything already emitted is queued.
func drainClient(c *Client) []protocol.Envelope {
	var out []protocol.Envelope
	for {
		select {
		case raw := <-c.Send:
			var env protocol.Envelope
			if err := json.Unmarshal(raw, &env); err == nil {
				out = append(out, env)
			}
		default:
			return out
		}
	}
}

// recvType waits up to d for an envelope of the given type, discarding others.
func recvType(c *Client, t protocol.MessageType, d time.Duration) (protocol.Envelope, bool) {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		select {
		case raw := <-c.Send:
			var env protocol.Envelope
			if err := json.Unmarshal(raw, &env); err != nil {
				continue
			}
			if env.Type == t {
				return env, true
			}
		case <-time.After(10 * time.Millisecond):
		}
	}
	return protocol.Envelope{}, false
}

func frameTypes(frames []protocol.Envelope) []protocol.MessageType {
	out := make([]protocol.MessageType, len(frames))
	for i, f := range frames {
		out[i] = f.Type
	}
	return out
}

func hasFrameType(frames []protocol.Envelope, t protocol.MessageType) bool {
	for _, f := range frames {
		if f.Type == t {
			return true
		}
	}
	return false
}

// lastFrame returns the most recent frame of a type.
func lastFrame(frames []protocol.Envelope, t protocol.MessageType) (protocol.Envelope, bool) {
	for i := len(frames) - 1; i >= 0; i-- {
		if frames[i].Type == t {
			return frames[i], true
		}
	}
	return protocol.Envelope{}, false
}

func combatTicks(frames []protocol.Envelope) []protocol.CombatTickPayload {
	var out []protocol.CombatTickPayload
	for _, f := range frames {
		if f.Type != protocol.TypeCombatTick {
			continue
		}
		var p protocol.CombatTickPayload
		if err := json.Unmarshal(f.Payload, &p); err == nil {
			out = append(out, p)
		}
	}
	return out
}

func combatEvents(frames []protocol.Envelope) []protocol.CombatEventPayload {
	var out []protocol.CombatEventPayload
	for _, f := range frames {
		if f.Type != protocol.TypeCombatEvent {
			continue
		}
		var p protocol.CombatEventPayload
		if err := json.Unmarshal(f.Payload, &p); err == nil {
			out = append(out, p)
		}
	}
	return out
}

// farCorner returns the map corner opposite (x,y) — outside combat AoI for any
// reasonably sized map.
func farCorner(h *Hub, x, y float64) (float64, float64) {
	ww, wh := h.worldSize()
	fx, fy := 60.0, 60.0
	if x < ww/2 {
		fx = ww - 60
	}
	if y < wh/2 {
		fy = wh - 60
	}
	return fx, fy
}

// ---- dodge ----

func TestDodgeAfterMoveDrainsStaminaAndCooldown(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)

	// A real move stamps lastMoveAt, which opens the 250ms dodge window.
	raw, _ := json.Marshal(protocol.MovePayload{X: px, Y: py + 8})
	h.handleMove(c, raw)
	if cc.lastMoveAt.IsZero() {
		cc.lastMoveAt = time.Now() // terrain-dependent; stamp directly
	}

	drainClient(c)
	h.handleDodge(c)

	want := staminaMax - dodgeStaminaCost
	if got := cc.staminaNow(time.Now()); math.Abs(got-want) > 0.5 {
		t.Fatalf("dodge should cost %v stamina, have %v", dodgeStaminaCost, got)
	}
	if got := h.entitySync(pe).Stamina; math.Abs(got-want) > 0.5 {
		t.Fatalf("world state should report stamina ~%v, got %v", want, got)
	}
	if until := time.Until(cc.dodgeReadyAt); until <= 0 || until > dodgeCooldown+50*time.Millisecond {
		t.Fatalf("dodge cooldown should be ~%v out, got %v", dodgeCooldown, until)
	}
	evs := combatEvents(drainClient(c))
	found := false
	for _, ev := range evs {
		if ev.ActionID == game.ActionIDDodge && ev.Success {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a dodge combat_event")
	}

	// A second dodge inside the cooldown is a no-op.
	h.handleDodge(c)
	if got := cc.staminaNow(time.Now()); math.Abs(got-want) > 0.5 {
		t.Fatalf("cooldown dodge must not drain stamina, got %v", got)
	}

	// Once the cooldown lapses (and movement is recent) dodge works again.
	cc.dodgeReadyAt = time.Now().Add(-time.Millisecond)
	cc.lastMoveAt = time.Now()
	h.handleDodge(c)
	if got := cc.staminaNow(time.Now()); math.Abs(got-(want-dodgeStaminaCost)) > 0.5 {
		t.Fatalf("second dodge should cost another %v stamina, got %v", dodgeStaminaCost, got)
	}
}

func TestDodgeFailsWithoutRecentMovement(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	drainClient(c)

	pe := h.playerEnt(c.ID)
	cc := clientControlOf(pe)
	h.handleDodge(c)
	if !cc.dodgeReadyAt.IsZero() {
		t.Fatal("dodge without recent movement must not start the cooldown")
	}
	if got := cc.staminaNow(time.Now()); math.Abs(got-staminaMax) > 0.5 {
		t.Fatalf("dodge without recent movement must not drain stamina, got %v", got)
	}
	for _, ev := range combatEvents(drainClient(c)) {
		if ev.ActionID == game.ActionIDDodge && ev.Success {
			t.Fatal("no dodge event should be emitted when standing still")
		}
	}
}

func TestDodgeFailsWithLowStamina(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	pe := h.playerEnt(c.ID)
	cc := clientControlOf(pe)
	cc.stamina = dodgeStaminaCost - 10
	cc.staminaAt = time.Now()
	cc.lastMoveAt = time.Now()

	h.handleDodge(c)
	if !cc.dodgeReadyAt.IsZero() {
		t.Fatal("dodge with insufficient stamina must not start the cooldown")
	}
	if got := cc.staminaNow(time.Now()); got >= dodgeStaminaCost {
		t.Fatalf("stamina should be untouched on a failed dodge, got %v", got)
	}
	for _, ev := range combatEvents(drainClient(c)) {
		if ev.ActionID == game.ActionIDDodge {
			t.Fatal("no dodge event should be emitted on low stamina")
		}
	}
}

func TestCombatStaminaRegen(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	_ = c
	cc := clientControlOf(pe)

	// staminaNow applies regen on read.
	cc.stamina = 50
	cc.staminaAt = time.Now().Add(-time.Second)
	if got := cc.staminaNow(time.Now()); got < 50+staminaRegenRate-0.5 {
		t.Fatalf("stamina should regen ~%v/s, got %v after 1s", staminaRegenRate, got)
	}

	// The out-of-combat regen tick pushes stamina onto the wire and restores
	// hp/mp once per second of accumulated tick time.
	cc.stamina = 40
	cc.staminaAt = time.Now().Add(-time.Second)
	pe.hp = pe.maxHP - 20
	hpBefore := pe.hp
	for i := 0; i < 4; i++ {
		h.outOfCombatRegen()
	}
	if got := h.entitySync(pe).Stamina; got < 40+staminaRegenRate-1 {
		t.Fatalf("outOfCombatRegen should sync regenerated stamina, got %v", got)
	}
	if pe.hp <= hpBefore {
		t.Fatal("out-of-combat regen should restore hp after ~1s of ticks")
	}
}

func TestResourceSyncHeartbeat(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)
	cc.stamina = staminaMax
	cc.staminaAt = time.Now()
	pe.hp, pe.mp = pe.maxHP, pe.maxMP

	drainClient(c)
	cc.lastResourceSync = time.Now()
	h.outOfCombatRegen()
	if hasFrameType(drainClient(c), protocol.TypePlayerSync) {
		t.Fatal("resource sync should not repeat before the heartbeat interval")
	}

	cc.lastResourceSync = time.Now().Add(-resourceSyncInterval)
	h.outOfCombatRegen()
	frame, ok := lastFrame(drainClient(c), protocol.TypePlayerSync)
	if !ok {
		t.Fatal("resource heartbeat should send player_sync even without a resource delta")
	}
	var got protocol.WorldEntity
	if err := json.Unmarshal(frame.Payload, &got); err != nil {
		t.Fatalf("decode resource heartbeat: %v", err)
	}
	if got.HP != pe.hp || got.MP != pe.mp || math.Abs(got.Stamina-staminaMax) > 1e-6 {
		t.Fatalf("resource heartbeat mismatch: hp=%d mp=%d stamina=%v", got.HP, got.MP, got.Stamina)
	}
}

func TestDodgeInterruptsCast(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)

	skill, ok := game.FindSkill("san_sanare")
	if !ok || game.SkillCastTime(skill) == 0 {
		t.Fatal("san_sanare should be a casted skill")
	}
	pe.casting = &activeCast{SkillID: skill.ID, TargetID: c.ID}
	pe.castX, pe.castY = pe.X, pe.Y
	pe.mp = 0
	pe.startGCD(time.Now())
	cc.lastMoveAt = time.Now()
	drainClient(c)

	h.handleDodge(c)
	if pe.casting != nil {
		t.Fatal("dodge should interrupt the active cast")
	}
	if pe.mp != skill.MPCost {
		t.Fatalf("interrupted cast should refund %d mp, got %d", skill.MPCost, pe.mp)
	}
	if !pe.gcdReadyAt.IsZero() {
		t.Fatal("interrupt should clear the GCD")
	}
	found := false
	for _, ev := range combatEvents(drainClient(c)) {
		if ev.CastCancelled && ev.ActionID == skill.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a cast-cancelled combat_event")
	}
}

// ---- conditional tick / AoI ----

func TestCombatTickRequiresActiveFight(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	drainClient(c)

	// Nothing engaged: the tick is a no-op and sends nothing.
	if h.combatActive() {
		t.Fatal("fresh hub should have no active combat")
	}
	h.tickEntities(time.Now())
	if frames := drainClient(c); len(frames) != 0 {
		t.Fatalf("idle tick should emit nothing, got %v", frameTypes(frames))
	}
	if len(h.aoi) != 0 {
		t.Fatal("aoi should stay empty without combat")
	}

	// Engaging an NPC activates the simulation.
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	h.engage(n, h.playerEnt(c.ID))
	if !h.combatActive() {
		t.Fatal("an engaged npc should activate combat")
	}
	drainClient(c)
	h.tickEntities(time.Now())
	ticks := combatTicks(drainClient(c))
	if len(ticks) == 0 || len(ticks[len(ticks)-1].Entities) == 0 {
		t.Fatal("active fight should broadcast combat_tick entities")
	}

	// When the fight ends, the previous AoI member gets one empty tick and
	// the player's combat flag clears.
	h.disengage(n, false)
	drainClient(c)
	h.tickEntities(time.Now())
	frames := drainClient(c)
	tick, ok := lastFrame(frames, protocol.TypeCombatTick)
	if !ok {
		t.Fatal("leaving combat should flush one combat_tick")
	}
	var payload protocol.CombatTickPayload
	if err := json.Unmarshal(tick.Payload, &payload); err != nil {
		t.Fatalf("decode tick: %v", err)
	}
	if len(payload.Entities) != 0 {
		t.Fatal("end-of-fight tick should carry an empty entity list")
	}
	if len(h.aoi) != 0 {
		t.Fatal("aoi should be cleared when no entities remain")
	}
	if cc := clientControlOf(pe); cc == nil || cc.inCombat {
		t.Fatal("player combat flag should clear once no npc fights them")
	}
}

func TestCombatTickAoIScope(t *testing.T) {
	px, py := wildernessXY()
	h, cA, _ := testHubWithPlayer(t, px, py)
	fx, fy := farCorner(h, px, py)
	if dist(px, py, fx, fy) <= combatAoIDist {
		t.Skip("map too small for AoI distance test")
	}
	cB, peB := addWorldClient(h, "client-2", "Lenna", fx, fy)

	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	h.engage(n, h.playerEnt(cA.ID))
	drainClient(cA)
	drainClient(cB)

	// Near fighter gets the tick; the far bystander does not.
	h.tickEntities(time.Now())
	if ticks := combatTicks(drainClient(cA)); len(ticks) == 0 || len(ticks[len(ticks)-1].Entities) == 0 {
		t.Fatal("client near the fight should receive combat_tick entities")
	}
	if hasFrameType(drainClient(cB), protocol.TypeCombatTick) {
		t.Fatal("distant client must not receive combat_tick")
	}
	if !h.aoi[cA.ID] || h.aoi[cB.ID] {
		t.Fatalf("aoi should contain only the near client, got %v", h.aoi)
	}

	// Bystander walking into the AoI starts receiving ticks.
	peB.X, peB.Y = px+200, py
	drainClient(cA)
	drainClient(cB)
	h.tickEntities(time.Now())
	if ticks := combatTicks(drainClient(cB)); len(ticks) == 0 || len(ticks[len(ticks)-1].Entities) == 0 {
		t.Fatal("bystander inside AoI should receive combat_tick entities")
	}
	if !h.aoi[cB.ID] {
		t.Fatal("bystander should be tracked in aoi")
	}

	// Leaving the AoI flushes exactly one empty tick so the HUD clears.
	peB.X, peB.Y = fx, fy
	drainClient(cA)
	drainClient(cB)
	h.tickEntities(time.Now())
	ticks := combatTicks(drainClient(cB))
	if len(ticks) != 1 || len(ticks[0].Entities) != 0 {
		t.Fatalf("bystander leaving AoI should get one empty tick, got %+v", ticks)
	}
	if h.aoi[cB.ID] {
		t.Fatal("bystander should drop out of aoi")
	}
	if ticks := combatTicks(drainClient(cA)); len(ticks) == 0 {
		t.Fatal("fighter should keep receiving combat_tick")
	}
}

func TestCombatEventAoIScope(t *testing.T) {
	px, py := wildernessXY()
	h, cA, _ := testHubWithPlayer(t, px, py)
	fx, fy := farCorner(h, px, py)
	if dist(px, py, fx, fy) <= combatAoIDist {
		t.Skip("map too small for AoI distance test")
	}
	cB, _ := addWorldClient(h, "client-2", "Lenna", fx, fy)
	drainClient(cA)
	drainClient(cB)

	h.sendCombatEvent(protocol.CombatEventPayload{
		AttackerID: cA.ID, ActionID: game.BasicAttack.ID, Message: "test hit",
	}, px, py)

	if !hasFrameType(drainClient(cA), protocol.TypeCombatEvent) {
		t.Fatal("client at the event origin should receive combat_event")
	}
	if hasFrameType(drainClient(cB), protocol.TypeCombatEvent) {
		t.Fatal("distant client must not receive combat_event")
	}
}

// ---- leash / kill / defeat ----

func TestNPCLeashesBeyondRadius(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)

	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px+leashRadius+300, py)
	n.hp = 10
	npcEngageOf(n).engaged = true
	n.targetID = c.ID

	home := game.TileCenter(wanderOf(n).patrol.Home)
	if dist(n.X, n.Y, home.X, home.Y) <= leashRadius {
		t.Fatal("test setup: npc should start beyond leash range")
	}
	h.tickEntities(time.Now())
	if npcEngaged(n) {
		t.Fatal("npc past leash radius should disengage")
	}
	if n.hp != n.maxHP {
		t.Fatal("leashed npc should reset to full hp")
	}
	if dist(n.X, n.Y, home.X, home.Y) > 1 {
		t.Fatalf("leashed npc should snap home to %v, at %v,%v", home, n.X, n.Y)
	}
	if n.targetID != "" {
		t.Fatal("leashed npc should drop its target")
	}
}

// TestEngageFarFromHomeDoesNotLeash reproduces the wandering-imp bug: an NPC
// that wandered far from its patrol home (regions are large; wander has no
// max distance) must not leash-teleport the moment a player walks up. The
// leash anchors to where combat began, not the spawn tile.
func TestEngageFarFromHomeDoesNotLeash(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)

	n := hostileNPC(h, "npc-1", px+aggroRadius-10, py)
	npcSetHome(h, n, px+leashRadius+300, py) // spawned far away
	h.engage(n, pe)

	for i := 0; i < 10; i++ {
		h.tickEntities(time.Now())
		if !npcEngaged(n) {
			t.Fatalf("npc leashed on tick %d though the fight never left its anchor", i)
		}
	}
	if dist(n.X, n.Y, px, py) > aggroRadius+leashRadius {
		t.Fatalf("npc drifted implausibly far: %.0f,%.0f", n.X, n.Y)
	}
}

// TestLeashedNPCReturnsToEngageAnchor: dragging an NPC beyond leashRadius from
// where combat began resets it to that spot — not to a distant patrol home.
func TestLeashedNPCReturnsToEngageAnchor(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)

	n := hostileNPC(h, "npc-1", px+60, py)
	h.engage(n, h.playerEnt(c.ID))
	anchorX, anchorY := n.X, n.Y

	// Drag the fight past the leash radius: move the npc with the player.
	n.X = anchorX + leashRadius + 40
	pe.X = n.X + 10
	pe.Y = n.Y
	h.tickEntities(time.Now())

	if npcEngaged(n) {
		t.Fatal("npc dragged past leash radius should disengage")
	}
	if dist(n.X, n.Y, anchorX, anchorY) > 1 {
		t.Fatalf("leashed npc should snap to its anchor (%.0f,%.0f), at %.0f,%.0f", anchorX, anchorY, n.X, n.Y)
	}
	if n.hp != n.maxHP {
		t.Fatal("leashed npc should reset to full hp")
	}
}

// TestEngagedNPCPathsAroundWall builds a map split by a wall column with one
// gap at the bottom. The NPC and player sit on opposite sides of the wall, so
// straight-line chase fails and the NPC must A* around the gap to reach melee.
func TestEngagedNPCPathsAroundWall(t *testing.T) {
	const cols, rows, ts = 24, 12, 32
	cells := make([]string, rows)
	for r := range cells {
		row := []byte(strings.Repeat(".", cols))
		if r < 8 {
			row[12] = '#' // wall column; gap at rows 8..11
		}
		cells[r] = string(row)
	}
	ow := &game.Overworld{
		Cols: cols, Rows: rows, TileSize: ts,
		WorldW: cols * ts, WorldH: rows * ts,
		Cells: cells,
	}
	h := mustTestHub()
	h.SetMap("wallmap", "Wallmap", ow)

	center := func(c, r int) (float64, float64) {
		v := ow.TileCenter(game.Tile{C: c, R: r})
		return v.X, v.Y
	}
	px, py := center(17, 4) // east of the wall
	_, pe := addWorldClient(h, "client-1", "Bartz", px, py)

	nx, ny := center(7, 4) // west of the wall, same row — direct chase blocked
	n := hostileNPC(h, "npc-1", nx, ny)
	if w := wanderOf(n); w != nil {
		w.patrol.Home = game.Tile{C: 7, R: 4}
	}
	h.engage(n, h.playerEnt("client-1"))
	if !npcEngaged(n) {
		t.Fatal("setup: npc should be engaged")
	}

	reached := false
	for i := 0; i < 900; i++ {
		h.tickEntities(time.Now())
		if !npcEngaged(n) {
			t.Fatalf("npc disengaged at tick %d (%.0f,%.0f)", i, n.X, n.Y)
		}
		if !ow.WalkableAt(n.X, n.Y) {
			t.Fatalf("npc stood on blocked terrain at %.0f,%.0f", n.X, n.Y)
		}
		if dist(n.X, n.Y, pe.X, pe.Y) <= meleeStopDistW+npcHoldSlackW+stepSlack() {
			reached = true
			break
		}
	}
	if !reached {
		t.Fatalf("npc never reached the player (at %.0f,%.0f, dist %.0f)", n.X, n.Y, dist(n.X, n.Y, pe.X, pe.Y))
	}
	// The only route runs below the wall — the NPC must have crossed c=12 at a
	// row >= 8, i.e. it actually pathed rather than clipping through.
	if n.X <= 12*ts && n.Y <= 8*ts {
		t.Fatal("npc reached the player without routing around the wall")
	}
}

func stepSlack() float64 { return enemySpeedWorld * combatTickInterval.Seconds() }

func TestKillNPCDespawnsAndRewardsContributor(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)

	n := hostileNPC(h, "g1", px+10, py)
	npcSetHome(h, n, px, py)
	h.engage(n, h.playerEnt(c.ID))
	n.contributors[c.ID] = 12
	drainClient(c)

	h.kill(n, h.playerEnt(c.ID))

	if n.onWorld() || hasWorldNPC(h, "g1") {
		t.Fatal("killed npc must despawn")
	}
	if npcEngaged(n) || n.targetID != "" {
		t.Fatal("killed npc must drop engagement")
	}
	r := respawnOf(n)
	if r == nil || r.respawnAt.IsZero() || !r.respawnAt.After(time.Now()) {
		t.Fatal("kill should schedule a future respawn")
	}

	env, ok := recvType(c, protocol.TypeRewardNotice, time.Second)
	if !ok {
		t.Fatal("contributor should receive a reward_notice")
	}
	var notice protocol.RewardNoticePayload
	if err := json.Unmarshal(env.Payload, &notice); err != nil {
		t.Fatalf("decode reward notice: %v", err)
	}
	if !notice.Victory || notice.XP <= 0 {
		t.Fatalf("expected a victory reward with XP, got %+v", notice)
	}
}

func TestPlayerDefeatRespawnsAtSavePoint(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)
	pe.hp = contactDamageW - 1 // one hit kills

	n := hostileNPC(h, "npc-1", px+30, py)
	npcSetHome(h, n, px, py)
	npcEngageOf(n).engaged = true
	n.targetID = c.ID

	profile, _ := h.store.Get(c.Name)
	expX, expY := game.SpawnPosition(profile.SavePointID)
	if h.overworld != nil {
		expX, expY = h.overworld.SpawnPosition(profile.SavePointID)
	}

	h.tickEntities(time.Now())

	if pe.hp != pe.maxHP || h.entitySync(pe).HP != pe.maxHP {
		t.Fatalf("defeat should restore hp to %d, got pe=%d wire=%d", pe.maxHP, pe.hp, h.entitySync(pe).HP)
	}
	if pe.X != expX || pe.Y != expY {
		t.Fatalf("defeated player should respawn at save point %v,%v, got %v,%v", expX, expY, pe.X, pe.Y)
	}
	if cc.inCombat || h.entitySync(pe).Engaged {
		t.Fatal("defeat should clear the combat flag")
	}
	if !battleImmuneEnt(pe) {
		t.Fatal("respawn should grant battle immunity")
	}
	if n.targetID != "" {
		t.Fatal("defeated player's npc should drop its target")
	}

	// With the victim immune and far away, the npc gives up next tick.
	h.tickEntities(time.Now())
	if npcEngaged(n) {
		t.Fatal("npc should disengage once its target is gone")
	}
}

// ---- target / GCD ----

func TestSetTargetStoresTargetID(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	delete(h.entities, c.ID) // prove set_target creates the player entity

	raw, _ := json.Marshal(protocol.SetTargetPayload{TargetID: "npc-9"})
	h.handleSetTarget(c, raw)
	e := h.playerEnt(c.ID)
	if e == nil {
		t.Fatal("set_target should create the player entity")
	}
	if e.targetID != "npc-9" {
		t.Fatalf("set_target should store the target, got %q", e.targetID)
	}
}

func TestGCDSwallowsSecondAction(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	pe := h.playerEnt(c.ID)
	n := hostileNPC(h, "npc-1", px+40, py) // inside basic-attack range
	npcSetHome(h, n, px, py)

	raw, _ := json.Marshal(protocol.ActionPayload{
		ActionID: game.BasicAttack.ID, TargetID: n.ID,
	})
	h.handleAction(c, raw)
	if n.hp >= n.maxHP {
		t.Fatal("first attack should land")
	}
	if pe.gcdReady(time.Now()) {
		t.Fatal("attack should start the GCD")
	}
	if pe.targetID != n.ID {
		t.Fatal("attack should record the npc as the player's target")
	}

	hpAfterFirst := n.hp
	h.handleAction(c, raw)
	if n.hp != hpAfterFirst {
		t.Fatal("action inside the GCD window must be ignored")
	}

	pe.gcdReadyAt = time.Now().Add(-time.Millisecond)
	h.handleAction(c, raw)
	if n.hp >= hpAfterFirst {
		t.Fatal("attack after the GCD should land")
	}
}

func TestGCDIsOneSecond(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000

	started := time.Now()
	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: game.BasicAttack.ID, TargetID: n.ID})
	h.handleAction(c, raw)
	got := pe.gcdReadyAt.Sub(started)
	if got < 950*time.Millisecond || got > 1050*time.Millisecond {
		t.Fatalf("GCD = %v, want about 1s", got)
	}
}

func TestSkillCooldownAddsAfterGCD(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	cc := clientControlOf(pe)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000
	skill, ok := game.FindSkill("van_impetus_acies")
	if !ok || skill.CooldownMs != 2000 {
		t.Fatal("Line Hold should have a 2s configured cooldown")
	}
	if _, msg := h.store.UnlockSkill(c.Name, skill.ID); msg != "" {
		t.Fatal(msg)
	}
	h.refreshCombatStats(c, pe)
	pe.mp = pe.maxMP

	started := time.Now()
	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: skill.ID, TargetID: n.ID})
	h.handleAction(c, raw)
	if hp := n.hp; hp >= n.maxHP {
		t.Fatal("skill should land")
	}
	skillReady := cc.skillReadyAt[skill.ID].Sub(started)
	want := gcdDuration + time.Duration(skill.CooldownMs)*time.Millisecond
	if skillReady < want-50*time.Millisecond || skillReady > want+50*time.Millisecond {
		t.Fatalf("skill ready delay = %v, want %v", skillReady, want)
	}

	pe.gcdReadyAt = time.Now().Add(-time.Millisecond)
	hpBefore := n.hp
	drainClient(c)
	h.handleAction(c, raw)
	if n.hp != hpBefore {
		t.Fatal("skill should remain blocked by its own cooldown after the GCD")
	}
	evs := combatEvents(drainClient(c))
	if len(evs) == 0 || !strings.Contains(evs[len(evs)-1].Message, "recharging") {
		t.Fatalf("expected a recharging combat event, got %+v", evs)
	}
}

func TestPassiveReflectsDamage(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	if _, msg := h.store.UnlockSkill(c.Name, "van_ripostis"); msg != "" {
		t.Fatal(msg)
	}
	h.refreshCombatStats(c, pe)
	for seed := int64(0); ; seed++ {
		r := rand.New(rand.NewSource(seed))
		if r.Float64() < 0.15 {
			h.rng = r
			break
		}
	}

	before := n.hp
	h.applyDamage(n, pe, 20, protocol.CombatEventPayload{ActionID: "test_hit"})
	if pe.hp != pe.maxHP-20 {
		t.Fatalf("incoming hp = %d, want %d", pe.hp, pe.maxHP-20)
	}
	if n.hp != before-5 {
		t.Fatalf("reflected damage should cost attacker 5 hp, got %d", before-n.hp)
	}
	found := false
	for _, ev := range combatEvents(drainClient(c)) {
		if ev.ActionID == "reflect" && ev.Damage == 5 {
			found = true
		}
	}
	if !found {
		t.Fatal("expected a reflect combat event")
	}
}

func TestAttackComboUsesStatusVariants(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	n.hp, n.maxHP = 10000, 10000
	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: game.BasicAttack.ID, TargetID: n.ID})
	names := []string{"Attack", "Attack II", "Attack III", "Attack IV", "Attack"}

	for i, want := range names {
		drainClient(c)
		h.handleAction(c, raw)
		evs := combatEvents(drainClient(c))
		if len(evs) == 0 || evs[len(evs)-1].ActionName != want {
			t.Fatalf("combo action %d name = %q, want %q", i+1, evs[len(evs)-1].ActionName, want)
		}
		if i < 3 && game.ComboStack(pe.statuses, game.BasicAttack.Combo) != i+1 {
			t.Fatalf("combo stack = %d, want %d", game.ComboStack(pe.statuses, game.BasicAttack.Combo), i+1)
		}
		if i == 3 && game.ComboStack(pe.statuses, game.BasicAttack.Combo) != 0 {
			t.Fatal("fourth combo variant should clear its status")
		}
		pe.gcdReadyAt = time.Now().Add(-time.Millisecond)
	}
}

func TestCaptureIneligibleKeepsGCD(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)
	respawnOf(n).capturable = true

	raw, _ := json.Marshal(protocol.ActionPayload{
		ActionID: game.ActionIDCapture, TargetID: n.ID,
	})
	h.handleAction(c, raw)
	if !pe.gcdReady(time.Now()) {
		t.Fatal("capture on a healthy target must not trigger the GCD")
	}

	// Weaken the target below the capture threshold: a real attempt costs the GCD.
	n.hp = int(float64(n.maxHP)*game.CaptureHPThreshold) - 1
	h.handleAction(c, raw)
	if pe.gcdReady(time.Now()) {
		t.Fatal("an eligible capture attempt should trigger the GCD")
	}
}

func TestSkillWithoutTargetPicksNearestEnemy(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	near := hostileNPC(h, "npc-near", px+30, py)
	npcSetHome(h, near, px, py)
	far := hostileNPC(h, "npc-far", px+60, py) // in range, but not the closest
	npcSetHome(h, far, px, py)

	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: game.BasicAttack.ID})
	h.handleAction(c, raw)
	if near.hp >= near.maxHP {
		t.Fatal("a targetless attack should hit the nearest enemy")
	}
	if far.hp != far.maxHP {
		t.Fatal("a targetless attack must not hit a farther enemy")
	}
	if pe.targetID != near.ID {
		t.Fatalf("a targetless attack should focus the nearest enemy, got %q", pe.targetID)
	}
	if pe.engageID != near.ID {
		t.Fatalf("a targetless attack should record the engage target, got %q", pe.engageID)
	}
}

func TestCaptureWithoutTargetPicksNearestEnemy(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	near := hostileNPC(h, "npc-near", px+30, py) // healthy — ineligible
	npcSetHome(h, near, px, py)
	far := hostileNPC(h, "npc-far", px+60, py) // weakened, capturable
	npcSetHome(h, far, px, py)
	respawnOf(near).capturable = true
	respawnOf(far).capturable = true
	far.hp = int(float64(far.maxHP)*game.CaptureHPThreshold) - 1

	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: game.ActionIDCapture})
	h.handleAction(c, raw)
	// Capture must pick the NEAR enemy — ineligible there, so no GCD.
	if !pe.gcdReady(time.Now()) {
		t.Fatal("capture on the nearest (ineligible) enemy must not trigger the GCD")
	}
	evs := combatEvents(drainClient(c))
	if len(evs) == 0 {
		t.Fatal("expected a combat event for the capture attempt")
	}
	if got := evs[len(evs)-1].TargetID; got != near.ID {
		t.Fatalf("capture should target the nearest enemy %q, got %q", near.ID, got)
	}
}

func TestEnmityBuildsOnDamage(t *testing.T) {
	px, py := wildernessXY()
	h, c, _ := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+40, py)
	npcSetHome(h, n, px, py)

	raw, _ := json.Marshal(protocol.ActionPayload{ActionID: game.BasicAttack.ID, TargetID: n.ID})
	h.handleAction(c, raw)
	got := n.enmity[c.ID]
	if got <= enmityActionBase {
		t.Fatalf("an attack should credit base enmity + damage on the target, got %d", got)
	}
}

func TestEnmitySwitchPullsAggro(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	_, pe2 := addWorldClient(h, "client-2", "Lenna", px+30, py)
	n := hostileNPC(h, "npc-1", px+20, py)
	npcSetHome(h, n, px, py)
	h.engage(n, pe)
	if n.enmity[pe.ID] <= 0 {
		t.Fatal("engaging should seed enmity on the puller")
	}
	if n.targetID != pe.ID {
		t.Fatalf("npc should target the puller, got %q", n.targetID)
	}

	ng := npcEngageOf(n)
	// Below the switch margin: aggro stays put.
	n.enmity[pe2.ID] = int(float64(n.enmity[pe.ID]) * (enmitySwitchMargin - 0.1))
	ng.Tick(h, n, time.Now(), combatTickInterval.Seconds())
	if n.targetID != pe.ID {
		t.Fatal("a challenger below the enmity margin must not pull aggro")
	}
	// Past the margin: the NPC switches victims.
	n.enmity[pe2.ID] = int(float64(n.enmity[pe.ID])*(enmitySwitchMargin+0.2)) + 1
	ng.Tick(h, n, time.Now(), combatTickInterval.Seconds())
	if n.targetID != pe2.ID {
		t.Fatalf("higher enmity should pull aggro, still on %q", n.targetID)
	}
}

func TestAllySkillSplashesEnmity(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	_, healer := addWorldClient(h, "client-2", "Lenna", px+30, py)
	n1 := hostileNPC(h, "npc-1", px+20, py)
	n2 := hostileNPC(h, "npc-2", px+60, py)
	n3 := hostileNPC(h, "npc-3", px+assistRadius+120, py) // out of assist range — never engaged
	npcSetHome(h, n1, px, py)
	npcSetHome(h, n2, px, py)
	npcSetHome(h, n3, px, py)
	h.engage(n1, pe)
	h.engage(n2, pe)

	skill, ok := game.FindSkill("san_sanare") // Heal
	if !ok || !skill.Heals {
		t.Fatal("heal skill not found")
	}
	healer.hp = healer.maxHP / 2 // a real heal, not overheal
	h.applySkillTo(healer, healer, skill, protocol.CombatEventPayload{})

	if n1.enmity[healer.ID] <= 0 || n2.enmity[healer.ID] <= 0 {
		t.Fatalf("a heal should splash enmity on every engaged enemy: n1=%d n2=%d",
			n1.enmity[healer.ID], n2.enmity[healer.ID])
	}
	if n3.enmity[healer.ID] != 0 {
		t.Fatal("an unengaged enemy must not gain enmity from heals")
	}
}

func TestEnmityClearsOnDisengage(t *testing.T) {
	px, py := wildernessXY()
	h, _, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+20, py)
	npcSetHome(h, n, px, py)
	h.engage(n, pe)
	h.applyDamage(pe, n, 15, protocol.CombatEventPayload{})
	if n.enmity[pe.ID] <= 0 {
		t.Fatal("expected enmity on the table")
	}
	h.disengage(n, true)
	if n.enmity != nil {
		t.Fatal("disengage must drop the enmity table")
	}
}

func TestPlayerDisengageKeepsEnmity(t *testing.T) {
	px, py := wildernessXY()
	h, c, pe := testHubWithPlayer(t, px, py)
	n := hostileNPC(h, "npc-1", px+20, py)
	npcSetHome(h, n, px, py)
	h.engage(n, pe)
	h.applyDamage(pe, n, 15, protocol.CombatEventPayload{})
	if n.enmity[pe.ID] <= 0 {
		t.Fatal("expected enmity on the table")
	}
	// The player breaking off — dropping their target — must not touch the
	// mob's enmity table. Only the NPC disengaging clears it.
	raw, _ := json.Marshal(protocol.SetTargetPayload{TargetID: ""})
	h.handleSetTarget(c, raw)
	if n.enmity[pe.ID] <= 0 {
		t.Fatal("player-side disengage must not clear the npc's enmity")
	}
	if !npcEngaged(n) {
		t.Fatal("the mob should stay engaged on the player")
	}
}
