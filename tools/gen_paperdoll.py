#!/usr/bin/env python3
"""Generate a paper-doll base character as a Spine skeleton + atlas.

Draws an original 16-bit JRPG-style adventurer with a compact pixel palette,
stepped hair, shaded clothing, and two-segment limbs. Joint overlaps remain
centered on Spine pivots, with no exposed fastener rings.

Cell convention matches Heroes 99: 100x40 frame, feet baseline at
FOOT_X/FOOT_Y, so the doll drops into the same world scale and shares the
same animation set (idle/run/attack/ride_idle/ride_run).

Output: wails/frontend/public/assets/spine/paperdoll.{png,atlas,json}

Run from the repo root:  python tools/gen_paperdoll.py
"""

import json
import math
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "wails/frontend/public/assets/spine")
OUT_IMG = "paperdoll.png"
OUT_ATLAS = "paperdoll.atlas"
OUT_JSON = "paperdoll.json"
PREVIEW = os.path.join(OUT_DIR, "paperdoll_preview.png")

FRAME_W, FRAME_H = 100, 40
FOOT_X, FOOT_Y = 39.5, 34.0
PAD = 2

# Parts draw on a fine internal grid (DS px per cell unit) and each atlas
# region downsamples LANCZOS to ART px/unit — smooth anti-aliased edges at
# the same texel density the old 2x NEAREST supersample only simulated.
# Skeleton coordinates and world scale stay fixed.
DS = 8    # internal draw grid, px per cell unit
ART = 4   # atlas density, px per cell unit


class SDraw:
    """ImageDraw proxy that scales all coordinates by DS — draw code stays in
    cell units."""

    def __init__(self, img):
        self.d = ImageDraw.Draw(img)

    def _box(self, b):
        return [v * DS for v in b]

    def _pts(self, pts):
        # Accept [(x,y), ...] or flat [x0, y0, x1, y1, ...]
        if pts and isinstance(pts[0], (int, float)):
            return [v * DS for v in pts]
        return [(x * DS, y * DS) for x, y in pts]

    @staticmethod
    def _fill_only(kw):
        """Strip Pillow's per-part contour; Phaser outlines the composite."""
        kw.pop("outline", None)
        kw.pop("width", None)
        return kw

    def line(self, pts, width=1, **kw):
        self.d.line(self._pts(pts), width=max(1, round(width * DS)), **kw)

    def ellipse(self, box, **kw):
        self.d.ellipse(self._box(box), **self._fill_only(kw))

    def rectangle(self, box, **kw):
        self.d.rectangle(self._box(box), **self._fill_only(kw))

    def rounded_rectangle(self, box, radius=0, **kw):
        self.d.rounded_rectangle(self._box(box), radius=radius * DS,
                                 **self._fill_only(kw))

    def arc(self, box, start, end, **kw):
        self.d.arc(self._box(box), start=start, end=end, **kw)

    def polygon(self, pts, **kw):
        self.d.polygon(self._pts(pts), **self._fill_only(kw))

# ---------------------------------------------------------------------------
# Palette — warm high-fantasy SNES house style.
#
# The palette deliberately shares one near-black plum outline and a three-step
# ramp per material.  That is the most important visual rule for keeping the
# modular layers coherent: hue may change, but value grouping does not.
# ---------------------------------------------------------------------------
SKIN = (231, 174, 128, 255)
SKIN_DARK = (177, 112, 94, 255)
OUTLINE = (44, 30, 54, 255)
SKIN_LIGHT = (255, 218, 156, 255)
TEAL = (45, 132, 126, 255)
TEAL_DARK = (35, 70, 86, 255)
TEAL_LIGHT = (104, 194, 157, 255)
HAIR = (108, 61, 51, 255)
HAIR_DARK = (60, 40, 49, 255)
HAIR_LIGHT = (180, 104, 62, 255)
RED = (184, 60, 68, 255)
RED_LIGHT = (239, 116, 90, 255)
LEATHER = (117, 70, 54, 255)
LEATHER_LIGHT = (179, 120, 74, 255)
PANTS = (70, 67, 89, 255)
PANTS_LIGHT = (113, 111, 137, 255)
BRIEF = (244, 240, 234, 255)       # painted-on undergarment
BRIEF_LINE = (190, 180, 170, 255)
EYE = (60, 45, 35, 255)
MOUTH = (170, 90, 80, 255)
BLUSH = (235, 160, 140, 140)

# ---------------------------------------------------------------------------
# Joint layout (cell coords). Profile view facing +x like the H99 art —
# flipX mirrors it for left-facing. Brads sit at every pivot.
# ---------------------------------------------------------------------------
NECK = (40.5, 18.0)
# Compact heroic proportions: oversized head and costume masses, short torso,
# wide-set shoulders, large hands and grounded boots.  The stance stays a
# readable three-quarter view so the existing single-direction rig can mirror.
# F/B name the rendered side, not the silhouette edge: F limbs are the near
# (camera) side drawn over the torso, B limbs the far side drawn behind it.
SH_F, ELB_F, WRI_F = (36.5, 20.7), (35.0, 23.7), (35.0, 26.2)
SH_B, ELB_B, WRI_B = (43.5, 20.7), (45.0, 23.7), (45.5, 26.2)
HIP_F, KNEE_F, ANK_F = (38.0, 26.0), (37.5, 30.0), (37.5, 33.5)
HIP_B, KNEE_B, ANK_B = (42.5, 26.0), (43.0, 30.0), (43.0, 33.5)
# Weapon mounts pivot on the fist — the hand blob hangs ~2 units below the
# wrist joint, so the grip sits mid-fist rather than on the wrist.
HAND_F = (WRI_F[0], WRI_F[1] + 1.75)
HAND_B = (WRI_B[0], WRI_B[1] + 1.75)


