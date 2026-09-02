# FF5 Multiplayer

A 2D, room-based multiplayer RPG inspired by Final Fantasy V and XI. Go
authoritative server over WebSockets; Phaser 3 + React frontend.

## Architecture

The system follows a Hub-and-Spoke model, split across two server roles:

- **Global proxy** (`internal/proxy`) — account auth, one client WebSocket,
  and validation of travel between map servers. The browser stays connected;
  the proxy forwards frames to the current map (no reconnect on transfer).
- **Map server** (`internal/mapnode`) — overworld, plugins, the **Hub**,
  battle rooms, movement, and gameplay. Several maps can run in one process
  (default `config/cluster.json`) or as separate processes later.
- **Client** (`internal/server/client.go`) — one session per player. On the
  proxy this is a WebSocket; on a map it is a proxied session with the same
  `ReadPump`/`WritePump` message shape.
- **Hub** (`internal/server/hub.go`) — orchestrator for a single map. Owns
  that map's open-world layer and routes messages to battle instances.
- **BattleRoom** — isolated combat instances (ATB or realtime plugin).
- **Protocol** (`internal/protocol/messages.go`) — JSON `Envelope` types,
  mirrored by `web/src/types.ts`. `welcome.map` tells the client what the
  current map is responsible for (name, overworld, combat modules). Cluster
  topology and transfer rules are not exposed to the frontend.
- **Auth** (`internal/auth/`, `internal/server/auth_http.go`) — registration
  and login on the proxy; JWT required for the WebSocket.
