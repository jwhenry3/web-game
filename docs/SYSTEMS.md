# Game systems

Authoritative gameplay rules live in Go (`internal/game`, `internal/server`). The client presents state and sends intents; the Hub validates them.

Architecture and networking: [ARCHITECTURE.md](./ARCHITECTURE.md). Editor: [GAME_DESIGNER.md](./GAME_DESIGNER.md).

## Overworld

Each map node owns one `game.Overworld`:

- Tile grid from `data/maps/{id}.map.json` (plus optional `data/maps/overrides/{id}.json`)
- **Regions** — wilderness / town / camp; `sanctuary: true` marks safe zones
- **Collision** — non-walkable tiles; pathfinding and engage respect sanctuaries
- **NPCs** — patrol/wander in a region; proximity or an attack pulls them into combat (not inside sanctuaries)
- **Exits** — rectangles that transfer the player to another map (`destMap`, `destX`, `destY`)
- **Save points** — attune / respawn / Return–Teleport destinations
- **Job changers** — optional POIs inside sanctuaries

Movement is server-authoritative (slide / bounds checks). Clients send move intents; the Hub broadcasts `world_state` / `entity_state`. Players, NPCs, and pets share one `WorldEntity` wire shape — kind selects the entity class and plugin-driven behavior.

### Sanctuary rules

- Every sanctuary must contain **at least one save point** (validated on map load).
- Job masters are optional (common in towns, optional at camps).
- Enemies do not path into or engage players inside sanctuaries.
- Entering a map via transfer can grant a short combat immunity window.

## Save points & travel skills

Profiles store `save_point_id` and `visited_save_points`. Setting a crystal requires proximity (`set_save_point`). Defeat respawns at the attuned crystal (or a map default). Cluster-wide registry supports Return / Teleport across maps when the destination crystal is known and visited.

## Combat

All combat is **realtime** and fought **directly in the overworld** — there are no instanced battle rooms and no per-map combat modes. One authoritative physics/combat simulation runs inside the map hub goroutine, driven by the single `move` path.

### Engagement

- Walking within ~110px of a hostile NPC, or attacking one, pulls it into combat.
- Nearby hostile NPCs within ~150px of an engaged ally assist it.
- Engaged NPCs chase at melee range; dragged ~380px from where the fight began they leash back to that spot and reset to full HP. Targets farther than ~460px are dropped.
- A world NPC's identity (kind, level, drop pool, capturable) is rolled from its patrol's encounter config; the patrol's own kind/level are fallbacks for encounters that omit them.
- Enemies do not path into or engage players inside sanctuaries.

### Tick & broadcast

- Combat ticks run every **50ms**, but only while at least one fight is active on the map.
- `combat_tick` / `combat_event` use area-of-interest filtering: only clients within ~900px of a fight (or flagged in-combat) receive them. Clients leaving the AoI get one empty `combat_tick` so the HUD clears.

### Actions & dodge

- Combat intents: `action` (`action_id`, optional `target_id` / `item_id`), `set_target`, `dodge`.
- **Dodge** is a universal action bound to **Shift** (not a hotbar slot): works in and out of combat, requires recent movement (250ms grace), costs **25 stamina** (max 100, regens 35/s), 500ms cooldown after the dash, and interrupts casting.
- Skills with cast times report progress; moving or dodging interrupts the cast.

### Defeat & rewards

- XP is awarded **per kill**: everyone who damaged the NPC gets a share, with a party bonus when 2+ same-party contributors dealt damage. Nearby party members who didn't fight get a smaller passive share.
- Defeated NPCs despawn and respawn after a delay at their patrol home.
- Defeated players respawn at their save point with a **5s immunity** window.

### Pets & capture

- Encounter enemies may set `"capturable": false` (default **true** when omitted).
- While an enemy is alive, capturable, and under **20% HP**, the player may use the **Capture** skill (`capture`) from the hotbar (default slot 7).
- Success chance: `clamp(0.05, 0.85, 0.35 + 0.04*(playerMainLvl − enemyLvl))`.
- Captured pets go on the profile (`pets`, max 20) at the enemy's level.
- One pet may **follow** on the overworld; one may fight as an **ally**.
- Allies are friendly non-players (`is_ally`): enemy AI can hit them; they AI-attack foes. The owner may queue **one** skill via `actor_id`; after it resolves, AI resumes.
- Ally heals/buffs/items may target pets.

