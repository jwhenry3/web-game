#!/usr/bin/env python3
"""Generate placeholder map-feature art + catalog for the map stamp editor.

The map editor stamps hand-drawn modular features onto the `clara_mundi`
world map instead of painting tile terrain. This generator produces the
starter catalog: 12 variants each of `water`, `building`, and `land`
features — stylized pixel-art PNGs plus alpha-derived collision polygons.

Output:
  wails/frontend/public/assets/map-features/<category>/<id>.png
  wails/frontend/public/assets/map-features/catalog.json

Catalog schema (fixed contract — the editor UI builds against it):
  { "features": [ { "id", "category", "image", "w", "h",
                    "collision": [[{"x":..,"y":..}, ...], ...] } ] }
Collision points are feature-local pixels with the origin at the image
top-left. A feature may carry zero or more polygons.

Deterministic: every feature draws from random.Random keyed on its id, so
re-runs are byte-stable. Run from the repo root:

  python tools/gen_map_features.py
"""

import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "wails/frontend/public/assets/map-features")
CATALOG = os.path.join(OUT_DIR, "catalog.json")
IMG_BASE = "/assets/map-features"

ALPHA_CUT = 128        # collision contour threshold on the alpha channel
RDP_EPS = 1.5          # Ramer-Douglas-Peucker simplification, px
MIN_POLY_AREA = 24.0   # drop speck-sized contours

INK = (26, 22, 34, 255)

# Three kinds per category x four variants = 12 features per category.
KINDS = {
    "water": ("pond", "lake", "pool", "open"),
    "building": ("hut", "house", "tower"),
    "land": ("grass", "rock", "sand", "snow"),
}
PER_KIND = 4

WATER_PALETTES = {
    "pond": ((168, 216, 224), (64, 136, 200), (36, 88, 160), (150, 210, 240)),
    "lake": ((150, 200, 214), (48, 112, 184), (26, 66, 140), (130, 190, 226)),
    "pool": ((170, 225, 220), (56, 168, 180), (30, 110, 140), (160, 225, 215)),
    # Shoreless interior fill — soft alpha edges so large bodies tile
    # seamlessly without shoreline rings in open water.
    "open": ((0, 0, 0), (58, 128, 196), (34, 80, 152), (140, 196, 232)),
}


# ---------------------------------------------------------------------------
# Shape helpers
# ---------------------------------------------------------------------------
def blob_points(rng, cx, cy, rx, ry, n=28, jag=0.16):
    """Irregular closed outline: base ellipse modulated by a few sine
    harmonics plus per-vertex jitter. Reads organic once pixelated."""
    harmonics = [
        (rng.randint(2, 4), rng.uniform(0, 2 * math.pi), rng.uniform(0.05, 0.16))
        for _ in range(3)
    ]
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        r = 1.0 + rng.uniform(-jag, jag)
        for k, phase, amp in harmonics:
            r += amp * math.sin(k * t + phase)
        pts.append((cx + rx * r * math.cos(t), cy + ry * r * math.sin(t)))
    return pts


def shrink(pts, cx, cy, f):
    return [(cx + (x - cx) * f, cy + (y - cy) * f) for x, y in pts]


