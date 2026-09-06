# Architecture & infrastructure

This document describes how the multiplayer stack is wired: process model, map registry, networking, and how pieces talk to each other.

For gameplay rules see [SYSTEMS.md](./SYSTEMS.md). For the in-app editor see [GAME_DESIGNER.md](./GAME_DESIGNER.md). Map file formats live in [data/maps/README.md](../data/maps/README.md). Planned 3D terrain/physics migration: [MAPS_3D_PHYSICS.md](./MAPS_3D_PHYSICS.md).

## Overview

```text
Wails desktop client (wails/frontend)
   │  HTTPS/WS  (/api, /ws)
   ▼
Proxy  (:8080)     internal/proxy
   │  auth, sessions, admin APIs
   │  one WebSocket per client; no reconnect on map change
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
Map node       Map node       Map node     internal/mapnode
(greenwood)    (frostkeep)    (tidecourt, …)
   │              │              │
   Hub            Hub            Hub         internal/server
   Overworld      Overworld      Overworld   internal/game
   Combat plugin  Combat plugin  …           (18 stock maps; see GDD)
```

Today all map nodes run **in-process** inside `cmd/server`. The same APIs can later host remote map processes; transfer validation stays on the proxy.

## Processes & packages

| Piece | Package / entry | Role |
|-------|-----------------|------|
| Cluster entry | `cmd/server` | Thin CLI → `internal/host.Start` |
| Host bootstrap | `internal/host` | Load cluster, start maps, serve proxy (also used by Wails standalone) |
| Proxy | `internal/proxy` | JWT auth HTTP, WebSocket sessions, route frames to the player's current map, validate transfers, admin map lifecycle |
| Map node | `internal/mapnode` | One map: load overworld + server config, run Hub, forward bytes to proxy, request transfers |
| Hub | `internal/server` | Per-map gameplay loop: movement, NPCs, battles, social, exits, save points |
| Game rules | `internal/game` | Jobs, skills, status, loot, overworld load/collision/pathfinding (**shared** with desktop client prediction) |
| Protocol | `internal/protocol` | JSON `Envelope` message types (mirrored in `wails/frontend/src/types.ts`); protobuf schemas in `proto/fantasy/v1` (**shared** contract) |
| Client net | `internal/clientnet` | Desktop Go client: WebSocket + local SlideMove prediction |
| Cluster config | `internal/cluster` | `MapSpec`, registry load/save, travel checks, transfer request types |
| Persistence | `internal/store` | Accounts + character profiles (JSON files under `data/`) |
| Auth | `internal/auth` | HS256 JWT (default 7-day TTL) |
| Desktop client | `wails/` | Wails shell + `wails/frontend` (Vite + React 19 + Three.js + Zustand) + `internal/clientnet`; optional embedded `internal/host` |

Internal transfer types (`cluster.TransferRequest`, attach payloads) are **never** sent to the client. Clients only see gameplay envelopes (`welcome`, `world_state`, `map_config`, …).

## Configuration

### Bootstrap: `data/cluster.json`

Proxy bind address, shared account/profile paths, static dir, **shared EXP rates**, and the **seed** map list (Greenwood, Northern Wastes).

```json
{
  "proxy": { "addr": ":8080", "accounts": "data/accounts.json", "data": "data/profiles.json", "static": "" },
  "exp": { "rate": 1.0, "main_percent": 75, "sub_percent": 25 },
  "maps": [ { "id": "greenwood", "config": "data/maps/greenwood.server.json", "default": true }, … ]
}
```

| Field | Meaning |
|-------|---------|
| `exp.rate` | Global job EXP multiplier (all maps, all award paths) |
| `exp.main_percent` / `exp.sub_percent` | Split of awarded EXP when a subjob is equipped (normalized to their sum; no sub → 100% main) |
| `exp.subjob_unlock_level` | Main-job level required before a subjob may be equipped (default `5`) |

### Live registry: `data/cluster.maps.json`

When this file exists and lists maps, it **replaces** the maps array from `cluster.json` at startup. Create / enable / disable / remove in Game Designer write here so Air (which only watches `.go` files) does not restart mid-edit.

Each map has a `MapSpec`: `id`, `name`, `config` (path to a server JSON), optional `addr`, `default`, `enabled`.

### Per-map server config

| Path | Typical use |
|------|-------------|
| `data/maps/{id}.server.json` | Every map — overworld path, combat plugin, battle speed |

Important fields: `server.overworld` (usually `data/maps/{id}.map.json`), `server.battle_speed`, `plugins.combat` (`combat.realtime` or `combat.atb`).

### Portable `data/` tree

Stock assets (`cluster.json`, `maps/`, `content/`) are committed and **embedded** in standalone binaries. On first run (or whenever a stock file is missing), `data.Materialize` writes them next to the executable. Existing files are never overwritten.

| File | Contents | Embedded? |
|------|----------|-----------|
| `accounts.json` | Logins, bcrypt hashes, `is_admin` | No |
| `profiles.json` | Characters: jobs, loadouts, inventory, map/position, save points | No |
| `cluster.maps.json` | Live map registry | No |
| `cluster.json`, `maps/`, `content/` | Stock world + catalogs | Yes (seed if missing) |

Default admin account is ensured on startup: **admin / admin**.

## Networking

### HTTP (proxy)

| Area | Examples |
|------|----------|
| Auth | `POST /api/register`, `POST /api/login`, `GET /api/me` |
| Public maps | `GET /api/maps`, `GET /api/maps/{id}`, `GET /api/atlas`, `GET /api/modules` |
| Public status | `GET /api/status` — aggregate uptime, player/battle counts, per-map running state (no identities) |
| Content site | `proxy.static` (default `site/dist`) — SPA with news / wiki / guide; falls back to `index.html` |
| Admin | `GET/POST /api/admin/maps`, enable/disable/remove, overrides CRUD |

