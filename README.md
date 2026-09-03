# FF5 Multiplayer

A 2D, room-based multiplayer RPG inspired by Final Fantasy V and XI. Go
authoritative cluster over WebSockets; Phaser + React frontend.

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Hub-and-spoke proxy, map nodes, config/registry, networking, ops |
| [docs/SYSTEMS.md](docs/SYSTEMS.md) | Overworld, combat plugins, jobs, save points, accounts |
| [docs/GAME_DESIGNER.md](docs/GAME_DESIGNER.md) | In-app **Game Designer** (admin world editor) |
| [maps/README.md](maps/README.md) | `.map.json` / Tiled assets, layers, sanctuaries, tooling |
| [web/public/assets/ATTRIBUTION.md](web/public/assets/ATTRIBUTION.md) | Third-party art licenses |

## Architecture (short)

```text
Browser ──WS/HTTP──► Proxy (:8080) ──in-process──► Map node(s)
                      auth, admin APIs              Hub + overworld + combat
```

- **Proxy** (`internal/proxy`) — accounts, one client WebSocket per browser, transfer validation, Game Designer admin APIs. Map changes do **not** reconnect the socket.
- **Map node** (`internal/mapnode`) — one map’s Hub, overworld, plugins, battles.
- **Hub** (`internal/server`) — per-map orchestrator (movement, NPCs, rooms, social).
- **Protocol** (`internal/protocol`) — JSON envelopes; mirrored in `web/src/types.ts`.
- **Persistence** (`internal/store`) — `data/accounts.json`, `data/profiles.json`; live map list in `data/cluster.maps.json`.

Bootstrap cluster: `config/cluster.json`. Details and diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The frontend (`web/`) uses **Phaser** for world/battle scenes and **React** + Zustand for menus/HUD. Title screen offers **Play Game** or **Game Designer**.

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

Prereqs: Go 1.25+, Node 20+.

The server creates `data/` on first save. Local persistence is gitignored.

### Development

```bash
npm run web:install

# Terminal 1 — cluster (proxy + map nodes); recompiles on .go changes
npm run server:dev

# Terminal 2 — frontend (proxies /api and /ws to :8080)
npm run web:dev     # http://localhost:5173
```

Air watches **Go only** so editing `maps/` or `data/cluster.maps.json` does not restart the server.

Register an account, create a hero, walk into enemies to battle. Greenwood uses realtime combat; cross the east Wolfrun exit into the Northern Wastes (ATB). The proxy keeps your WebSocket.

### Production-style

```bash
npm run web:install
npm run build
npm run server   # serves web/dist at http://localhost:8080
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
-cluster    config/cluster.json   proxy + map servers (default)
-jwt-secret (or JWT_SECRET)       JWT signing secret (ephemeral if unset)
-config     unused in cluster mode
```

## Project layout

```text
cmd/server/          Cluster entry: proxy + in-process map nodes
cmd/genmapwalls/     Sanctuary wall patches → overrides
internal/proxy/      Auth, WS routing, transfers, admin map APIs
internal/mapnode/    One map’s hub, overworld, plugins
internal/cluster/    Cluster config + live maps registry
internal/game/       Jobs, skills, overworld load/rules
internal/server/     Hub, battles, NPCs, social, auth HTTP
internal/store/      Accounts & profiles
config/              Bootstrap cluster + stock map server JSON
maps/                .map.json, overrides/, created *.server.json
web/                 Vite + React + Phaser client
docs/                Architecture, systems, Game Designer
scripts/             Smoke tests / server helpers
data/                Runtime JSON (gitignored)
```

## Not yet implemented

Spectator mode, party level syncing, passive party XP, quests/events, and
trading are still future work.