def pixelate(img, factor=2):
    """Downscale→upscale with NEAREST for a deliberate chunky pixel grid."""
    w, h = img.size
    small = img.resize((max(1, w // factor), max(1, h // factor)),
                       Image.NEAREST)
    return small.resize((w, h), Image.NEAREST)


# ---------------------------------------------------------------------------
# Feature painters — each returns a finished RGBA image.
# ---------------------------------------------------------------------------
def draw_water(rng, kind):
    """Layered pond/lake blob: light shore rim, mid water, deep center.
    "open" drops the shoreline — a soft-edged interior patch that blends
    seamlessly into neighbouring water."""
    lo, hi = {"pond": (96, 136), "lake": (140, 192), "pool": (112, 168),
              "open": (160, 224)}[kind]
    w, h = rng.randint(lo, hi), rng.randint(lo, hi)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    shore_c, mid_c, deep_c, lite_c = WATER_PALETTES[kind]

    outline = blob_points(rng, cx, cy, w * 0.46, h * 0.45)
    if kind == "open":
        d.polygon(outline, fill=mid_c + (255,))
        d.polygon(shrink(outline, cx, cy, 0.6), fill=deep_c + (255,))
        for _ in range(rng.randint(3, 6)):
            gx = cx + rng.uniform(-0.25, 0.25) * w
            gy = cy + rng.uniform(-0.2, 0.2) * h
            d.rectangle([gx, gy, gx + rng.uniform(2, 6), gy + 1],
                        fill=lite_c + (200,))
        img = pixelate(img)
        # Feathered alpha edge instead of the hard shore rim.
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).polygon(outline, fill=255)
        img.putalpha(Image.composite(
            img.getchannel("A"), mask.filter(ImageFilter.GaussianBlur(radius=6)),
            mask))
        return img
    d.polygon(outline, fill=shore_c + (255,))
    d.polygon(shrink(outline, cx, cy, 0.86), fill=mid_c + (255,))
    d.polygon(shrink(outline, cx, cy, 0.55), fill=deep_c + (255,))
    # Surface glints.
    for _ in range(rng.randint(3, 7)):
        gx = cx + rng.uniform(-0.25, 0.25) * w
        gy = cy + rng.uniform(-0.2, 0.2) * h
        d.rectangle([gx, gy, gx + rng.uniform(2, 6), gy + 1], fill=lite_c + (220,))
    return pixelate(img)


def _shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3])


def _lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


# Semi-isometric buildings share the character pipeline's plum outline.
B_OUTLINE = (44, 30, 54, 255)

# House roofs cycle a saturated JRPG palette so village variants differ.
HOUSE_ROOFS = [
    (188, 72, 60),    # clay red
    (84, 116, 178),   # slate blue
    (104, 156, 88),   # moss green
    (152, 108, 168),  # plum violet
]
STONE_WALL = (170, 166, 182)
STONE_SIDE = (128, 124, 146)
SLATE_ROOF = (96, 90, 128)
WOOD_WALL = (186, 144, 94)
WOOD_SIDE = (140, 104, 66)
THATCH = (210, 172, 96)
PLASTER = (230, 212, 178)
PLASTER_SIDE = (178, 158, 128)
TIMBER = (150, 104, 66)
DOOR_C = (86, 60, 44)
WINDOW_C = (244, 222, 140)
FOUNDATION = (110, 104, 128)


