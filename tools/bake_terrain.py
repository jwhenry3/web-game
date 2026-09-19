#!/usr/bin/env python3
"""Bake terrain chunks — pre-render a map's ground layer into large PNGs so
the client doesn't rasterize tiles at scene startup.

Mirrors wails/frontend/src/world/terrainRaster.ts exactly: transparent props
sit on a grass underlay, 2x2 tree canopy tops go on a separate overhead image
(walk-under depth), and unresolved GIDs fall back to a flat grass fill.

    python tools/bake_terrain.py [--map data/maps/clara_mundi.map.json]

Outputs under wails/frontend/public/assets/baked/<map_id>/:
    manifest.json        — map dims, terrain hash, chunk lists
    base_<cx>_<cy>.png   — ground layer for 64x64-tile chunk (cx,cy)
    over_<cx>_<cy>.png   — canopy tops (only written when non-empty)

Run after regenerating the map (gencontinent) or editing terrain. The client
verifies manifest.terrain_hash against the live layers and falls back to
runtime rasterization when it doesn't match.
"""

import argparse
import json
import os
import sys

from PIL import Image

T = 32            # tile px
CHUNK = 64        # tiles per chunk side — must match TERRAIN_CHUNK_TILES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILESETS = os.path.join(ROOT, "wails", "frontend", "public", "assets", "tilesets")
OUT_BASE = os.path.join(ROOT, "wails", "frontend", "public", "assets", "baked")

# Tileset catalog — mirrors PIPOYA_TILESETS in world/pipoyaTilesets.ts plus the
# MundiTerrain supplemental sheet (internal/game/mundi_tiles.go).
SHEETS = [  # (id, firstgid, tilecount, columns, image path under tilesets/)
    ("waterfall", 1, 576, 32, "pipoya/WaterFall_pipo.png"),
    ("basechip", 577, 1064, 8, "pipoya/BaseChip_pipo.png"),
    ("grass", 1641, 528, 8, "pipoya/Grass_pipo.png"),
    ("water", 2169, 3072, 64, "pipoya/Water_pipo.png"),
    ("flower", 5241, 48, 8, "pipoya/Flower_pipo.png"),
    ("dirt", 5289, 336, 8, "pipoya/Dirt_pipo.png"),
    ("mundi", 6000, 64, 8, "mundi/MundiTerrain.png"),
]

BASE_CHIP_FIRST_GID = 577
GRASS_FILL_GID = BASE_CHIP_FIRST_GID + 0
DIRT_FILL_GID = BASE_CHIP_FIRST_GID + 5

# Solid BaseChip fills that fully cover a cell — mirrors SOLID_BASECHIP_LOCALS.
SOLID_BASECHIP_LOCALS = {
    0, 1, 2,
    5, 7, 115,
    116, 117, 118, 119, 120, 122, 123, 124, 125, 126,
    128, 129, 130, 131, 132,
    256, 257, 258, 259, 260,
}

# Sheets whose locals 8-15 are 2x2 tree canopy tops (walk-under layer).
CANOPY_SHEETS = {"basechip", "mundi"}

FALLBACK_RGB = (26, 58, 34)  # flat grass — matches client FILL['.']

GRASS_CHAR_SOLID = {0, 1, 2}
DIRT_LOCALS = {5, 115}


def load_sheets():
    sheets = []
    for sid, firstgid, tilecount, cols, rel in SHEETS:
        path = os.path.join(TILESETS, rel)
        if not os.path.exists(path):
            print(f"  warn: missing tileset {rel} — its tiles use the fallback fill", file=sys.stderr)
            continue
        sheets.append({
            "id": sid,
            "firstgid": firstgid,
            "tilecount": tilecount,
            "cols": cols,
            "img": Image.open(path).convert("RGBA"),
        })
    # Highest firstgid first so local index resolves to the correct sheet.
    sheets.sort(key=lambda s: -s["firstgid"])
    return sheets


