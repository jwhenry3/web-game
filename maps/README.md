# World maps

Runtime maps are **server-authoritative** `.map.json` files. The Game Designer edits sparse overrides on top of those bases. The client renders terrain from API layer data (not Tiled assets).

Full stack context: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Editor: [docs/GAME_DESIGNER.md](../docs/GAME_DESIGNER.md).

## Runtime artifacts

| Artifact | Role |
|----------|------|
| `maps/{id}.map.json` | **Loaded by the server** — terrain grids, regions, NPCs, save points, exits, objects |
| `maps/overrides/{id}.json` | Sparse patches from **Game Designer** (tile diffs + objects); hot-reloaded |
| `maps/{id}.server.json` | Per-map server config for maps created in Game Designer |
| `base_chip.tsx` / `base_chip.png` | Base terrain tileset definition (GID centers for paint / walls) |

Loader order (`game.LoadOverworldData`): `.map.json` → else `.tmj` (optional import path) → else legacy paint JSON.

Stock configs point at `.map.json` (e.g. `config/server.json` → `maps/greenwood.map.json`).

## Stock files

| File | Description |
|------|-------------|
| `greenwood.map.json` | Main overworld (160×120 @ 32px) |
| `north.map.json` | Northern Wastes |
| `cave.map.json` / `easternshore.map.json` | Additional maps (cluster registry) |
| `base_chip.tsx` / `base_chip.png` | Base terrain tileset |

Maps created in Game Designer register in `data/cluster.maps.json`.

## Tooling

```bash
# Merge sanctuary wall patches into overrides
go run ./cmd/genmapwalls
```

Optional: `game.ExportMapConfigFromTiled` can still convert an external `.tmj` if you bring one in.

## Base chip GID layout

| firstgid | Tileset | Purpose |
|----------|---------|---------|
| 577 | BaseChip_pipo (`base_chip.png`) | Grass, dirt, cobble, cliffs, trees |

See `maps/base_chip.tsx`, `internal/game/base_chip.go`, `internal/game/pipoya_tilesets.go`.

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

`.map.json` can also store regions / save points / NPCs / exits as first-class arrays; Game Designer works primarily through the **objects** list.

## Sanctuaries

Every sanctuary region must contain at least one save point. Job masters are optional. Enemies cannot path into or engage players inside sanctuaries.

## Game Designer & APIs

Title → **Game Designer** → admin login (**admin / admin**).

- Paints **overrides** on top of base `.map.json` (`maps/overrides/{mapId}.json`); base files are not rewritten.
- Editable layers: `ground`, `collision`, plus objects.
- `PUT /api/admin/maps/{id}/overrides` — save + hot-reload; clients get `map_config`.
- `GET /api/maps`, `GET /api/maps/{id}` — public map config for client prefetch.
- Create / enable / disable / remove maps via admin APIs (see [docs/GAME_DESIGNER.md](../docs/GAME_DESIGNER.md)).

When overrides exist, the live game renders the patched ground layer to match the editor.