def capsule(d, p0, p1, width, fill, outline, cap_r=2.6, tip=True):
    """Draw between the actual joint pivots. Rounded ends provide overlap
    without extending the segment or moving its joint cap off the pivot.
    cap_r draws the joint-covering disc centered at p0. tip=False leaves
    the p1 end flat at the pivot so the segment can't overhang the joint —
    the child part's cap covers the seam instead."""
    d.line([p0, p1], fill=fill, width=width)
    r = width / 2
    for p in ((p0, p1) if tip else (p0,)):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)
    # Joint cap — a disc centred on the pivot, slightly wider than the limb,
    # hides the seam at any rotation angle.
    d.ellipse([p0[0] - cap_r, p0[1] - cap_r, p0[0] + cap_r, p0[1] + cap_r],
              fill=fill)


def new_part():
    return Image.new("RGBA", (FRAME_W * DS, FRAME_H * DS), (0, 0, 0, 0))


# Each part: draw function. Rounded ends overlap at the actual joint;
# the joint cap on the CHILD part stays centered as the limb rotates.
def draw_head(img):
    d = SDraw(img)
    d.rectangle([39, 16.5, 42, 19.5], fill=SKIN_DARK, outline=OUTLINE)
    # Angular anime head — the cranium stays broad while the cheeks taper
    # through two planes to a pointed chin, instead of the old round ball
    # ending in a flat bottom. Profile reads as a 3/4 view facing +x.
    d.polygon([(33.5, 9.5), (35, 6.5), (38, 4.5), (44, 4.5),
               (46.5, 6.5), (47.5, 9.5), (47, 12.5), (45, 15.5),
               (41.5, 18), (39.5, 17.5), (37, 16), (34.5, 14)],
              fill=SKIN, outline=OUTLINE)
    # Under-jaw shadow hugs the taper — deepest under the chin point and
    # the far cheek, so the lower face reads as angled planes.
    d.polygon([(34.5, 12), (37, 13), (37.5, 15.8), (39.8, 17.4),
               (41.5, 17.8), (43.8, 16.2), (44.8, 14.8),
               (44.5, 16.3), (38.5, 16.3), (34.5, 14)],
              fill=SKIN_DARK)
    # Two deliberate highlight clusters survive at game scale and keep all
    # faces compatible with hair/helmet overlays.
    d.polygon([(36, 7.5), (39, 5.5), (44, 5.5), (46.5, 7.5),
               (44, 8.5), (38, 8.5)],
              fill=SKIN_LIGHT)
    d.rectangle([44.5, 10, 45.5, 11], fill=OUTLINE)


def draw_torso(img):
    d = SDraw(img)
    # Tapered heroic torso, with a strong shoulder-to-waist rhythm shared by
    # human, goblin and imp silhouettes. The pelvis narrows to the hip span
    # and ends at the joint line with a shallow crotch point — a wide slab
    # below the hips reads as a flap once the near thigh covers the front.
    d.polygon([(35.5, 19), (39, 17.5), (42, 17.5), (45, 19),
               (45.5, 23), (44, 24.5), (43.5, 26.5), (40.2, 27.25),
               (36.8, 26.5), (36, 24)],
              fill=SKIN, outline=OUTLINE)
    d.polygon([(35.5, 19.5), (38, 19), (38, 24.5), (37.2, 26), (36.2, 25.2)],
              fill=SKIN_DARK)
    d.line([(39, 18.5), (42, 18.5)], fill=SKIN_LIGHT, width=.5)


def _arm(sh, elb, wri, fill, img):
    d = SDraw(img)
    capsule(d, sh, elb, 3.0, fill, OUTLINE, cap_r=2.1, tip=False)
    d.line([(sh[0], sh[1] - .5), (elb[0], elb[1] - 1)], fill=SKIN_LIGHT, width=.5)


def _forearm(elb, wri, fill, img):
    d = SDraw(img)
    capsule(d, elb, wri, 2.5, fill, OUTLINE, cap_r=1.6)
    d.line([(elb[0], elb[1]), (wri[0], wri[1])], fill=SKIN_LIGHT, width=.5)
    d.polygon([(wri[0] - 1.5, wri[1] + .5), (wri[0] + 1.5, wri[1] + .5),
               (wri[0] + 2, wri[1] + 2), (wri[0] + 1.5, wri[1] + 3.5),
               (wri[0] - 1.5, wri[1] + 3.5), (wri[0] - 2, wri[1] + 2)],
              fill=SKIN, outline=OUTLINE)
    d.line([(wri[0], wri[1] + 1), (wri[0], wri[1] + 2.5)], fill=SKIN_LIGHT, width=.5)


def _thigh(hip, knee, fill, img):
    d = SDraw(img)
    capsule(d, hip, knee, 3.5, fill, OUTLINE, cap_r=2.0, tip=False)
    d.line([(hip[0] - .5, hip[1] + .5), (knee[0] - .5, knee[1] - 1)],
           fill=SKIN_LIGHT, width=.5)


def _shin(knee, ank, fill, img):
    d = SDraw(img)
    capsule(d, knee, ank, 3, fill, OUTLINE, cap_r=1.85)
    d.line([(knee[0], knee[1] + 1), (ank[0], ank[1] - .5)], fill=SKIN_LIGHT, width=1)
    # Clip the ankle at the flat sole; keep the corrected heel height.
    sole_y = ank[1] + 1.5
    cut_y = round(sole_y * DS) + 1
    img.paste((0, 0, 0, 0), (0, cut_y, img.width, img.height))
    d.polygon([(ank[0] - 2.5, ank[1] - .5), (ank[0] - 1, ank[1] - 1.5),
               (ank[0] + 1.5, ank[1] - .5), (ank[0] + 4, ank[1] + .3),
               (ank[0] + 4, sole_y), (ank[0] - 2.5, sole_y)], fill=fill, outline=OUTLINE)
    d.line([(ank[0] - .5, ank[1]), (ank[0] + 2, ank[1] + .5)], fill=SKIN_LIGHT, width=.5)


