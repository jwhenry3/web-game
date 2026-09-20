#!/usr/bin/env python3
"""Generate world prop objects (camps, save crystals, markers) as a Spine rig.

Same conventions as gen_paperdoll.py: 100x40 cell, feet baseline at
FOOT_X/FOOT_Y, deliberate 2px grid, shared plum outline + ramp palette.
One bone per prop kind so the idle animation can shimmer each without
moving the others; PropSprite picks one slot's attachment per POI.

Bones are spread horizontally so the editor viewport shows every prop in
a row; PropSprite zeroes bone offsets at load so each prop anchors at its
own point.

Output: wails/frontend/public/assets/spine/propdoll.{png,atlas,json}
        + prop_<key>.png cell previews for the canvas map editor.

Run from the repo root:  python tools/gen_props.py
"""

import json
import math
import os
import sys
from PIL import Image, ImageDraw

if __package__:
    from .gen_paperdoll import (
        SDraw, new_part, pack,
        FRAME_W, FRAME_H, FOOT_X, FOOT_Y, PAD, DS, ART,
        OUTLINE, LEATHER, LEATHER_LIGHT, RED, RED_LIGHT,
    )
    from .paperdoll_layers import shade, rgba
else:
    from gen_paperdoll import (
        SDraw, new_part, pack,
        FRAME_W, FRAME_H, FOOT_X, FOOT_Y, PAD, DS, ART,
        OUTLINE, LEATHER, LEATHER_LIGHT, RED, RED_LIGHT,
    )
    from paperdoll_layers import shade, rgba

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "wails/frontend/public/assets/spine")
OUT_IMG = "propdoll.png"
OUT_ATLAS = "propdoll.atlas"
OUT_JSON = "propdoll.json"

WOOD = (122, 84, 55, 255)
WOOD_LIGHT = (164, 118, 74, 255)
PARCHMENT = (233, 208, 152, 255)
STONE = (118, 114, 128, 255)
STONE_DARK = (74, 70, 88, 255)
GLASS = (168, 220, 235, 255)
FLAME = (232, 116, 44, 255)
FLAME_LIGHT = (255, 206, 92, 255)

def _hx(n):
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255)


# Mirrors CAMP_SKINS in wails/frontend/src/housing/campSkins.ts — tent canvas
# palettes per camp skin. Keep the two tables in sync.
TENT_SKINS = {
    "basic":    {"outer": _hx(0xD4B06A), "inner": _hx(0x6B4A2E)},
    "forest":   {"outer": _hx(0x7FA05A), "inner": _hx(0x4A3A2A)},
    "desert":   {"outer": _hx(0xD8B47A), "inner": _hx(0x7A5232)},
    "arctic":   {"outer": _hx(0xB8D8E8), "inner": _hx(0x4A5A6A)},
    "volcanic": {"outer": _hx(0x8A5A4A), "inner": _hx(0x3A2A28)},
    "royal":    {"outer": _hx(0x9A7AC8), "inner": _hx(0x4A3A5A)},
}

CRYSTAL = (168, 232, 255)
CRYSTAL_ACTIVE = (255, 233, 168)


def _tri(d, pts, fill, outline=True):
    """Filled triangle with a hand-drawn dark silhouette edge."""
    if outline:
        d.polygon(pts, fill=OUTLINE)
        cx = sum(p[0] for p in pts) / 3
        cy = sum(p[1] for p in pts) / 3
        inner = [(cx + (x - cx) * .82, cy + (y - cy) * .82) for x, y in pts]
        d.polygon(inner, fill=fill)
    else:
        d.polygon(pts, fill=fill)


def draw_tent(pal):
    im = new_part()
    d = SDraw(im)
    outer, inner = rgba(pal["outer"]), rgba(pal["inner"])
    # Ground shadow.
    d.ellipse([18, 29.5, 62, 35], fill=(20, 14, 32, 110))
    # A-frame silhouette + two canvas faces split at the ridge.
    _tri(d, [(18, 33), (62, 33), (40, 3.5)], outer)
    d.polygon([(40, 5), (60, 32), (40, 32)], fill=shade(pal["outer"], .68))
    # Canvas seam lines.
    d.line([(40, 5), (40, 32)], fill=OUTLINE, width=.6)
    d.line([(20, 32), (40, 5)], fill=shade(pal["outer"], 1.3), width=.6)
    # Door flap.
    _tri(d, [(33.5, 32.5), (46.5, 32.5), (40, 14)], inner)
    d.polygon([(40, 15.5), (45.5, 31.5), (40, 31.5)], fill=shade(pal["inner"], .6))
    # Ridge cap + ground stakes.
    d.rectangle([38.5, 3, 41.5, 5.5], fill=WOOD, outline=OUTLINE)
    for sx in (18.5, 61.5):
        d.line([(sx, 31.5), (sx - 1.5 if sx < 40 else sx + 1.5, 34)],
               fill=OUTLINE, width=1)
    return im