Crossing a map exit (e.g. Wolfrun road → Northern Wastes) keeps the same WebSocket; only the owning map node changes.

### Status effects

Buffs/debuffs (`internal/game/status.go`) tick inside the combat sim: defense/attack mods, shields, regen/poison, haste, stun, etc. Synced to the client as badges on HUD and sprites.

### Targeting (client)

- Offensive skills — current target or click a pulsing enemy.
- Ally skills / items — arm on hotbar, then click ally or self.
- Auto-attack — hotbar slot 1 toggles (does not consume GCD).

## Jobs & progression

- **10 core classes** with clear roles (Tank / Healer / Support / DPS) and **one primary weapon each** across nine implements: sword, hammer, axe, spear, katana, knuckles, staff, wand, dagger. Six are starters; Aegis, Reaver, Lancer, and Ronin unlock later.
- **Combo aliases** (Spellblade, Nightveil, …) are named main+sub pairs — display labels and loadout presets, not separate skill trees.
- New characters pick **main only**; `profile.unlocked_jobs` starts as the six starters. Subclass requires main level ≥ `exp.subjob_unlock_level` (default **5**).
- Each core has a **four-skill tree**; skills unlock at class levels 1 / 5 / 9 / 13 and train through use (up to skill level 5).
- Equipment, hotbars, and skill progress are stored **per main/sub combo** (`store` loadouts). Eight equipment slots: main, sub, six armor.
- Each loadout keeps a single **hotbar** of **24 slots** (1–8, ctrl+1–8, shift+1–8) shared by field skills (Return, Port, Camp), combat skills, and consumables. `set_hotbar` binds a slot directly — there is no `bar` field. The Skills window assigns onto the one bar.
- Only **equipped** items contribute combat stats.
- Procedural loot on victory; Mug improves rarity.

### EXP rates (cluster-wide)

Configured once in `data/cluster.json` under `exp` and applied by every map server via `game.DistributeJobXP`:

1. Scale base award by `exp.rate`.
2. If a subjob is set, split by `exp.main_percent` / `exp.sub_percent`; otherwise all EXP goes to main.

Used for per-kill XP shares and party passive EXP. Defaults: rate `1.0`, main `75%`, sub `25%`.

## Housing / camps

- Field skill **Camp** (`camp`) pitches one tent at the hero’s feet (1.5s cast). Relocating packs the old camp.
- Click / interact the tent to enter a **house instance** (100×100 map, **20×20** walkable starter footprint). Anyone may enter for now.
- Owner logout despawns the camp and kicks guests to the overworld at the tent tile.
- Owner-only **house storage** (separate from inventory, default 40 slots, searchable in UI) and **furniture** place/pick (inventory items as decorations).
- Door returns to the overworld camp tile. Camp skin and house size are upgrade hooks for later.

## Social

Friends list and chat are Hub-mediated and persist on the profile. Rosters show nearby players (⚔ marks those in combat); party members fight alongside each other in the overworld and share kill XP.

## Accounts & profiles

| Store | File | Responsibility |
|-------|------|----------------|
| Accounts | `data/accounts.json` | Username/password, `is_admin`, linked character name |
| Profiles | `data/profiles.json` | Jobs, loadouts, inventory, friends, map id / position, save points, prev map |

JWT claims identify the account on HTTP and WebSocket. Character select / create flows run after login (`GET /api/me`).

## Client presentation

- **WorldScene** — tiled overworld, HEROES 99 layered sprites, realtime combat staging and VFX driven by server results, engage markers.
- React windows — Character, Equipment, Inventory, Skills, hotbar (24 slots), main menu, social.

Asset licenses: `wails/frontend/public/assets/ATTRIBUTION.md`.

## Not yet implemented

Party level syncing, quests/events, and trading remain future work.