Admin auth: Bearer JWT for an account with `is_admin`, or legacy `ADMIN_SECRET` / `X-Admin-Key`.

### WebSocket

1. Client obtains JWT from login.
2. Connects `ws://host/ws?token=…` (`wails/frontend/src/net/socket.ts` via Go `clientnet`).
3. Sends `join_world` → receives `welcome` (map snapshot, combat module, portals, terrain).
4. Proxy attaches the session to a map node; subsequent envelopes are forwarded both ways.
5. On map exit / cross-map warp: proxy detaches, attaches to destination, re-issues join with spawn — **same socket**.

**Status WebSocket** (separate from gameplay): `ws://host/status/ws` — anonymous JSON `{ "type": "status", "payload": … }` pushed about every 2s. Used by the public content site; never attaches to a map hub.

### Content site

Player-facing Vite + React app in [`site/`](../site/). Markdown under `site/content/` (news, wiki, guide). Build with `cd site && npm install && npm run build`, then run the cluster so `proxy.static` serves `site/dist`. Dev: `npm run dev` in `site/` (proxies `/api` and `/status` to `:8080`).
## Map lifecycle (runtime)

Implemented in `internal/proxy/lifecycle.go`:

| Action | Behavior |
|--------|----------|
| **Create** | Write blank `data/maps/{id}.map.json` + `data/maps/{id}.server.json`, append registry, start node |
| **Enable** | Mark enabled, start node if needed |
| **Disable** | Evacuate players to previous/default map, stop node, mark disabled |
| **Remove** | Evacuate, stop, drop from registry, delete map/server files + overrides |

Travel to disabled or missing maps is blocked (`cluster.CanTravelTo`). The default map cannot be disabled/removed; at least one enabled map must remain.

Blank maps include a full-map sanctuary and a center **Spawn Crystal** (validation requires every sanctuary to contain a save point).

## Live reload

Saving Game Designer overrides:

1. `PUT /api/admin/maps/{id}/overrides` writes `data/maps/overrides/{id}.json`.
2. Owning map node calls `ReloadOverworld`.
3. Hub refreshes overworld + NPC seed (players in battle stay in battle).
4. Clients receive updated `map_config` / world state.

## Frontend topology

| Layer | Location | Notes |
|-------|----------|-------|
| Screens | `wails/frontend/src/App.tsx`, `state/store.ts` | `title` → auth / Game Designer / play |
| Net | `wails/frontend/src/net/` | auth, transport, public maps, adminMaps |
| Three.js 3D | `wails/frontend/src/three/` | `WorldView`, `BattleView`, `HouseView`, `GameRenderer`, camera, character animations, GLB models |
| React HUD | `wails/frontend/src/components/` | menus, hotbar, social, windows |
| Editor | `wails/frontend/src/components/MapEditor*.tsx`, `editor/` | Game Designer UI + logic |
| Wails glue | `wails/frontend/src/wails*.ts`, `bootstrap.ts` | Go API / transport / movement bridges |

## 3D Presentation & Coordinates

The desktop client renders all game views in 3D using Three.js:

- **Coordinate Mapping:** The server and wire protocol operate on 2D map coordinates `(X, Y)`. The client transforms these into Three.js space via `wails/frontend/src/three/coords.ts`:
  - Three `x = mapX`
  - Three `y = height` (default `0`, or sampled floor)
  - Three `z = mapY` (horizontal South is Three `+Z`)
  - Facing is represented as yaw radians around the vertical Y axis (Three-native, transmitted in `MovePayload.facing`).
- **Render Views:**
  - `GameRenderer.ts`: Orchestrates the Three.js WebGL renderer, scene graphs, lighting, and animation loop.
  - `WorldView.ts`: 3D overworld view that generates terrain geometry from map cells/GIDs, spawns players/NPCs using GLB models (`modelLoader.ts`), manages nametags via `Css2dLabels.tsx`, and handles third-person camera lerping (`camera.ts`).
  - `BattleView.ts`: 3D combat stage for instanced encounters.
  - `HouseView.ts`: 3D interior for player camps/housing, featuring 3D perspective raycasting for furniture placement.
- **3D Terrain & Physics Migration:**
  - Complete blueprint in [MAPS_3D_PHYSICS.md](./MAPS_3D_PHYSICS.md).
  - Transitioning from 2D AABB tile collision (`SlideMovePlayer`) to shared heightfields, mesh colliders, and a kinematic character step synchronized between the server Hub and client prediction (`internal/clientnet`).
  - Open-world combat migration ([OPEN_WORLD_COMBAT.md](./OPEN_WORLD_COMBAT.md)) moves combat directly into the 3D overworld without separate battle-scene swaps.

## Air / hot reload (Go)

`.air.toml` watches **Go only** under `cmd/` and `internal/` (`include_ext = ["go"]`). Writing under `data/` does not restart the server — intentional for Game Designer map CRUD.

## Dev commands

```bash
npm run wails:install
npm run server:dev               # Air → :8080
npm run wails:dev                # desktop client against external server
npm run wails:dev:standalone     # desktop + embedded server
```

Production-style: `npm run wails:build` then `npm run server`.

**Standalone desktop:** `npm run wails:build:standalone` embeds `internal/host` plus stock `data/` seed files (`-tags standalone`). Player JSON lives next to the exe under `data/`; missing stock assets are written from the binary on first run.

Set `JWT_SECRET` (or `-jwt-secret`) for stable tokens across restarts.
