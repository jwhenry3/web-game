# 3D terrain & physics migration

**Status:** Planning  
**Audience:** Engineering + design + tools  
**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md), [SYSTEMS.md](./SYSTEMS.md), [OPEN_WORLD_COMBAT.md](./OPEN_WORLD_COMBAT.md), [data/maps/README.md](../data/maps/README.md), [GAME_DESIGNER.md](./GAME_DESIGNER.md)

This document plans moving Clara Mundi from **2D tile collision** (server-authoritative grid + axis slide) to **3D terrain with a shared collision/physics model**, synchronized between **server and client**.

It is complementary to open-world combat: combat eventually runs on the same floor queries and movement step this migration introduces.

---

## 1. North star

| Today | Target |
|-------|--------|
| Map `(X, Y)` pixels on a tile grid | World `(X, Y, Z)` with **Y-up** height (or explicit contract — see §3) |
| Collision = GID layer / cell string | Collision = **heightfield and/or mesh colliders** (+ optional static props) |
| `SlideMovePlayer` (axis slide) | **Physics / kinematic character** step (capsule + floor cast) |
| Client Three plane at height `0` | Client terrain **matches** server collision geometry |
| Go `StepMove` mirrors 2D slide | Predictor uses the **same** step API as the Hub |

**Principle:** The map node remains the authoritative simulation. The client predicts with an identical (or byte-compatible) movement step. Visual terrain is no longer a flat placeholder divorced from walkability.

### Non-goals (v1)

- Full rigid-body ragdoll / destructible worlds  
- Client-authoritative movement  
- Rewriting the proxy/mapnode sharding model  
- Converting **housing** to full 3D in the first cut (may stay 2D island longer)  
- Requiring every map to ship unique sculpted meshes on day one (heightfields derived from data are OK)

---

## 2. Current architecture (baseline)

### 2.1 Process & authority

```text
Client (Three + optional Wails StepMove)
   │  move intents (x, y [, facing])
   ▼
Proxy → Map node Hub
   │  clampMove → Overworld.SlideMovePlayer
   ▼
Broadcast player_moved / world_state
```

- **One overworld + collision grid per map node** (`internal/mapnode`, `internal/game.Overworld`).
- Transfers: `DestMap` + `DestX`/`DestY` (+ facing). No height on the wire today.
- Prediction: Wails `StepMove` → `internal/clientnet.Predictor` → **same** Go `SlideMovePlayer` as the server; TS fallback in `world/overworld.ts`.

### 2.2 Coordinate systems

| Layer | Convention |
|-------|------------|
| Server / protocol | 2D pixels `(X, Y)` on tile grid (`tile_size`, typically 32) |
| Three.js | Map → `(x, height=0, z=y)` Y-up — **display only** (`wails/frontend/src/three/coords.ts`) |
| Facing | Yaw radians around vertical (already 3D-oriented on the wire) |

### 2.3 Collision model

1. Authoritative **collision layer** GIDs in `.map.json` / overrides.  
2. Composed into **cell chars** (`WalkableTile`: walkable vs blocked).  
3. Player **foot-anchored AABB** (`PlayerCollisionHalfW/H`).  
4. **Slide:** full step → X-only → Y-only; max step capped.  

Key packages: `internal/game/world.go`, `overworld.go`, `tiled_load.go`, Hub `handleMove` / `clampMove`.

### 2.4 Client presentation

| Piece | Path / behavior |
|-------|-----------------|
| Terrain | `createTerrainMesh` — flat `PlaneGeometry` from cell string (“placeholder until real terrain”) |
| Movement | `WorldView.moveSelf` → `applyPlayerSlide` → `net.move` |
| Bridge | `world/movementBridge.ts` → Wails or TS |
| Props | GLBs in `public/models/` — **decoration only**, not colliders |

### 2.5 Everything else that assumes tiles

| System | Dependency |
|--------|------------|
| NPC pathfinding | A* on tiles (`pathfindWith`), wander excludes sanctuaries |
| Zone exits | Tile rectangles → pixel dest `(x,y)` |
| Save / job POIs | Tile centers + pixel interact range |
| Regions / sanctuaries | Tile / polygon footprints |
| House | Separate 2D walkable island (`housing.go`) |
| Editor / genworld | Paint collision GIDs / walls |

