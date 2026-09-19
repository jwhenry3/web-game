#!/usr/bin/env python3
"""Generate a Spine skeleton + atlas for the Heroes 99 paper-doll character.

Slices the idle reference frame of every H99 layer sheet into body-part
regions, packs them into one atlas, and emits a Spine 4.3 JSON skeleton with
bones/slots/skins/animations. Replaces baked frame-swap animation with
skeletal animation while preserving the exact pixel art.

Output: wails/frontend/public/assets/spine/h99doll.{png,atlas,json}

Run from the repo root:  python tools/gen_spine_character.py
"""

import json
import math
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "wails/frontend/public/assets/heroes99")
OUT_DIR = os.path.join(ROOT, "wails/frontend/public/assets/spine")
OUT_IMG = "h99doll.png"
OUT_ATLAS = "h99doll.atlas"
OUT_JSON = "h99doll.json"

FRAME_W, FRAME_H = 100, 40
COLS = 8
SRC_FRAME = 1  # idle frame cell index (0-based) used as the rig reference pose
# Ground contact: matches H99_ORIGIN (x=39.5, feet bottom at row 33+1).
FOOT_X, FOOT_Y = 39.5, 34.0
PAD = 1        # atlas padding around each region
OVERLAP = 1    # px of neighboring art included at part borders to hide seams

# ---------------------------------------------------------------------------
# Part geometry (cell coords). Art faces +x; feet at FOOT_X/FOOT_Y.
# ---------------------------------------------------------------------------

def body_part(x, y):
    """Partition skin/cloth pixels into rig parts."""
    if y < 18:
        return "head"
    if y < 27:
        if x < 37:
            return "armB_u" if y < 23 else "armB_l"
        if x >= 45:
            return "armF_u" if y < 23 else "armF_l"
        return "torso"
    if x <= 40:
        return "legB_u" if y < 30 else "legB_l"
    return "legF_u" if y < 30 else "legF_l"

# Parts drawn back -> front within each layer.
PART_ORDER = [
    "legB_l", "legB_u", "armB_l", "armB_u", "torso",
    "legF_u", "legF_l", "head", "armF_u", "armF_l", "weapon", "weaponB",
]

# H99 layer draw order (bottom -> top) — preserved for part slots.
LAYER_ORDER = [
    "skin", "cloth_bot", "hair_bot", "face",
    "cloth_top", "hair_top", "weapon_bot", "weapon_top",
]

# Which part each layer's pixels are assigned to. The staff (weapon5) is held
# mid-shaft by the BACK hand — it rides a separate weaponB bone so it pivots at
# that grip instead of the front fist.
def layer_part(layer, x, y, variant_key=""):
    if layer in ("face", "hair_bot", "hair_top"):
        return "head"
    if layer in ("weapon_bot", "weapon_top"):
        return "weaponB" if variant_key.startswith("weapon5") else "weapon"
    return body_part(x, y)

def slot_name(layer, part):
    return f"{layer}_{part}"

# ---------------------------------------------------------------------------
# Bones — world positions in spine coords (x right, y up, origin at feet).
# Cell (cx, cy) -> spine (cx - FOOT_X, FOOT_Y - cy).
# ---------------------------------------------------------------------------

def S(cx, cy):
    return (round(cx - FOOT_X, 2), round(FOOT_Y - cy, 2))

# (name, parent, local offset). Locals are world minus parent world.
_BONES_WORLD = {
    "root":   S(39.5, 34),
    "torso":  S(39.5, 22),
    "head":   S(41,   17.5),
    "armF_u": S(45,   20.5),
    "armF_l": S(45.5, 24.5),
    "weapon": S(46,   26),
    "armB_u": S(36.5, 20.5),
    "armB_l": S(35,   24.5),
    "weaponB": S(36,  25.5),
    "legF_u": S(43,   27.5),
    "legF_l": S(43,   30.5),
    "legB_u": S(38,   27.5),
    "legB_l": S(38,   30.5),
}
BONES = [
    ("root",   None,     (0, 0)),
    ("torso",  "root",   (0, 0)),
    ("head",   "torso",  (0, 0)),
    ("armF_u", "torso",  (0, 0)),
    ("armF_l", "armF_u", (0, 0)),
    ("weapon", "armF_l", (0, 0)),
    ("armB_u", "torso",  (0, 0)),
    ("armB_l", "armB_u", (0, 0)),
    ("weaponB", "armB_l", (0, 0)),
    ("legF_u", "root",   (0, 0)),
    ("legF_l", "legF_u", (0, 0)),
    ("legB_u", "root",   (0, 0)),
    ("legB_l", "legB_u", (0, 0)),
]
BONE_PARENT = {n: p for n, p, _ in BONES}