def resolve(gid, sheets):
    """gid -> (sheet, local, tile Image) or None — mirrors resolvePipoyaTile."""
    raw = gid & 0x1FFFFFFF
    if raw <= 0:
        return None
    for s in sheets:
        if raw < s["firstgid"]:
            continue
        local = raw - s["firstgid"]
        if local < 0 or local >= s["tilecount"]:
            continue
        sx = (local % s["cols"]) * T
        sy = (local // s["cols"]) * T
        return s, local, s["img"].crop((sx, sy, sx + T, sy + T))
    return None


def is_canopy(sheet_id, local):
    return sheet_id in CANOPY_SHEETS and 8 <= local <= 15


def needs_underlay(sheet_id, local):
    """Transparent tiles that need a ground fill painted beneath them."""
    if sheet_id == "basechip":
        return local not in SOLID_BASECHIP_LOCALS
    if sheet_id == "mundi":
        return local >= 8  # fills are 0-7; trees/props are transparent
    return False


def pick_canopy_underlay(ground):
    """Dirt-vs-grass underlay for canopy cells — mirrors pickGroundUnderlayGid."""
    dirt = grass = 0
    for i in range(0, len(ground), 97):
        local = (ground[i] & 0x1FFFFFFF) - BASE_CHIP_FIRST_GID
        if local in GRASS_CHAR_SOLID:
            grass += 1
        elif local in DIRT_LOCALS:
            dirt += 1
    return DIRT_FILL_GID if dirt > grass else GRASS_FILL_GID


def terrain_hash(ground, collision):
    """Mirrors the numeric hash in terrainLayerKey (terrainRaster.ts)."""
    h = len(ground) & 0xFFFFFFFF
    for i in range(0, len(ground), 97):
        h = ((h * 31) + (ground[i] & 0xFFFFFFFF)) & 0xFFFFFFFF
    for i in range(0, len(collision), 97):
        h = ((h * 31) + (collision[i] & 0xFFFFFFFF)) & 0xFFFFFFFF
    return h


def bake(map_path: str, out_base: str, chunk: int) -> None:
    with open(map_path) as f:
        m = json.load(f)
    cols, rows = m["cols"], m["rows"]
    ground = m["terrain"]["ground"]
    collision = m["terrain"].get("collision", [0] * (cols * rows))
    if len(ground) != cols * rows:
        raise SystemExit(f"terrain.ground length {len(ground)} != {cols}x{rows}")

    map_id = os.path.basename(map_path)
    if map_id.endswith(".map.json"):
        map_id = map_id[: -len(".map.json")]
    else:
        map_id = os.path.splitext(map_id)[0]
    out_dir = os.path.join(out_base, map_id)
    os.makedirs(out_dir, exist_ok=True)

    sheets = load_sheets()
    fallback = Image.new("RGBA", (T, T), FALLBACK_RGB + (255,))
    tile_cache = {}

    def tile_img(gid):
        if gid not in tile_cache:
            hit = resolve(gid, sheets)
            tile_cache[gid] = hit
        return tile_cache[gid]

    canopy_underlay_hit = tile_img(pick_canopy_underlay(ground))
    canopy_underlay = canopy_underlay_hit[2] if canopy_underlay_hit else fallback
    grass_underlay_hit = tile_img(GRASS_FILL_GID)
    grass_underlay = grass_underlay_hit[2] if grass_underlay_hit else fallback

    base_keys, over_keys = [], []
    ncx = (cols + chunk - 1) // chunk
    ncy = (rows + chunk - 1) // chunk
    for cy in range(ncy):
        for cx in range(ncx):
            c0, r0 = cx * chunk, cy * chunk
            w = min(chunk, cols - c0)
            h = min(chunk, rows - r0)
            base = Image.new("RGBA", (w * T, h * T))
            over = Image.new("RGBA", (w * T, h * T))
            over_used = False
            for r in range(r0, r0 + h):
                i0 = r * cols
                for c in range(c0, c0 + w):
                    gid = ground[i0 + c]
                    x, y = (c - c0) * T, (r - r0) * T
                    hit = tile_img(gid)
                    if hit and is_canopy(hit[0]["id"], hit[1]):
                        base.paste(canopy_underlay, (x, y))
                        over.paste(hit[2], (x, y), hit[2])
                        over_used = True
                        continue
                    if hit:
                        if needs_underlay(hit[0]["id"], hit[1]):
                            base.paste(grass_underlay, (x, y))
                        base.paste(hit[2], (x, y), hit[2])
                    else:
                        base.paste(fallback, (x, y))
            key = f"{cx},{cy}"
            base.save(os.path.join(out_dir, f"base_{cx}_{cy}.png"), optimize=True)
            base_keys.append(key)
            if over_used:
                over.save(os.path.join(out_dir, f"over_{cx}_{cy}.png"), optimize=True)
                over_keys.append(key)

    manifest = {
        "map": map_id,
        "tile_size": T,
        "chunk_tiles": chunk,
        "cols": cols,
        "rows": rows,
        "terrain_hash": terrain_hash(ground, collision),
        "base": base_keys,
        "over": over_keys,
    }
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f)
    print(f"baked {len(base_keys)} chunks ({len(over_keys)} with canopy) -> {out_dir}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Bake terrain chunks to PNGs")
    ap.add_argument("--map", default=os.path.join(ROOT, "data", "maps", "clara_mundi.map.json"))
    ap.add_argument("--out", default=OUT_BASE)
    ap.add_argument("--chunk", type=int, default=CHUNK)
    args = ap.parse_args()
    bake(args.map, args.out, args.chunk)


if __name__ == "__main__":
    main()
