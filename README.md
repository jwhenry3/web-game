# Clara Mundi

A 2D, room-based multiplayer RPG set in Clara Mundi. Go
authoritative cluster over WebSockets; Wails desktop client (Phaser + React).

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | JSON + Protobuf wire contract |
| [docs/SYSTEMS.md](docs/SYSTEMS.md) | Overworld, combat plugins, jobs, save points, accounts |
| [docs/GAME_DESIGNER.md](docs/GAME_DESIGNER.md) | In-app **Game Designer** (admin world editor) |
| [data/maps/README.md](data/maps/README.md) | `.map.json` / Tiled assets, layers, sanctuaries, tooling |
| [site/README.md](site/README.md) | Public content site (status, news, wiki, guide) |
| [wails/frontend/public/assets/ATTRIBUTION.md](wails/frontend/public/assets/ATTRIBUTION.md) | Third-party art licenses |

## Architecture (short)

```text
Wails client ──WS/HTTP──► Proxy (:8080) ──in-process──► Map node(s)
Browser site ──/ + /api/status + /status/ws──┘            Hub + overworld + combat
                           auth, admin APIs
```

- **Proxy** (`internal/proxy`) — accounts, one client WebSocket per session, transfer validation, Game Designer admin APIs, public **status** API/WS, optional static content site. Map changes do **not** reconnect the game socket.
- **Map node** (`internal/mapnode`) — one map’s Hub, overworld, plugins, battles.
- **Hub** (`internal/server`) — per-map orchestrator (movement, NPCs, rooms, social).
- **Protocol** (`internal/protocol`) — wire envelopes; mirrored in `wails/frontend/src/types.ts`.
- **Persistence** (`internal/store`) — `data/accounts.json`, `data/profiles.json`; live map list in `data/cluster.maps.json`.
- **Content site** (`site/`) — markdown-driven status / news / wiki / guide; build to `site/dist` and set `proxy.static`.

Bootstrap cluster: `data/cluster.json`. Shared **EXP rates** (`exp.rate`, `exp.main_percent`, `exp.sub_percent`) apply to every map. Stock maps/content/config ship in the binary and are written under `data/` on first standalone run if missing (accounts/profiles stay external only). Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The client (`wails/frontend/`) uses **Phaser** for world/battle scenes and **React** + Zustand for menus/HUD. Title screen offers **Play Game** or **Game Designer**.
**Shared Go libraries:** `internal/game` and `internal/protocol` are used by both the server and the desktop client. `internal/host` boots the cluster (used by `cmd/server` and optional Wails standalone). `internal/clientnet` is the Go WebSocket + prediction client. See [wails/README.md](wails/README.md).

## Progression & combat

See [docs/SYSTEMS.md](docs/SYSTEMS.md) for full rules. Summary:

- 22 jobs, six starters; subjob at job level 5; four-skill trees; loadouts per main/sub combo.
- Per-map combat plugin: **realtime** (Greenwood) or **ATB** (Northern Wastes).
- Status effects, hotbar targeting, procedural loot, friends/chat.
- Battles cap at 4 players; only equipped items grant stats.

## Game Designer

Admin world editor: terrain, entities, regions, prefabs, create/enable/disable/remove maps, sparse overrides with live reload.

Title → **Game Designer** → admin login (default **admin / admin**). Full guide: [docs/GAME_DESIGNER.md](docs/GAME_DESIGNER.md).

## Running

Prereqs: Go 1.25+, Node 20+, [Wails CLI](https://wails.io/) v2.

The server creates `data/` on first save. Local persistence is gitignored.

### Development

```bash
npm run wails:install

# Terminal 1 — cluster (proxy + map nodes); recompiles on .go changes
npm run server:dev

# Terminal 2 — desktop client
npm run wails:dev

# Optional — public content site (status / news / wiki / guide)
cd site && npm install && npm run dev
```

Build the site for the proxy (`proxy.static` → `site/dist`):

```bash
cd site && npm install && npm run build
```

Then open http://127.0.0.1:8080 for the site, `GET /api/status` for JSON, or `ws://127.0.0.1:8080/status/ws` for live updates.

Or all-in-one (embedded server):

```bash
npm run wails:dev:standalone
```

Air watches **Go only** so editing `data/maps/` or `data/cluster.maps.json` does not restart the server.

Register an account, create a hero, walk into enemies to battle. Greenwood uses realtime combat; cross the east Wolfrun exit into the Northern Wastes (ATB). The proxy keeps your WebSocket.

### Production-style

```bash
npm run wails:install
npm run wails:build
npm run server
```

```bash
export JWT_SECRET=your-long-random-secret
go run ./cmd/server -jwt-secret "$JWT_SECRET"
```

## Testing

```bash
npm test                       # go test ./...
node scripts/smoke.mjs         # two-player e2e (server must run)
node scripts/smoke-defeat.mjs  # defeat-flow regression
```

## Server flags

```text
-cluster    data/cluster.json     proxy + map servers (default)
-jwt-secret (or JWT_SECRET)       JWT signing secret (ephemeral if unset)
-config     unused in cluster mode
```

## Project layout

```text
cmd/server/          Cluster entry → internal/host
internal/host/       Shared cluster bootstrap (server + Wails standalone)
internal/clientnet/  Shared Go client (WS + prediction)
internal/proxy/      Auth, WS routing, transfers, admin map APIs
internal/mapnode/    One map’s hub, overworld, plugins
internal/cluster/    Cluster config + live maps registry
internal/game/       Jobs, skills, overworld load/rules (shared)
internal/protocol/   Wire envelopes (shared)
internal/server/     Hub, battles, NPCs, social, auth HTTP
internal/store/      Accounts & profiles
data/                Portable game + player data (seeded from binary when missing)
  cluster.json       Bootstrap cluster
  maps/              .map.json, .server.json, overrides/
  content/           Game Designer catalogs
  accounts.json      Player accounts (not embedded)
  profiles.json      Player profiles (not embedded)
wails/               Desktop client (Go bindings + React/Phaser UI)
docs/                Architecture, systems, Game Designer
scripts/             Smoke tests / server helpers
```

## Not yet implemented

Spectator mode, party level syncing, passive party XP, quests/events, and
trading are still future work.