def bone_world(name):
    wx, wy = _BONES_WORLD[name]
    return wx, wy

def bone_local(name):
    wx, wy = _BONES_WORLD[name]
    parent = BONE_PARENT[name]
    if parent is None:
        return wx, wy
    px, py = _BONES_WORLD[parent]
    return round(wx - px, 2), round(wy - py, 2)

# ---------------------------------------------------------------------------
# Variant enumeration
# ---------------------------------------------------------------------------

def scan_variants():
    """Return {layer_key: (kind, style, color, path)} for every sheet file."""
    v = {}

    for fn in sorted(os.listdir(os.path.join(SRC, "skin"))):
        if fn.startswith("skin_"):
            v[f"skin_{fn[5:-4]}"] = ("skin", None, fn[5:-4], f"skin/{fn}")

    for fn in sorted(os.listdir(os.path.join(SRC, "face"))):
        if fn.startswith("face_"):
            v[f"face_{fn[5:-4]}"] = ("face", None, fn[5:-4], f"face/{fn}")

    cloth_dir = os.path.join(SRC, "cloth")
    for style in sorted(os.listdir(cloth_dir), key=lambda s: int(s[5:])):
        for half in ("bot", "top"):
            d = os.path.join(cloth_dir, style, f"{style}_{half}")
            if not os.path.isdir(d):
                continue
            for fn in sorted(os.listdir(d)):
                if fn.endswith(f"_{half}.png"):
                    color = fn[len(style) + 1:-len(f"_{half}.png")]
                    v[f"{style}_{color}"] = v.get(f"{style}_{color}") or {}
                    v[f"{style}_{color}"][f"cloth_{half}"] = f"cloth/{style}/{style}_{half}/{fn}"

    hair_dir = os.path.join(SRC, "hair")
    for style in sorted(os.listdir(hair_dir)):
        for half in ("bot", "top"):
            d = os.path.join(hair_dir, style, f"{style}_{half}")
            if not os.path.isdir(d):
                continue
            for fn in sorted(os.listdir(d)):
                if fn.endswith(f"_{half}.png"):
                    color = fn[len(style) + 1:-len(f"_{half}.png")]
                    v[f"hair_{style}_{color}"] = v.get(f"hair_{style}_{color}") or {}
                    v[f"hair_{style}_{color}"][f"hair_{half}"] = f"hair/{style}/{style}_{half}/{fn}"

    weapon_dir = os.path.join(SRC, "weapon")
    for w in sorted(os.listdir(weapon_dir)):
        for half in ("bot", "top"):
            d = os.path.join(weapon_dir, w, f"{w}_{half}")
            if not os.path.isdir(d):
                continue
            for fn in sorted(os.listdir(d)):
                if not fn.endswith(f"_{half}.png"):
                    continue
                color = fn[len(w) + 1:-len(f"_{half}.png")]
                # weapon1-4 have no color segment: filename is "<w>_<half>.png"
                if color == w:  # fn == f"{w}_{half}.png" -> color slice hits prefix
                    color = ""
                key = f"{w}_{color}" if color else w
                v.setdefault(key, {})[f"weapon_{half}"] = f"weapon/{w}/{w}_{half}/{fn}"

    return v

# ---------------------------------------------------------------------------
# Slicing
# ---------------------------------------------------------------------------

