#!/usr/bin/env python3
"""Render tile-level crops of the generated clara_mundi map using the real
tileset sheets — verifies MundiTerrain tiles sit correctly in context."""
import json, sys
from PIL import Image

ASSETS = "wails/frontend/public/assets/tilesets"
MAP = "data/maps/clara_mundi.map.json"
TS = 32

SHEETS = [  # (firstgid, tilecount, columns, image)
    (1,    576,  32, f"{ASSETS}/pipoya/WaterFall_pipo.png"),
    (577,  1064, 8,  f"{ASSETS}/pipoya/BaseChip_pipo.png"),
    (1641, 528,  8,  f"{ASSETS}/pipoya/Grass_pipo.png"),
    (2169, 3072, 64, f"{ASSETS}/pipoya/Water_pipo.png"),
    (5241, 48,   8,  f"{ASSETS}/pipoya/Flower_pipo.png"),
    (5289, 336,  8,  f"{ASSETS}/pipoya/Dirt_pipo.png"),
    (6000, 64,   8,  f"{ASSETS}/mundi/MundiTerrain.png"),
]
imgs = {}
for first, count, cols, path in SHEETS:
    imgs[first] = (Image.open(path).convert("RGBA"), cols, first + count)

def tile(gid):
    for first, (img, cols, end) in imgs.items():
        if first <= gid < end:
            l = gid - first
            x, y = (l % cols) * TS, (l // cols) * TS
            return img.crop((x, y, x + TS, y + TS))
    return None

doc = json.load(open(MAP))
cols, rows = doc["cols"], doc["rows"]
ground, coll = doc["terrain"]["ground"], doc["terrain"]["collision"]

def crop_at(cx, cy, w=40, h=40):
    x0, y0 = max(0, cx - w // 2), max(0, cy - h // 2)
    out = Image.new("RGBA", (w * TS, h * TS), (20, 26, 34, 255))
    for r in range(h):
        for c in range(w):
            i = (y0 + r) * cols + (x0 + c)
            if i >= len(ground):
                continue
            g = tile(ground[i])
            if g:
                out.paste(g, (c * TS, r * TS), g)
            if coll[i]:
                ov = Image.new("RGBA", (TS, TS), (255, 60, 60, 70))
                out.paste(ov, (c * TS, r * TS), ov)
    return out, (x0, y0)

def find(gid, pred=None):
    for i, g in enumerate(ground):
        if g == gid and (pred is None or pred(i)):
            return i % cols, i // cols
    return None

ICE, DUNE, PINE_TOP, PALM_BOT, BEACH = 6002, 6003, 6008, 6020, 6004
spots = [
    ("glacier/ice coast", find(ICE)),
    ("dunes + cacti",     find(DUNE)),
    ("taiga pines",       find(PINE_TOP)),
    ("beach + palms",     find(PALM_BOT) or find(BEACH)),
]
tiles = []
for name, pos in spots:
    if pos is None:
        print("MISS", name); continue
    img, origin = crop_at(*pos)
    tiles.append((name, pos, img))
    print(f"{name}: tile {pos} (crop origin {origin})")

w = max(i.width for _, _, i in tiles)
sheet = Image.new("RGBA", (w * 2, w * 2), (10, 12, 16, 255))
for k, (name, pos, img) in enumerate(tiles):
    sheet.paste(img, ((k % 2) * w, (k // 2) * w))
sheet = sheet.resize((w, w), Image.LANCZOS)
sheet.save("/tmp/cm_crops.png")
print("wrote /tmp/cm_crops.png", sheet.size)
