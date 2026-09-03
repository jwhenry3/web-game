# Architecture & infrastructure

This document describes how the multiplayer stack is wired: process model, map registry, networking, and how pieces talk to each other.

For gameplay rules see [SYSTEMS.md](./SYSTEMS.md). For the in-app editor see [GAME_DESIGNER.md](./GAME_DESIGNER.md). Map file formats live in [maps/README.md](../maps/README.md).

## Overview

```text
Browser (Vite :5173 or static web/dist)
   │  HTTPS/WS  (/api, /ws)
   ▼
Proxy  (:8080)     internal/proxy
   │  auth, sessions, admin APIs, static files
   │  one WebSocket per browser; no reconnect on map change
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
Map node       Map node       Map node     internal/mapnode
(greenwood)    (north)        (cave, …)
   │              │              │
   Hub            Hub            Hub         internal/server
   Overworld      Overworld      Overworld   internal/game
   Combat plugin  Combat plugin  …
```

Today all map nodes run **in-process** inside `cmd/server`. The same APIs can later host remote map processes; transfer validation stays on the proxy.

## Processes & packages

| Piece | Package / entry | Role |
|-------|-----------------|------|
| Cluster entry | `cmd/server` | Load cluster config, shared stores, start enabled maps, listen on proxy addr |
| Proxy | `internal/proxy` | JWT auth HTTP, WebSocket sessions, route frames to the player's current map, validate transfers, admin map lifecycle |
| Map node | `internal/mapnode` | One map: load overworld + server config, run Hub, forward bytes to proxy, request transfers |
| Hub | `internal/server` | Per-map gameplay loop: movement, NPCs, battles, social, exits, save points |
| Game rules | `internal/game` | Jobs, skills, status, loot, overworld load/collision/pathfinding |
| Protocol | `internal/protocol` | JSON `Envelope` message types (mirrored in `web/src/types.ts`) |
| Cluster config | `internal/cluster` | `MapSpec`, registry load/save, travel checks, transfer request types |
| Persistence | `internal/store` | Accounts + character profiles (JSON files under `data/`) |
| Auth | `internal/auth` | HS256 JWT (default 7-day TTL) |
| Client | `web/` | Vite + React 19 + Phaser 4 + Zustand |

Internal transfer types (`cluster.TransferRequest`, attach payloads) are **never** sent to the browser. Clients only see gameplay envelopes (`welcome`, `world_state`, `map_config`, …).

## Configuration

### Bootstrap: `config/cluster.json`

Proxy bind address, shared account/profile paths, static dir, and the **seed** map list (Greenwood, Northern Wastes).

```json
{
  "proxy": { "addr": ":8080", "accounts": "data/accounts.json", "data": "data/profiles.json", "static": "web/dist" },
  "maps": [ { "id": "greenwood", "config": "config/server.json", "default": true }, … ]
}
```

### Live registry: `data/cluster.maps.json`

When this file exists and lists maps, it **replaces** the maps array from `cluster.json` at startup. Create / enable / disable / remove in Game Designer write here so Air (which only watches `.go` files) does not restart mid-edit.

Each map has a `MapSpec`: `id`, `name`, `config` (path to a server JSON), optional `addr`, `default`, `enabled`.

### Per-map server config

| Path | Typical use |
|------|-------------|
| `config/server.json` | Greenwood — overworld path + combat plugin |
| `config/server.north.json` | Northern Wastes |
| `maps/{id}.server.json` | Maps created in Game Designer |

Important fields: `server.overworld` (usually `maps/{id}.map.json`), `server.battle_speed`, `plugins.combat` (`combat.realtime` or `combat.atb`).

### Runtime data (`data/`, gitignored)

| File | Contents |
|------|----------|
| `accounts.json` | Logins, bcrypt hashes, `is_admin` |
| `profiles.json` | Characters: jobs, loadouts, inventory, map/position, save points |
| `cluster.maps.json` | Live map registry |

Default admin account is ensured on startup: **admin / admin**.

## Networking

### HTTP (proxy)

| Area | Examples |
|------|----------|
| Auth | `POST /api/register`, `POST /api/login`, `GET /api/me` |
| Public maps | `GET /api/maps`, `GET /api/maps/{id}`, `GET /api/atlas`, `GET /api/modules` |
| Admin | `GET/POST /api/admin/maps`, enable/disable/remove, overrides CRUD |

Admin auth: Bearer JWT for an account with `is_admin`, or legacy `ADMIN_SECRET` / `X-Admin-Key`.

### WebSocket

1. Client obtains JWT from login.
2. Connects `ws://host/ws?token=…` (`web/src/net/socket.ts`).
3. Sends `join_world` → receives `welcome` (map snapshot, combat module, portals, terrain).
4. Proxy attaches the session to a map node; subsequent envelopes are forwarded both ways.
5. On map exit / cross-map warp: proxy detaches, attaches to destination, re-issues join with spawn — **same socket**.

## Map lifecycle (runtime)

Implemented in `internal/proxy/lifecycle.go`:

| Action | Behavior |
|--------|----------|
| **Create** | Write blank `maps/{id}.map.json` + `maps/{id}.server.json`, append registry, start node |
| **Enable** | Mark enabled, start node if needed |
| **Disable** | Evacuate players to previous/default map, stop node, mark disabled |
| **Remove** | Evacuate, stop, drop from registry, delete map/server files + overrides |

Travel to disabled or missing maps is blocked (`cluster.CanTravelTo`). The default map cannot be disabled/removed; at least one enabled map must remain.

Blank maps include a full-map sanctuary and a center **Spawn Crystal** (validation requires every sanctuary to contain a save point).

## Live reload

Saving Game Designer overrides:

1. `PUT /api/admin/maps/{id}/overrides` writes `maps/overrides/{id}.json`.
2. Owning map node calls `ReloadOverworld`.
3. Hub refreshes overworld + NPC seed (players in battle stay in battle).
4. Clients receive updated `map_config` / world state.

## Frontend topology

| Layer | Location | Notes |
|-------|----------|-------|
| Screens | `web/src/App.tsx`, `state/store.ts` | `title` → auth / Game Designer / play |
| Net | `web/src/net/` | auth, socket, public maps, adminMaps |
| Phaser | `web/src/phaser/` | `WorldScene`, `BattleScene`, combat plugins |
| React HUD | `web/src/components/` | menus, hotbar, social, windows |
| Editor | `web/src/components/MapEditor*.tsx`, `web/src/editor/` | Game Designer UI + logic |

Dev: Vite on **:5173** proxies `/api` and `/ws` to **:8080**. Prefer the Vite URL while iterating; `:8080` alone serves last-built `web/dist`.

## Air / hot reload (Go)

`.air.toml` watches **Go only** under `cmd/` and `internal/` (`include_ext = ["go"]`). Writing `config/`, `data/`, or `maps/` does not restart the server — intentional for Game Designer map CRUD.

## Dev commands

```bash
npm run web:install
npm run server:dev    # Air → :8080
npm run web:dev       # Vite → :5173
```

Production-style: `npm run build` then `npm run server` (serves `web/dist` from the proxy).

Set `JWT_SECRET` (or `-jwt-secret`) for stable tokens across restarts.