### 2.6 What does **not** exist yet

- Server height / Z  
- Heightmaps, navmeshes, gravity, slopes  
- Physics engine on server or client  
- Mesh colliders synced to authority  
- `DestZ` / grounded flags on transfer  

---

## 3. Target architecture

### 3.1 Recommended coordinate contract

Adopt **one** canonical mapping and document it everywhere:

| Name | Meaning |
|------|---------|
| **Map X** | East (+), same as today’s server X |
| **Map Z** | South (+), same as today’s server Y (Three `z`) |
| **Map Y** | Up (+), height above reference sea/floor |

Wire/protocol may use `x`, `y`, `z` with **`y` = height** (Three-native) **or** keep `x`/`y` as horizontal and add `z` as height. **Pick in Phase 0 and never waffle.**

Recommendation for least client churn: **protocol `x`, `z` horizontal (old x/y), `y` height** matching Three, with a short compatibility shim that treats missing `y` as `0` / sampled floor.

### 3.2 Simulation stack

```text
┌──────────────────────────────────────────────────────────┐
│ Map node (authoritative)                                 │
│  Terrain asset(s): heightfield and/or collision meshes   │
│  Physics / character controller step                     │
│  NPC nav (navmesh or heightfield A*)                     │
│  Hub: validate move Δ, rate limit, broadcast pose        │
└──────────────────────────▲───────────────────────────────┘
                           │ same step API
┌──────────────────────────┴───────────────────────────────┐
│ Client predictor (Go via Wails and/or WASM/native)       │
│  Optimistic step → reconcile on server pose              │
└──────────────────────────▲───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│ Three.js: visual terrain + debug colliders               │
│  Must be generated from the SAME source as server        │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Terrain representation (phased)

| Stage | Server | Client visual | Notes |
|-------|--------|---------------|-------|
| **A. Heightfield** | Grid of heights (e.g. one sample per tile or denser) | Displaced plane / terrain mesh from same heights | Fast path from existing maps |
| **B. Static meshes** | Triangle mesh / compound colliders for cliffs, buildings | Same GLB or derived collision mesh | Authored or exported from art |
| **C. Hybrid** | Heightfield ground + mesh props | Matching | Production target |

v1 can ship **A** for all stock maps (heights default `0` = today’s flat world) while tooling grows toward **B/C**.

### 3.4 Character controller

Replace axis-slide with a **kinematic capsule** (or cylinder):

- Floor cast / snap-to-ground  
- Max slope angle  
- Step-up height  
- Horizontal velocity from input (camera-relative already on client)  
- Optional gravity when not grounded (gaps, bridges later)

Server and predictor call the **same** `StepCharacter(in) → out` in `internal/game` (or a dedicated `internal/physics` package).

### 3.5 Synchronization model

| Channel | Content |
|---------|---------|
| Intent | Client sends desired move (axes or target velocity) + facing + timestamp/seq |
| Authority | Server steps simulation, clamps speed/Δ, returns or broadcasts pose `(x,y,z)`, facing, grounded |
| Prediction | Client steps locally; on `player_moved` / snapshot, reconcile (snap or smooth if error &lt; ε) |
| Assets | Both sides load terrain by **map ID + content hash** (reject drift) |

Do **not** stream full physics state every frame for all entities early on — pose + grounded + velocity optional is enough for an MMO-like feel.

---

## 4. Complexities

Effort: **S** days · **M** ~1–2 weeks · **L** ~2–4 weeks · **XL** 1–2+ months.

| Area | Why it hurts | Impact | Effort |
|------|----------------|--------|--------|
| Dual slide implementations | Go server, Go predictor, TS overworld, TS house all assume tiles | Critical | L |
| Protocol & persistence 2D | `MovePayload`, profiles `WorldX/Y`, transfers without height | Critical | M |
| Tile consumers | Exits, save points, A*, regions, editor validation | Critical | XL |
| Terrain source of truth | Visual plane ≠ collision; GLBs decorative | Critical | L |
| Physics engine choice | Go vs CGO vs WASM; determinism; Wails packaging | High | L |
| NPC navigation | Tile A* → navmesh / heightfield pathing | High | XL |
| Prediction/reconcile | Async Wails IPC + continuous step needs new model | High | L |
| Content pipeline | 18 maps + overrides + Game Designer collision paint | High | XL |
| Combat coupling | Engage ranges, open-combat sessions assume flat XY | High | M–L |
| Housing | Separate 2D island; can lag or convert later | Medium | M |
| Perf | Broadphase, sleep, AOI for physics queries | Medium | L |

### Coupling that blocks 3D physics

1. **`WalkableTile` / cell string / collision GID** is the single walkability source for players, NPCs, exits, resume, tools.  
2. **Duplicated slide logic** across languages.  
3. **Protocol & profiles** are 2D.  
4. **Client terrain is not geometry.**  
5. **Pathfinding / exits / sanctuaries** are tile-index based.  
6. **Editor & genworld** write 2D layers only.  
7. **Cheap pure `SlideMovePlayer`** ≠ continuous physics step.  
8. **Foot AABB** does not equal capsule-on-mesh without a new contract.

---

## 5. Engine & tech options

Decide in Phase 0. Options are illustrative; pick based on packaging and determinism needs.

| Option | Pros | Cons |
|--------|------|------|
| **Heightfield-only custom** (Go) | No native deps; easy to share with TS/WASM port; enough for gentle terrain | Cliffs/overhangs need meshes later |
| **Rapier** (WASM client + `rapier-go` / FFI server) | Real colliders, active community | Dual runtime; version skew risk |
| **Jolt / Bullet via CGO** | Proven character controllers | Harder Wails/cross-compile; ops cost |
| **Unity/Unreal server** | — | Out of scope (wrong stack) |

**Recommendation:**  

1. **v1:** Custom **heightfield + capsule** in pure Go (`internal/physics`), with a **TS or WASM twin** generated/tested against golden vectors.  
2. **v2:** Add **static mesh colliders** (glTF collision nodes or `.col.bin`) loaded by both sides; optionally adopt Rapier if mesh contact becomes painful.

Matching client/server means **same inputs → same outputs** within float tolerance on golden tests — not “looks close.”

---

## 6. What to reuse

| Keep | Evolve | Replace |
|------|--------|---------|
| Map IDs, `.server.json`, cluster registry | Pose wire format (`y` height) | Flat `createTerrainMesh` as authority |
| Proxy transfer/attach flow | Exit/save as horizontal footprints + floor sample | `SlideMovePlayer` as final movement |
| Hub authority + rate limits | Prediction = shared `StepCharacter` | Cell-string as only collision |
| Region polygons / sanctuaries (2D footprints) | Overrides → height patches / mesh refs | Tile A* for complex 3D (eventually) |
| Facing yaw | Combat ranges use 3D or XZ distance | — |
| Open-combat session idea | Floor queries for grounded checks | — |

---

## 7. Effort legend & calendar

| Size | Calendar | Typical work |
|------|----------|--------------|
| S | Days | Contracts, shims, docs |
| M | ~1–2 weeks | Protocol, flat heightfield=0 parity |
| L | ~2–4 weeks | Character step, predictor, visual bind |
| XL | 1–2+ months | Navmesh, content pipeline, mesh colliders |

**Roll-up (phases 0–7):** roughly **~16–28 engineer-weeks** for heightfield parity + tooling + one authored uneven map, assuming 1–2 engineers. Mesh-heavy art pipeline and full NPC navmesh push toward the high end.

---

## 8. Migration phases

### Phase 0 — Contract & engine choice

| | |
|--|--|
| **Effort** | S · 0.5–1 week |
| **Goal** | Lock coordinates, non-goals, engine approach |

**Exit criteria**

- [ ] Documented axis mapping (X/Z horizontal, Y up) and wire field names  
- [ ] Engine decision: heightfield-Go v1 vs Rapier/etc.  
- [ ] Explicit: housing deferred; maps may start with height=0  
- [ ] Golden-test strategy agreed (shared fixtures)  

---

### Phase 1 — Pose protocol & persistence (backward compatible)

| | |
|--|--|
| **Effort** | M · 1–2 weeks |
| **Goal** | Carry height on the wire without breaking flat maps |

**Work**

- Extend `MovePayload`, `WorldPlayer`, `PlayerMoved`, transfers, profiles with optional height (`y` or `z` per contract)  
- Server: if missing, sample floor (heightfield default 0)  
- Client Three: place characters at received height  
- Proto regen / JSON omitempty rules (0 is valid — avoid silent drop)  

**Exit criteria**

- [ ] Flat maps unchanged in gameplay  
- [ ] Client renders server height when present  
- [ ] Old clients or missing fields still join flat maps  

---

### Phase 2 — Heightfield asset + server floor query

| | |
|--|--|
| **Effort** | L · 2–3 weeks |
| **Goal** | Per-map heightfield co-located with map node |

**Work**

- Format: e.g. `data/maps/{id}.height.bin` / `.height.json` (cols, rows, cell size, float32 samples) or embed in `.map.json`  
- Loader beside `LoadOverworldData`; content hash in map snapshot  
- API: `SampleFloor(x, z) → y`, `ClampToFloor(pose)`  
- Default generator: all zeros from existing `cols/rows/tile_size` (bit-identical flat world)  

**Exit criteria**

- [ ] Every stock map loads a heightfield (zeros OK)  
- [ ] Hub can snap spawn/resume to floor  
- [ ] Reload story works (`ReloadOverworld`)  

---

### Phase 3 — Shared character step (parity with slide)

| | |
|--|--|
| **Effort** | L · 2–4 weeks |
| **Goal** | Replace slide with capsule step that **matches** flat-world behavior |

**Work**

- Implement `StepCharacter` on heightfield (horizontal move + floor snap)  
- On flat zero field, golden tests ≈ old `SlideMovePlayer` within ε  
- Hub `handleMove` uses step; keep max-speed / max-Δ anti-cheat  
- Deprecate TS duplicate slide for world (call shared API via Wails or port)  

**Exit criteria**

- [ ] Flat maps: players cannot walk through old walls (collision layer still enforced — see below)  
- [ ] Predictor uses same step  
- [ ] Golden vector suite in CI  

**Collision during transition:** Until meshes exist, keep **2D collision GID** as a horizontal blocker mask on the heightfield (cylinder vs blocked tiles). That preserves exits/walls while height varies.

---

### Phase 4 — Client visual terrain bound to heightfield

| | |
|--|--|
| **Effort** | M–L · 2–3 weeks |
| **Goal** | What you see is what you collide with (ground) |

**Work**

- Replace flat `createTerrainMesh` with mesh built from the **same** height samples the server loads  
- Optional debug draw: collision mask, capsule  
- Nature props: still decorative **or** begin registering simple cylinder blockers for large trunks (optional)  

**Exit criteria**

- [ ] Uneven sandbox map: character sticks to visible ground  
- [ ] No systematic hover/sink vs server pose beyond reconcile ε  

---

### Phase 5 — Prediction & reconcile hardening

| | |
|--|--|
| **Effort** | L · 2–3 weeks |
| **Goal** | Smooth client motion under latency |

**Work**

- Sequence numbers / client tick on move intents  
- Server ACK or broadcast with authoritative pose  
- Reconcile: rewind-resim or blend if error small; hard snap if large  
- Reduce reliance on async IPC lag (batch steps; or WASM in-process predictor)  

**Exit criteria**

- [ ] Acceptable feel at 50–100 ms RTT on sandbox  
- [ ] Documented cheat limits (max speed, max vertical delta)  

---

### Phase 6 — NPC navigation & world systems on 3D floor

| | |
|--|--|
| **Effort** | XL · 3–6 weeks |
| **Goal** | NPCs, exits, saves, engage ranges work on heightfield |

**Work**

- Short term: pathfind on **2D walkable mask**, set NPC Y from `SampleFloor`  
- Medium: navmesh bake from heightfield + collision mask  
- Exits/saves: keep tile footprints; spawn Y from floor sample  
- Engage / open combat: distance in XZ (or 3D) documented  
- Sanctuary footprints unchanged as 2D polygons  

**Exit criteria**

- [ ] Patrol NPCs stay on mesh and respect sanctuaries  
- [ ] Transfers land on floor at dest  
- [ ] No soft-lock in geometry cracks (kill-plane / unstuck)  

---

### Phase 7 — Content pipeline, meshes, cleanup

| | |
|--|--|
| **Effort** | XL · ongoing after vertical slice |
| **Goal** | Authoring path for real terrain; retire pure tile authority |

**Work**

- Game Designer / external DCC: export heightfield and/or collision GLB  
- Overrides: height patches + mesh refs (not only GID paint)  
- Static mesh colliders for cliffs/buildings (server + client)  
- Remove cell-string as authority once mask+height+meshes cover maps  
- Docs: ARCHITECTURE, maps README, PROTOCOL  
- Perf: spatial hash, sleep, AOI  

**Exit criteria**

- [ ] At least one production map with non-trivial relief  
- [ ] Pipeline documented for artists  
- [ ] Flat GID-only path deprecated or limited to legacy  

---

## 9. Interaction with open-world combat

| Concern | Guidance |
|---------|----------|
| Order | Physics **floor query** should land before or with open-combat Phase 3 (action loop on map XY) |
| Distances | Define engage/leash in **XZ** first; optional 3D later |
| Instances | Sub-maps load their own heightfield/colliders like any map node |
| Vertical combat | Out of scope until grounded movement is solid |

See [OPEN_WORLD_COMBAT.md](./OPEN_WORLD_COMBAT.md).

---

## 10. Risk register

| Risk | Mitigation |
|------|------------|
| Client/server geometry drift | Content hash in map snapshot; refuse move if mismatch |
| Float non-determinism | Golden tests with ε; fixed timestep; avoid dual engines early |
| Players stuck in mesh | Unstuck command; kill plane; careful step-up limits |
| IPC prediction lag (Wails) | In-process WASM/Go step; reduce chatty `StepMove` |
| 18 maps block art | Zero heightfields first; one showcase map for relief |
| Editor gap | Keep GID mask for walls while height tools catch up |
| Scope creep (full Rapier) | Stick to heightfield+capsule until forced by overhangs |

---

## 11. Suggested first spike (≈1–1.5 weeks)

1. Add all-zero heightfield for one sandbox map.  
2. Implement `SampleFloor` + capsule snap in Go.  
3. Hub writes height on `player_moved`.  
4. Client places avatar on sampled/`y` height; still use **2D collision mask** for walls.  
5. Build Three terrain mesh from the same zeros (prove pipeline).  
6. Optional: second map with a gentle ramp heightfield — walk up/down without tunneling.  

**Success:** Protocol + visual bind + server floor sample work end-to-end.  
**Failure to watch:** hover/sink, predictor fighting Hub, missing height on transfer.

---

## 12. Config / artifact sketch (future)

```text
data/maps/{id}.map.json          # logical entities, regions, exits (keep)
data/maps/{id}.height.bin        # float32 heights + header (cols, rows, scale)
data/maps/{id}.collision.glb     # optional static colliders (v2)
data/maps/{id}.server.json       # physics: stepHz, maxSlope, capsuleRadius, asset hashes
```

Map snapshot / `welcome` should advertise **terrain content hash** so client and server refuse desynced assets.

---

## 13. Doc & code ownership

| When | Update |
|------|--------|
| Phase 0 | This doc accepted; axis contract in ARCHITECTURE |
| Phase 1 | PROTOCOL.md pose fields |
| Phase 2–4 | data/maps/README.md artifact list |
| Phase 6 | SYSTEMS.md movement / NPC section |
| Phase 7 | GAME_DESIGNER.md height/collision authoring |

Primary code ownership (expected):

| Package | Role |
|---------|------|
| `internal/physics` or `internal/game/physics` | Heightfield, step, fixtures |
| `internal/game` loaders | Map assets |
| `internal/server` Hub | Authoritative step + broadcast |
| `internal/clientnet` | Predictor bound to same step |
| `wails/frontend/src/three` | Visual terrain + reconcile |
| `wails/frontend/src/world` | Bridge; delete duplicate slide when ready |

---

## 14. Summary

The stack is already **per-map authoritative simulation + client prediction + proxy transfers**. Moving to 3D is not a cluster rewrite — it is replacing **tile GID + axis slide** with a **shared terrain + character step**, and making the **Three terrain** a projection of that same data.

Ship **heightfield zeros** for parity, prove **one ramp**, bind **visuals to samples**, harden **prediction**, then grow **nav** and **mesh colliders** through the content pipeline. Keep map IDs, transfers, and Hub authority; extend pose with height; defer housing and full art-driven meshes until the vertical slice is green.
