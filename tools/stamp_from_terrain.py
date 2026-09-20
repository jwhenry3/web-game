#!/usr/bin/env python3
"""Derive map-feature stamp placements from a map's tile terrain — the
hand-drawn stamp layer that reproduces what the tiled terrain intends:
water bodies get water features, biome fills get land patches (sand, snow,
rock, grass), and town regions get building clusters.

Approach:

- Each ground gid classifies to a category (grass/sand/snow/rock/water) or
  None — trees and scatter props vote transparent, since they sit on top of
  the biome ground and don't say what it is.
- The tile grid is BSP-split until each leaf is >= PURE one category (of
  classified cells), clamped to 8..32 tiles per side. Each leaf gets one
  stamp of the matching feature family, scaled to cover the leaf with
  overlap, with deterministic variant/rotation/flip from a position hash —
  soft-alpha edges blend across leaf borders over the surviving tile base.
- Regions with kind "town" get building stamps on a jittered grid; *_camp
  ids use huts only, named towns mix houses with a central tower.

Output: data/maps/<id>.stamps.json plus the client mirror at
wails/frontend/public/assets/maps/<id>.stamps.json. Deterministic for a
given map + seed — rerun after terrain or catalog changes, then bake.

    python tools/stamp_from_terrain.py [--map data/maps/clara_mundi.map.json]
"""

import argparse
import json
import os
import random
import zlib

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG_PATH = os.path.join(
    ROOT, "wails", "frontend", "public", "assets", "map-features", "catalog.json")
PUBLIC_MAPS = os.path.join(ROOT, "wails", "frontend", "public", "assets", "maps")

TILE = 32
MIN_LEAF = 8    # tiles — boundary leaves never split past this
MAX_LEAF = 32   # tiles — uniform areas cap here for consistent texture density
PURE = 0.85     # majority share (of classified cells) that stops splitting
OVERLAP = 1.25  # stamp scale slack so soft edges overlap leaf borders

# GID layout — internal/game/pipoya_tiles.go + mundi_tiles.go.
WATER_LO, WATER_HI = 2169, 5241   # Water_pipo animated sheet
GRASS_LO, GRASS_HI = 1641, 2169   # Grass_pipo sheet
FLOWER_LO, FLOWER_HI = 5241, 5289  # Flower_pipo — scatter props
DIRT_LO, DIRT_HI = 5289, 5625     # Dirt_pipo sheet
BASECHIP = 577                    # BaseChip_pipo firstgid
MUNDI = 6000                      # MundiTerrain firstgid

# BaseChip locals (gid - 577). Fills vote; trees/bushes/scatter vote None —
# they're overlays, the ground under them comes from the neighbors.
BASECHIP_SAND = {5}                          # dirt path fill
BASECHIP_ROCK = set(range(115, 133)) | set(range(256, 261))  # cobble/stone/wall
BASECHIP_WATER = {58, 59}                    # water-grass chips
BASECHIP_PROP = set(range(8, 57))            # trees 8-35, bushes+props 40-56
# Mundi locals: 0-2 snow family, 3-4 sand, 5-6 rock, 7 peat, >=8 props.
MUNDI_SNOW = {0, 1, 2}
MUNDI_SAND = {3, 4}
MUNDI_ROCK = {5, 6}
MUNDI_GRASS = {7}

CATS = ("grass", "sand", "snow", "rock", "water")
CAT_IX = {c: i for i, c in enumerate(CATS)}
# Category -> catalog feature id prefix.
CAT_PREFIX = {
    "water": "water_",
    "sand": "land_sand_",
    "snow": "land_snow_",
    "rock": "land_rock_",
    "grass": "land_grass_",
}
# Painter order: land patches first, water overlaps shorelines last.
DRAW_ORDER = ("grass", "snow", "rock", "sand", "water")


def classify(gid):
    """Tile gid -> ground category name, or None for overlay props."""
    if gid <= 0:
        return None
    if gid < BASECHIP:
        return "water"  # WaterFall sheet
    if gid < GRASS_LO:
        local = gid - BASECHIP
        if local in BASECHIP_PROP:
            return None
        if local in BASECHIP_WATER:
            return "water"
        if local in BASECHIP_SAND:
            return "sand"
        if local in BASECHIP_ROCK:
            return "rock"
        return "grass"
    if gid < WATER_LO:
        return "grass"
    if gid < WATER_HI:
        return "water"
    if gid < FLOWER_HI:
        return None
    if gid < DIRT_HI:
        return "sand"
    local = gid - MUNDI
    if local in MUNDI_SNOW:
        return "snow"
    if local in MUNDI_SAND:
        return "sand"
    if local in MUNDI_ROCK:
        return "rock"
    if local in MUNDI_GRASS:
        return "grass"
    return None  # mundi trees/props