def draw_building(rng, kind):
    """Front-facing JRPG structure — symmetric facade, hip/spire roof, no
    oblique side face (the world is orthographic; iso massing read as tilt).
    Drawn at 3x and LANCZOS-downscaled for smooth high-fidelity edges.

    Returns (img, collision): the footprint strip along the base, not the
    alpha silhouette — roofs and overhangs shouldn't block movement."""
    SS = 3
    w_rng, h_rng = {
        "hut":   ((150, 190), (110, 140)),
        "house": ((200, 264), (132, 178)),
        "tower": ((108, 132), (190, 240)),
    }[kind]
    w, h = rng.randint(*w_rng), rng.randint(*h_rng)
    # Pre-layout: the roof's full rise (front slope + the visible back
    # slope, pennant on towers) must fit above the wall — grow the canvas
    # rather than clip the silhouette.
    base_m = rng.uniform(14, 20)
    wall_h = {"hut": 0.50, "house": 0.55, "tower": 0.70}[kind] * h
    rh = (rng.uniform(0.30, 0.38) if kind != "tower"
          else rng.uniform(0.20, 0.26)) * h
    bh = rh * rng.uniform(0.38, 0.55)          # visible back slope height
    top_pad = max(24, bh + 6) if kind == "tower" else bh + 6
    h = max(h, math.ceil(wall_h + rh + top_pad + base_m))
    img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    # ImageDraw REPLACES pixels (no alpha compositing) — translucent detail
    # would overwrite the facade's alpha and make it see-through. Route any
    # fill with alpha < 255 onto an overlay that composites at the end.
    over = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dov = ImageDraw.Draw(over)
    OW = max(2, round(SS * 1.1))                 # outline stroke width

    def spts(pts):
        return [(x * SS, y * SS) for x, y in pts]

    def target(fill):
        return dov if len(fill) == 4 and fill[3] < 255 else dr

    def poly(pts, fill, outline=B_OUTLINE):
        target(fill).polygon(spts(pts), fill=fill)
        if outline:
            dr.line(spts(pts + [pts[0]]), fill=outline,
                    width=OW, joint="curve")

    def rect(x0, y0, x1, y1, fill, outline=B_OUTLINE):
        poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, outline)

    def seg(pts, fill, width=1.0):
        target(fill).line(spts(pts), fill=fill,
                          width=max(1, round(width * SS)))

    def oval(x0, y0, x1, y1, fill, outline=None):
        target(fill).ellipse([x0 * SS, y0 * SS, x1 * SS, y1 * SS],
                             fill=fill, outline=outline, width=OW)

    if kind == "hut":
        wall, roof = WOOD_WALL, THATCH
    elif kind == "house":
        wall = PLASTER
        roof = HOUSE_ROOFS[rng.randrange(len(HOUSE_ROOFS))]
    else:
        wall, roof = STONE_WALL, SLATE_ROOF
    wall_d = _shade(wall, 0.74)
    wall_l = _shade(wall, 1.12)
    roof_d = _shade(roof, 0.62)
    roof_l = _shade(roof, 1.22)

    # --- layout (all in final-pixel units) -------------------------------
    ov = rng.uniform(8, 14)                      # eave overhang each side
    x0 = ov + rng.uniform(5, 12)
    x1 = w - x0                                  # symmetric facade
    cx = (x0 + x1) / 2
    y_base = h - base_m
    y_wall = y_base - wall_h
    taper = rng.uniform(4, 8) if kind == "tower" else 0
    ridge_y = y_wall - rh
    e_l, e_r = (x0 - ov + taper, y_wall), (x1 + ov - taper, y_wall)
    rw = 0 if kind == "tower" else (x1 - x0) * rng.uniform(0.26, 0.40)
    r_l, r_r = (cx - rw, ridge_y), (cx + rw, ridge_y)
    # Back slope: the roof continues past the ridge to a narrower back eave,
    # so the silhouette is a solid hexagon — nothing shows through behind
    # the peak.
    bin_ = rw * rng.uniform(0.2, 0.45) + ov * 0.5
    b_l = (cx - rw - bin_, ridge_y - bh)
    b_r = (cx + rw + bin_, ridge_y - bh)

    # Soft ground shadow under the footprint.
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse(
        [x0 * SS - 8, (y_base - 5) * SS, x1 * SS + 8, (y_base + 7) * SS],
        fill=(20, 14, 32, 120))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(radius=3 * SS)))

    # --- wall --------------------------------------------------------------
    wt = [(x0 + taper, y_wall), (x1 - taper, y_wall),
          (x1, y_base), (x0, y_base)]
    poly(wt, wall + (255,))
    # Sunlit gradient — pale bands up top, ambient occlusion at the base.
    n = 8
    for i in range(n):
        t = i / n
        if i < n - 3:
            a = round(46 * (1 - t) ** 2)
            if a:
                rect(x0 + 1, y_wall + wall_h * t,
                     x1 - 1, y_wall + wall_h * (t + 1 / n),
                     (*wall_l[:3], a), outline=None)
    rect(x0 + 1, y_base - wall_h * 0.14, x1 - 1, y_base,
         (*wall_d[:3], 70), outline=None)
    # Foundation plinth with stone joints.
    plinth = max(6, wall_h * 0.10)
    rect(x0 - 1, y_base - plinth, x1 + 1, y_base, FOUNDATION + (255,))
    px = x0 + 6
    while px < x1 - 4:
        seg([(px, y_base - plinth + 2), (px, y_base - 1)],
            _shade(FOUNDATION, 0.7) + (255,), 0.8)
        px += rng.uniform(10, 16)

    if kind == "house":
        # Timber frame: corner posts, eave + mid beams, corner braces.
        for bx in (x0 + 1, x1 - 6):
            rect(bx, y_wall + 1, bx + 5, y_base - plinth, TIMBER + (255,))
        rect(x0, y_wall, x1, y_wall + 4, TIMBER + (255,))
        mid_y = y_wall + wall_h * 0.52
        rect(x0 + 4, mid_y, x1 - 4, mid_y + 3.5, TIMBER + (255,))
        seg([(x0 + 6, y_wall + 4), (x0 + 22, mid_y)], TIMBER + (255,), 2.4)
        seg([(x1 - 6, y_wall + 4), (x1 - 22, mid_y)], TIMBER + (255,), 2.4)
    elif kind == "hut":
        # Vertical plank seams + rail.
        sx = x0 + (x1 - x0) / 5
        while sx < x1 - 3:
            seg([(sx, y_wall + 3), (sx, y_base - plinth)],
                wall_d + (200,), 0.7)
            sx += (x1 - x0) / 5
        rect(x0, y_wall + wall_h * 0.45, x1, y_wall + wall_h * 0.45 + 3,
             WOOD_SIDE + (255,))
    else:
        # Stone courses with staggered joints.
        sy = y_wall + 8
        row = 0
        while sy < y_base - plinth - 4:
            seg([(x0 + taper + 1, sy), (x1 - taper - 1, sy)],
                wall_d + (255,), 0.9)
            jx = x0 + taper + (14 if row % 2 else 6)
            while jx < x1 - taper - 4:
                seg([(jx, sy), (jx, sy + 8)], wall_d + (160,), 0.7)
                jx += rng.uniform(16, 24)
            sy += 8
            row += 1

    # --- roof --------------------------------------------------------------
    if kind == "tower":
        # Rear spire facet peeks over the front — solid silhouette.
        poly([(e_l[0] - 1, y_wall - 1), (e_r[0] + 1, y_wall - 1),
              (cx, ridge_y - bh)], _shade(roof, 0.8) + (255,))
        # Brim + pyramid spire.
        rect(e_l[0] - 3, y_wall - 4, e_r[0] + 3, y_wall + 1,
             _shade(roof, 0.8) + (255,))
        poly([e_l, e_r, (cx, ridge_y - 6)], roof + (255,))
        seg([e_l, (cx, ridge_y - 6)], roof_d + (255,), 1.2)
        seg([e_r, (cx, ridge_y - 6)], roof_l + (255,), 1.2)
        for t in (0.35, 0.62, 0.85):             # spire banding
            a = _lerp(e_l, (cx, ridge_y - 6), t)
            b = _lerp(e_r, (cx, ridge_y - 6), t)
            seg([a, b], roof_d + (200,), 0.9)
        # Pennant on a pole off the apex.
        seg([(cx, ridge_y - 6), (cx, ridge_y - 18)], B_OUTLINE, 1.0)
        poly([(cx, ridge_y - 18), (cx + 11, ridge_y - 15),
              (cx, ridge_y - 12)], (196, 74, 68, 255))
    else:
        # Hip roof straight-on: back slope behind the ridge, hip-end
        # triangles at the sides, then the front slope — a solid silhouette
        # with no transparency showing through behind the peak.
        roof_b = _shade(roof, 0.82)              # back slope, least lit
        roof_m = _shade(roof, 0.92)              # hip ends
        poly([r_l, r_r, b_r, b_l], roof_b + (255,))
        poly([e_l, r_l, b_l], roof_m + (255,))
        poly([e_r, r_r, b_r], roof_m + (255,))
        roof_pts = [e_l, e_r, r_r, r_l]
        poly(roof_pts, roof + (255,))
        # Slope shading — darker near eave, lit toward ridge.
        for i in range(6):
            t = i / 6
            a = _lerp(e_l, r_l, t), _lerp(e_r, r_r, t)
            b = _lerp(e_l, r_l, t + 1 / 6), _lerp(e_r, r_r, t + 1 / 6)
            shade = roof_l if t > 0.6 else roof
            dov.polygon(spts([a[0], b[0], b[1], a[1]]),
                        fill=(*shade[:3], 40))
        # Shingle courses with staggered ticks.
        for t in (0.22, 0.42, 0.60, 0.78):
            a, b = _lerp(e_l, r_l, t), _lerp(e_r, r_r, t)
            seg([a, b], roof_d + (220,), 1.1)
            tx = a[0] + 4
            while tx < b[0] - 2:
                seg([(tx, a[1]), (tx, a[1] + 3.5)], roof_d + (150,), 0.6)
                tx += rng.uniform(8, 13)
        # Hip lines from eave corners to ridge ends + lit ridge cap.
        seg([e_l, r_l], roof_d + (255,), 1.4)
        seg([e_r, r_r], roof_d + (255,), 1.4)
        seg([r_l, r_r], roof_l + (255,), 2.2)
        # Eave thickness band under the roof edge.
        poly([(e_l[0], y_wall), (e_r[0], y_wall),
              (e_r[0] - 2, y_wall + 4), (e_l[0] + 2, y_wall + 4)],
             roof_d + (255,))
        if kind == "hut":
            # Ragged thatch fringe along the eave.
            fx = e_l[0] + 2
            while fx < e_r[0] - 3:
                dln = rng.uniform(3, 6)
                poly([(fx, y_wall + 3), (fx + 5, y_wall + 3),
                      (fx + 2.5, y_wall + 3 + dln)],
                     roof_d + (255,), outline=None)
                fx += 7
            # Straw streaks on the slope.
            for _ in range(int((x1 - x0) / 6)):
                tx0 = rng.uniform(e_l[0] + 4, e_r[0] - 4)
                ty0 = rng.uniform(ridge_y + 4, y_wall - 8)
                seg([(tx0, ty0), (tx0 + rng.uniform(-1, 1), ty0 + 7)],
                    _shade(THATCH, 0.8) + (160,), 0.6)

    # Eave shadow cast on the wall.
    rect(x0 + 1, y_wall, x1 - 1, y_wall + 5, (20, 14, 32, 80), outline=None)

    # --- details -------------------------------------------------------------
    door_w = rng.uniform(16, 20) if kind != "tower" else rng.uniform(11, 14)
    door_x = cx + (rng.uniform(-0.14, 0.14) * (x1 - x0)
                   if kind != "tower" else 0)
    door_h = door_w * (1.6 if kind == "tower" else 1.4)
    # Frame, arched head, panel split, knob, step.
    rect(door_x - door_w / 2 - 2, y_base - door_h - 1,
         door_x + door_w / 2 + 2, y_base, TIMBER + (255,))
    rect(door_x - door_w / 2, y_base - door_h + 2,
         door_x + door_w / 2, y_base, DOOR_C + (255,), outline=None)
    oval(door_x - door_w / 2, y_base - door_h - 1,
         door_x + door_w / 2, y_base - door_h + door_w * 0.8,
         DOOR_C + (255,), outline=B_OUTLINE)
    seg([(door_x, y_base - door_h * 0.72), (door_x, y_base)],
        _shade(DOOR_C, 0.6) + (255,), 0.8)
    oval(door_x + door_w * 0.28 - 1.5, y_base - door_h * 0.42 - 1.5,
         door_x + door_w * 0.28 + 1.5, y_base - door_h * 0.42 + 1.5,
         (228, 200, 120, 255))
    rect(door_x - door_w / 2 - 3, y_base, door_x + door_w / 2 + 3,
         y_base + 4, FOUNDATION + (255,))

    # Windows — warm panes, mullions, sills; houses get shutters + a loft row.
    win_w = door_w * 0.9
    win_rows = [(y_wall + wall_h * 0.30, win_w)]
    if kind == "house" and wall_h > 60:
        win_rows.append((y_wall + wall_h * 0.10, win_w * 0.8))
    for wy, ww in win_rows:
        for wx in (x0 + (x1 - x0) * 0.20, x0 + (x1 - x0) * 0.80 - ww):
            if abs(wx + ww / 2 - door_x) < door_w * 0.9:
                continue
            rect(wx - 1.5, wy - 1.5, wx + ww + 1.5, wy + ww + 1.5,
                 TIMBER + (255,))
            rect(wx, wy, wx + ww, wy + ww, WINDOW_C + (255,), outline=None)
            # Pane shading — top-left lit, bottom-right warm dark.
            dov.polygon(spts([(wx, wy), (wx + ww, wy), (wx, wy + ww)]),
                        fill=(255, 244, 180, 90))
            seg([(wx + ww / 2, wy), (wx + ww / 2, wy + ww)], B_OUTLINE, 0.8)
            seg([(wx, wy + ww / 2), (wx + ww, wy + ww / 2)], B_OUTLINE, 0.8)
            rect(wx - 2.5, wy + ww + 1.5, wx + ww + 2.5, wy + ww + 3.5,
                 TIMBER + (255,), outline=None)
            if kind == "house" and ww == win_w:
                rect(wx - 5, wy, wx - 1.5, wy + ww, WOOD_SIDE + (255,))
                rect(wx + ww + 1.5, wy, wx + ww + 5, wy + ww,
                     WOOD_SIDE + (255,))

    if kind == "tower":
        # Arrow slits up the shaft.
        sy = y_wall + 12
        while sy < y_base - door_h - 16:
            rect(cx - 2, sy, cx + 2, sy + 8, (40, 34, 52, 255), outline=None)
            sy += 24
    elif kind == "house" and rng.random() < 0.75:
        # Chimney on the roof's right half + faint smoke.
        ch_w = rng.uniform(9, 13)
        ch_x = _lerp(e_r, r_r, 0.5)[0] - ch_w / 2
        ch_top = ridge_y + rng.uniform(-4, 4)
        rect(ch_x, ch_top, ch_x + ch_w,
             _lerp((cx, ridge_y), e_r, 0.55)[1], FOUNDATION + (255,))
        rect(ch_x - 2, ch_top - 3, ch_x + ch_w + 2, ch_top,
             _shade(FOUNDATION, 0.8) + (255,))
        for i in range(3):
            sxp = ch_x + ch_w / 2 + i * 3
            syp = ch_top - 10 - i * 9
            oval(sxp - 4 - i * 1.5, syp - 3 - i,
                 sxp + 4 + i * 1.5, syp + 3 + i,
                 (200, 200, 214, 70 - i * 16))

    if kind != "tower" and rng.random() < 0.6:
        # Hanging sign by the door.
        sgn_x = door_x + door_w * 1.3
        sgn_y = y_base - door_h - 6
        seg([(sgn_x, sgn_y), (sgn_x + 10, sgn_y)], TIMBER + (255,), 1.6)
        rect(sgn_x + 6, sgn_y, sgn_x + 13, sgn_y + 9, WOOD_SIDE + (255,))
        seg([(sgn_x + 7, sgn_y + 3), (sgn_x + 12, sgn_y + 3)],
            WINDOW_C + (255,), 0.8)

    # Grass tufts + pebbles where the walls meet the ground.
    for gx in (x0 + 2, x1 - 5, cx + rng.uniform(-0.3, 0.3) * (x1 - x0)):
        for i in range(3):
            bx = gx + i * 3
            seg([(bx, y_base + 1),
                 (bx + rng.uniform(-2.5, 2.5), y_base - rng.uniform(3, 7))],
                (90, 140, 80, 220), 0.9)
    for _ in range(3):
        pxs = rng.uniform(x0, x1)
        oval(pxs, y_base + 1, pxs + rng.uniform(2, 4),
             y_base + 2 + rng.uniform(1, 2), (*FOUNDATION[:3], 180))

    img.alpha_composite(over)
    img = img.resize((w, h), Image.LANCZOS)
    fpd = max(10, wall_h * 0.12)
    footprint = [[{"x": round(p[0], 1), "y": round(p[1], 1)} for p in poly_]
                 for poly_ in [[(x0, y_base - fpd), (x1, y_base - fpd),
                                (x1, y_base), (x0, y_base)]]]
    return img, footprint