PARTS = {
    # name -> draw fn (back-to-front slot order follows SLOT_ORDER below)
    "armB_u": lambda img: _arm(SH_B, ELB_B, WRI_B, SKIN, img),
    "armB_l": lambda img: _forearm(ELB_B, WRI_B, SKIN, img),
    "legB_u": lambda img: _thigh(HIP_B, KNEE_B, SKIN, img),
    "legB_l": lambda img: _shin(KNEE_B, ANK_B, SKIN, img),
    "torso": draw_torso,
    "legF_u": lambda img: _thigh(HIP_F, KNEE_F, SKIN, img),
    "legF_l": lambda img: _shin(KNEE_F, ANK_F, SKIN, img),
    "armF_u": lambda img: _arm(SH_F, ELB_F, WRI_F, SKIN, img),
    "armF_l": lambda img: _forearm(ELB_F, WRI_F, SKIN, img),
    "head": draw_head,
}
SLOT_ORDER = [
    # Spine draws first to last. B (far-side) limbs sit behind the torso;
    # the near leg also tucks under it so tunics and the hip joint read
    # correctly, while the near arm stays in front. The head draws under
    # the collar so the neck never paints over the chest.
    "armB_u", "armB_l", "legB_u", "legB_l", "head",
    "legF_u", "legF_l", "torso", "armF_u", "armF_l",
]

# Bones — every pivot sits on its joint pin.
def S(cx, cy):
    return (round(cx - FOOT_X, 2), round(FOOT_Y - cy, 2))

_BONES_WORLD = {
    "root":   S(*[39.5, 34]),
    # Pelvis pivot — midway between the hip joints. Torso and legs hang off
    # it so the "height" key can lift the whole upper body while the leg
    # chains stretch beneath it, feet planted.
    "hips":   S(40.0, 26.0),
    "torso":  S(40.0, 23.5),
    "head":   S(*NECK),
    # Ears/horns sit at the skull origin so shape keys scale them in place.
    "ears":   S(*NECK),
    "horns":  S(*NECK),
    # Creature feature anchors — wing root at the shoulder blade, tail root at
    # the lower back. Both ride the torso so they follow its lean.
    "wings":  S(37.0, 20.5),
    "tail":   S(37.5, 26.5),
    "armF_u": S(*SH_F), "armF_l": S(*ELB_F), "weapon":  S(*HAND_F),
    "armB_u": S(*SH_B), "armB_l": S(*ELB_B), "weaponB": S(*HAND_B),
    "legF_u": S(*HIP_F), "legF_l": S(*KNEE_F),
    "legB_u": S(*HIP_B), "legB_l": S(*KNEE_B),
}
BONES = [
    ("root", None), ("hips", "root"), ("torso", "hips"), ("head", "torso"),
    ("ears", "head"), ("horns", "head"),
    ("wings", "torso"), ("tail", "torso"),
    ("armF_u", "torso"), ("armF_l", "armF_u"), ("weapon", "armF_l"),
    ("armB_u", "torso"), ("armB_l", "armB_u"), ("weaponB", "armB_l"),
    ("legF_u", "hips"), ("legF_l", "legF_u"),
    ("legB_u", "hips"), ("legB_l", "legB_u"),
]
BONE_PARENT = {n: p for n, p in BONES}

# Shape keys — runtime bone scaling for body diversity off the one rig.
# bones: bone -> axes ("x"|"y"|"xy") multiplied by the key value; translate:
# bone -> world offset per (value - 1). Width keys are per-region: chest
# widens the torso (arms ride it, so shoulders spread too), armWidth/legWidth
# thicken the limbs without touching the torso.
SHAPE_KEYS = [
    # Height is a waist-depth morph: scaling "hips" on Y stretches the gap
    # between the pelvis and the torso — the torso offset rises (upper body
    # lifts) while the leg attach points sit on the hip line (y-offset ~0),
    # so the feet never move. Torso and legs are shape-neutral (below), so
    # no artwork stretches — only positions shift.
    {"name": "height", "label": "Height", "group": "Body", "min": 0.6,
     "max": 1.6, "bones": {"hips": "y"}},
    {"name": "chest", "label": "Chest", "group": "Body", "min": 0.75,
     "max": 1.5, "bones": {"torso": "x"}},
    {"name": "armLen", "label": "Arm length", "group": "Body", "min": 0.75,
     "max": 1.35,
     "bones": {"armF_u": "y", "armF_l": "y", "armB_u": "y", "armB_l": "y"}},
    {"name": "armWidth", "label": "Arm width", "group": "Body", "min": 0.7,
     "max": 1.6,
     "bones": {"armF_u": "x", "armF_l": "x", "armB_u": "x", "armB_l": "x"}},
    {"name": "legWidth", "label": "Leg width", "group": "Body", "min": 0.7,
     "max": 1.6,
     "bones": {"legF_u": "x", "legF_l": "x", "legB_u": "x", "legB_l": "x"}},
    # Leg length scales the upper-leg bones on Y — the lower-leg bones aren't
    # keyed, so they inherit the parent's scale and the whole chain stretches
    # uniformly (art and joint offsets). Hips lift by the grown chain length
    # so the feet stay planted, like the quaddoll's leg-driven "height".
    {"name": "legLen", "label": "Leg length", "group": "Body", "min": 0.75,
     "max": 1.5,
     "bones": {"legF_u": "y", "legB_u": "y"},
     "translate": {"hips": {"y": 34.0 - 26.0}}},
    {"name": "head", "label": "Head", "group": "Head", "min": 0.7,
     "max": 1.6, "bones": {"head": "xy"}},
    {"name": "ears", "label": "Ears", "group": "Head", "min": 0.6,
     "max": 1.8, "bones": {"ears": "xy"}},
    {"name": "horns", "label": "Horns", "group": "Head", "min": 0.6,
     "max": 1.8, "bones": {"horns": "xy"}},
    {"name": "wings", "label": "Wings", "group": "Creature", "min": 0.6,
     "max": 1.7, "bones": {"wings": "xy"}},
    {"name": "tail", "label": "Tail", "group": "Creature", "min": 0.6,
     "max": 1.7, "bones": {"tail": "xy"}},
    # Weapons are shape-neutral — body morphs never resize them. These keys
    # scale each hand's weapon on its own instead.
    {"name": "weaponSize", "label": "Weapon", "group": "Weapons", "min": 0.6,
     "max": 1.8, "bones": {"weapon": "xy"}},
    {"name": "subWeaponSize", "label": "Sub weapon", "group": "Weapons",
     "min": 0.6, "max": 1.8, "bones": {"weaponB": "xy"}},
]
# Bones that cancel inherited scale — their local scale divides out the
# ancestors' accumulated morph so the attachment keeps its authored size.
# The bone still rides its (morphed) world position. Weapons keep their
# size while the grip stays in the fist; torso/legs cancel the hips' height
# scale so only their offsets move — no art stretches. Their own shape keys
# (weaponSize, chest, legWidth, ...) still apply on top.
SHAPE_NEUTRAL = ["weapon", "weaponB", "torso", "legF_u", "legB_u"]