def draw_fire():
    im = new_part()
    d = SDraw(im)
    d.ellipse([48, 30, 61, 34.5], fill=(20, 14, 32, 110))
    # Stone ring.
    for i, (sx, sy, sr) in enumerate([(49, 32.5, 1.8), (52, 33.5, 2), (56, 33.5, 2),
                                      (59, 32.5, 1.8), (54, 33.8, 1.6)]):
        d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=STONE)
        d.ellipse([sx - sr + .8, sy - sr + .8, sx + sr - .8, sy + sr - .8],
                  fill=STONE_DARK)
    # Crossed logs.
    d.polygon([(50, 31), (58, 28.5), (58.5, 30), (50.5, 32.5)], fill=OUTLINE)
    d.polygon([(50.5, 30.8), (57.8, 28.6), (58.1, 29.6), (50.9, 31.8)], fill=WOOD)
    d.polygon([(58, 31), (50, 28.5), (49.5, 30), (57.5, 32.5)], fill=OUTLINE)
    d.polygon([(57.5, 30.8), (50.2, 28.6), (49.9, 29.6), (57.1, 31.8)],
              fill=WOOD_LIGHT)
    return im


def draw_flame():
    """Flame only — sits on its own bone over the fire so the idle
    animation can flicker it without moving the stones and logs."""
    im = new_part()
    d = SDraw(im)
    # Outer orange teardrop + inner yellow tongue.
    d.polygon([(54, 30.5), (50.5, 26.5), (52, 21), (54, 24.5), (56, 20),
               (58, 26.5)], fill=OUTLINE)
    d.polygon([(54, 30), (51.2, 26.5), (52.5, 22), (54, 25), (55.8, 21.5),
               (57.2, 26.5)], fill=FLAME)
    d.polygon([(54, 29), (52.6, 26.8), (54, 24), (55.4, 26.8)], fill=FLAME_LIGHT)
    return im


def draw_crystal_base(rgb):
    """Stationary rock base — ground shadow + stone setting. The shards are
    separate parts on orbiting bones so the base never moves."""
    im = new_part()
    d = SDraw(im)
    d.ellipse([29, 30.5, 51, 34.5], fill=(20, 14, 32, 110))
    d.polygon([(30.5, 33.5), (49.5, 33.5), (47.5, 29), (32.5, 29)], fill=OUTLINE)
    d.polygon([(31.5, 33), (48.5, 33), (47, 29.8), (33, 29.8)], fill=STONE_DARK)
    d.polygon([(33, 29.8), (40, 29.8), (40, 33), (31.5, 33)], fill=STONE)
    return im


def draw_crystal_shard(rgb, part):
    """One floating shard — drawn at the same cell coords it held in the
    composite, so its attachment offset lands it back in place."""
    im = new_part()
    d = SDraw(im)
    main, light, dark = rgba(rgb), shade(rgb, 1.35), shade(rgb, .62)
    if part == "left":
        _tri(d, [(30, 29.5), (33.5, 13.5), (36.5, 29.5)], dark)
    elif part == "right":
        _tri(d, [(44, 29.5), (47, 11.5), (50.5, 29.5)], dark)
    else:  # main — faceted diamond
        d.polygon([(40, 6), (33.5, 19), (40, 31), (46.5, 19)], fill=OUTLINE)
        d.polygon([(40, 7.5), (35, 19), (40, 29.5)], fill=light)
        d.polygon([(40, 7.5), (45, 19), (40, 29.5)], fill=main)
        d.polygon([(40, 29.5), (35, 19), (40, 21)], fill=main)
        d.polygon([(40, 29.5), (45, 19), (40, 21)], fill=dark)
        d.polygon([(40, 7.5), (37.5, 12.5), (42.5, 12.5)], fill=shade(rgb, 1.8))
        d.rectangle([36, 15.5, 36.8, 16.3], fill=shade(rgb, 1.8))
        d.rectangle([44, 23.5, 44.8, 24.3], fill=shade(rgb, 1.6))
    return im


