# Open-world combat migration

**Status:** Planning  
**Audience:** Engineering + design  
**Related:** [SYSTEMS.md](./SYSTEMS.md) (current combat), [ARCHITECTURE.md](./ARCHITECTURE.md), [GDD.md](./GDD.md), [PROTOCOL.md](./PROTOCOL.md)

This document describes how to convert Clara Mundi’s **instanced battle-room combat** into **open overworld combat**, while keeping **instanced content** for bosses and dungeons as temporary **sub-maps** that use the same open-combat rules (not a separate battle-scene format).

---

## 1. North star

| Default | Exception |
|---------|-----------|
| Fights happen **on the map** at world coordinates | Hard content uses a **private sub-map** |
| Player stays in **WorldView** + combat HUD overlays | Same move / attack / skills / pets as open world |
| Soft **combat session** (membership, aggro, rewards) | Entry via portal / quest / item → transfer/attach |

**Principle:** An “instance” is a temporary overworld-like space, not a frozen arena with a different protocol and UI. Today’s realtime battle `Room` already models isolated sessions; open combat lifts that kernel onto map XY. Boss/dungeon instances reuse zone-travel (`Transfer` / `Attach`) into a private map that still runs that same kernel.

### Non-goals (v1)

- Full open-world PvP
- Porting ATB **rooms** into open geometry (action windows + frozen actors)
- Keeping `screen: "battle"` + `BattleView` arena for trash/elite fights
- Cross-map combat sessions (combat stays map-node-local, as today)

---

## 2. Current architecture (baseline)

Combat is **per-map-node, plugin-selected, room-instanced**.

| Concern | Today |
|---------|--------|
| Plugin | One of `combat.realtime` or `combat.atb` / `combat.ordo` per map JSON |
| Start | NPC collide / walk-into fighting party → `StartFromNPC` → `EnterBattle` |
| Lock | `WorldPlayer.InBattle` + `BattleID`; overworld `move` / equip / jobs rejected |
| NPC | Marked in battle and **despawned** until fight ends, then delayed respawn |
| Client | `screen: "battle"`; `GameRenderer` swaps **WorldView → BattleView** (fixed ~720×480 arena) |
| Protocol | Shared join/leave/invite; ATB `battle_*` vs realtime `rt_*` families |
| End | `battle_end` / `rt_battle_end` → grace → `FinishBattle` → `battle_return` + ~5s `immune_until` |
| Cap | Hub rooms, typically **4** players |
| Pets | Follow hidden while `in_battle`; battle ally exists only as room `is_ally` entity |

### Key code (reference)

| Area | Paths |
|------|--------|
| Hub combat host | `internal/server/hub_combat_host.go`, `hub.go` (`FinishBattle`, immunity) |
| Engagement | `internal/server/npc.go`, `social.go` (`engagePartyMemberAt`) |
| Realtime room | `internal/plugins/combatrealtime/` (`Room` tick, attack, arena move) |
| ATB room | `internal/plugins/combatatb/` |
| Contracts | `internal/plugins/contracts/combat.go` |
| Client plugins | `wails/frontend/src/plugins/combat-realtime/`, `combat-atb/` |
| 3D views | `wails/frontend/src/three/WorldView.ts`, `BattleView.ts`, `GameRenderer.ts` |

### What already resembles the target instance model

- **Realtime `Room`:** own ID, goroutine tick, Join/Leave, entity list, end → unlock overworld.
- **Housing `houseRoom`:** private space + flags without a combat arena (pattern only).
- **Map transfer / Attach:** cluster already moves a session to another map with spawn pose/facing.

---