def category_grid(ground, cols, rows):
    """uint8 grid of CAT_IX+1 (0 = unclassified prop cell) via gid LUT."""
    max_gid = max(int(max(ground)), MUNDI + 64) + 1
    lut = np.zeros(max_gid + 1, dtype=np.uint8)
    for gid in range(max_gid + 1):
        cat = classify(gid)
        if cat:
            lut[gid] = CAT_IX[cat] + 1
    g = np.clip(np.asarray(ground, dtype=np.int32), 0, max_gid)
    return lut[g.reshape(rows, cols)]


def integral_masks(grid):
    """Per-category summed-area tables — rect counts in O(1)."""
    tables = {}
    for cat, ix in CAT_IX.items():
        m = (grid == ix + 1).astype(np.int64)
        tables[cat] = np.pad(m, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    return tables


def rect_count(table, x0, y0, x1, y1):
    return int(table[y1, x1] - table[y0, x1] - table[y1, x0] + table[y0, x0])


def load_features():
    with open(CATALOG_PATH) as f:
        catalog = json.load(f)["features"]
    by_cat = {}
    for ft in catalog:
        by_cat.setdefault(ft["category"], []).append(ft)
    return catalog, by_cat


def features_for(cat, by_cat):
    """Ground-category features — CAT_PREFIX selects the land_* family."""
    prefix = CAT_PREFIX[cat]
    return [f for f in by_cat.get("water" if cat == "water" else "land", [])
            if f["id"].startswith(prefix)]


def rng_for(map_id, *coords):
    return random.Random(zlib.crc32(f"{map_id}:{':'.join(map(str, coords))}".encode()))


def emit_leaf(stamps, map_id, cat, feats, x0, y0, x1, y1):
    """One stamp covering the leaf rect (tile coords), deterministic on
    position so re-runs are stable."""
    rng = rng_for(map_id, "leaf", x0, y0, x1, y1)
    f = feats[rng.randrange(len(feats))]
    wpx, hpx = (x1 - x0) * TILE, (y1 - y0) * TILE
    scale = max(wpx / f["w"], hpx / f["h"]) * OVERLAP * rng.uniform(0.95, 1.05)
    cx = (x0 + x1) / 2 * TILE + rng.uniform(-0.08, 0.08) * wpx
    cy = (y0 + y1) / 2 * TILE + rng.uniform(-0.08, 0.08) * hpx
    stamps[cat].append({
        "feature": f["id"],
        "x": round(cx, 1),
        "y": round(cy, 1),
        # No rotation — arbitrary angles blur the pixel art and the sheared
        # edges don't tile; flipX alone gives orientation variety.
        "rotation": 0,
        "scale": round(scale, 3),
        "flipX": rng.random() < 0.5,
    })


def split(stamps, map_id, tables, by_cat, x0, y0, x1, y1):
    """BSP-split the tile rect until each leaf is pure enough or MIN_LEAF."""
    w, h = x1 - x0, y1 - y0
    counts = {c: rect_count(t, x0, y0, x1, y1) for c, t in tables.items()}
    classified = sum(counts.values())
    if classified == 0:
        if max(w, h) <= MIN_LEAF:
            return  # all-prop pocket — neighbors' stamps cover it
    else:
        cat = max(counts, key=counts.get)
        if max(w, h) <= MAX_LEAF and (max(w, h) <= MIN_LEAF
                                    or counts[cat] >= PURE * classified):
            emit_leaf(stamps, map_id, cat, features_for(cat, by_cat), x0, y0, x1, y1)
            return
    # Split the longest side in half (tile-aligned).
    if w >= h:
        mid = x0 + w // 2
        if mid == x0:
            if classified:
                emit_leaf(stamps, map_id, max(counts, key=counts.get),
                          features_for(max(counts, key=counts.get), by_cat),
                          x0, y0, x1, y1)
            return
        split(stamps, map_id, tables, by_cat, x0, y0, mid, y1)
        split(stamps, map_id, tables, by_cat, mid, y0, x1, y1)
    else:
        mid = y0 + h // 2
        if mid == y0:
            if classified:
                emit_leaf(stamps, map_id, max(counts, key=counts.get),
                          features_for(max(counts, key=counts.get), by_cat),
                          x0, y0, x1, y1)
            return
        split(stamps, map_id, tables, by_cat, x0, y0, x1, mid)
        split(stamps, map_id, tables, by_cat, x0, mid, x1, y1)


def town_buildings(stamps, map_id, region, by_cat, poi_pts):
    """Jittered building cluster inside a town region's tile rect. Keeps a
    clear plaza around POI points (save crystals, job masters) — buildings
    must never swallow the interactables."""
    x0 = region["minC"] * TILE
    y0 = region["minR"] * TILE
    x1 = (region["maxC"] + 1) * TILE
    y1 = (region["maxR"] + 1) * TILE
    inset = TILE * 2
    x0, y0, x1, y1 = x0 + inset, y0 + inset, x1 - inset, y1 - inset
    rng = rng_for(map_id, "town", region["id"])
    camp = region["id"].endswith("_camp")
    feats = by_cat.get("building", [])
    pick = lambda prefix: [f for f in feats if f["id"].startswith(f"building_{prefix}")]
    huts, houses, towers = pick("hut"), pick("house"), pick("tower")

    keep_clear = 130
    clear = lambda x, y: all(
        (x - px) ** 2 + (y - py) ** 2 >= keep_clear ** 2
        for px, py in poi_pts)

    spacing = 240  # semi-iso buildings are ~140-230px wide
    placed = 0
    yy = y0
    row = 0
    while yy < y1:
        xx = x0 + (spacing / 2 if row % 2 else 0)
        while xx < x1:
            bx = xx + rng.uniform(-36, 36)
            by = yy + rng.uniform(-26, 26)
            if rng.random() < 0.75 and clear(bx, by):
                pool = huts if camp else (houses + huts)
                f = pool[rng.randrange(len(pool))]
                stamps["building"].append({
                    "feature": f["id"],
                    "x": round(bx, 1),
                    "y": round(by, 1),
                    # Buildings stay axis-aligned — rotation reads as tilt.
                    "rotation": 0,
                    "scale": round(rng.uniform(0.9, 1.15), 3),
                    "flipX": rng.random() < 0.5,
                })
                placed += 1
            xx += spacing
        yy += spacing
        row += 1
    # Named towns get one tower on the square's edge — off the center so it
    # never sits on the crystal/job master.
    if not camp and towers:
        f = towers[rng.randrange(len(towers))]
        tx = (x0 + x1) / 2 + spacing * 0.9 + rng.uniform(-16, 16)
        ty = (y0 + y1) / 2 - spacing * 0.45 + rng.uniform(-16, 16)
        if tx > x1 or not clear(tx, ty):
            tx = (x0 + x1) / 2 - spacing * 0.9 + rng.uniform(-16, 16)
        if clear(tx, ty):
            stamps["building"].append({
                "feature": f["id"],
                "x": round(tx, 1),
                "y": round(ty, 1),
                "rotation": 0,
                "scale": round(rng.uniform(0.95, 1.1), 3),
                "flipX": False,
            })
            placed += 1
    return placed


def stamp_map(map_path, out_path=None, mirror=True, seed=1, verbose=True,
              coverage=True):
    """coverage=True adds the ground-fill BSP stamps; False emits only
    discrete objects (town buildings) — ground coverage belongs to the paint
    mask layer (paint_from_terrain.py) which bakes far faster."""
    with open(map_path) as f:
        m = json.load(f)
    map_id = os.path.basename(map_path).split(".")[0]
    cols, rows = m["cols"], m["rows"]
    ts = m.get("tile_size") or TILE
    if ts != TILE:
        raise ValueError(f"{map_id}: expected tile_size {TILE}, got {ts}")
    ground = m.get("terrain", {}).get("ground")
    if not ground or len(ground) != cols * rows:
        raise ValueError(f"{map_id}: missing/short terrain.ground")

    _catalog, by_cat = load_features()
    grid = category_grid(ground, cols, rows)
    tables = integral_masks(grid)

    # POI points (save crystals, job masters) get a clear plaza — buildings
    # keep this radius free.
    poi_pts = []
    for poi in list(m.get("save_points", [])) + list(m.get("job_changers", [])):
        t = poi.get("tile")
        if isinstance(t, list) and len(t) == 2:
            poi_pts.append(((t[0] + 0.5) * TILE, (t[1] + 0.5) * TILE))

    stamps = {c: [] for c in CATS}
    stamps["building"] = []
    if coverage:
        split(stamps, map_id, tables, by_cat, 0, 0, cols, rows)
    for reg in m.get("regions", []):
        if reg.get("kind") == "town":
            town_buildings(stamps, map_id, reg, by_cat, poi_pts)

    doc = {"stamps": [s for cat in DRAW_ORDER for s in stamps[cat]]}
    doc["stamps"].extend(stamps["building"])

    out_path = out_path or map_path.replace(".map.json", ".stamps.json")
    blob = json.dumps(doc, indent=None, separators=(",", ":")) + "\n"
    with open(out_path, "w") as f:
        f.write(blob)
    if mirror:
        os.makedirs(PUBLIC_MAPS, exist_ok=True)
        with open(os.path.join(PUBLIC_MAPS, os.path.basename(out_path)), "w") as f:
            f.write(blob)
    if verbose:
        counts = {c: len(v) for c, v in stamps.items() if v}
        print(f"stamped {map_id}: {counts} -> {out_path}")
    return doc


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--map", default=os.path.join(
        ROOT, "data", "maps", "clara_mundi.map.json"))
    ap.add_argument("--out", help="stamps output path (default: sibling .stamps.json)")
    ap.add_argument("--no-mirror", action="store_true",
                    help="don't mirror to public/assets/maps")
    ap.add_argument("--coverage", action="store_true",
                    help="also emit ground-fill coverage stamps (obsolete once "
                         "the paint mask exists — slow to bake)")
    args = ap.parse_args()
    stamp_map(args.map, args.out, mirror=not args.no_mirror,
              coverage=args.coverage)


if __name__ == "__main__":
    main()
