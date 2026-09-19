#!/usr/bin/env python3
"""Generate MundiTerrain.png — Clara Mundi's supplemental terrain tileset.

Fills the biome gaps in the Pipoya set: snow/ice/sand/scree ground fills,
pines (green + snowy), palms, a dead grey tree, and per-biome props
(cacti, reeds, boulders, frost ferns, lava rock, ...).

Tiles are 32x32 on an 8-column sheet, matching the Pipoya conventions the
engine already understands: rows 1-2 hold four 2x2 trees (canopy tops
walk-under, bottoms blocked), fills are fully opaque, props are
transparent overlays that sit on whatever ground fill is underneath.

    python tools/gen_mundi_terrain.py

Outputs:
    wails/frontend/public/assets/tilesets/mundi/MundiTerrain.png
    wails/frontend/public/assets/tilesets/mundi/MundiTerrain.tsx
"""

import math
import os
import random
import sys

from PIL import Image, ImageDraw

T = 32          # tile px
COLS = 8
ROWS = 8
SEED = 0xC1A4A

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "wails", "frontend", "public", "assets", "tilesets", "mundi")
PNG = os.path.join(OUT_DIR, "MundiTerrain.png")
TSX = os.path.join(OUT_DIR, "MundiTerrain.tsx")

rng = random.Random(SEED)
sheet = Image.new("RGBA", (COLS * T, ROWS * T), (0, 0, 0, 0))


def put(img: Image.Image, col: int, row: int) -> None:
    sheet.alpha_composite(img, (col * T, row * T))


# ---------------------------------------------------------------------------
# Ground fills — flat base + clustered two-shade dither (Pipoya fill style).
# ---------------------------------------------------------------------------

def speckle(im: Image.Image, color, density: float, size=(1, 2)) -> None:
    px = im.load()
    n = int(T * T * density)
    for _ in range(n):
        x = rng.randrange(T)
        y = rng.randrange(T)
        w = rng.randint(size[0], size[1])
        h = rng.randint(size[0], size[1])
        for dy in range(h):
            for dx in range(w):
                # Wrap writes so clusters crossing an edge continue on the
                # far side — the tile must repeat seamlessly.
                px[(x + dx) % T, (y + dy) % T] = color + (255,)


def fill(base, dark, light, d_dark=0.10, d_light=0.08):
    im = Image.new("RGBA", (T, T), base + (255,))
    speckle(im, dark, d_dark)
    speckle(im, light, d_light)
    return im


def draw_wrapped(im: Image.Image, marks) -> None:
    """Replay mark tuples at all 9 ±T offsets so anything clipped at an edge
    continues on the opposite edge — keeps the tile seamless when repeated.

    Marks are ("line", pts, fill, width), ("arc", box, a0, a1, fill, width),
    ("ellipse", box, fill), or ("polygon", pts, fill). Geometry is generated
    once, then each mark is drawn nine times offset by -T, 0, +T on each axis.
    """
    d = ImageDraw.Draw(im)
    for ox in (-T, 0, T):
        for oy in (-T, 0, T):
            for m in marks:
                kind = m[0]
                if kind == "line":
                    _, pts, color, w = m
                    d.line([(x + ox, y + oy) for x, y in pts], fill=color, width=w)
                elif kind == "arc":
                    _, box, a0, a1, color, w = m
                    d.arc([box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy],
                          a0, a1, fill=color, width=w)
                elif kind == "ellipse":
                    _, box, color = m
                    d.ellipse([box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy], fill=color)
                elif kind == "polygon":
                    _, pts, color = m
                    d.polygon([(x + ox, y + oy) for x, y in pts], fill=color)