def draw_quest():
    im = new_part()
    d = SDraw(im)
    d.ellipse([34, 31, 46, 34.5], fill=(20, 14, 32, 110))
    # Post.
    d.rectangle([38.3, 15, 41.7, 33.5], fill=OUTLINE)
    d.rectangle([39, 15.5, 41, 33], fill=WOOD)
    d.rectangle([39, 15.5, 39.8, 33], fill=WOOD_LIGHT)
    # Board — parchment notice nailed to a wood frame.
    d.rectangle([31.5, 7, 48.5, 19], fill=OUTLINE)
    d.rectangle([32.5, 8, 47.5, 18], fill=WOOD)
    d.rectangle([34, 9.5, 46, 16.5], fill=PARCHMENT)
    d.rectangle([34, 9.5, 46, 10.3], fill=shade(_hx(0xE9D098), .85))
    # Painted "!".
    d.rectangle([39.3, 10.8, 40.8, 13.8], fill=RED)
    d.rectangle([39.3, 14.6, 40.8, 15.8], fill=RED)
    # Nail heads + grass tuft.
    d.rectangle([33.5, 8.8, 34.3, 9.6], fill=OUTLINE)
    d.rectangle([45.8, 8.8, 46.6, 9.6], fill=OUTLINE)
    d.line([(36, 33.5), (35.2, 31.5)], fill=(90, 140, 80, 255), width=.8)
    d.line([(44, 33.5), (44.8, 31.5)], fill=(90, 140, 80, 255), width=.8)
    return im


def draw_item():
    im = new_part()
    d = SDraw(im)
    d.ellipse([34, 30.5, 46, 34], fill=(20, 14, 32, 110))
    # Bottle: round flask + neck + cork.
    d.ellipse([35, 20.5, 45, 31.5], fill=OUTLINE)
    d.ellipse([36, 21.5, 44, 30.5], fill=GLASS)
    # Liquid fills the bottom half — a flattened polygon approximating the
    # flask's lower arc (SDraw has no pieslice).
    d.polygon([(36.5, 26), (43.5, 26), (43.5, 28), (42.5, 30), (37.5, 30),
               (36.5, 28)], fill=RED)
    d.polygon([(37.5, 27), (42.5, 27), (41.8, 29.3), (38.2, 29.3)],
              fill=RED_LIGHT)
    d.rectangle([38.3, 16.5, 41.7, 22], fill=OUTLINE)
    d.rectangle([39, 17, 41, 21.5], fill=GLASS)
    d.rectangle([37.8, 14, 42.2, 17], fill=OUTLINE)
    d.rectangle([38.5, 14.7, 41.5, 16.5], fill=WOOD_LIGHT)
    # Glass highlight.
    d.rectangle([37.5, 22.5, 38.5, 25.5], fill=(255, 255, 255, 200))
    return im


def eased(keys):
    result = []
    for start, end in zip(keys, keys[1:]):
        steps = max(2, math.ceil((end['time'] - start['time']) * 60))
        for i in range(steps):
            u = i / steps
            mix = (1 - math.cos(math.pi * u)) / 2
            result.append({
                'time': round(start['time'] + (end['time'] - start['time']) * u, 6),
                **{k: round(start[k] + (end[k] - start[k]) * mix, 4)
                   for k in start if k != 'time'},
            })
    return result + [keys[-1]]


