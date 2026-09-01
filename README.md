# FF5 Multiplayer

A 2D, room-based multiplayer RPG inspired by Final Fantasy V and XI. Go
authoritative server over WebSockets; Phaser 3 + React frontend.

## Architecture

The system follows a Hub-and-Spoke model:

- **Client** (`internal/server/client.go`) — one WebSocket connection per
  player with `ReadPump`/`WritePump` goroutines.
- **Hub** (`internal/server/hub.go`) — central orchestrator. Owns the
  persistent **open-world layer** (movement, chat, roster, combat-locked
  states) and routes messages to battle instances. Players stay on the same
  socket while fighting.
- **BattleRoom** (`internal/server/battle.go`) — isolated, ephemeral combat
  instances implementing the **Action Window / Tick system**: action requests
  are buffered during a 200ms window, validated and batch-processed at the
  tick, and broadcast in a single atomic `battle_event`. Combat uses an
  FFXIV-style split: **auto-attack** has its own swing ATB (on by default,
  toggleable) and **skills/consumables** share a separate GCD ATB. Failed
  validations return explicit failure results so clients play the "fizzle"
  animation.
- **Protocol** (`internal/protocol/messages.go`) — JSON `Envelope` +
  `MessageType` definitions, mirrored by `web/src/types.ts`.
- **Auth** (`internal/auth/`, `internal/server/auth_http.go`) — account
  registration/login over HTTP; JWT bearer tokens required for the WebSocket.
  Accounts persist to `data/accounts.json`.
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

# Terminal 1: game server (HTTP + ws://localhost:8080/ws)
npm run server:dev   # recompiles on .go changes (recommended)
# npm run server     # one-shot, no reload

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
-addr       :8080                 HTTP listen address
-data       data/profiles.json    hero profile persistence
-accounts   data/accounts.json     account persistence
-jwt-secret (or JWT_SECRET env)   JWT signing secret (random per launch if unset)
-static     web/dist              frontend build to serve (default in production)
```

## Project layout

```text
cmd/server/          HTTP + WebSocket entrypoint
internal/auth/       JWT issuance and validation
internal/game/       Jobs, skills, status effects, loot, overworld rules
internal/protocol/   Wire message types
internal/server/     Hub, battles, NPCs, social, HTTP auth routes
internal/store/      Profile/account persistence and loadouts
web/                 Vite + React + Phaser client
scripts/             Smoke-test scripts
data/                Runtime JSON persistence (gitignored)
```

## Not yet implemented

Spectator mode, party level syncing, passive party XP, quests/events, and
trading are still future work. The core loop — auth, overworld, batched ATB
combat, job/subjob progression, status effects, loadouts, persistence, and
procedural loot — is in place.