def cell_image(path):
    img = Image.open(os.path.join(SRC, path)).convert("RGBA")
    cx = (SRC_FRAME % COLS) * FRAME_W
    cy = (SRC_FRAME // COLS) * FRAME_H
    return img.crop((cx, cy, cx + FRAME_W, cy + FRAME_H))

def slice_parts(layer, img, variant_key=""):
    """Return {part: (Image, bbox_in_cell)} — boxes expanded by OVERLAP.

    Each region contains ONLY pixels assigned to its part: neighboring parts'
    pixels inside the bounding rect are masked out, otherwise e.g. a jacket's
    chest pixels captured in the front-arm crop would move with the arm bone
    and draw over the torso. The expanded bbox is kept (transparent padding)
    so part regions still abut when bones rotate.
    """
    px = img.load()
    owner = {}  # (x, y) -> part
    boxes = {}
    for y in range(FRAME_H):
        for x in range(FRAME_W):
            if px[x, y][3] > 0:
                part = layer_part(layer, x, y, variant_key)
                owner[(x, y)] = part
                if part not in boxes:
                    boxes[part] = [x, y, x, y]
                else:
                    b = boxes[part]
                    b[0] = min(b[0], x); b[1] = min(b[1], y)
                    b[2] = max(b[2], x); b[3] = max(b[3], y)
    out = {}
    for part, (x0, y0, x1, y1) in boxes.items():
        ex0 = max(0, x0 - OVERLAP); ey0 = max(0, y0 - OVERLAP)
        ex1 = min(FRAME_W - 1, x1 + OVERLAP); ey1 = min(FRAME_H - 1, y1 + OVERLAP)
        w, h = ex1 - ex0 + 1, ey1 - ey0 + 1
        crop = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        cp = crop.load()
        for (sx, sy), p in owner.items():
            if p == part and ex0 <= sx <= ex1 and ey0 <= sy <= ey1:
                cp[sx - ex0, sy - ey0] = px[sx, sy]
        out[part] = (crop, (ex0, ey0, ex1, ey1))
    return out

# ---------------------------------------------------------------------------
# Shelf-packing atlas
# ---------------------------------------------------------------------------

def pack(regions):
    """regions: {name: PIL.Image} -> (atlas Image, {name: (x,y,w,h)})"""
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
    if height > 4096:
        sys.exit("atlas exceeds 4096px height")
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for n, (px_, py_, w, h) in placements.items():
        atlas.paste(regions[n], (px_, py_))
    return atlas, placements

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    variants = scan_variants()

    # region name -> image ;  attachment record: (slot, att_name, region, bbox)
    regions = {}
    attachments = {}  # slot -> {att_name: (region, bbox)}

    def add_sheet(layer, variant_key, path):
        img = cell_image(path)
        for part, (crop, bbox) in slice_parts(layer, img, variant_key).items():
            slot = slot_name(layer, part)
            region = f"{variant_key}/{slot}"
            regions[region] = crop
            attachments.setdefault(slot, {})[variant_key] = (region, bbox)

    for key, entry in sorted(variants.items()):
        kind = entry[0] if isinstance(entry, tuple) else None
        if kind in ("skin", "face"):
            _, _, _, path = entry
            add_sheet(kind, key, path)
        else:
            for layer, path in entry.items():
                add_sheet(layer, key, path)

    atlas_img, placements = pack(regions)
    os.makedirs(OUT_DIR, exist_ok=True)
    atlas_img.save(os.path.join(OUT_DIR, OUT_IMG))

    # ---- .atlas ----------------------------------------------------------
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

    # ---- slots -----------------------------------------------------------
    slots = []
    slot_index = {}
    for layer in LAYER_ORDER:
        for part in PART_ORDER:
            s = slot_name(layer, part)
            if s in attachments:
                slot_index[s] = len(slots)
                slots.append(s)

    SLOT_BONE = {}
    for layer in LAYER_ORDER:
        for part in PART_ORDER:
            s = slot_name(layer, part)
            if s not in slot_index:
                continue
            SLOT_BONE[s] = part

    def default_att(slot):
        # skin_c1 / face_c1 / hair_m1_c1 / cloth1_c1 / weapon1
        for prefer in ("skin_c1", "face_c1", "hair_m1_c1", "cloth1_c1", "weapon1"):
            if prefer in attachments[slot]:
                return prefer
        return next(iter(attachments[slot]))

    # ---- skeleton JSON ---------------------------------------------------
    bones_json = []
    for name, parent, _ in BONES:
        lx, ly = bone_local(name)
        b = {"name": name}
        if parent:
            b["parent"] = parent
        if lx: b["x"] = lx
        if ly: b["y"] = ly
        bones_json.append(b)

    slots_json = [
        {"name": s, "bone": SLOT_BONE[s], "attachment": default_att(s)}
        for s in slots
    ]

    skins = {"default": {}}
    for slot, atts in attachments.items():
        bone = SLOT_BONE[slot]
        bwx, bwy = bone_world(bone)
        smap = {}
        for att_name, (region, (x0, y0, x1, y1)) in sorted(atts.items()):
            # Region center in cell coords -> spine -> relative to bone.
            ccx = (x0 + x1 + 1) / 2.0
            ccy = (y0 + y1 + 1) / 2.0
            sx = ccx - FOOT_X
            sy = FOOT_Y - ccy
            w, h = x1 - x0 + 1, y1 - y0 + 1
            entry = {
                "path": region,
                "x": round(sx - bwx, 2),
                "y": round(sy - bwy, 2),
                "width": w,
                "height": h,
            }
            smap[att_name] = entry
        skins["default"][slot] = smap

    # ---- animations ------------------------------------------------------
    # Bone timeline helper: Spine 4.x bone timelines are additive — rotate keys
    # are degrees added to setup rotation, translate keys are x/y offsets added
    # to setup position.
    def rot(*keys):  # (t, deg) pairs
        return [{"time": t, "value": v} for t, v in keys]

    def ty(_bone, *keys):  # (t, dy) — y offset added to setup local y
        return [{"time": t, "x": 0, "y": round(dy, 3)} for t, dy in keys]

    RUN = 0.6   # seconds per 2-step cycle
    IDLE = 1.6
    RIDE = 0.7      # mount gait cycle
    RIDE_IDLE = 2.0

    # Seated riding pose (additive offsets from setup): thighs rotate forward
    # over the mount's back, shins tuck back under bent knees, arms reach
    # forward-down to the reins, torso leans slightly forward.
    P = {
        "legF_u": 32, "legF_l": -50, "legB_u": 28, "legB_l": -48,
        "torso": -4, "head": 4,
        "armF_u": 26, "armF_l": -18, "armB_u": 20, "armB_l": -12,
    }

    def ride_bones(dur, swing, bob):
        """Riding bone timelines looping over `dur` seconds.
        swing = leg sway amplitude around the seated pose, bob = torso bounce."""
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
        "idle": {"bones": {
            "torso":  {"rotate": rot((0, 0), (0.8, 1.5), (IDLE, 0)),
                        "translate": ty("torso", (0, 0), (0.8, 0.35), (IDLE, 0))},
            "head":   {"rotate": rot((0, 0), (0.8, -1.2), (IDLE, 0))},
            "armF_u": {"rotate": rot((0, 0), (0.8, 2.5), (IDLE, 0))},
            "armB_u": {"rotate": rot((0, 0), (0.8, -2.5), (IDLE, 0))},
        }},
        "run": {"bones": {
            "torso":  {"rotate": rot((0, 5), (0.15, 2), (0.3, 5), (0.45, 2), (RUN, 5)),
                        "translate": ty("torso", (0, 0.4), (0.15, 1.1), (0.3, 0.4), (0.45, 1.1), (RUN, 0.4))},
            "head":   {"rotate": rot((0, -2), (0.15, -4), (0.3, -2), (0.45, -4), (RUN, -2))},
            "legF_u": {"rotate": rot((0, 28), (0.15, -8), (0.3, -26), (0.45, 14), (RUN, 28))},
            "legF_l": {"rotate": rot((0, -8), (0.15, -14), (0.3, -55), (0.45, -30), (RUN, -8))},
            "legB_u": {"rotate": rot((0, -26), (0.15, 14), (0.3, 28), (0.45, -8), (RUN, -26))},
            "legB_l": {"rotate": rot((0, -55), (0.15, -30), (0.3, -8), (0.45, -14), (RUN, -55))},
            "armF_u": {"rotate": rot((0, -22), (0.15, 4), (0.3, 24), (0.45, -6), (RUN, -22))},
            "armF_l": {"rotate": rot((0, -28), (0.15, -38), (0.3, -30), (0.45, -36), (RUN, -28))},
            "armB_u": {"rotate": rot((0, 24), (0.15, -6), (0.3, -22), (0.45, 4), (RUN, 24))},
            "armB_l": {"rotate": rot((0, -30), (0.15, -36), (0.3, -28), (0.45, -38), (RUN, -30))},
        }},
        "ride_idle": {"bones": ride_bones(RIDE_IDLE, 2, 0.3)},
        "ride_run": {"bones": ride_bones(RIDE, 5, 0.9)},
        "attack": {"bones": {
            "torso":  {"rotate": rot((0, 0), (0.1, -5), (0.22, 9), (0.4, 3), (0.55, 0))},
            "armF_u": {"rotate": rot((0, 0), (0.1, -35), (0.22, 75), (0.38, 25), (0.55, 0))},
            "armF_l": {"rotate": rot((0, 0), (0.1, -15), (0.22, 20), (0.4, 5), (0.55, 0))},
            "weapon": {"rotate": rot((0, 0), (0.1, -10), (0.22, 15), (0.4, 3), (0.55, 0))},
            "armB_u": {"rotate": rot((0, 0), (0.1, 8), (0.22, -12), (0.4, -4), (0.55, 0))},
            # Back-hand staff: orb end lifts up-forward through the strike.
            "weaponB": {"rotate": rot((0, 0), (0.1, -12), (0.22, 55), (0.4, 12), (0.55, 0))},
        }},
    }

    skeleton = {
        "skeleton": {
            "spine": "4.3.0",
            "hash": "h99doll",
            "x": -25, "y": -1, "width": 50, "height": 36,
            "fps": 30,
        },
        "bones": bones_json,
        "slots": slots_json,
        "skins": [{"name": "default", "attachments": skins["default"]}],
        "animations": animations,
    }
    with open(os.path.join(OUT_DIR, OUT_JSON), "w", newline="\n") as f:
        json.dump(skeleton, f)

    n_att = sum(len(v) for v in attachments.values())
    print(f"regions={len(regions)} slots={len(slots)} attachments={n_att} "
          f"atlas={atlas_img.width}x{atlas_img.height}")

if __name__ == "__main__":
    main()
