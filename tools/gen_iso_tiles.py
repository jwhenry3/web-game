#!/usr/bin/env python3
"""Generate IsoTiles.png + iso_tiles.json — a simple tileset for the
isometric world renderer.

Two kinds of frames:
  * fills  — flat 32x32 square ground tiles. The scene renders them inside an
             isometric container transform, so each square becomes a diamond;
             texture detail is deliberately non-directional.
  * props  — upright billboard sprites (64x96, anchor bottom-center) drawn
             above the ground and depth-sorted by their anchor.

Deterministic (seeded RNG) — regenerate rather than hand-edit the PNG.

    python tools/gen_iso_tiles.py
"""
import json, math, os, random
from PIL import Image, ImageDraw

rng = random.Random(0x1507)
T = 32          # fill tile size (square — projected to a diamond on screen)
PW, PH = 64, 96 # prop frame box; anchor = bottom-center

OUT_DIR = "wails/frontend/public/assets/tilesets/iso"
PNG = os.path.join(OUT_DIR, "IsoTiles.png")
JSON_OUT = os.path.join(OUT_DIR, "iso_tiles.json")

# ---------------------------------------------------------------- fills ---

def speckle(im, color, density, lo=1, hi=2):
    px = im.load()
    for _ in range(int(T * T * density)):
        x, y = rng.randrange(T), rng.randrange(T)
        for dy in range(rng.randint(lo, hi)):
            for dx in range(rng.randint(lo, hi)):
                px[(x + dx) % T, (y + dy) % T] = color + (255,)

def fill_tile(base, dark, light, d_dark=0.08, d_light=0.07):
    im = Image.new("RGBA", (T, T), base + (255,))
    speckle(im, dark, d_dark)
    speckle(im, light, d_light)
    return im

def ice_fill():
    im = fill_tile((150, 196, 222), (126, 176, 206), (196, 230, 244), 0.07, 0.08)
    d = ImageDraw.Draw(im)
    for _ in range(2):  # faint cracks — wrapped so they tile cleanly
        x, y = rng.randrange(T), rng.randrange(T)
        pts = [(x, y)]
        for _ in range(2):
            x = min(T - 1, max(0, x + rng.randint(-8, 8)))
            y = min(T - 1, max(0, y + rng.randint(-8, 8)))
            pts.append((x, y))
        d.line(pts, fill=(120, 168, 198, 200), width=1)
    return im

def water_fill():
    im = fill_tile((38, 84, 138), (28, 68, 118), (58, 110, 168), 0.08, 0.06)
    d = ImageDraw.Draw(im)
    for _ in range(3):  # gentle horizontal ripple lines
        y = rng.randrange(4, T - 4)
        x = rng.randrange(-6, T - 10)
        d.arc([x, y - 3, x + rng.randint(12, 20), y + 4], 0, 180, fill=(58, 110, 168, 160), width=1)
    return im

FILLS = [  # (name, builder or (base, dark, light))
    ("grass",       ((78, 122, 58),  (64, 104, 46),  (96, 142, 72))),
    ("grass_dark",  ((58, 98, 46),   (48, 82, 38),   (72, 114, 58))),
    ("jungle",      ((44, 96, 44),   (36, 78, 36),   (58, 116, 56))),
    ("savanna",     ((150, 140, 84), (130, 120, 68), (168, 158, 100))),
    ("dirt",        ((120, 96, 62),  (102, 80, 50),  (138, 112, 76))),
    ("path",        ((140, 122, 88), (122, 104, 74), (156, 138, 102))),
    ("cobble",      ((120, 118, 112),(104, 102, 96), (138, 136, 128))),
    ("rock",        ((88, 88, 96),   (72, 72, 80),   (106, 106, 116))),
    ("water",       "water"),
    ("snow",        ((226, 234, 240),(206, 218, 228),(242, 248, 252))),
    ("packed_snow", ((200, 214, 226),(182, 198, 214),(218, 230, 240))),
    ("ice",         "ice"),
    ("dune",        ((222, 194, 134),(200, 172, 112),(238, 212, 152))),
    ("beach",       ((214, 194, 152),(196, 176, 134),(228, 210, 168))),
    ("scree",       ((138, 130, 116),(114, 106, 92), (162, 154, 138))),
    ("ash",         ((96, 92, 92),   (80, 76, 78),   (112, 108, 108))),
    ("peat",        ((74, 70, 48),   (58, 54, 36),   (92, 88, 60))),
    ("mire",        ((60, 78, 62),   (48, 64, 50),   (74, 94, 76))),
]