# Rig baseline morphs — the authored doll is chibi/stocky, so the adult
# proportions are the neutral baseline. Mirrors RIG_BASE_SHAPE["paperdoll"]
# in wails/frontend/src/phaser/CharacterSprite.ts — keep them in sync.
SHAPE_DEFAULTS = {
    "height": 1.3,
    "legLen": 1.25,
    "head": 0.78,
    "chest": 0.9,
    "armLen": 1.1,
    "armWidth": 0.85,
    "legWidth": 0.85,
}

SLOT_BONE = {  # each part hangs on the bone at its pivot joint
    "head": "head", "torso": "torso",
    "armF_u": "armF_u", "armF_l": "armF_l",
    "armB_u": "armB_u", "armB_l": "armB_l",
    "legF_u": "legF_u", "legF_l": "legF_l",
    "legB_u": "legB_u", "legB_l": "legB_l",
    "weapon": "weapon", "weaponB": "weaponB",
}


def bone_local(name):
    wx, wy = _BONES_WORLD[name]
    parent = BONE_PARENT[name]
    if parent is None:
        return wx, wy
    px, py = _BONES_WORLD[parent]
    return round(wx - px, 2), round(wy - py, 2)


def pack(regions):
    names = sorted(regions, key=lambda n: -regions[n].height * regions[n].width)
    width = 1024
    placements = {}
    x = PAD; y = PAD; row_h = 0
    for n in names:
        im = regions[n]
        w, h = im.size
        if x + w + PAD > width:
            x = PAD; y += row_h + PAD; row_h = 0
        placements[n] = (x, y, w, h)
        x += w + PAD
        row_h = max(row_h, h)
    height = 1
    while height < y + row_h + PAD:
        height <<= 1
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for n, (px_, py_, w, h) in placements.items():
        atlas.paste(regions[n], (px_, py_))
    return atlas, placements


