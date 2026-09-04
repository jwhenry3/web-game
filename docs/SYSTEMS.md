# Game systems

Authoritative gameplay rules live in Go (`internal/game`, `internal/server`). The client presents state and sends intents; the Hub validates them.

Architecture and networking: [ARCHITECTURE.md](./ARCHITECTURE.md). Editor: [GAME_DESIGNER.md](./GAME_DESIGNER.md).

## Overworld

Each map node owns one `game.Overworld`:

- Tile grid from `data/maps/{id}.map.json` (plus optional `data/maps/overrides/{id}.json`)
- **Regions** — wilderness / town / camp; `sanctuary: true` marks safe zones
- **Collision** — non-walkable tiles; pathfinding and engage respect sanctuaries
- **NPCs** — patrol/wander in a region; engage starts combat (not inside sanctuaries)
- **Exits** — rectangles that transfer the player to another map (`destMap`, `destX`, `destY`)
- **Save points** — attune / respawn / Return–Teleport destinations
- **Job changers** — optional POIs inside sanctuaries

Movement is server-authoritative (slide / bounds checks). Clients send move intents; the Hub broadcasts `world_state` / `npc_state`.

### Sanctuary rules

- Every sanctuary must contain **at least one save point** (validated on map load).
- Job masters are optional (common in towns, optional at camps).
- Enemies do not path into or engage players inside sanctuaries.
- Entering a map via transfer can grant a short battle immunity window.

## Save points & travel skills

Profiles store `save_point_id` and `visited_save_points`. Setting a crystal requires proximity (`set_save_point`). Defeat respawns at the attuned crystal (or a map default). Cluster-wide registry supports Return / Teleport across maps when the destination crystal is known and visited.

## Combat

Combat is a **plugin** selected per map (`plugins.combat` in the map's server JSON):

| Plugin ID | Package | Typical map |
|-----------|---------|-------------|
| `combat.realtime` | `internal/plugins/combatrealtime` | Greenwood |
| `combat.atb` | `internal/plugins/combatatb` | Northern Wastes |

Battles are isolated **rooms** on the Hub (cap **4** players). Clients load matching frontend modules under `wails/frontend/src/plugins/`. `welcome.map` tells the client which combat module the current map uses.

Crossing a map exit (e.g. Wolfrun road → Northern Wastes) keeps the same WebSocket; only the owning map node changes.

### Status effects

Buffs/debuffs (`internal/game/status.go`) tick with combat timing: defense/attack mods, shields, regen/poison, haste, stun, etc. Synced to the client as badges on HUD and sprites.

### Targeting (client)

- Offensive skills — current target or click a pulsing enemy.
- Ally skills / items — arm on hotbar, then click ally or self.
- Auto-attack — hotbar slot 1 toggles (does not consume GCD).

## Jobs & progression

- **22 jobs** in four weapon categories; six starters (WAR, MNK, WHM, BLM, RDM, THF). New characters pick **main only**; `profile.unlocked_jobs` starts as those six (advanced jobs unlock later).
- Equipping a **subjob** requires main-job level ≥ `exp.subjob_unlock_level` (default **5**) and that both jobs appear in `unlocked_jobs`. `set_jobs` is validated server-side. Subjob skills use the sub-weapon slot at 50% effectiveness.
- Each job has a **four-skill tree**; skills unlock at job levels 1 / 5 / 9 / 13 and train through use (up to skill level 5).
- Equipment, hotbar, and skill progress are stored **per main/sub combo** (`store` loadouts). Eight equipment slots: main, sub, six armor.
- Only **equipped** items contribute battle stats.
- Procedural loot on victory; Mug improves rarity.

### EXP rates (cluster-wide)

Configured once in `data/cluster.json` under `exp` and applied by every map server via `game.DistributeJobXP`:

1. Scale base award by `exp.rate`.
2. If a subjob is set, split by `exp.main_percent` / `exp.sub_percent`; otherwise all EXP goes to main.

Used for battle victory shares and party passive EXP. Defaults: rate `1.0`, main `75%`, sub `25%`.

## Social

Friends list and chat are Hub-mediated and persist on the profile. Rosters show nearby players; click a fighting hero (⚔) to join their battle when seats remain.

## Accounts & profiles

| Store | File | Responsibility |
|-------|------|----------------|
| Accounts | `data/accounts.json` | Username/password, `is_admin`, linked character name |
| Profiles | `data/profiles.json` | Jobs, loadouts, inventory, friends, map id / position, save points, prev map |

JWT claims identify the account on HTTP and WebSocket. Character select / create flows run after login (`GET /api/me`).

## Client presentation

- **WorldScene** — tiled overworld, HEROES 99 layered sprites, engage, markers.
- **BattleScene** / realtime plugin scenes — staging and VFX driven by server results.
- React windows — Character, Equipment, Inventory, Skills, hotbar (1–5), main menu, social.

Asset licenses: `wails/frontend/public/assets/ATTRIBUTION.md`.

## Not yet implemented

Spectator mode, party level syncing, passive party XP, quests/events, and trading remain future work.