def ice_tile():
    im = fill((166, 208, 230), (146, 192, 216), (204, 234, 248), 0.08, 0.10)
    marks = []
    # Long diagonal melt streaks.
    for _ in range(4):
        x = rng.randrange(-8, T)
        marks.append(("line", [(x, T), (x + T // 2, 0)], (204, 234, 248, 255), 2))
    # Thin cracks.
    for _ in range(3):
        x0, y0 = rng.randrange(T), rng.randrange(T)
        pts = [(x0, y0)]
        for _ in range(3):
            x0 = min(T - 1, max(0, x0 + rng.randint(-7, 7)))
            y0 = min(T - 1, max(0, y0 + rng.randint(-7, 7)))
            pts.append((x0, y0))
        marks.append(("line", pts, (128, 178, 208, 255), 1))
    draw_wrapped(im, marks)
    return im


def dune_tile():
    im = fill((226, 200, 140), (206, 178, 116), (240, 218, 160), 0.07, 0.08)
    marks = []
    # Wind ripples — shallow arcs drifting across the tile.
    for _ in range(3):
        y = rng.randrange(4, T - 4)
        x = rng.randrange(-6, T - 8)
        w = rng.randint(14, 26)
        marks.append(("arc", [x, y - 4, x + w, y + 5], 180, 340, (206, 178, 116, 255), 2))
        marks.append(("arc", [x, y - 2, x + w, y + 7], 180, 340, (240, 218, 160, 255), 1))
    draw_wrapped(im, marks)
    return im


def scree_tile():
    im = fill((140, 132, 118), (108, 100, 88), (168, 160, 144), 0.12, 0.10)
    marks = []
    for _ in range(9):  # scattered stones
        x, y = rng.randrange(-4, T - 2), rng.randrange(-3, T - 2)
        w, h = rng.randint(2, 5), rng.randint(2, 4)
        marks.append(("polygon",
                      [(x, y + h), (x + w // 2, y), (x + w, y + h // 2), (x + w - 1, y + h)],
                      (112 + rng.randint(-12, 40), 106 + rng.randint(-10, 36),
                       92 + rng.randint(-10, 30), 255)))
    draw_wrapped(im, marks)
    return im


def peat_tile():
    im = fill((76, 72, 50), (58, 54, 36), (96, 92, 62), 0.12, 0.08)
    marks = []
    for _ in range(5):  # mossy wet patches
        x, y = rng.randrange(-5, T - 2), rng.randrange(-4, T - 2)
        marks.append(("ellipse", [x, y, x + rng.randint(3, 7), y + rng.randint(2, 5)],
                      (64, 78, 44, 255)))
    draw_wrapped(im, marks)
    return im


# ---------------------------------------------------------------------------
# Prop helpers — transparent tiles with outline + soft ground shadow.
# ---------------------------------------------------------------------------

def prop_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def shadow(d: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float) -> None:
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(20, 24, 18, 70))


def outline_poly(d, pts, fill, edge):
    d.polygon(pts, fill=edge)
    inset = [(x + (1 if x < 16 else -1) * 0.6, y + (1 if y < 16 else -1) * 0.6) for x, y in pts]
    d.polygon(inset, fill=fill)


def rock(im, cx, cy, rx, ry, base=(128, 124, 118), light=(152, 148, 140), dark=(96, 92, 86)):
    d = ImageDraw.Draw(im)
    shadow(d, cx, cy + ry - 1, rx + 1, 3)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=dark + (255,))
    d.ellipse([cx - rx, cy - ry, cx + rx - 1, cy + ry - 2], fill=base + (255,))
    d.ellipse([cx - rx * 0.6, cy - ry * 0.7, cx + rx * 0.15, cy - ry * 0.05], fill=light + (255,))


def shrub(im, cx, cy, rx, ry, base, light, dark):
    d = ImageDraw.Draw(im)
    shadow(d, cx, cy + ry - 1, rx + 1, 3)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=dark + (255,))
    d.ellipse([cx - rx + 1, cy - ry, cx + rx - 1, cy + ry - 2], fill=base + (255,))
    for _ in range(7):
        x = cx + rng.randint(-int(rx * 0.7), int(rx * 0.5))
        y = cy + rng.randint(-int(ry * 0.8), 0)
        d.ellipse([x, y, x + 3, y + 3], fill=light + (255,))


# ---------------------------------------------------------------------------
# Props — one 32x32 transparent tile each.
# ---------------------------------------------------------------------------

def p_cactus_tall():
    im, d = prop_canvas()
    shadow(d, 16, 27, 9, 3)
    g, e, l = (84, 148, 78), (48, 106, 52), (110, 172, 96)
    d.rectangle([12, 8, 20, 28], fill=e + (255,))
    d.rectangle([13, 8, 19, 27], fill=g + (255,))
    d.ellipse([12, 5, 20, 11], fill=g + (255,))
    for y0, side in ((14, -1), (18, 1)):  # arms
        x0 = 16 + side * 4
        d.rectangle([min(x0, x0 + side * 6), y0 - 2, max(x0, x0 + side * 6), y0], fill=e + (255,))
        d.rectangle([min(x0 + side * 6 - 2, x0 + side * 6), y0 - 8, max(x0 + side * 6 - 2, x0 + side * 6), y0 - 1], fill=g + (255,))
        d.ellipse([x0 + side * 6 - 4, y0 - 10, x0 + side * 6, y0 - 5], fill=g + (255,))
    d.line([(15, 9), (15, 26)], fill=l + (255,))
    for y in range(10, 26, 4):  # spine ticks
        d.point([(14, y)], fill=e + (255,))
        d.point([(18, y + 2)], fill=e + (255,))
    return im


def p_cactus_round():
    im, d = prop_canvas()
    shadow(d, 16, 27, 9, 3)
    g, e, l = (88, 152, 84), (52, 110, 56), (116, 176, 100)
    d.ellipse([7, 9, 25, 28], fill=e + (255,))
    d.ellipse([8, 9, 24, 27], fill=g + (255,))
    for x in (12, 16, 20):  # ribs
        d.arc([x - 5, 10, x + 5, 27], 80, 280, fill=e + (255,))
    d.line([(12, 12), (12, 25)], fill=l + (255,))
    d.ellipse([13, 6, 19, 10], fill=(214, 96, 120, 255))  # bloom
    d.ellipse([15, 7, 17, 9], fill=(240, 220, 120, 255))
    return im


def p_sage():
    im, d = prop_canvas()
    shadow(d, 16, 26, 9, 3)
    for _ in range(14):
        x = 16 + rng.randint(-9, 9)
        top = 26 - rng.randint(8, 18)
        bend = rng.randint(-4, 4)
        c = rng.choice([(120, 140, 118), (104, 126, 104), (138, 152, 130)])
        d.line([(x, 26), (x + bend, top)], fill=c + (255,), width=2)
        d.point([(x + bend, top - 1)], fill=(150, 164, 140, 255))
    return im


def p_snow_shrub():
    im, d = prop_canvas()
    shrub(im, 16, 21, 10, 8, (88, 108, 88), (110, 132, 108), (66, 84, 66))
    d.ellipse([7, 11, 25, 19], fill=(238, 244, 248, 255))
    d.ellipse([9, 14, 23, 21], fill=(224, 232, 240, 255))
    return im


def p_reeds(tall: bool):
    im, d = prop_canvas()
    shadow(d, 16, 27, 10, 2)
    n = 9 if tall else 6
    for _ in range(n):
        x = 16 + rng.randint(-10, 10)
        h = rng.randint(14, 24) if tall else rng.randint(8, 14)
        c = rng.choice([(108, 128, 70), (132, 148, 88), (88, 110, 58)])
        d.line([(x, 28), (x + rng.randint(-2, 2), 28 - h)], fill=c + (255,), width=1)
        if tall and rng.random() < 0.5:  # cattail head
            d.rectangle([x - 1, 28 - h - 5, x + 1, 28 - h], fill=(126, 92, 52, 255))
    return im


def p_ice_crystal():
    im, d = prop_canvas()
    shadow(d, 16, 27, 10, 3)
    shards = [((14, 26), (10, 12), (18, 16)), ((20, 26), (22, 8), (26, 18)), ((10, 26), (6, 18), (12, 20))]
    for a, b, c in shards:
        d.polygon([a, b, c], fill=(148, 200, 228, 255), outline=(110, 170, 205, 255))
        mid = ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)
        d.line([b, mid], fill=(214, 240, 250, 255))
    return im


def p_boulder():
    im, _ = prop_canvas()
    rock(im, 16, 20, 10, 8)
    return im


def p_rock_spire():
    im, d = prop_canvas()
    shadow(d, 16, 28, 10, 3)
    d.polygon([(8, 28), (13, 4), (18, 7), (23, 28)], fill=(96, 92, 86, 255))
    d.polygon([(9, 28), (13, 5), (17, 8), (21, 28)], fill=(128, 124, 118, 255))
    d.polygon([(13, 5), (17, 8), (15, 16), (12, 14)], fill=(152, 148, 140, 255))
    return im


def p_snow_drift():
    im, d = prop_canvas()
    shadow(d, 16, 27, 12, 3)
    d.ellipse([3, 16, 29, 29], fill=(222, 230, 238, 255))
    d.ellipse([4, 15, 28, 26], fill=(238, 243, 247, 255))
    d.ellipse([9, 13, 22, 20], fill=(250, 252, 255, 255))
    return im


def p_fern(frost: bool):
    im, d = prop_canvas()
    shadow(d, 16, 27, 9, 2)
    cols = [(160, 200, 220), (188, 220, 236)] if frost else [(58, 138, 66), (80, 162, 78)]
    for i in range(9):
        a = -math.pi / 2 + (i - 4) * 0.34
        ln = 13 - abs(i - 4)
        x1 = 16 + math.cos(a) * ln
        y1 = 27 + math.sin(a) * ln
        d.line([(16, 27), (x1, y1)], fill=cols[0] + (255,), width=2)
        for t in (0.45, 0.75):  # leaflets
            mx = 16 + (x1 - 16) * t
            my = 27 + (y1 - 27) * t
            d.point([(mx - 2, my)], fill=cols[1] + (255,))
            d.point([(mx + 2, my)], fill=cols[1] + (255,))
    return im


def p_vine_bush():
    im, d = prop_canvas()
    shrub(im, 16, 20, 11, 9, (48, 106, 48), (70, 134, 62), (34, 82, 38))
    for _ in range(4):  # hanging vines
        x = 16 + rng.randint(-8, 8)
        d.line([(x, 20), (x + rng.randint(-3, 3), 28)], fill=(34, 82, 38, 255), width=1)
    return im


def p_snowy_rock():
    im, d = prop_canvas()
    rock(im, 16, 21, 9, 7)
    d.ellipse([8, 13, 24, 19], fill=(238, 244, 248, 255))
    return im


def p_charred_stump():
    im, d = prop_canvas()
    shadow(d, 16, 27, 8, 3)
    d.rectangle([10, 14, 22, 28], fill=(52, 44, 38, 255))
    d.rectangle([11, 14, 21, 27], fill=(68, 56, 46, 255))
    d.ellipse([10, 11, 22, 17], fill=(40, 34, 30, 255))
    d.ellipse([13, 12, 19, 15], fill=(86, 70, 54, 255))
    d.line([(13, 18), (13, 26)], fill=(44, 38, 34, 255))
    return im


def p_mud_mound():
    im, d = prop_canvas()
    shadow(d, 16, 27, 11, 3)
    d.ellipse([5, 17, 27, 29], fill=(88, 72, 48, 255))
    d.ellipse([6, 16, 26, 26], fill=(110, 90, 60, 255))
    d.ellipse([10, 15, 20, 20], fill=(130, 110, 76, 255))
    d.ellipse([13, 12, 17, 15], fill=(60, 90, 110, 255))  # pooled water glint
    return im


def p_driftwood():
    im, d = prop_canvas()
    shadow(d, 16, 24, 12, 3)
    d.line([(4, 22), (28, 18)], fill=(140, 118, 92, 255), width=4)
    d.line([(5, 21), (27, 17)], fill=(166, 144, 114, 255), width=2)
    d.line([(20, 19), (25, 12)], fill=(140, 118, 92, 255), width=3)
    return im


def p_wet_rock():
    im, _ = prop_canvas()
    rock(im, 16, 21, 9, 7, base=(92, 106, 116), light=(120, 138, 150), dark=(66, 78, 88))
    d = ImageDraw.Draw(im)
    d.point([(12, 16), (13, 16)], fill=(190, 215, 230, 255))
    return im


def p_shells():
    im, d = prop_canvas()
    shadow(d, 16, 26, 8, 2)
    for cx, cy, c in ((11, 24, (236, 226, 210)), (19, 26, (222, 196, 190)), (24, 22, (240, 234, 224))):
        d.ellipse([cx - 3, cy - 2, cx + 3, cy + 2], fill=c + (255,), outline=(168, 150, 132, 255))
        d.line([(cx - 2, cy), (cx + 2, cy)], fill=(168, 150, 132, 255))
    return im


def p_obsidian():
    im, d = prop_canvas()
    shadow(d, 16, 27, 9, 3)
    d.polygon([(9, 27), (12, 8), (20, 6), (24, 27)], fill=(38, 34, 48, 255))
    d.polygon([(11, 26), (13, 10), (18, 9), (16, 26)], fill=(62, 56, 82, 255))
    d.line([(14, 11), (13, 24)], fill=(128, 118, 158, 255))
    return im


def p_lava_rock():
    im, d = prop_canvas()
    rock(im, 16, 21, 10, 7, base=(56, 50, 48), light=(80, 72, 68), dark=(36, 32, 30))
    for _ in range(4):  # glowing cracks
        x0, y0 = rng.randint(9, 20), rng.randint(15, 24)
        pts = [(x0, y0)]
        for _ in range(3):
            x0 += rng.randint(-4, 4)
            y0 += rng.randint(-3, 3)
            pts.append((x0, y0))
        d.line(pts, fill=(232, 116, 40, 255), width=1)
        d.line(pts, fill=(250, 180, 80, 110), width=1)
    return im


def p_mossy_rock():
    im, d = prop_canvas()
    rock(im, 16, 21, 9, 7)
    d.ellipse([8, 14, 24, 19], fill=(92, 124, 60, 255))
    d.ellipse([10, 14, 20, 17], fill=(112, 146, 74, 255))
    return im


def p_skull():
    im, d = prop_canvas()
    shadow(d, 16, 26, 7, 2)
    d.ellipse([10, 14, 22, 26], fill=(224, 216, 196, 255), outline=(176, 166, 146, 255))
    d.rectangle([13, 23, 19, 28], fill=(224, 216, 196, 255), outline=(176, 166, 146, 255))
    d.ellipse([12, 18, 15, 22], fill=(48, 42, 36, 255))
    d.ellipse([17, 18, 20, 22], fill=(48, 42, 36, 255))
    for x in (14, 16, 18):
        d.line([(x, 24), (x, 27)], fill=(176, 166, 146, 255))
    return im


def p_stone_marker():
    im, d = prop_canvas()
    shadow(d, 16, 27, 8, 3)
    d.polygon([(10, 27), (11, 9), (16, 5), (21, 9), (22, 27)], fill=(104, 100, 94, 255))
    d.polygon([(12, 26), (13, 10), (16, 7), (19, 10), (20, 26)], fill=(128, 124, 116, 255))
    d.line([(13, 13), (19, 13)], fill=(88, 84, 78, 255))
    d.line([(14, 17), (18, 21)], fill=(88, 84, 78, 255))
    d.line([(18, 17), (14, 21)], fill=(88, 84, 78, 255))
    return im


def p_giant_mushroom():
    im, d = prop_canvas()
    shadow(d, 16, 27, 10, 3)
    d.rectangle([13, 15, 19, 28], fill=(214, 204, 184, 255))
    d.rectangle([14, 15, 18, 27], fill=(230, 222, 204, 255))
    d.ellipse([5, 6, 27, 19], fill=(150, 60, 52, 255))
    d.ellipse([6, 7, 26, 17], fill=(178, 78, 64, 255))
    for x, y in ((11, 10), (18, 9), (22, 13), (14, 13)):
        d.ellipse([x, y, x + 3, y + 2], fill=(236, 226, 208, 255))
    return im


# ---------------------------------------------------------------------------
# 2x2 trees — drawn on a 64x64 canvas, split into sheet locals
# TL,TR on row A / BL,BR on row B (Pipoya stamp layout).
# ---------------------------------------------------------------------------

def tree_quad() -> Image.Image:
    return Image.new("RGBA", (64, 64), (0, 0, 0, 0))


def pine(snowy: bool) -> Image.Image:
    im = tree_quad()
    d = ImageDraw.Draw(im)
    dark, mid, light = (34, 84, 52), (48, 110, 62), (66, 134, 74)
    shadow(d, 32, 60, 18, 4)
    d.rectangle([29, 46, 35, 62], fill=(96, 66, 42, 255))
    d.rectangle([30, 46, 33, 61], fill=(116, 82, 52, 255))
    tiers = [(32, 2, 22), (32, 14, 30), (32, 28, 38), (32, 42, 44)]
    for cx, ty, w in tiers:
        base_y = ty + 20
        d.polygon([(cx - w // 2, base_y), (cx, ty), (cx + w // 2, base_y)], fill=dark + (255,))
        d.polygon([(cx - w // 2 + 3, base_y - 1), (cx, ty + 2), (cx + w // 2 - 3, base_y - 1)], fill=mid + (255,))
        # Jagged lower edge.
        for x in range(cx - w // 2 + 2, cx + w // 2 - 2, 4):
            d.point([(x, base_y - 1)], fill=mid + (255,))
        d.line([(cx - w // 4, base_y - 8), (cx, ty + 3)], fill=light + (255,))
        if snowy:
            d.polygon([(cx - w // 6, ty + 7), (cx, ty), (cx + w // 6, ty + 7)], fill=(238, 244, 248, 255))
            for x in range(cx - w // 2 + 4, cx + w // 2 - 2, 7):
                d.point([(x, base_y - 2)], fill=(232, 240, 246, 255))
                d.point([(x + 1, base_y - 1)], fill=(220, 230, 238, 255))
    return im


def palm() -> Image.Image:
    im = tree_quad()
    d = ImageDraw.Draw(im)
    shadow(d, 32, 60, 16, 4)
    # Curved trunk leaning right.
    pts = [(26, 60), (27, 48), (30, 36), (34, 26), (36, 18)]
    for i in range(len(pts) - 1):
        d.line([pts[i], pts[i + 1]], fill=(124, 92, 56, 255), width=5)
        d.line([(pts[i][0] - 1, pts[i][1]), (pts[i + 1][0] - 1, pts[i + 1][1])], fill=(152, 116, 72, 255), width=3)
    for i in range(1, len(pts) - 1):  # trunk rings
        x, y = pts[i]
        d.line([(x - 3, y), (x + 3, y - 1)], fill=(108, 78, 46, 255), width=1)
    cx, cy = 37, 15  # crown
    fronds = [(-2.9, 22), (-2.3, 24), (-1.7, 22), (-0.9, 20), (-0.3, 18), (0.35, 20), (0.9, 22)]
    for a, ln in fronds:
        x1 = cx + math.cos(a) * ln
        y1 = cy + math.sin(a) * ln * 0.55 + 4
        xm = cx + math.cos(a) * ln * 0.55
        ym = cy + math.sin(a) * ln * 0.3 - 3
        d.line([(cx, cy), (xm, ym), (x1, y1)], fill=(52, 118, 58, 255), width=3)
        d.line([(cx, cy), (xm, ym - 1), (x1, y1 - 1)], fill=(80, 150, 70, 255), width=1)
        # Frond edge ticks.
        d.line([(x1 - 2, y1 - 1), (x1 + 2, y1 + 1)], fill=(52, 118, 58, 255), width=1)
    d.ellipse([cx - 3, cy - 2, cx + 3, cy + 3], fill=(110, 82, 50, 255))  # coconuts
    d.ellipse([cx - 1, cy + 1, cx + 4, cy + 5], fill=(96, 70, 42, 255))
    return im


def dead_tree() -> Image.Image:
    im = tree_quad()
    d = ImageDraw.Draw(im)
    bark, dark = (104, 98, 92), (80, 74, 68)
    shadow(d, 32, 60, 15, 4)
    d.polygon([(27, 60), (29, 30), (35, 30), (38, 60)], fill=dark + (255,))
    d.polygon([(29, 60), (30, 30), (34, 30), (36, 60)], fill=bark + (255,))
    branches = [
        ((30, 36), [(20, 24), (12, 16), (10, 8)]),
        ((33, 30), [(38, 18), (44, 10), (50, 6)]),
        ((31, 24), [(26, 14), (22, 6)]),
        ((34, 40), [(44, 32), (52, 28)]),
        ((29, 46), [(18, 40), (10, 38)]),
    ]
    for start, seg in branches:
        prev = start
        for p in seg:
            d.line([prev, p], fill=dark + (255,), width=3)
            d.line([(prev[0], prev[1] - 1), (p[0], p[1] - 1)], fill=bark + (255,), width=1)
            prev = p
    return im


# ---------------------------------------------------------------------------
# Assemble the sheet.
# ---------------------------------------------------------------------------

def build() -> None:
    # Row 0 — opaque fills.
    put(fill((232, 238, 244), (214, 224, 234), (250, 252, 255)), 0, 0)          # 0 snow
    put(fill((206, 216, 226), (192, 204, 218), (222, 232, 240)), 1, 0)          # 1 packed snow
    put(ice_tile(), 2, 0)                                                     # 2 ice
    put(dune_tile(), 3, 0)                                                    # 3 dune sand
    put(fill((218, 192, 142), (202, 178, 130), (232, 208, 158)), 4, 0)          # 4 beach sand
    put(scree_tile(), 5, 0)                                                   # 5 scree
    put(fill((102, 100, 98), (82, 80, 78), (128, 126, 122)), 6, 0)              # 6 ash
    put(peat_tile(), 7, 0)                                                    # 7 peat

    # Rows 1-2 — four 2x2 trees: pine, snowy pine, palm, dead grey.
    for i, q in enumerate((pine(False), pine(True), palm(), dead_tree())):
        col = i * 2
        put(q.crop((0, 0, 32, 32)), col, 1)
        put(q.crop((32, 0, 64, 32)), col + 1, 1)
        put(q.crop((0, 32, 32, 64)), col, 2)
        put(q.crop((32, 32, 64, 64)), col + 1, 2)

    # Row 3 — props A.
    for i, f in enumerate((p_cactus_tall, p_cactus_round, p_sage, p_snow_shrub,
                          lambda: p_reeds(True), lambda: p_reeds(False), p_ice_crystal, p_boulder)):
        put(f(), i, 3)

    # Row 4 — props B.
    for i, f in enumerate((p_rock_spire, p_snow_drift, lambda: p_fern(False), p_vine_bush,
                          p_snowy_rock, p_charred_stump, p_mud_mound, p_driftwood)):
        put(f(), i, 4)

    # Row 5 — props C.
    for i, f in enumerate((p_wet_rock, p_shells, p_obsidian, p_lava_rock,
                          lambda: p_fern(True), p_mossy_rock, p_skull, p_stone_marker)):
        put(f(), i, 5)

    # Row 6 — props D.
    for i, f in enumerate((p_giant_mushroom,)):
        put(f(), i, 6)

    os.makedirs(OUT_DIR, exist_ok=True)
    sheet.save(PNG)
    write_tsx()
    print(f"wrote {PNG} ({sheet.width}x{sheet.height})")


def write_tsx() -> None:
    tiles = ROWS * COLS
    with open(TSX, "w", encoding="utf-8") as fh:
        fh.write(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<tileset version="1.10" tiledversion="1.10.2" name="MundiTerrain" '
            f'tilewidth="32" tileheight="32" tilecount="{tiles}" columns="{COLS}">\n'
            f' <image source="MundiTerrain.png" width="{COLS * T}" height="{ROWS * T}"/>\n'
            ' <terraintypes>\n'
            '  <terrain name="Snow" tile="0"/>\n'
            '  <terrain name="Ice" tile="2"/>\n'
            '  <terrain name="Sand" tile="3"/>\n'
            '  <terrain name="Scree" tile="5"/>\n'
            ' </terraintypes>\n'
            ' <tile id="2"><properties><property name="collides" type="bool" value="true"/></properties></tile>\n'
            '</tileset>\n'
        )
    print(f"wrote {TSX}")


if __name__ == "__main__":
    sys.exit(build())
