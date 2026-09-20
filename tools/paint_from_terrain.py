#!/usr/bin/env python3
"""Generate the terrain paint mask from a map's tile terrain.

    python tools/paint_from_terrain.py [--map data/maps/clara_mundi.map.json]

Classifies every tile gid (same table as stamp_from_terrain.py), fills
prop-only cells from their neighbours, upscales to the paint resolution
(MASK_SCALE world px per mask px), and writes <id>.paint.png next to the map:
an RGBA image where each pixel's RGB is the exact category color in
PAINT_COLORS. The editor brushes this file; bake_terrain.py blends it into
the assets/terrain-fills textures.
"""

import argparse
import json
import os

import numpy as np
from PIL import Image

import stamp_from_terrain as st

ROOT = st.ROOT
MASK_SCALE = 8  # world px per mask px (tile 32px -> 4x4 mask px per tile)

# Exact mask colors — the editor palette and the bake LUT use these.
PAINT_COLORS = {
    "water": (42, 109, 189),
    "grass": (96, 160, 80),
    "sand": (216, 192, 136),
    "snow": (232, 240, 248),
    "rock": (140, 120, 96),
}
CAT_ORDER = ("water", "grass", "sand", "snow", "rock")


def fill_props(grid):
    """Prop cells (0) take the nearest classified neighbour; leftovers ->
    grass. Diffusion passes — a forest interior inherits its edge biome."""
    g = grid.astype(np.uint8).copy()
    for _ in range(48):
        if (g != 0).all():
            break
        for axis, delta in ((0, 1), (0, -1), (1, 1), (1, -1)):
            ng = np.roll(g, delta, axis=axis)
            g = np.where((g == 0) & (ng != 0), ng, g)
    g[g == 0] = st.CAT_IX["grass"] + 1
    return g


def mask_image(grid):
    """Category-index tile grid -> RGBA mask at paint resolution."""
    idx = fill_props(grid)  # CAT_IX + 1 per tile
    idx = np.repeat(np.repeat(idx, 4, axis=0), 4, axis=1)  # tile -> 4x4 mask px
    lut = np.zeros((len(CAT_ORDER) + 1, 4), dtype=np.uint8)
    for cat, rgb in PAINT_COLORS.items():
        lut[st.CAT_IX[cat] + 1] = rgb + (255,)
    lut[0] = PAINT_COLORS["grass"] + (255,)
    return Image.fromarray(lut[idx], "RGBA")


def paint_map(map_path, out_path=None, verbose=True):
    with open(map_path) as f:
        m = json.load(f)
    cols, rows = m["cols"], m["rows"]
    ground = m["terrain"]["ground"]
    grid = st.category_grid(ground, cols, rows)
    img = mask_image(grid)
    out_path = out_path or map_path.replace(".map.json", ".paint.png")
    img.save(out_path, optimize=True)
    if verbose:
        counts = {
            cat: int((grid == st.CAT_IX[cat] + 1).sum()) for cat in CAT_ORDER}
        print(f"painted {os.path.basename(out_path)}: {img.size} mask, "
              f"tile counts {counts} -> {out_path}")
    return out_path


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--map", default=os.path.join(
        ROOT, "data", "maps", "clara_mundi.map.json"))
    ap.add_argument("--out", help="mask output path (default: sibling .paint.png)")
    args = ap.parse_args()
    paint_map(args.map, args.out)


if __name__ == "__main__":
    main()