def main():
    if __package__:
        from .paperdoll_layers import build_layers, CREATURE_PRESETS
        from . import hair_docs as hair_mod
    else:
        from paperdoll_layers import build_layers, CREATURE_PRESETS
        import hair_docs as hair_mod
    layers = build_layers(sys.modules[__name__])

    # Rigged hair docs — each painted part is a weighted mesh skinned to a
    # 3-bone chain (root pinned to the head, mid/tip carry the sway so the
    # wave travels outward). Slots follow the "{layer}_{bone}" convention;
    # draw order mirrors flat hair (tail behind the body, top and bangs
    # over the face).
    hair_docs = hair_mod.load_hair_docs()
    tail_layers, front_layers = [], []
    hair_flex = {}   # slot -> (part, pivot, chain bone names)
    for hd in hair_docs:
        for part in ("tail", "top", "bangs"):
            p = hd["parts"].get(part)
            if not p:
                continue
            bbox_px = p["img"].getbbox()
            if bbox_px is None:
                continue
            bbox = tuple(v / DS for v in bbox_px)
            span = hair_mod.hair_flow_span(part, p["pivot"], bbox)
            chain = hair_mod.hair_chain(hd["id"], part)
            cells = hair_mod.hair_chain_cells(part, p["pivot"], span)
            parents = ("head", chain[0], chain[1])
            for name, parent, cc in zip(chain, parents, cells):
                if name not in BONE_PARENT:
                    BONES.append((name, parent))
                    BONE_PARENT[name] = parent
                    _BONES_WORLD[name] = S(*cc)
            variants = {f"hair_{hd['id']}_{k}": img
                        for k, img in hair_mod.hair_color_variants(p["img"]).items()}
            slot = hair_mod.hair_slot(hd["id"], part)
            hair_flex[slot] = (part, p["pivot"], chain, span)
            entry = (slot, chain[0], None, variants, {})
            (tail_layers if part == "tail" else front_layers).append(entry)

    def insert_after(slot_name, tuples):
        idx = next(i for i, l in enumerate(layers) if l[0] == slot_name)
        layers[idx + 1:idx + 1] = tuples

    if tail_layers:
        insert_after("hair_bot_head", tail_layers)
    if front_layers:
        insert_after("hair_top_head", front_layers)
    os.makedirs(OUT_DIR, exist_ok=True)
    regions, bboxes = {}, {}
    assembled = new_part()
    bare = new_part()
    for slot, bone, default, variants, _rots in layers:
        for key, img in variants.items():
            bbox = img.getbbox()
            # A transparent attachment lets a style omit sleeves/back hair
            # without a runtime fallback to a different style.
            if bbox is None:
                bbox = (0, 0, 1, 1)
            path = f'{slot}__{key}'
            region = img.crop(bbox)
            # Downsample the DS-res crop to the ART atlas density — the
            # LANCZOS pass is what turns the fine draw grid into AA edges.
            regions[path] = region.resize(
                (max(1, round(region.width * ART / DS)),
                 max(1, round(region.height * ART / DS))),
                Image.Resampling.LANCZOS)
            bboxes[path] = tuple(v / DS for v in bbox)
        if default:
            assembled.alpha_composite(variants[default])
            if slot.startswith('skin_'):
                bare.alpha_composite(variants[default])
    assembled.resize((FRAME_W * ART, FRAME_H * ART),
                     Image.Resampling.LANCZOS).save(PREVIEW)
    bare.resize((FRAME_W * ART, FRAME_H * ART),
                Image.Resampling.LANCZOS).save(
                    os.path.join(OUT_DIR, 'paperdoll_base_preview.png'))

    # Baked creature previews — a 100x40 cell (H99 convention) plus a tight
    # icon per preset so the map editor and pet UI can render doll-based
    # enemies without a Spine runtime. Art is on the 2px grid, so a NEAREST
    # halving keeps every deliberate pixel.
    def preset_key(slot, a):
        for prefix in ("skin", "face"):
            if slot.startswith(prefix + "_"):
                v = a.get(prefix)
                return f"{prefix}_{v}" if v else None
        if slot.startswith("hair_"):
            return f"hair_{a['hair']}_{a.get('hair_color', 'c1')}" if a.get("hair") else None
        if slot.startswith("cloth_"):
            return f"{a['cloth']}_{a.get('cloth_color', 'c1')}" if a.get("cloth") else None
        for prefix, key in (("weapon_top", "weapon"),
                            ("weapon_front", "weapon"),
                            ("weapon_bot", "sub_weapon"),
                            ("weapon_over", "sub_weapon")):
            if slot.startswith(prefix + "_"):
                w = a.get(key, "")
                if not w:
                    return None
                color = a.get(key + "_color") or a.get("weapon_color")
                return f"{w}_{color}" if w == "weapon5" and color else w
        for prefix in ("ears", "tail"):
            if slot.startswith(prefix + "_"):
                v = a.get(prefix)
                return f"{prefix}_{v}_{a['skin']}" if v else None
        for prefix in ("horns", "wings"):
            if slot.startswith(prefix + "_"):
                v = a.get(prefix)
                return f"{prefix}_{v}" if v else None
        return None

    for kind, preset in CREATURE_PRESETS.items():
        comp = new_part()
        for slot, _bone, _default, variants, _rots in layers:
            key = preset_key(slot, preset["appearance"])
            if key and key in variants:
                comp.alpha_composite(variants[key])
        comp.resize((FRAME_W, FRAME_H), Image.Resampling.LANCZOS).save(
            os.path.join(OUT_DIR, f"doll_{kind}.png"))
        bbox = comp.getbbox()
        if bbox:
            icon = comp.crop(bbox)
            icon.resize((max(1, round(icon.width * ART / DS)),
                         max(1, round(icon.height * ART / DS))),
                        Image.Resampling.LANCZOS).save(
                os.path.join(OUT_DIR, f"doll_{kind}_icon.png"))

    atlas_img, placements = pack(regions)
    os.makedirs(OUT_DIR, exist_ok=True)
    atlas_img.save(os.path.join(OUT_DIR, OUT_IMG))

    lines = [
        OUT_IMG,
        f"size: {atlas_img.width},{atlas_img.height}",
        "format: RGBA8888",
        "filter: Nearest,Nearest",
        "repeat: none",
    ]
    for name in sorted(placements):
        px_, py_, w, h = placements[name]
        lines += [
            name,
            "  rotate: false",
            f"  xy: {px_}, {py_}",
            f"  size: {w}, {h}",
            f"  orig: {w}, {h}",
            "  offset: 0, 0",
            "  index: -1",
        ]
    with open(os.path.join(OUT_DIR, OUT_ATLAS), "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    bones_json = []
    for name, parent in BONES:
        lx, ly = bone_local(name)
        b = {"name": name}
        if parent:
            b["parent"] = parent
        if lx: b["x"] = lx
        if ly: b["y"] = ly
        bones_json.append(b)

    slots_json = []
    skin_atts = {}
    bone_index = {n: i for i, (n, _p) in enumerate(BONES)}
    for slot, bone, default, variants, rots in layers:
        entry = {'name': slot, 'bone': bone}
        if default:
            entry['attachment'] = default
        slots_json.append(entry)
        skin_atts[slot] = {}
        for key in variants:
            path = f'{slot}__{key}'
            x0, y0, x1, y1 = bboxes[path]
            sx, sy = (x0 + x1) / 2 - FOOT_X, FOOT_Y - (y0 + y1) / 2
            bx, by = _BONES_WORLD[bone]
            if slot in hair_flex:
                # Weighted mesh — grid skinned to the part's deform chain;
                # identical geometry across the color variants.
                part, pivot, chain, span = hair_flex[slot]
                bw = [_BONES_WORLD[b] for b in chain]
                bi = [bone_index[b] for b in chain]
                skin_atts[slot][key] = {
                    'type': 'mesh', 'path': path,
                    'x': round(sx - bx, 3), 'y': round(sy - by, 3),
                    'width': x1 - x0, 'height': y1 - y0,
                    **hair_mod.hair_mesh((x0, y0, x1, y1), (x0, y0, x1, y1),
                                         pivot, part, span, bw, bi),
                }
                continue
            att = {
                'path': path, 'x': round(sx-bx, 3), 'y': round(sy-by, 3),
                'width': x1-x0, 'height': y1-y0,
            }
            if key.startswith('face_ms'):
                # Extracted MS faces share one fixed mount — the sprites are
                # pre-scaled per-face, so the anchor is tuned by eye rather
                # than derived from the bbox.
                att['x'], att['y'] = 1, 4.5
                att['scaleX'] = att['scaleY'] = 1.2
            deg = rots.get(key, 0)
            if deg:
                # Rotate the center offset about the bone too — Spine pivots a
                # region on its own center, so without this the grip would
                # orbit the wrist instead of staying in the fist.
                rad = math.radians(deg)
                ox, oy = att['x'], att['y']
                att['x'] = round(ox*math.cos(rad) - oy*math.sin(rad), 3)
                att['y'] = round(ox*math.sin(rad) + oy*math.cos(rad), 3)
                att['rotation'] = deg
            skin_atts[slot][key] = att

    def eased(keys):
        # Bake cosine easing at 60 Hz into ordinary linear Spine keys. This
        # keeps the editor and runtime identical without curve-format coupling.
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

    def rot(*keys):
        return eased([{"time": t, "value": v} for t, v in keys])

    def ty(_bone, *keys):
        return eased([{"time": t, "x": 0, "y": round(dy, 3)} for t, dy in keys])

    RUN, IDLE, RIDE, RIDE_IDLE = 0.6, 1.6, 0.7, 2.0
    P = {"legF_u": 32, "legF_l": -50, "legB_u": 28, "legB_l": -48,
         "torso": -4, "head": 4,
         "armF_u": 26, "armF_l": 18, "armB_u": 20, "armB_l": 12}

    def ride_bones(dur, swing, bob):
        return {
            "legF_u": {"rotate": rot((0, P["legF_u"]), (dur / 2, P["legF_u"] + swing), (dur, P["legF_u"]))},
            "legF_l": {"rotate": rot((0, P["legF_l"]), (dur / 2, P["legF_l"] - swing), (dur, P["legF_l"]))},
            "legB_u": {"rotate": rot((0, P["legB_u"]), (dur / 2, P["legB_u"] + swing), (dur, P["legB_u"]))},
            "legB_l": {"rotate": rot((0, P["legB_l"]), (dur / 2, P["legB_l"] - swing), (dur, P["legB_l"]))},
            "torso": {"rotate": rot((0, P["torso"]), (dur / 4, P["torso"] - 2), (dur / 2, P["torso"]),
                                    (3 * dur / 4, P["torso"] - 2), (dur, P["torso"])),
                      "translate": ty("torso", (0, 0), (dur / 4, bob), (dur / 2, 0),
                                      (3 * dur / 4, bob), (dur, 0))},
            "head": {"rotate": rot((0, P["head"]), (dur / 4, P["head"] + 2), (dur / 2, P["head"]),
                                   (3 * dur / 4, P["head"] + 2), (dur, P["head"]))},
            "armF_u": {"rotate": rot((0, P["armF_u"]), (dur / 2, P["armF_u"] - 4), (dur, P["armF_u"]))},
            "armF_l": {"rotate": rot((0, P["armF_l"]), (dur / 2, P["armF_l"] + 4), (dur, P["armF_l"]))},
            "armB_u": {"rotate": rot((0, P["armB_u"]), (dur / 2, P["armB_u"] - 4), (dur, P["armB_u"]))},
            "armB_l": {"rotate": rot((0, P["armB_l"]), (dur / 2, P["armB_l"] + 4), (dur, P["armB_l"]))},
        }

    animations = {
        "idle": {"bones": {}},
        "run": {"bones": {}},
        "ride_idle": {"bones": ride_bones(RIDE_IDLE, 2, 0.3)},
        "ride_run": {"bones": ride_bones(RIDE, 5, 0.9)},
        "attack": {"bones": {
            "torso": {"rotate": rot((0, 0), (0.1, -5), (0.22, 9), (0.4, 3), (0.55, 0))},
            "armF_u": {"rotate": rot((0, 0), (0.1, -35), (0.22, 75), (0.38, 25), (0.55, 0))},
            "armF_l": {"rotate": rot((0, 0), (0.1, 15), (0.22, -8), (0.4, 5), (0.55, 0))},
            # Weapon wrist bones add snap on top of the arm swing (h99 rig parity).
            "weapon": {"rotate": rot((0, 0), (0.1, -10), (0.22, 15), (0.4, 3), (0.55, 0))},
            "armB_u": {"rotate": rot((0, 0), (0.1, 8), (0.22, -12), (0.4, -4), (0.55, 0))},
            "armB_l": {"rotate": rot((0, 0), (0.1, 12), (0.22, 6), (0.4, 10), (0.55, 0))},
            # Back-hand staff: orb end lifts up-forward through the strike.
            "weaponB": {"rotate": rot((0, 0), (0.1, -12), (0.22, 55), (0.4, 12), (0.55, 0))},
        }},
    }

    def cycle(duration, fn, translate=False):
        steps = math.ceil(duration * 60)
        keys = []
        for i in range(steps + 1):
            # Evaluate the last sample at zero to close every loop exactly.
            phase = 2 * math.pi * i / steps if i < steps else 0
            value = round(fn(phase), 4)
            keys.append({'time': round(duration * i / steps, 6),
                         **({'x': 0, 'y': value} if translate else {'value': value})})
        return keys

    # Gentle breathing with delayed elbows and head; no rigid straight arms.
    idle = animations['idle']['bones']
    idle['torso'] = {'rotate': cycle(IDLE, lambda p: .8 * math.sin(p)),
                     'translate': cycle(IDLE, lambda p: .16 * (1 - math.cos(p)), True)}
    idle['head'] = {'rotate': cycle(IDLE, lambda p: -.65 * math.sin(p - .35))}
    for side, phase in [('F', 0), ('B', .4)]:
        idle[f'arm{side}_u'] = {'rotate': cycle(IDLE, lambda p, q=phase: 2 * math.sin(p - q))}
        idle[f'arm{side}_l'] = {'rotate': cycle(IDLE, lambda p, q=phase: 7 + 2 * math.sin(p - q - .6))}

    # Continuous stride, knee lift during recovery, and a delayed arm swing.
    run = animations['run']['bones']
    run.clear()
    run['root'] = {'translate': cycle(RUN, lambda p: .5 * (1 - math.cos(2 * p)), True)}
    run['torso'] = {'rotate': cycle(RUN, lambda p: -6 + 1.4 * math.sin(2 * p - .25))}
    run['head'] = {'rotate': cycle(RUN, lambda p: 3 - 1.2 * math.sin(2 * p - .6))}
    for side, phase in [('F', 0), ('B', math.pi)]:
        run[f'leg{side}_u'] = {'rotate': cycle(RUN, lambda p, q=phase: 26 * math.cos(p + q))}
        # Knees never fully extend (baseline -8) and fold hard through
        # recovery (-72 peak) — the bent-knee carry is what reads as a run.
        run[f'leg{side}_l'] = {'rotate': cycle(RUN, lambda p, q=phase: -8 - 64 * max(0, -math.sin(p + q)) ** 1.6)}
        run[f'arm{side}_u'] = {'rotate': cycle(RUN, lambda p, q=phase: -24 * math.cos(p + q - .25))}
        # Elbows stay cocked (~55°) and pump rather than hanging straight.
        run[f'arm{side}_l'] = {'rotate': cycle(RUN, lambda p, q=phase: 55 + 17 * math.sin(p + q - .65))}

    # Creature feature bones — gentle wing flap and tail sway riding the body.
    idle['wings'] = {'rotate': cycle(IDLE, lambda p: 5 * math.sin(p - .5))}
    idle['tail'] = {'rotate': cycle(IDLE, lambda p: 7 * math.sin(p - .9))}
    run['wings'] = {'rotate': cycle(RUN, lambda p: -8 + 9 * math.sin(2 * p - .4))}
    run['tail'] = {'rotate': cycle(RUN, lambda p: 9 * math.sin(2 * p + .3))}
    attack = animations['attack']['bones']
    attack['wings'] = {'rotate': rot((0, 0), (.1, -14), (.22, 20), (.4, 4), (.55, 0))}
    attack['tail'] = {'rotate': rot((0, 0), (.1, 6), (.22, -9), (.4, -2), (.55, 0))}

    # Carry the entire seated figure through each bounce, with head follow-through.
    for name, duration in [('ride_idle', RIDE_IDLE), ('ride_run', RIDE)]:
        bones = animations[name]['bones']
        bones['root'] = {'translate': bones['torso'].pop('translate')}
        bones['head']['rotate'] = cycle(duration, lambda p: 4 + 1.5 * math.sin(2 * p - .45))
    animations['attack']['bones']['head'] = {'rotate': rot(
        (0, 0), (.13, 3), (.26, -5), (.43, -1.5), (.55, 0))}

    # "attackB" mirrors the swing onto the far arm — used when the sub hand
    # carries the weapon because the main hand holds a shield. The shared
    # torso/head/creature tracks are reused; the arm roles swap.
    atk = animations['attack']['bones']
    animations["attackB"] = {"bones": {
        "torso": atk["torso"], "head": atk["head"],
        "wings": atk["wings"], "tail": atk["tail"],
        "armB_u": atk["armF_u"], "armB_l": atk["armF_l"],
        "weaponB": atk["weapon"],
        "armF_u": atk["armB_u"], "armF_l": atk["armB_l"],
        "weapon": atk["weaponB"],
    }}

    # Rigged hair sway — tracks on the mid/tip chain bones only; the root
    # stays glued to the head. Amplitude grows and phase lags down the
    # chain so the wave travels from scalp to tip. Mirrors
    # hairChainTracks in tools/editor/src/model/hair.ts.
    for hd in hair_docs:
        sway = hd["sway"]
        for part in hd["parts"]:
            ia, ip, ra, rp, aa, bob = hair_mod.HAIR_SWAY[part]
            _root, mid, tip = hair_mod.hair_chain(hd["id"], part)
            for b, amp_scale, lag in ((mid, hair_mod.CHAIN_AMP[0], hair_mod.CHAIN_LAG[0]),
                                      (tip, hair_mod.CHAIN_AMP[1], hair_mod.CHAIN_LAG[1])):
                idle[b] = {"rotate": cycle(
                    IDLE, lambda p, a=ia * amp_scale, ph=ip + lag:
                    sway * a * math.sin(p - ph))}
                run[b] = {"rotate": cycle(
                    RUN, lambda p, a=ra * amp_scale, ph=rp + lag:
                    sway * a * math.sin(2 * p - ph))}
                animations["ride_idle"]["bones"][b] = {"rotate": cycle(
                    RIDE_IDLE, lambda p, a=ia * amp_scale, ph=ip + lag:
                    sway * 0.8 * a * math.sin(p - ph))}
                animations["ride_run"]["bones"][b] = {"rotate": cycle(
                    RIDE, lambda p, a=ra * amp_scale, ph=rp + lag:
                    sway * a * math.sin(2 * p - ph))}
                flick = {"rotate": rot(
                    (0, 0), (.1, -.5 * aa * amp_scale * sway),
                    (.22, aa * amp_scale * sway),
                    (.4, .3 * aa * amp_scale * sway), (.55, 0))}
                attack[b] = flick
                animations["attackB"]["bones"][b] = flick
            # Tip bob — a vertical bounce that trails the rotation, most
            # visible on bangs and tails.
            if bob:
                idle[tip]["translate"] = cycle(
                    IDLE, lambda p: sway * bob * 0.5 * math.sin(p - ip - .7), True)
                run[tip]["translate"] = cycle(
                    RUN, lambda p: sway * bob * math.sin(2 * p - rp - .7), True)
                animations["ride_idle"]["bones"][tip]["translate"] = cycle(
                    RIDE_IDLE, lambda p: sway * bob * 0.5 * math.sin(p - ip - .7), True)
                animations["ride_run"]["bones"][tip]["translate"] = cycle(
                    RIDE, lambda p: sway * bob * math.sin(2 * p - rp - .7), True)

    # Partial pose overlays — anims that key only a few bones. Played on a
    # higher Spine track (or merged in previews/editor), they override just
    # those bones while the base animation keeps driving everything else.
    # guardB holds the far-hand shield out from the body — the arm swings
    # toward +x while weaponB unwinds the chain's rotation to ~0° total so
    # the heater shield's tapered point stays down. guardF does the same
    # for a near-hand shield on the armF/weapon chain. The runtime enables
    # each whenever a weapon_over_* / weapon_front_* attachment is equipped.
    animations["guardB"] = {"bones": {
        "armB_u": {"rotate": cycle(IDLE, lambda p: 15 + 1.5 * math.sin(p))},
        "armB_l": {"rotate": cycle(IDLE, lambda p: 55 + 2 * math.sin(p - .4))},
        "weaponB": {"rotate": cycle(IDLE, lambda p: -62 + 1.5 * math.sin(p - .2))},
    }}
    animations["guardF"] = {"bones": {
        "armF_u": {"rotate": cycle(IDLE, lambda p: 10 + 1.5 * math.sin(p))},
        "armF_l": {"rotate": cycle(IDLE, lambda p: 65 + 2 * math.sin(p - .4))},
        "weapon": {"rotate": cycle(IDLE, lambda p: -67 + 1.5 * math.sin(p - .2))},
    }}

    skeleton = {
        "skeleton": {"spine": "4.3.0", "hash": "paperdoll",
                     "x": -25, "y": -1, "width": 50, "height": 36, "fps": 30},
        "bones": bones_json,
        "slots": slots_json,
        "skins": [{"name": "default", "attachments": skin_atts},
                  {"name": "base", "attachments": {k:v for k,v in skin_atts.items() if k.startswith("skin_")}}],
        "animations": animations,
    }
    with open(os.path.join(OUT_DIR, OUT_JSON), "w", newline="\n") as f:
        json.dump(skeleton, f)

    # Editor spec — makes paperdoll a first-class character in tools/editor
    # (bone/anim editing, creature-part variant picks, working Regenerate).
    # Emitted alongside the assets so it never drifts from the code-driven rig.
    spec_layers = []
    seen_layers = set()
    # Appearance-part catalog — every registered variant per layer with its
    # mount slot and carry rotation. The editor's Catalog tab edits this to
    # register new parts without regenerating the whole rig.
    catalog = {}
    for slot, bone, _default, variants, rots in layers:
        # Slot names are "{layer}_{bone}"; bone names can contain underscores.
        suffix = "_" + bone
        lname = slot[:-len(suffix)] if slot.endswith(suffix) else slot
        entries = catalog.setdefault(lname, [])
        for key in variants:
            e = {"key": key, "slot": slot}
            if rots.get(key):
                e["rotation"] = rots[key]
            if key.startswith("face_ms"):
                e["scaleX"] = e["scaleY"] = 1.2
            entries.append(e)
        if lname in seen_layers:
            continue
        seen_layers.add(lname)
        entry = {"name": lname,
                 "part": bone if bone in ("wings", "tail", "head", "ears", "horns",
                                          "weapon", "weaponB") else "auto"}
        if lname in ("weapon_top", "weapon_bot"):
            entry["partByVariantPrefix"] = {"weapon5": "weaponB"}
        spec_layers.append(entry)
    spec = {
        "generator": "tools/gen_paperdoll.py",
        "output": {"dir": "wails/frontend/public/assets/spine", "name": "paperdoll"},
        "source": {"dir": "tools", "frame": 0, "footX": FOOT_X, "footY": FOOT_Y,
                   "pad": PAD, "overlap": 0, "atlasWidth": atlas_img.width},
        "partOrder": list(SLOT_ORDER),
        "partRules": [],
        "layers": spec_layers,
        "bones": [{"name": name, "parent": parent,
                   "x": round(_BONES_WORLD[name][0], 2),
                   "y": round(_BONES_WORLD[name][1], 2)}
                  for name, parent in BONES],
        "shapeKeys": SHAPE_KEYS,
        "shapeDefaults": SHAPE_DEFAULTS,
        "shapeNeutral": SHAPE_NEUTRAL,
        "catalog": catalog,
        "animations": animations,
    }
    with open(os.path.join(ROOT, "tools", "paperdoll.spec.json"), "w", newline="\n") as f:
        json.dump(spec, f, indent=2)
        f.write("\n")

    # Per-creature specs — the editor lists each as its own character while
    # they all share the paperdoll rig (output.name) and differ only in the
    # default variant selection applied on load.
    for kind, preset in CREATURE_PRESETS.items():
        a = preset["appearance"]
        pspec = dict(spec)
        pspec["preset"] = {
            "skin": a.get("skin", "c1"), "face": a.get("face", "ms1"),
            "hair": a.get("hair", ""), "hairColor": a.get("hair_color", "c1"),
            "cloth": a.get("cloth", ""), "clothColor": a.get("cloth_color", "c1"),
            "weapon": a.get("weapon", ""), "weaponColor": a.get("weapon_color", "c1"),
            "subWeapon": a.get("sub_weapon", ""),
            "subWeaponColor": a.get("sub_weapon_color", a.get("weapon_color", "c1")),
            "ears": a.get("ears", ""), "horns": a.get("horns", ""),
            "wings": a.get("wings", ""), "tail": a.get("tail", ""),
            "shape": preset.get("shape", {}),
        }
        with open(os.path.join(ROOT, "tools", f"paperdoll_{kind}.spec.json"),
                  "w", newline="\n") as f:
            json.dump(pspec, f, indent=2)
            f.write("\n")

    print(f"regions={len(regions)} slots={len(slots_json)} atlas={atlas_img.width}x{atlas_img.height}")


if __name__ == "__main__":
    main()