def main():
    # Bone world positions — spread so the editor shows every prop in a row.
    # PropSprite zeroes these at load; in-world each prop anchors at its POI.
    # The flame shares the fire's anchor so they composite into one
    # campfire; a separate bone lets the flame flicker alone. Same for the
    # crystal's shards — they share the base's anchor but orbit on their own
    # bones while the base stays put.
    BONES = [("root", None, 0, 0), ("tent", "root", 0, 0),
             ("fire", "root", 16, 0), ("flame", "root", 16, 0),
             ("crystal", "root", 52, 0),
             ("shard_l", "root", 52, 0), ("shard_m", "root", 52, 0),
             ("shard_r", "root", 52, 0),
             ("quest", "root", 88, 0), ("item", "root", 118, 0)]
    bone_world = {n: (x, y) for n, _p, x, y in BONES}

    # (slot, bone, {key: image}) — no default attachment: the runtime picks
    # one variant per POI and the editor picks via the Catalog tab.
    parts = []
    for skin_id, pal in TENT_SKINS.items():
        parts.append((f"tent_{skin_id}", "tent", draw_tent(pal)))
    parts.append(("fire", "fire", draw_fire()))
    parts.append(("flame", "flame", draw_flame()))
    parts.append(("crystal", "crystal", draw_crystal_base(CRYSTAL)))
    parts.append(("crystal_active", "crystal",
                  draw_crystal_base(CRYSTAL_ACTIVE)))
    for shard, which in (("shard_l", "left"), ("shard_m", "main"),
                         ("shard_r", "right")):
        parts.append((shard, shard, draw_crystal_shard(CRYSTAL, which)))
        parts.append((f"{shard}_active", shard,
                      draw_crystal_shard(CRYSTAL_ACTIVE, which)))
    parts.append(("quest", "quest", draw_quest()))
    parts.append(("item", "item", draw_item()))

    os.makedirs(OUT_DIR, exist_ok=True)
    regions, bboxes = {}, {}
    slots = {}
    for key, bone, img in parts:
        slot = f"{bone}_{bone}"
        bbox = img.getbbox() or (0, 0, 1, 1)
        path = f"{slot}__{key}"
        region = img.crop(bbox)
        regions[path] = region.resize(
            (max(1, round(region.width * ART / DS)),
             max(1, round(region.height * ART / DS))),
            Image.Resampling.LANCZOS)
        bboxes[path] = tuple(v / DS for v in bbox)
        slots.setdefault(slot, {"bone": bone, "variants": []})["variants"].append(key)
        # Cell preview for the canvas map editor.
        img.resize((FRAME_W, FRAME_H), Image.Resampling.LANCZOS).save(
            os.path.join(OUT_DIR, f"prop_{key}.png"))

    # The crystal previews show the composed prop — base + all three shards —
    # so the map editor's picker still reads as a crystal, not a bare rock.
    for variant, rgb in (("crystal", CRYSTAL), ("crystal_active", CRYSTAL_ACTIVE)):
        comp = draw_crystal_base(rgb)
        for which in ("left", "main", "right"):
            comp.alpha_composite(draw_crystal_shard(rgb, which))
        comp.resize((FRAME_W, FRAME_H), Image.Resampling.LANCZOS).save(
            os.path.join(OUT_DIR, f"prop_{variant}.png"))

    atlas_img, placements = pack(regions)
    os.makedirs(OUT_DIR, exist_ok=True)
    atlas_img.save(os.path.join(OUT_DIR, OUT_IMG))

    lines = [OUT_IMG, f"size: {atlas_img.width},{atlas_img.height}",
             "format: RGBA8888", "filter: Nearest,Nearest", "repeat: none"]
    for name in sorted(placements):
        px_, py_, w, h = placements[name]
        lines += [name, "  rotate: false", f"  xy: {px_}, {py_}",
                  f"  size: {w}, {h}", f"  orig: {w}, {h}",
                  "  offset: 0, 0", "  index: -1"]
    with open(os.path.join(OUT_DIR, OUT_ATLAS), "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    bones_json = []
    for name, parent, x, y in BONES:
        b = {"name": name}
        if parent:
            b["parent"] = parent
        if x:
            b["x"] = x
        if y:
            b["y"] = y
        bones_json.append(b)

    slots_json = [{"name": slot, "bone": meta["bone"]}
                  for slot, meta in slots.items()]
    skin_atts = {}
    for slot, meta in slots.items():
        bx, by = bone_world[meta["bone"]]
        skin_atts[slot] = {}
        for key in meta["variants"]:
            path = f"{slot}__{key}"
            x0, y0, x1, y1 = bboxes[path]
            sx, sy = (x0 + x1) / 2 - FOOT_X, FOOT_Y - (y0 + y1) / 2
            skin_atts[slot][key] = {
                "path": path, "x": round(sx - bx, 3), "y": round(sy - by, 3),
                "width": x1 - x0, "height": y1 - y0,
            }

    IDLE = 1.6

    def cycle(duration, fn, translate=False):
        steps = math.ceil(duration * 60)
        keys = []
        for i in range(steps + 1):
            phase = 2 * math.pi * i / steps if i < steps else 0
            value = round(fn(phase), 4)
            keys.append({"time": round(duration * i / steps, 6),
                         **({"x": 0, "y": value} if translate else {"value": value})})
        return keys

    def scale_cycle(duration, fn):
        """fn(phase) -> (scaleX, scaleY) — absolute scale keys."""
        steps = math.ceil(duration * 60)
        keys = []
        for i in range(steps + 1):
            phase = 2 * math.pi * i / steps if i < steps else 0
            sx, sy = fn(phase)
            keys.append({"time": round(duration * i / steps, 6),
                         "x": round(sx, 4), "y": round(sy, 4)})
        return keys

    def orbit(duration, rx, ry, phase=0):
        """Slow closed loop — absolute x/y translate keys tracing an ellipse
        (squashed Y so the drift reads as circling in the world, not a flat
        screen-space wheel)."""
        steps = math.ceil(duration * 60)
        keys = []
        for i in range(steps + 1):
            p = phase + 2 * math.pi * i / steps if i < steps else phase
            keys.append({"time": round(duration * i / steps, 6),
                         "x": round(rx * math.cos(p), 4),
                         "y": round(ry * math.sin(p), 4)})
        return keys

    ORBIT_T = 4.2   # slow shard drift
    ORBIT_P = 2 * math.pi / 3  # 120° between the three shards

    animations = {"idle": {"bones": {
        # Crystal base stays planted — only the shard bones drift, each in a
        # slow circle around its own rest spot, phased a third apart.
        "shard_l": {"translate": orbit(ORBIT_T, 1.7, 1.1, 0),
                    "rotate": cycle(3.1, lambda p: 1.8 * math.sin(p))},
        "shard_m": {"translate": orbit(ORBIT_T, 1.7, 1.1, ORBIT_P),
                    "rotate": cycle(3.1, lambda p: 1.8 * math.sin(p + ORBIT_P))},
        "shard_r": {"translate": orbit(ORBIT_T, 1.7, 1.1, 2 * ORBIT_P),
                    "rotate": cycle(3.1, lambda p: 1.8 * math.sin(p + 2 * ORBIT_P))},
        # Signpost bobs as if the notice flutters.
        "quest": {"rotate": cycle(IDLE, lambda p: 2 * math.sin(p - .3)),
                  "translate": cycle(IDLE, lambda p: .35 * (1 - math.cos(p)), True)},
        # Fire stays planted — the flame bone alone flickers: a quick
        # vertical surge with a side sway and a faint lick off the top.
        "flame": {
            "rotate": cycle(.9, lambda p: 4.5 * math.sin(2 * p)
                            + 1.5 * math.sin(5 * p + .8)),
            "scale": scale_cycle(.9, lambda p: (
                1 + .05 * math.sin(3 * p + 1.1),
                1 + .13 * math.sin(2 * p + .4) + .05 * math.sin(5 * p))),
        },
        # Potion bob.
        "item": {"translate": cycle(IDLE, lambda p: .4 * (1 - math.cos(p)), True)},
    }}}

    skeleton = {
        "skeleton": {"spine": "4.3.0", "hash": "propdoll",
                     "x": -22, "y": -32, "width": 44, "height": 34, "fps": 30},
        "bones": bones_json,
        "slots": slots_json,
        "skins": [{"name": "default", "attachments": skin_atts}],
        "animations": animations,
    }
    with open(os.path.join(OUT_DIR, OUT_JSON), "w", newline="\n") as f:
        json.dump(skeleton, f)

    # Editor spec — propdoll shows up as a first-class character in
    # tools/editor (bone/anim editing, catalog picks, working Regenerate).
    spec = {
        "generator": "tools/gen_props.py",
        "output": {"dir": "wails/frontend/public/assets/spine", "name": "propdoll"},
        "source": {"dir": "tools", "frame": 0, "footX": FOOT_X, "footY": FOOT_Y,
                   "pad": PAD, "overlap": 0, "atlasWidth": atlas_img.width},
        "partOrder": list(slots),
        "partRules": [],
        "layers": [{"name": bone, "part": "auto"}
                   for bone in ("tent", "fire", "flame", "crystal",
                                "shard_l", "shard_m", "shard_r",
                                "quest", "item")],
        "bones": [{"name": n, "parent": p, "x": x, "y": y}
                  for n, p, x, y in BONES],
        "shapeKeys": [],
        "shapeNeutral": [],
        "catalog": {meta["bone"]: [{"key": k, "slot": slot}
                                   for k in meta["variants"]]
                    for slot, meta in slots.items()},
        "animations": animations,
    }
    with open(os.path.join(ROOT, "tools", "propdoll.spec.json"), "w", newline="\n") as f:
        json.dump(spec, f, indent=2)
        f.write("\n")

    print(f"regions={len(regions)} slots={len(slots_json)} "
          f"atlas={atlas_img.width}x{atlas_img.height}")


if __name__ == "__main__":
    main()
