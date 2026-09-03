# World maps (Tiled)

Maps are authored as **Tiled JSON** (`.tmj`) and loaded by the game server as the single source of truth.

## Files

| File | Description |
|------|-------------|
| `greenwood.tmj` | Main overworld (160×120 tiles @ 32px) |
| `north.tmj` | Northern Wastes |
| `base_chip.tsx` | **Tileset config** — terrain types, autotile centers, collision/water props |
| `base_chip.png` | Base terrain tileset image (orchestrated by `base_chip.tsx`) |
| `pipoya_waterfall.png` | Animated waterfall strips (optional detail) |
| `pipoya_grass.png` | Animated grass overlay |
| `pipoya_water.png` | Animated water autotiles |
| `pipoya_flower.png` | Flower decoration decals |
| `pipoya_longgrass.png` | Long-grass autotile patches (type3) |

Regenerate from legacy paint JSON:

```bash
go run ./cmd/genmaps
```

This reads `maps/base_chip.tsx` for terrain/autotile rules, copies overlay Pipoya assets from `compressed/pipoya/`, and publishes to `web/public/assets/maps/`.

## Tileset GID layout

| firstgid | Tileset | Purpose |
|----------|---------|---------|
| 1 | waterfall | Waterfall animation |
| 577 | BaseChip_pipo (`base_chip.png`) | Grass, dirt, cobble, cliffs, trees — from `base_chip.tsx` |
| 1641 | grass | Animated grass overlay |
| 2169 | water | Animated lakes/rivers on `water` |
| 5241 | flower | Flower decals on `grass` |
| 5289 | longgrass | Tall grass patches on `grass` |

See `maps/base_chip.tsx`, `internal/game/base_chip.go`, and `internal/game/pipoya_tilesets.go`.

## Base chip terrain (`base_chip.tsx`)

| Terrain | Center tile | Use |
|---------|-------------|-----|
| Grass Base | 48 | Default walkable ground |
| Dirt / Path Base | 112 | Paths, ruins |
| Cliff Ledge | 52 | Blocking rocks (`collides`) |
| Cobblestone | 116 | Haven / sanctuary floors |
| Water | 176 | Water (`collides`, `water`) |

## Tiled layer conventions (bottom → top)

| Layer | Tilesets | Purpose |
|-------|----------|---------|
| **ground** | BaseChip_pipo | Autotiled floor terrain |
| **grass** | flower, longgrass | Flowers, tall grass |
| **water** | water | Animated water bodies |
| **water_grass** | BaseChip_pipo | Shoreline grass at water edges |
| **tree** | BaseChip_pipo | Tree canopies (collision on `collision`) |
| **collision** | — | Non-zero = blocked (server) |
| **objects** | — | Regions, POIs, NPCs, exits |

Map properties: `wanderMinDistance`, `wanderPauseSec`, `wanderSpeed`.

Object types on **objects** layer:

- `region` — props: `id`, `sanctuary` (bool), `kind` (town/camp/…)
- `save_point` — props: `id`, `name` (required inside every sanctuary)
- `job_changer` — props: `id`, `name` (optional, sanctuary only)
- `npc` — props: `id`, `kind`, `name`, `level`, `region`
- `exit` — props: `destMap`, `destX`, `destY`

## Sanctuaries

Every sanctuary region must contain at least one save point. Job masters are optional (towns yes, camps maybe not). Enemies cannot path into or engage players inside sanctuaries.

## In-game map editor (admin)

Set `ADMIN_SECRET` in the server environment (optional legacy fallback), or sign in with the default **admin / admin** account.

- Title screen → **Map Editor** → admin login
- Side panel tool groups: Terrain, Collision, NPCs & POIs, Scene & Regions, Prefabs (coming soon)

- Paints **sparse overrides** on top of the base `.tmj` (stored in `maps/overrides/{mapId}.json`)
- Loads **ground** and **collision** from the base `.tmj`; saves only diffs from that base
- Editable layers: `ground`, `collision`
- `PUT /api/admin/maps/{id}/overrides` — save and hot-reload the map server; connected clients receive `map_config`
- `GET /api/maps` — public map list with terrain, overrides, and tiled asset paths (for client prefetch)
- `GET /api/maps/{id}` — public map config for one map
- When overrides exist, the game renders the patched **ground** layer (matching the editor) instead of the full genmaps decorative stack

Base maps from `go run ./cmd/genmaps` or Tiled are never modified directly.