## 3. Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Public overworld map node                                  │
│  • Players + NPCs at map XY                                 │
│  • Soft CombatSession (aggro / interact)                    │
│  • Same move + combat actions                               │
│  • WorldView + overlay HUD                                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ portal / quest / item
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Private sub-map (instance)                                 │
│  • Party-scoped occupancy                                   │
│  • Same combat kernel + HUD                                 │
│  • Scripted spawns / phases / exit locks                    │
│  • TTL: empty / wipe / clear → transfer home                │
└─────────────────────────────────────────────────────────────┘
```

### Soft combat session (open world)

A session is **membership + rules**, not a place:

- Members: players, NPCs, pets tagged into the fight
- Positions: **map coordinates** (same as overworld movement)
- Tick: damage, AI, statuses, GCD/cast (realtime-derived)
- End: wipe, leash reset, last hostile dead, sanctuary, flee/de-aggro
- Does **not** set a hard world-move freeze (see flags below)

### Flags (conceptual)

| Flag | Meaning |
|------|---------|
| `InCombat` | Participating in a soft session; **can still move** on the map |
| `Hostile` (NPC) | Aggroable / currently fighting; **remains visible** on the map |
| `ImmuneUntil` | Short post-combat / post-transfer grace (keep) |
| Instance occupancy | Separate from combat; “you are on private map X” |

Deprecate (for open fights) binary **`InBattle` world freeze** and NPC **despawn-into-room**.

### Instanced sub-map

Same combat kernel as open world. Differences are **space and lifecycle**:

| Same | Different |
|------|-----------|
| Move / attack / skills | Private map occupancy (party-scoped) |
| Sessions & aggro | Entry/exit portals and optional locks |
| HUD / hotbar / pets | Scripted spawns and boss phases |
| Rewards pipeline | Destroy on empty / wipe / timer |

Implementation sketch: ephemeral `mapID` (or private overworld slice on the same node) + existing `Transfer`/`Attach` with spawn; collision/terrain shared or copied; instance registry with TTL.

---

## 4. Complexities

Effort key: **S** = days · **M** = ~1–2 weeks · **L** = ~2–4 weeks · **XL** = 1–2+ months (per area, 1 engineer familiar with the stack).

| Area | Why it hurts | Impact | Effort |
|------|----------------|--------|--------|
| World lock / `InBattle` | Fighters freeze; Hub rejects move/equip/jobs; client leaves WorldView | Critical | L |
| NPC despawn into rooms | Fight empties tiles; no shared world presence | Critical | L |
| Dual plugins + protocols | `battle_*` vs `rt_*`; one plugin per map | High | XL |
| Battle screen / `BattleView` | Fixed arena + battle HUD assume a separate scene | High | M |
| Aggro, leash, multi-pull AI | Threat, reset, fair multi-player pulls | High | XL |
| Net sync & cheat surface | Authoritative hits while free movement | High | L |
| Pets follow vs battle ally | Follow hidden in battle; ally only in room | Medium | M |
| Sanctuary / immune / camp / house | Rules assume enter/exit instance | Medium | M |
| Rewards & nearby XP | Tied to room membership, not open contribution | Medium | M |
| Instanced sub-maps | Private OW slices + lifecycle cost | High | L |

### Coupling that blocks open combat today

1. Binary `in_battle` world freeze  
2. NPC despawn into rooms  
3. Screen/mode swap (WorldView off, BattleView on)  
4. Dual protocol + per-map plugin as “arena type”  
5. Room-centric lifecycle (`EnterBattle` / `FinishBattle` / `battle_return`)  
6. Join UX assumes frozen anchors (collide locked players / battle-tagged NPCs)  
7. Pets split follow vs battle entity  

---

## 5. What to reuse vs replace

| Asset | Reuse as | Notes |
|-------|----------|--------|
| Realtime `Room` tick / Attack | **Open combat kernel** | Lift off arena bounds onto map coords + range/LOS |
| Hub Enter / Finish / rewards | Session lifecycle | Rename conceptually: battle room → combat session |
| Party invite / `join_battle` | Session membership | Prefer proximity / assist tag over freeze-collide |
| `BattlePetID` | In-world ally | Merge with follow; assist while hostile |
| Zone transfer / Attach | Instance entry/exit | Ephemeral map ID or private OW slice |
| Housing `houseRoom` | Pattern only | Private space + flags, not combat geometry |
| ATB `BattleRoom` | Optional **pacing** only | Cast times / GCD / stamina — not open-world geometry |
| `BattleView` arena | Remove for normal fights | Keep only if needed as debug staging, then delete |

### ATB decision

**Do not port ATB rooms into open world as-is.** ATB assumes frozen actors and action windows. For open maps, prefer realtime movement + skills. If a zone wants a slower tactical feel, express it as **cast times / GCD / stamina**, not a separate battle scene. Per-map config becomes **pacing presets**, not arena types.

---

## 6. Effort legend & calendar

| Size | Calendar | Typical work |
|------|----------|--------------|
| S | Days | Docs, flags, thin wiring |
| M | ~1–2 weeks | Client overlays, pet merge, zone rules |
| L | ~2–4 weeks | Lifecycle rewrite, sub-map instances |
| XL | 1–2+ months | AI/aggro, net authority, full action loop |

**Roll-up (phases 0–6):** roughly **~12–20 engineer-weeks** with 1–2 people who know Hub + client. Parallelize client HUD with server session work after Phase 1. Calendar stretches if ATB must remain fully supported in parallel.

---

## 7. Migration phases

Each phase has a **goal**, **effort**, and **exit criteria**. Do not start the next phase until exits are met (or explicitly waived).

### Phase 0 — Decide & freeze scope

| | |
|--|--|
| **Effort** | S · 0.5–1 week |
| **Goal** | Lock product/tech principles before large refactors |

**Exit criteria**

- [ ] Written combat principles: open map default; instance = sub-map  
- [ ] Explicit keep list: party invite, rewards hooks, pets, immunity, sanctuary  
- [ ] Explicit non-goals for v1 (no full PvP; no ATB open-world rooms)  
- [ ] Decision: realtime is the open-combat kernel  

**Deliverables:** this doc accepted; short GDD note; spike map ID chosen for Phase 2–3.

---

### Phase 1 — Unified combat entity model

| | |
|--|--|
| **Effort** | L · 2–3 weeks |
| **Goal** | One entity representation for combatants on map coordinates |

**Work**

- Introduce a shared combatant view (player / NPC / pet): `id`, `kind`, `x`, `y`, `facing`, `hp`/`mp`, statuses, team  
- Stop despawning NPCs on engage; mark `Hostile` / session membership instead  
- Client `WorldView`: render fighting NPCs with HP/status (not ghosts-only players)

**Exit criteria**

- [ ] Server can list combatants at map XY without requiring an arena entity list alone  
- [ ] Engaged NPC remains visible and positionally coherent on the overworld  
- [ ] Client shows hostile NPC + basic vitals in WorldView  

**Risks:** dual representations (world NPC vs room entity) drifting — prefer one source of truth early.

---

### Phase 2 — Soft combat sessions (no screen swap)

| | |
|--|--|
| **Effort** | L · 2–4 weeks |
| **Goal** | Engage starts a session without world freeze or BattleView |

**Work**

- Replace hard `InBattle` freeze with `InCombat` that **allows map movement**  
- Run combat tick against **world positions** (reuse realtime Room tick internals)  
- Combat HUD as **WorldView overlays** (target, vitals, cast bars) — keep React hotbar  
- Replace `battle_return` screen bounce with session end + short immunity  
- Gate Hub restrictions: still block camping/house enter mid-combat if desired; **do not** block movement

**Exit criteria**

- [ ] Sandbox map: start fight, camera stays on WorldView  
- [ ] Player can walk while fighting (even if AI/combat is still stubby)  
- [ ] Session end returns to peaceful overworld without `screen: "battle"`  

**Spike (recommended, ~1 week before full Phase 2):** disable freeze + BattleView for realtime on one map; keep NPC visible; Room tick uses world XY with short melee range.

---

### Phase 3 — Open-world action loop

| | |
|--|--|
| **Effort** | XL · 3–5 weeks |
| **Goal** | Authoritative move + attack + skills on the overworld |

**Work**

- Map-coord `move` / `attack` / skill intents with **range, facing, rate limits, optional LOS**  
- Aggro radius, leash, de-aggro, HP reset on leash, respawn timers  
- Multi-player: session join by proximity / assist / party, not only freeze-collide  
- Pet: follow remains; assist while session hostile  
- Sanctuary: hard stop aggro / drop combat on enter  

**Exit criteria**

- [ ] Player can kill a world NPC without entering an arena  
- [ ] Leash works; sanctuary safe  
- [ ] Second player can join mid-fight via party or proximity rules  
- [ ] Basic anti-cheat: reject out-of-range hits server-side  

**Risks:** kiting across the zone; trains; desync. Mitigations: leash, elite tags, membership caps, interest management later (Phase 6).

---

### Phase 4 — Protocol & plugin consolidation

| | |
|--|--|
| **Effort** | L · 2–3 weeks |
| **Goal** | One combat message family for open world; retire arena-only paths |

**Work**

- Prefer evolving **realtime** messages (or a renamed `combat_*` family) for open maps  
- Drop `screen: "battle"` requirement for normal fights  
- ATB: remove from open maps **or** reduce to pacing-only (no room)  
- Map config: e.g. `combat_mode: open | instance_only` (+ pacing preset)  
- Update client plugins / `welcome.map` combat module advertising  

**Exit criteria**

- [ ] Open maps no longer depend on `battle_state` / arena `rt_move` in local arena space  
- [ ] Docs: PROTOCOL + SYSTEMS list the open-combat messages  
- [ ] ATB path either deleted for OW or clearly “pacing only”  

---

### Phase 5 — Instanced sub-maps (boss / dungeon)

| | |
|--|--|
| **Effort** | L · 2–4 weeks |
| **Goal** | Hard content as temporary private maps with the **same** open-combat rules |

**Work**

- Instance registry: create / attach party / destroy on empty|wipe|clear|TTL  
- Entry: portal, item, quest → `Transfer`/`Attach` like zone travel  
- Optional locked exits until objective complete  
- Scripted spawns / boss phases as **map content**, not a different combat plugin  
- Return spawn: parent map checkpoint / portal tile  

**Exit criteria**

- [ ] Party enters private map, fights with WorldView + same actions  
- [ ] Clear/wipe returns party to parent map  
- [ ] Empty instance destroyed; no orphan nodes  

**Cost note:** Prefer ephemeral maps sharing static collision data; idle TTL; cap concurrent instances per cluster.

---

### Phase 6 — Polish, balance, cleanup

| | |
|--|--|
| **Effort** | M · 2–3 weeks |
| **Goal** | Remove dead arena paths; tune; document |

**Work**

- Delete unused `BattleView` arena path for normal combat  
- Update GDD, SYSTEMS, ARCHITECTURE, PROTOCOL  
- Perf: tick culling, AOI / interest management for dense mobs  
- UX: target assist, soft lock, death/release flow  

**Exit criteria**

- [ ] No production path requires battle screen for open maps  
- [ ] Docs match code  
- [ ] Acceptable CPU on a busy sandbox map under load test  

---

## 8. Flows

### Open fight

1. Player enters aggro (or interacts / is assisted into a session).  
2. Soft session tags player + NPC (+ pet).  
3. Both remain on WorldView; moves and attacks validated on map XY.  
4. NPC dies, leashes, or sanctuary breaks the session.  
5. Loot / XP / contribution; short immunity.  

### Instanced boss / dungeon

1. Party interacts with portal (or quest gate).  
2. Attach to private map (same open-combat rules).  
3. Clear or wipe.  
4. Transfer back to parent map at exit/checkpoint.  
5. Destroy empty instance.  

---

## 9. Risk register

| Risk | Mitigation |
|------|------------|
| Players kite mobs across the whole zone | Leash distance; reset HP on leash; sanctuary hard-stop |
| Train / multi-pull chaos | Session membership caps; soft aggro links; elite tags |
| Cheat move+hit desync | Server-side range/rate limits; later AOI |
| ATB fans lose identity | Zone pacing presets; cast/GCD — not arenas |
| Instance cost (many private maps) | Ephemeral maps; idle TTL; share static collision |
| Dual systems forever | Hard cutover on sandbox → greenwood-like maps; delete arena paths in Phase 6 |

---

## 10. Suggested first spike (≈1 week)

On **one sandbox map** configured with `combat.realtime`:

1. Disable `InBattle` movement freeze and BattleView swap for that map.  
2. Keep NPC **visible** on engage (no despawn).  
3. Run Room tick using **world XY** with a short melee range.  
4. Prove: damage + HUD overlay without screen swap.  

**Success:** designers can walk around while “in combat” and see hits land.  
**Failure modes to note:** desync, missing target UI, Hub still blocking move — fix before Phase 3 AI investment.

---

## 11. Config sketch (future)

Illustrative only — final schema TBD in Phase 0/4:

```json
{
  "plugins": {
    "combat": "combat.realtime"
  },
  "combat": {
    "mode": "open",
    "pacing": "standard",
    "aggroRadius": 120,
    "leashRadius": 400,
    "maxSessionPlayers": 4
  },
  "instances": {
    "enabled": true,
    "templates": ["boss_greenwood_alpha"]
  }
}
```

`mode: "instance_only"` would mean the public map has no open pulls (town hub); combat only inside sub-maps.

---

## 12. Doc & code ownership

| When | Update |
|------|--------|
| Phase 0 accept | Link from GDD “combat feel” |
| Phase 2–3 | SYSTEMS.md combat section rewrite |
| Phase 4 | PROTOCOL.md combat message catalog |
| Phase 5 | ARCHITECTURE.md instance registry |
| Phase 6 | Remove stale BattleScene / arena references in docs |

---

## 13. Summary

Open combat is a **lifecycle and coordinate-space change**, not a new game genre: keep Hub sessions, party, pets, and rewards; stop freezing the world and swapping to an arena; use **sub-maps** when content needs privacy and scripting. Realtime `Room` is the kernel; ATB survives only as pacing if at all. Execute in phases with hard exit criteria; validate with a one-week WorldView spike before investing in full aggro AI and instance infrastructure.
