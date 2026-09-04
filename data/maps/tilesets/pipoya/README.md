# Pipoya tilesets

Royalty-free Pipoya RPG tiles (32×32) used by Clara Mundi maps.

| File | Role |
|------|------|
| `catalog.json` | firstgid registry (matches `samplemap.tmx` + Dirt overlay) |
| `BaseChip_pipo.*` | Primary ground tileset (`firstgid` **577**) — same IDs as `data/maps/base_chip.*` |
| `Grass_pipo.*` | Animated/autotile grass (`1641`) |
| `Water_pipo.*` | Water autotiles (`2169`) |
| `WaterFall_pipo.*` | Waterfalls (`1`) |
| `Flower_pipo.*` | Flower overlays (`5241`) |
| `Dirt_pipo.*` | Dirt/path overlays (`5289`) |
| `samplemap.tmx` | Official Pipoya sample (paths rewritten to safe filenames) |

Client copies live under `wails/frontend/public/assets/tilesets/pipoya/` and are blitted by GID in `WorldScene`.

Credit: [Pipoya FREE RPG Tileset 32x32](https://pipoya.itch.io/pipoya-rpg-tileset-32x32) — free for commercial use; do not redistribute the raw assets as a standalone pack.
