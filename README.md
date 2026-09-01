# FF5 Multiplayer

A 2D, room-based multiplayer RPG inspired by Final Fantasy V, per the design
docs in `GameProject/docs`. Go authoritative server over WebSockets; Phaser +
React frontend.

## Architecture

The system follows the Hub-and-Spoke model from the docs:

- **Client** (`internal/server/client.go`) — one WebSocket connection per
  player with `ReadPump`/`WritePump` goroutines.
- **Hub** (`internal/server/hub.go`) — the central orchestrator. Owns the
  persistent **Open World layer** (movement, chat, roster, combat-locked
  states) and routes messages to battle instances. Players never switch
  sockets: they stay connected to the world shard while fighting.
- **BattleRoom** (`internal/server/battle.go`) — isolated, ephemeral combat
  instances implementing the **Action Window / Tick system**: action requests
  are buffered during a 200ms window, validated and batch-processed at the
  tick, and broadcast in a single atomic `battle_event`. Combat follows an
  FFXIV-style split: **auto-attack** has its own swing ATB (on by default,
  toggleable) and **skills/consumables** share a separate GCD ATB. Failed
  validations return explicit failure results so clients play the "fizzle"
  animation.
- **Protocol** (`internal/protocol/messages.go`) — JSON `Envelope` +
  `MessageType` definitions, mirrored by `web/src/types.ts`.
- **Game rules** (`internal/game/`) — the **Armory system**: four specialties
  (Swordplay/sword, Stealth/dagger, Sorcery/staff, Devotion/mace). Each starts
  with 1 skill point; using that specialty's skills and weapons earns more
  (1 extra point per 25 training). Spend points on a per-specialty tree —
  deeper nodes cost more (1 / 2 / 3). Training also raises potency. Staff/mace
  add a synergy bonus to their magic category. Consumables (potions, ethers)
  drop alongside gear. Level-20 cap; seven equipment slots; Mug improves
  rarity.
- **Persistence** (`internal/store/profiles.go`) — player profiles (level/XP,
  proficiencies, inventory, equipped gear) saved to `data/profiles.json`;
  returning heroes keep all progression. Only *equipped* items contribute
  stats in battle; battles cap at 4 players.

The frontend (`web/`) renders the world and battles with **Phaser 3** scenes
and drives menus/HUD with **React** (state shared via zustand):

- `src/phaser/WorldScene.ts` — open-world map, WASD/arrow movement, other
  players with combat-locked indicators; clicking a hero marked ⚔ joins
  their battle if the party has room.
- `src/phaser/BattleScene.ts` — battle staging, lunge/damage/heal animations
  driven by server results; with a skill selected, legal targets pulse and
  can be clicked directly on the battlefield.
- `src/components/` — login, world/battle HUDs, **Character / Equipment /
  Inventory / Skills windows** (C/E/I/K), a 5-slot **hotbar** (keys 1–5 in
  battle), roster + chat. Inventory can equip gear and use consumables;
  Skills spends specialty points; hotbar binds skills or item types.

## Running

Prereqs: Go 1.25+, Node 20+.

### Development

```bash
# Terminal 1: the game server (ws://localhost:8080/ws)
go run ./cmd/server

# Terminal 2: the frontend with hot reload (proxies /ws to :8080)
cd web
npm install
npm run dev     # open http://localhost:5173
```

### Production-style

```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/server   # serves web/dist at http://localhost:8080
```

Open multiple browser tabs to play multiplayer locally: other heroes appear
in the world, and anyone can join an active battle from the "Active Battles"
panel ("Call for Help").

## Testing

```bash
go test ./...                  # battle room: batching, validation, rewards
node scripts/smoke.mjs         # two-player end-to-end flow (server must run)
node scripts/smoke-defeat.mjs  # defeat-flow regression (server must run)
```

## Server flags

```text
-addr   :8080               listen address
-data   data/profiles.json  profile persistence file
-static web/dist            frontend build to serve (optional)
```

## Not yet implemented (from the GDD)

Spectator mode, party level syncing, passive party XP, quests/events, and
trading are future work; the world/instance split, batched ATB combat, the
armory progression system, leveling, persistence, and procedural loot cover
the core pillars.