def draw_land(rng, kind):
    """Soft ground patch: mottled fill inside an alpha-faded blob."""
    w, h = rng.randint(96, 160), rng.randint(96, 160)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)

    palettes = {
        "grass": ((96, 160, 80), (70, 128, 64), (128, 184, 96)),
        "rock": ((140, 120, 96), (110, 96, 76), (160, 148, 116)),
        "sand": ((216, 192, 136), (188, 164, 112), (232, 208, 152)),
        "snow": ((232, 240, 248), (200, 216, 232), (248, 250, 252)),
    }
    base, dark, lite = palettes[kind]
    d.rectangle([0, 0, w, h], fill=base + (255,))

    # Mottling — scattered 1–3px dashes; the alpha mask crops them to shape.
    for _ in range(w * h // 14):
        mx, my = rng.uniform(0, w), rng.uniform(0, h)
        c = dark if rng.random() < 0.55 else lite
        d.rectangle([mx, my, mx + rng.uniform(1, 3), my + rng.uniform(1, 2)],
                    fill=c + (255,))

    if kind == "rock":
        # Clustered outcrop: gray stepped boulders with ink + top light.
        rcx, rcy = w / 2 + rng.uniform(-6, 6), h / 2 + rng.uniform(-4, 4)
        for _ in range(rng.randint(3, 5)):
            rw, rh = rng.uniform(12, 30), rng.uniform(9, 20)
            ox, oy = rng.uniform(-14, 14), rng.uniform(-9, 9)
            box = [rcx + ox - rw / 2, rcy + oy - rh / 2,
                   rcx + ox + rw / 2, rcy + oy + rh / 2]
            d.polygon([(box[0] + 3, box[3]), (box[0], box[1] + rh * 0.4),
                       (box[0] + rw * 0.3, box[1]), (box[2] - rw * 0.2, box[1]),
                       (box[2], box[1] + rh * 0.5), (box[2] - 3, box[3])],
                      fill=(150, 150, 155, 255), outline=INK)
            d.line([(box[0] + rw * 0.3, box[1] + 1),
                    (box[2] - rw * 0.2, box[1] + 1)],
                   fill=(196, 196, 205, 255), width=1)
    elif kind == "sand":
        # Wind streaks.
        for _ in range(rng.randint(4, 8)):
            sy = rng.uniform(h * 0.2, h * 0.8)
            sx = rng.uniform(w * 0.15, w * 0.6)
            d.arc([sx, sy, sx + rng.uniform(18, 44), sy + rng.uniform(6, 14)],
                  start=200, end=340, fill=lite + (255,), width=1)

    # Alpha-faded irregular edge: blob mask, blurred, applied as alpha.
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.polygon(blob_points(rng, w / 2, h / 2, w * 0.48, h * 0.46, jag=0.2),
               fill=255)
    img = pixelate(img)
    img.putalpha(mask.filter(ImageFilter.GaussianBlur(radius=5)))
    return img


PAINTERS = {"water": draw_water, "building": draw_building, "land": draw_land}


# ---------------------------------------------------------------------------
# Collision extraction — alpha contour via marching squares + RDP simplify.
# ---------------------------------------------------------------------------
def _segments(mask, w, h):
    """Marching squares over the alpha mask (zero-padded). Returns an
    adjacency map of doubled lattice coordinates (ints) -> [neighbors]."""
    adj = {}

    def get(i, j):
        return mask[j][i] if 0 <= i < w and 0 <= j < h else 0

    def add(p, q):
        adj.setdefault(p, []).append(q)
        adj.setdefault(q, []).append(p)

    # Cell (i,j) spans field nodes (i,j),(i+1,j),(i+1,j+1),(i,j+1); its edge
    # midpoints in doubled coords are T/R/B/L below.
    for j in range(-1, h):
        for i in range(-1, w):
            case = (get(i, j) | get(i + 1, j) << 1 |
                    get(i + 1, j + 1) << 2 | get(i, j + 1) << 3)
            if case in (0, 15):
                continue
            T = (2 * i + 1, 2 * j)
            R = (2 * i + 2, 2 * j + 1)
            B = (2 * i + 1, 2 * j + 2)
            L = (2 * i, 2 * j + 1)
            table = {
                1: [(L, T)], 2: [(T, R)], 3: [(L, R)], 4: [(R, B)],
                5: [(L, T), (R, B)], 6: [(T, B)], 7: [(L, B)],
                8: [(B, L)], 9: [(T, B)], 10: [(T, R), (B, L)],
                11: [(B, R)], 12: [(R, L)], 13: [(T, R)], 14: [(T, L)],
            }
            for p, q in table[case]:
                add(p, q)
    return adj


def _loops(adj):
    """Consume the segment multigraph into closed point loops."""
    loops = []
    while adj:
        start = next(iter(adj))
        loop = [start]
        cur = start
        while True:
            nxt = adj[cur][0]
            adj[cur].pop(0)
            adj[nxt].remove(cur)
            if not adj[cur]:
                del adj[cur]
            if nxt in adj and not adj[nxt]:
                del adj[nxt]
            if nxt == start:
                break
            loop.append(nxt)
            cur = nxt
        loops.append(loop)
    return loops


def _rdp(pts, eps):
    """Ramer-Douglas-Peucker on an open point chain (endpoints kept)."""
    if len(pts) <= 2:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        dmax, imax = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            dist = (math.hypot(px - ax, py - ay) if norm == 0 else
                    abs(dy * px - dx * py + bx * ay - by * ax) / norm)
            if dist > dmax:
                dmax, imax = dist, i
        if dmax > eps:
            keep[imax] = True
            stack.append((a, imax))
            stack.append((imax, b))
    return [p for p, k in zip(pts, keep) if k]


def _area(pts):
    s = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        s += x0 * y1 - x1 * y0
    return s / 2


def alpha_polys(img):
    """Trace every alpha>128 contour, simplify to ~1.5px tolerance, and
    return polygons as feature-local px [{x,y},...] lists (origin at the
    image top-left), largest area first."""
    a = img.getchannel("A")
    w, h = img.size
    px = a.load()
    mask = [[1 if px[x, y] > ALPHA_CUT else 0 for x in range(w)]
            for y in range(h)]
    adj = _segments(mask, w, h)
    polys = []
    for loop in _loops(adj):
        # Lattice coords are doubled, node (i,j) sits on pixel (i,j) center —
        # +0.5 shifts contours onto pixel-boundary coords within [0,w]x[0,h].
        pts = [(x / 2 + 0.5, y / 2 + 0.5) for x, y in loop]
        simp = _rdp(pts + [pts[0]], RDP_EPS)[:-1]
        if len(simp) >= 3 and abs(_area(simp)) >= MIN_POLY_AREA:
            polys.append(simp)
    polys.sort(key=lambda p: -abs(_area(p)))
    return [[{"x": round(x, 1), "y": round(y, 1)} for x, y in p]
            for p in polys]


# ---------------------------------------------------------------------------
def main():
    catalog = {"features": []}
    counts = {}
    for category, kinds in KINDS.items():
        cat_dir = os.path.join(OUT_DIR, category)
        os.makedirs(cat_dir, exist_ok=True)
        counts[category] = 0
        for kind in kinds:
            for i in range(1, PER_KIND + 1):
                fid = f"{category}_{kind}_{i:02d}"
                rng = random.Random(f"mapfeature:{fid}")
                res = PAINTERS[category](rng, kind)
                # Painters may return (img, collision) to override the
                # alpha-traced polygons — buildings use the ground footprint
                # so roofs/overhangs don't block movement.
                if isinstance(res, tuple):
                    img, collision = res
                else:
                    img, collision = res, alpha_polys(res)
                w, h = img.size
                img.save(os.path.join(cat_dir, f"{fid}.png"))
                catalog["features"].append({
                    "id": fid,
                    "category": category,
                    "image": f"{IMG_BASE}/{category}/{fid}.png",
                    "w": w,
                    "h": h,
                    "collision": collision,
                })
                counts[category] += 1

    with open(CATALOG, "w", newline="\n") as f:
        json.dump(catalog, f, indent=2)
        f.write("\n")

    total = sum(counts.values())
    print(f"gen_map_features: wrote {total} features -> {OUT_DIR}")
    for cat, n in counts.items():
        polys = sum(len(ft["collision"]) for ft in catalog["features"]
                    if ft["category"] == cat)
        print(f"  {cat:<9} {n:2d} pngs, {polys} collision polys")
    print(f"  catalog   {CATALOG}")


if __name__ == "__main__":
    main()
