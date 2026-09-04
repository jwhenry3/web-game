# World maps

Runtime maps are **server-authoritative** `.map.json` files. The Game Designer edits sparse overrides on top of those bases. The client renders terrain from API layer data (not Tiled assets).

Full stack context: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Lore & region layout: [docs/GDD.md](../docs/GDD.md). Editor: [docs/GAME_DESIGNER.md](../docs/GAME_DESIGNER.md).

## Runtime artifacts

| Artifact | Role |
|----------|------|
| `data/maps/{id}.map.json` | **Loaded by the server** — terrain grids, regions, NPCs, save points, exits, objects |
| `data/maps/{id}.server.json` | Per-map server config (combat, battle speed, overworld path) |
| `data/maps/overrides/{id}.json` | Sparse patches from **Game Designer** / `genmapwalls` |
| `base_chip.tsx` / `base_chip.png` | Base terrain tileset definition (GID centers for paint / walls) |
| `tilesets/pipoya/` | Full Pipoya pack + catalog + sample map (client mirror under `wails/frontend/public/assets/tilesets/pipoya/`) |

The client blits map GIDs through the Pipoya firstgid registry (BaseChip **577**, matching the sample map). See [tilesets/pipoya/README.md](./tilesets/pipoya/README.md).

Loader order (`game.LoadOverworldData`): `.map.json` → else `.tmj` → else legacy paint JSON.

## Stock world (18 maps)

Three regions × 6 maps. Hubs are mother cities; each region also has ≥2 minor settlement maps.

| Region | Hub | Settlements | Fields / borders |
|--------|-----|-------------|------------------|
| Verdant March | `greenwood` | `willowford`, `sanctuarygrove` | `timberroad`, `deepcanopy`, `northwatch` |
| Frost Bastion | `frostkeep` | `stillstone`, `cairnwatch` | `windswept`, `icehollow`, `frostmarch` |
| Tide Courts | `tidecourt` | `redsash`, `cliffhaven` | `brinecoast`, `dunesreach`, `westwharf` |

**Connectivity**

- Contiguous zone edges within each region (FFXI-style walk-off).
- Inter-region contiguous borders: `northwatch` ↔ `frostmarch`, `deepcanopy` ↔ `westwharf`.
- Non-contiguous ferry: `frostkeep` ↔ `tidecourt` (Mandate boat docks).

Combat plugins: Verdant + Tide = `combat.realtime`; Frost = `combat.ordo`.

## Tooling

```bash
# Rebuild the entire stock world from the GDD layout (wipes legacy north/cave/easternshore)
go run ./cmd/genworld

# Merge sanctuary wall patches into overrides for every map
go run ./cmd/genmapwalls
```

## Base chip GID layout

| firstgid | Tileset | Purpose |
|----------|---------|---------|
| 577 | BaseChip_pipo (`base_chip.png`) | Grass, dirt, cobble, cliffs, trees |

See `data/maps/base_chip.tsx`, `internal/game/base_chip.go`, `internal/game/pipoya_tilesets.go`.

### Base chip centers (`base_chip.tsx`)

| Terrain | Center tile | Use |
|---------|-------------|-----|
| Grass Base | 48 | Default walkable ground (GID 625 with firstgid 577) |
| Dirt / Path Base | 112 | Paths, ruins |
| Cliff Ledge | 52 | Blocking rocks |
| Cobblestone | 116 | Haven / sanctuary floors |
| Water | 176 | Water |

## Object types

- `region` — wilderness polygon zone (`id`, `kind`)
- `sanctuary` — safe-zone polygon (`id`, `kind`); legacy: `region` + `sanctuary` bool
- `save_point` — `id`, `name` (**required** inside every sanctuary)
- `job_changer` / service NPC — sanctuary services
- `npc` — combat/service entities
- `exit` — `destMap`, `destX`, `destY`

## Sanctuaries

Every sanctuary region must contain at least one save point. Job masters are optional. Enemies cannot path into or engage players inside sanctuaries.

## Game Designer & APIs

Title → **Game Designer** → admin login (**admin / admin**).

- Paints **overrides** on top of base `.map.json`; base files are not rewritten by the editor.
- Create / enable / disable / remove maps via admin APIs.
- Live registry: `data/cluster.maps.json` (overrides `cluster.json` maps when present).
