# Game Designer

**Game Designer** is the in-app world editor (admin tool). It paints terrain, places entities and regions, manages prefabs/entity catalogs, and can create or take maps online/offline without restarting the cluster for config file churn.

Architecture context: [ARCHITECTURE.md](./ARCHITECTURE.md). Map formats: [maps/README.md](../maps/README.md).

## Access

1. Title screen → **Game Designer**
2. Admin login (default account **admin / admin**, created on server start if missing)
3. JWT must belong to an account with `is_admin` (legacy `ADMIN_SECRET` / `X-Admin-Key` still accepted by the API)

Prefer **http://localhost:5173** during development so you get the live Vite bundle. `:8080` serves `web/dist` and may lag behind.

## UI layout

| Area | Component | Purpose |
|------|-----------|---------|
| Top chrome | `MapEditorChrome` | Map picker, save, New map / Enable / Disable / Remove, Terrain · Entity · Region modes |
| Hierarchy | `MapEditorHierarchy` | Object tree for the current map |
| Toolbox | `MapEditorToolbox` | Terrain palette, prefabs, entities, region tools |
| Canvas | `MapEditorScreen` viewport | Pan/zoom paint & place surface |
| Inspector | `MapEditorInspector` | Properties for the selected object |
| Prefab / entity pages | `PrefabEditorView`, `EntityEditorPage` | Catalog editors (workspace nav) |

### Interact modes

| Mode | Focus |
|------|--------|
| **Terrain** | Ground GID paint, collision block/walk |
| **Entity** | NPCs, save points, prefabs, items, quest triggers |
| **Region** | Sanctuary / region polygons, scene transitions (exits) |

### Canvas controls

| Action | Input |
|--------|--------|
| Zoom | Mouse wheel (toward cursor) |
| Pan | Middle-drag, right-drag, or **Space** + left-drag |
| Select | **V** / select tool; hierarchy click focuses camera |
| Cancel place | **Esc** or click outside the map (placement keepers use `data-map-editor-keep-placement`) |

Space is **not** stolen while focus is in an input, textarea, or select.

## Object types

Placed on the objects layer (editor + `.map.json` / overrides):

| Type | Notes |
|------|--------|
| `region` / sanctuary | Bounds; `sanctuary` + `kind` props; every sanctuary needs a save point |
| `save_point` | Crystal; `id` + `name` |
| `job_changer` | Optional; sanctuary only |
| `npc` | Combat or service NPCs; `region`, level, kind |
| `exit` | Scene transition / portal; `destMap`, `destX`, `destY` |
| Prefab stamps | Local catalog → stamped tiles + objects |

Selecting a catalog entity or prefab enters **place** mode immediately (no separate “Place on map” step).

## Map lifecycle

Chrome actions (world mode):

| Action | API | Result |
|--------|-----|--------|
| **New map** | `POST /api/admin/maps` | Blank grass map + sanctuary + spawn crystal; `maps/{id}.map.json`, `maps/{id}.server.json`; registry update; node starts |
| **Enable** | `POST …/enable` | Mark enabled, start node |
| **Disable** | `POST …/disable` | Evacuate players, stop node |
| **Remove** | `DELETE …/{id}` | Evacuate, stop, delete registry entry + map files |

Ids: lowercase letter start, then letters/digits/underscore (`^[a-z][a-z0-9_]{1,31}$`). Size defaults 80×60 (min 16×16, max 512×512).

Switching the map dropdown reloads terrain/objects and resets pan/selection for that map.

## Saving

Save writes **sparse overrides** only — base `.map.json` is not rewritten:

1. Diff ground/collision against the loaded base.
2. If objects changed, include full object list in the override.
3. `PUT /api/admin/maps/{id}/overrides` → `maps/overrides/{id}.json`.
4. Map node hot-reloads; connected players get updated `map_config`.

Disabled maps cannot be saved until enabled. Clear overrides with `DELETE …/overrides`.

## Data the editor sees

`GET /api/admin/maps` returns each map’s metadata, full terrain grids, and objects. When a `.map.json` has regions/POIs but an empty `objects` array, the server **synthesizes** editor objects so sanctuaries and crystals appear in the hierarchy.

Client: `web/src/net/adminMaps.ts`.

## Prefabs & entities

- Prefabs and entity definitions are stored in **browser local storage** (designer catalogs), then stamped into map overrides when placed.
- Prefab editor and entity editor are separate workspace pages from the main map canvas.

## Related server pieces

| Concern | Location |
|---------|----------|
| Admin HTTP | `internal/proxy/admin_maps.go` |
| Create/enable/disable/remove | `internal/proxy/lifecycle.go` |
| Blank map template | `internal/game/blank_map.go` |
| Override I/O + reload | `internal/game/map_override.go`, `mapnode.ReloadOverworld` |
| Registry persistence | `internal/cluster` → `data/cluster.maps.json` |