# ---------------------------------------------------------------- props ---
# Each prop: (name, draw fn) — drawn in a PW×PH box, anchor bottom-center.

def shadow(d, cx, w, y=None):
    y = PH - 8 if y is None else y
    d.ellipse([cx - w // 2, y - 4, cx + w // 2, y + 4], fill=(0, 0, 0, 60))

def pine(d, cx, body, snow=False):
    shadow(d, cx, 34)
    d.rectangle([cx - 3, PH - 26, cx + 3, PH - 8], fill=(86, 58, 38, 255))  # trunk
    layers = [(PH - 78, 13), (PH - 60, 18), (PH - 40, 22)]
    for top, half in layers:
        d.polygon([(cx, top), (cx - half, top + 34), (cx + half, top + 34)],
                  fill=body + (255,), outline=(body[0] - 24, body[1] - 24, body[2] - 20, 255))
        if snow:
            d.line([(cx, top + 3), (cx - half + 6, top + 30)], fill=(232, 240, 246, 220), width=3)

def palm(d, cx, **_):
    shadow(d, cx, 30)
    d.line([(cx - 2, PH - 10), (cx + 4, PH - 46)], fill=(120, 88, 52, 255), width=5)
    for a in (-150, -110, -70, -30, 10):  # fronds fanning from the crown
        r = math.radians(a)
        x2 = cx + 4 + math.cos(r) * 26
        y2 = PH - 46 + math.sin(r) * 14
        d.line([(cx + 4, PH - 46), (x2, y2)], fill=(52, 118, 58, 255), width=4)

def leafy(d, cx, body, dead=False):
    shadow(d, cx, 32)
    d.rectangle([cx - 4, PH - 34, cx + 4, PH - 8], fill=(92, 62, 40, 255))
    if dead:
        for (x2, y2) in [(cx - 16, PH - 66), (cx + 14, PH - 70), (cx, PH - 78)]:
            d.line([(cx, PH - 34), (x2, y2)], fill=(96, 88, 80, 255), width=3)
    else:
        for (ox, oy, r) in [(0, -62, 20), (-13, -50, 15), (13, -50, 15)]:
            d.ellipse([cx + ox - r, PH + oy - r, cx + ox + r, PH + oy + r],
                      fill=body + (255,), outline=(body[0] - 26, body[1] - 26, body[2] - 22, 255))

def bush(d, cx, body=(70, 116, 58), **_):
    shadow(d, cx, 26, PH - 4)
    for (ox, oy, r) in [(0, -18, 14), (-10, -12, 10), (10, -12, 10)]:
        d.ellipse([cx + ox - r, PH + oy - r, cx + ox + r, PH + oy + r], fill=body + (255,))

def rock(d, cx, body=(118, 114, 108), w=30, h=26, **_):
    shadow(d, cx, w + 6)
    d.polygon([(cx - w // 2, PH - 8), (cx - w // 4, PH - 8 - h), (cx + w // 4, PH - 8 - h - 6),
               (cx + w // 2, PH - 10)], fill=body + (255,),
              outline=(body[0] - 30, body[1] - 30, body[2] - 28, 255))
    d.line([(cx - w // 4, PH - 8 - h), (cx + 2, PH - 10)], fill=(body[0] + 26, body[1] + 26, body[2] + 24, 200), width=2)

def spire(d, cx, body=(104, 98, 92), **_):
    shadow(d, cx, 34)
    d.polygon([(cx - 14, PH - 8), (cx - 4, PH - 74), (cx + 6, PH - 66), (cx + 14, PH - 8)],
              fill=body + (255,), outline=(body[0] - 28, body[1] - 28, body[2] - 26, 255))

def cactus(d, cx, tall=True, **_):
    shadow(d, cx, 22)
    h = 52 if tall else 30
    d.rounded_rectangle([cx - 6, PH - 8 - h, cx + 6, PH - 8], 6, fill=(74, 128, 66, 255),
                        outline=(50, 96, 46, 255))
    if tall:
        d.rounded_rectangle([cx - 18, PH - 44, cx - 8, PH - 24], 5, fill=(74, 128, 66, 255),
                            outline=(50, 96, 46, 255))

def stalks(d, cx, body=(96, 132, 74), n=6, **_):
    shadow(d, cx, 20, PH - 4)
    for i in range(n):
        x = cx - 12 + i * 5 + rng.randint(-1, 1)
        d.line([(x, PH - 6), (x + rng.randint(-4, 4), PH - 26 - rng.randint(0, 12))],
               fill=body + (255,), width=2)

def crystal(d, cx, **_):
    shadow(d, cx, 26)
    for (ox, h, w) in [(0, 46, 12), (-11, 30, 9), (11, 24, 8)]:
        d.polygon([(cx + ox - w // 2, PH - 8), (cx + ox, PH - 8 - h), (cx + ox + w // 2, PH - 8)],
                  fill=(168, 214, 238, 230), outline=(120, 178, 210, 255))

def drift(d, cx, **_):
    shadow(d, cx, 30, PH - 4)
    d.ellipse([cx - 15, PH - 14, cx + 15, PH - 4], fill=(226, 234, 240, 255),
              outline=(196, 210, 222, 255))

def stump(d, cx, **_):
    shadow(d, cx, 22)
    d.rectangle([cx - 7, PH - 30, cx + 7, PH - 8], fill=(52, 42, 34, 255))
    d.ellipse([cx - 7, PH - 34, cx + 7, PH - 26], fill=(74, 60, 48, 255))

def mound(d, cx, body=(88, 74, 52), **_):
    shadow(d, cx, 30, PH - 4)
    d.ellipse([cx - 14, PH - 20, cx + 14, PH - 6], fill=body + (255,))

def wood(d, cx, **_):
    shadow(d, cx, 28, PH - 4)
    d.line([(cx - 14, PH - 12), (cx + 12, PH - 18)], fill=(110, 84, 56, 255), width=6)
    d.line([(cx + 2, PH - 14), (cx + 14, PH - 22)], fill=(96, 72, 46, 255), width=4)

def shells(d, cx, **_):
    shadow(d, cx, 20, PH - 4)
    for ox in (-8, 0, 8):
        d.arc([cx + ox - 5, PH - 16, cx + ox + 5, PH - 6], 180, 360, fill=(232, 220, 200, 255), width=3)

def skull(d, cx, **_):
    shadow(d, cx, 20, PH - 4)
    d.ellipse([cx - 8, PH - 22, cx + 8, PH - 8], fill=(226, 220, 204, 255),
              outline=(180, 172, 152, 255))
    d.ellipse([cx - 5, PH - 18, cx - 1, PH - 13], fill=(40, 36, 32, 255))
    d.ellipse([cx + 1, PH - 18, cx + 5, PH - 13], fill=(40, 36, 32, 255))

def marker(d, cx, **_):
    shadow(d, cx, 20)
    d.rectangle([cx - 6, PH - 44, cx + 6, PH - 8], fill=(126, 120, 112, 255),
                outline=(96, 90, 84, 255))
    d.line([(cx - 3, PH - 36), (cx + 3, PH - 36)], fill=(90, 84, 78, 255), width=2)
    d.line([(cx - 3, PH - 28), (cx + 3, PH - 28)], fill=(90, 84, 78, 255), width=2)

def mushroom(d, cx, cap=(168, 92, 72), **_):
    shadow(d, cx, 26)
    d.rectangle([cx - 4, PH - 26, cx + 4, PH - 8], fill=(214, 202, 178, 255))
    d.ellipse([cx - 15, PH - 44, cx + 15, PH - 20], fill=cap + (255,),
              outline=(cap[0] - 30, cap[1] - 26, cap[2] - 22, 255))
    for ox in (-6, 3):
        d.ellipse([cx + ox - 2, PH - 38, cx + ox + 2, PH - 34], fill=(238, 230, 214, 255))

def flowers(d, cx, **_):
    shadow(d, cx, 24, PH - 4)
    for (ox, col) in [(-8, (232, 232, 240)), (0, (238, 196, 92)), (8, (196, 120, 150))]:
        d.line([(cx + ox, PH - 6), (cx + ox, PH - 18)], fill=(70, 116, 58, 255), width=2)
        d.ellipse([cx + ox - 4, PH - 26, cx + ox + 4, PH - 18], fill=col + (255,))

def pad(d, cx, **_):
    d.ellipse([cx - 14, PH - 14, cx + 14, PH - 4], fill=(64, 118, 66, 255),
              outline=(46, 92, 50, 255))
    d.ellipse([cx - 3, PH - 14, cx + 3, PH - 8], fill=(228, 172, 196, 255))

def tuft(d, cx, body=(88, 138, 66), **_):
    stalks(d, cx, body, n=4)

PROPS = [
    ("tree_green",  lambda d, c: leafy(d, c, (78, 134, 62))),
    ("tree_dark",   lambda d, c: leafy(d, c, (48, 96, 46))),
    ("tree_autumn", lambda d, c: leafy(d, c, (176, 122, 52))),
    ("tree_dead",   lambda d, c: leafy(d, c, (0, 0, 0), dead=True)),
    ("pine",        lambda d, c: pine(d, c, (44, 96, 56))),
    ("pine_snow",   lambda d, c: pine(d, c, (52, 104, 62), snow=True)),
    ("palm",        lambda d, c: palm(d, c)),
    ("dead_grey",   lambda d, c: leafy(d, c, (0, 0, 0), dead=True)),
    ("bush",        lambda d, c: bush(d, c)),
    ("bush_dead",   lambda d, c: bush(d, c, (110, 96, 62))),
    ("fern",        lambda d, c: stalks(d, c, (62, 122, 64), 7)),
    ("vine",        lambda d, c: bush(d, c, (40, 92, 52))),
    ("boulder",     lambda d, c: rock(d, c)),
    ("spire",       lambda d, c: spire(d, c)),
    ("snowy_rock",  lambda d, c: rock(d, c, (168, 178, 190), 26, 20)),
    ("mossy_rock",  lambda d, c: rock(d, c, (104, 122, 88), 26, 20)),
    ("wet_rock",    lambda d, c: rock(d, c, (92, 100, 104), 24, 16)),
    ("cactus_tall", lambda d, c: cactus(d, c, True)),
    ("cactus_round",lambda d, c: cactus(d, c, False)),
    ("sage",        lambda d, c: stalks(d, c, (122, 138, 96), 5)),
    ("reeds",       lambda d, c: stalks(d, c, (104, 138, 80), 8)),
    ("ice_crystal", lambda d, c: crystal(d, c)),
    ("snow_drift",  lambda d, c: drift(d, c)),
    ("stump",       lambda d, c: stump(d, c)),
    ("mud_mound",   lambda d, c: mound(d, c)),
    ("driftwood",   lambda d, c: wood(d, c)),
    ("shells",      lambda d, c: shells(d, c)),
    ("obsidian",    lambda d, c: rock(d, c, (56, 52, 64), 22, 20)),
    ("lava_rock",   lambda d, c: rock(d, c, (92, 56, 44), 24, 18)),
    ("frost_fern",  lambda d, c: stalks(d, c, (140, 170, 180), 6)),
    ("skull",       lambda d, c: skull(d, c)),
    ("marker",      lambda d, c: marker(d, c)),
    ("mushroom_giant", lambda d, c: mushroom(d, c)),
    ("mushroom_small", lambda d, c: mushroom(d, c, (196, 140, 90))),
    ("flowers",     lambda d, c: flowers(d, c)),
    ("tuft",        lambda d, c: tuft(d, c)),
    ("tuft_dead",   lambda d, c: tuft(d, c, (128, 112, 72))),
    ("lilypad",     lambda d, c: pad(d, c)),
]

# ---------------------------------------------------------------- sheet ---

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    fills_per_row = 8
    fill_rows = math.ceil(len(FILLS) / fills_per_row)
    props_per_row = 8
    prop_rows = math.ceil(len(PROPS) / props_per_row)
    W = max(fills_per_row * T, props_per_row * PW)
    H = fill_rows * T + prop_rows * PH
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    atlas = {"tile": T, "prop": [PW, PH], "fills": {}, "props": {}}

    for i, (name, spec) in enumerate(FILLS):
        x, y = (i % fills_per_row) * T, (i // fills_per_row) * T
        if spec == "water":
            tile = water_fill()
        elif spec == "ice":
            tile = ice_fill()
        else:
            base, dark, light = spec
            tile = fill_tile(base, dark, light)
        sheet.paste(tile, (x, y))
        atlas["fills"][name] = {"x": x, "y": y}

    for i, (name, fn) in enumerate(PROPS):
        x = (i % props_per_row) * PW
        y = fill_rows * T + (i // props_per_row) * PH
        frame = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
        fn(ImageDraw.Draw(frame), PW // 2)
        sheet.paste(frame, (x, y))
        atlas["props"][name] = {"x": x, "y": y}

    sheet.save(PNG)
    with open(JSON_OUT, "w") as f:
        json.dump(atlas, f, indent=1)
    print(f"wrote {PNG} {sheet.size}, {len(FILLS)} fills, {len(PROPS)} props")

if __name__ == "__main__":
    main()
