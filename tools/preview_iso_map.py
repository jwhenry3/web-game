#!/usr/bin/env python3
"""Preview the isometric renderer faithfully: build the orthogonal ground
raster (what rasterizeIsoChunk draws), apply the same S(1,0.5)*R45*sqrt(2)
affine the scene's container chain applies, then composite billboard props
at their projected anchors sorted by projected Y (the depth order).

    python tools/preview_iso_map.py [map.json] [out.png] [c0 r0 w h]
"""
import json, sys
from PIL import Image

MAP = sys.argv[1] if len(sys.argv) > 1 else "data/maps/clara_mundi.map.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "C:/tmp/iso_preview.png"
C0, R0 = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (560, 330)
W, H = (int(sys.argv[5]), int(sys.argv[6])) if len(sys.argv) > 6 else (70, 50)

T = 32
SHEET = Image.open("wails/frontend/public/assets/tilesets/iso/IsoTiles.png").convert("RGBA")
ATLAS = json.load(open("wails/frontend/public/assets/tilesets/iso/iso_tiles.json"))
PW, PH = ATLAS["prop"]

MUNDI_FILLS = ["snow", "packed_snow", "ice", "dune", "beach", "scree", "ash", "peat"]
MUNDI_TREES = {8: "pine", 10: "pine_snow", 12: "palm", 14: "dead_grey"}
MUNDI_PROPS = {24: "cactus_tall", 25: "cactus_round", 26: "sage", 27: "bush",
               28: "reeds", 29: "reeds", 30: "ice_crystal", 31: "boulder",
               32: "spire", 33: "snow_drift", 34: "fern", 35: "vine",
               36: "snowy_rock", 37: "stump", 38: "mud_mound", 39: "driftwood",
               40: "wet_rock", 41: "shells", 42: "obsidian", 43: "lava_rock",
               44: "frost_fern", 45: "mossy_rock", 46: "skull", 47: "marker",
               48: "mushroom_giant"}
BASE_FILLS = {0: "grass", 5: "dirt", 116: "cobble", 176: "water", 256: "rock"}
BASE_TREES = {8: "tree_green", 10: "tree_dark", 12: "tree_autumn", 14: "tree_dead"}
BASE_BIG = {24: "tree_green", 26: "tree_dark", 28: "tree_autumn", 30: "tree_dead"}
BASE_PROPS = {40: "bush", 41: "bush", 42: "bush", 43: "bush_dead", 44: "wet_rock",
              45: "marker", 46: "driftwood", 47: "driftwood", 62: "mossy_rock",
              63: "boulder", 65: "boulder", 67: "boulder", 68: "stump", 71: "wet_rock"}
BASE_DECALS = set(range(48, 62)) | {64, 66, 69, 70}


def cell_kind(gid):
    raw = gid & 0x1FFFFFFF
    if raw <= 0:
        return ("skip", None)
    if raw >= 6000:
        local = raw - 6000
        if local < 8:
            return ("fill", MUNDI_FILLS[local])
        if local in MUNDI_TREES:
            return ("tree", MUNDI_TREES[local])
        if local <= 23:
            return ("skip", None)
        return ("prop", MUNDI_PROPS.get(local))
    if raw >= 2169:
        return ("fill", "water") if raw < 5241 or raw >= 5289 else ("decal", None)
    if raw >= 1641:
        return ("decal", None)
    if raw >= 577:
        local = raw - 577
        if local in BASE_FILLS:
            return ("fill", BASE_FILLS[local])
        if local in BASE_BIG:
            return ("tree", BASE_BIG[local], True)
        if local in BASE_TREES:
            return ("tree", BASE_TREES[local])
        if 8 <= local <= 39:
            return ("skip", None)
        if local in BASE_PROPS:
            return ("prop", BASE_PROPS[local])
        if local in BASE_DECALS:
            return ("decal", None)
        return ("fill", "grass")
    return ("fill", "water")


def fill_tile(name):
    r = ATLAS["fills"][name]
    return SHEET.crop((r["x"], r["y"], r["x"] + T, r["y"] + T))


def prop_tile(name):
    r = ATLAS["props"][name]
    return SHEET.crop((r["x"], r["y"], r["x"] + PW, r["y"] + PH))


data = json.load(open(MAP))
cols, rows = data["cols"], data["rows"]
ground = data.get("terrain", {}).get("ground") or data.get("ground")


def gid_at(c, r):
    return ground[r * cols + c] if 0 <= c < cols and 0 <= r < rows else 0


def underlay(c, r):
    votes = {}
    for dc in (-1, 0, 1):
        for dr in (-1, 0, 1):
            k = cell_kind(gid_at(c + dc, r + dr))
            if k[0] == "fill":
                votes[k[1]] = votes.get(k[1], 0) + 1
    return max(votes, key=votes.get) if votes else "grass"


# 1) Orthogonal raster of the crop — exactly what the chunk canvas holds.
ortho = Image.new("RGBA", (W * T, H * T), (0, 0, 0, 0))
props = []  # (anchor_wx, anchor_wy, name, big)
for r in range(R0, R0 + H):
    for c in range(C0, C0 + W):
        k = cell_kind(gid_at(c, r))
        dx, dy = (c - C0) * T, (r - R0) * T
        kind, name = k[0], k[1]
        big = len(k) > 2 and k[2]
        if kind == "fill":
            ortho.paste(fill_tile(name), (dx, dy))
        elif kind in ("skip", "decal", "tree", "prop"):
            ortho.paste(fill_tile(underlay(c, r)), (dx, dy))
            if kind == "tree" and name:
                props.append(((c + 1) * T, (r + 2) * T, name, big))
            elif kind == "prop" and name:
                props.append(((c + 0.5) * T, (r + 1) * T, name, False))

# 2) Project: screen = (wx - wy, (wx + wy) / 2) — PIL inverse affine.
ox, oy = C0 * T, R0 * T  # world origin of the raster
w_out = (W + H) * T
h_out = (W + H) * T // 2 + PH + 40
out = Image.new("RGBA", (w_out, h_out), (18, 22, 30, 255))

# world min/max for offsetting the projection into the canvas
min_sx = (ox - (oy + H * T))
min_sy = (ox + oy) / 2  # projected sy at the crop's top corner
# inverse: input_wx = sx/2 + sy, input_wy = sy - sx/2  (minus raster origin)
a, b, c = 0.5, 1.0, min_sx * 0.5 + min_sy - ox
d, e, f = -0.5, 1.0, min_sy - min_sx * 0.5 - oy
proj = ortho.transform(
    (w_out, h_out), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BILINEAR,
)
out.alpha_composite(proj)

# 3) Billboards at projected anchors, sorted by projected Y (painter order).
props.sort(key=lambda p: (p[0] + p[1]) / 2)
for wx, wy, name, big in props:
    sx = (wx - wy) - min_sx
    sy = (wx + wy) / 2 - min_sy
    tile = prop_tile(name)
    if big:
        tile = tile.resize((int(PW * 1.5), int(PH * 1.5)), Image.NEAREST)
    out.alpha_composite(tile, (int(sx - tile.width / 2), int(sy - tile.height)))

out.save(OUT)
print(f"wrote {OUT} {out.size}, {len(props)} props")