- **Game rules** (`internal/game/`) — see [Progression & combat](#progression--combat).
- **Persistence** (`internal/store/`) — player profiles (jobs, loadouts,
  inventory, skills) saved to `data/profiles.json`. Only *equipped* items
  contribute stats in battle; battles cap at 4 players.

The frontend (`web/`) renders the world and battles with **Phaser 3** scenes
and drives menus/HUD with **React** (state via zustand):

- `src/phaser/WorldScene.ts` — overworld map, WASD/arrow movement, layered
  **HEROES 99** character sprites with equipped weapons; click a hero marked ⚔
  to join their battle.
- `src/phaser/BattleScene.ts` — battle staging, lunge/damage/heal animations
  driven by server results; status badges above HP/GCD bars; with a skill
  armed, legal targets pulse and can be clicked on the battlefield.
- `src/components/` — auth, character creation/select, world/battle HUDs,
  **Character / Equipment / Inventory / Skills** windows, icon-based main menu,
  5-slot **hotbar** (keys 1–5 in battle), roster + chat + friends.

Asset attribution: `web/public/assets/ATTRIBUTION.md`.

## Progression & combat

### Jobs

22 jobs across four weapon categories (sword, dagger, staff, mace). New heroes
pick one of six starters (WAR, MNK, WHM, BLM, RDM, THF). Additional jobs
unlock through play. At **job level 5**, a **subjob** can be equipped; subjob
skills use the **sub-weapon** slot and run at 50% effectiveness.

Each job has a **four-skill tree** (root + three follow-ups with prereqs).
Skills auto-unlock at job levels 1 / 5 / 9 / 13. Using a skill in battle
trains it (up to level 5); higher skill levels increase potency.

### Loadouts & hotbar

Equipment, hotbar bindings, and skill progress are stored **per main/sub job
combo**. Switching jobs loads that combo's saved loadout when one exists;
otherwise a default hotbar is generated (auto-attack, potion, each job's root
skill).

Eight equipment slots: main weapon, sub weapon, and six armor pieces.

### Status effects

Combat supports buffs and debuffs (`internal/game/status.go`):

| Kind | Examples |
|------|----------|
| Defense up/down | Minne, Sentinel, Dia |
| Attack up/down | Berserk, Boost |
| Shield | Phalanx |
| Regen / Poison | Geo-Regen, Geo-Poison |
| Haste | Haste Samba, Celerity |
| Stun | Shield Bash |

Statuses tick each action window (HoT/DoT), modify damage dealt/taken, absorb
via shields, speed up ATB (haste), and block actions (stun). Active statuses
sync to clients and show as icon badges with tooltips near HP/MP/GCD in the
battle HUD and above sprites.

Skills marked `heals` or `buffs` target allies; offensive skills target
enemies. Consumables always target allies.

### Battle targeting (client)

- **Enemy skills** — cast immediately on your current target, or arm the skill
  and click an enemy (list, sprite, or pulsing ring).
- **Ally skills & items** — first hotbar press arms the action; click a party
  member in the list, your sprite, or your stats panel; press the same hotbar
  key again to cast on yourself.
- **Auto-attack** — hotbar slot 1 toggles AA on/off (does not use the GCD).

### Other rules

- Five playable races (cosmetic presets for the HEROES 99 sprite layers).
- Procedural loot on victory; Mug improves drop rarity.
- Friends list and chat in the social pane.

## Running

Prereqs: Go 1.25+, Node 20+.

The server creates `data/` automatically on first save. Local persistence
files are gitignored — see `.gitignore`.

### Development

```bash
# Install frontend deps once
npm run web:install

# Terminal 1: cluster (proxy + map servers)
npm run server:dev   # recompiles on .go changes (recommended)
# npm run server     # one-shot, no reload
# config/cluster.json lists the proxy bind address and map configs

# Terminal 2: frontend with hot reload (proxies /api and /ws to :8080)
npm run web:dev     # open http://localhost:5173

# Stop the background server (default port 8080)
npm run server:stop
```

Equivalent without root scripts:

```bash
go run ./cmd/server
cd web && npm install && npm run dev
```

Register an account in the browser, create a hero, then walk into enemies on
the overworld to start battles.

The cluster runs two maps with different combat plugins. Greenwood (default)
uses realtime combat. Walk east along the Wolfrun road into the glowing zone
line to cross into the Northern Wastes, which uses ATB combat. Walk west from
Frostgate to return. The proxy keeps your WebSocket; you do not reconnect.

### Production-style

```bash
npm run web:install
npm run build
npm run server   # serves web/dist at http://localhost:8080
```

Set a stable JWT secret for production:

```bash
export JWT_SECRET=your-long-random-secret
go run ./cmd/server -jwt-secret "$JWT_SECRET"
```

Open multiple browser tabs (or accounts) to play multiplayer locally: other
heroes appear in the world, and anyone can join an active battle from the
roster or by clicking a fighting player.

## Testing

```bash
npm test                       # go test ./...
node scripts/smoke.mjs         # two-player end-to-end flow (server must run)
node scripts/smoke-defeat.mjs  # defeat-flow regression (server must run)
```

## Server flags

```text
-config     (unused in cluster mode; maps load from cluster.json)
-cluster    config/cluster.json   proxy + map servers
-jwt-secret (or JWT_SECRET env)   JWT signing secret (random per launch if unset)
```

## Project layout

```text
cmd/server/          Cluster entry: global proxy + map nodes
internal/proxy/      Auth, client WebSocket, map routing, transfer checks
internal/mapnode/    One map's hub, overworld, plugins, battles
internal/cluster/    Cluster config and transfer types
internal/auth/       JWT issuance and validation
internal/game/       Jobs, skills, status effects, loot, overworld rules
internal/protocol/   Wire message types
internal/server/     Hub, battles, NPCs, social, HTTP auth routes
internal/store/      Profile/account persistence and loadouts
config/              cluster.json, per-map server.json, overworld maps
web/                 Vite + React + Phaser client
scripts/             Smoke-test scripts
data/                Runtime JSON (profiles, accounts)
```

## Not yet implemented

Spectator mode, party level syncing, passive party XP, quests/events, and
trading are still future work. The core loop — auth, overworld, batched ATB
combat, job/subjob progression, status effects, loadouts, persistence, and
procedural loot — is in place.
