#!/usr/bin/env python3
"""Generate a Spine skeleton + atlas for the Heroes 99 paper-doll character.

Slices the idle reference frame of every H99 layer sheet into body-part
regions, packs them into one atlas, and emits a Spine 4.3 JSON skeleton with
bones/slots/skins/animations. Replaces baked frame-swap animation with
skeletal animation while preserving the exact pixel art.

All rig data (bones, part rules, layer mapping, animations, slicing params)
lives in tools/h99doll.spec.json — edit it by hand or via tools/editor, and
re-running this script preserves those changes. If the spec is missing it is
created with the built-in defaults below.

Output: <spec.output.dir>/<spec.output.name>.{png,atlas,json}
        (defaults: wails/frontend/public/assets/spine, spec filename stem)

Run from the repo root:  python tools/gen_spine_character.py [spec.json]
"""

import json
import math
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC_PATH = os.path.join(ROOT, "tools", "h99doll.spec.json")

FRAME_W, FRAME_H = 100, 40
COLS = 8

# ---------------------------------------------------------------------------
# Spec
# ---------------------------------------------------------------------------
# Part partition rules: ordered, first match wins. Each cond is [op, value]
# with op in x<, x<=, x>, x>=, y<, y<=, y>, y>= evaluated against cell coords.
# Layers use "part": "auto" (part rules), a fixed part name, or
# partByVariantPrefix to route a variant (e.g. the staff) to another bone.

def _rot(*keys):
    return [{"time": t, "value": v} for t, v in keys]


def _ty(*keys):
    return [{"time": t, "x": 0, "y": round(dy, 3)} for t, dy in keys]


def _default_spec():
    # Ground contact: matches H99_ORIGIN (x=39.5, feet bottom at row 33+1).
    foot_x, foot_y = 39.5, 34.0

    def S(cx, cy):
        return (round(cx - foot_x, 2), round(foot_y - cy, 2))

    bones_world = {
        "root":   S(39.5, 34),
        # Pelvis pivot midway between the hip joints — torso and legs hang
        # off it so the "height" shape key lifts the upper body while the
        # leg chains stretch beneath, feet planted.
        "hips":   S(40.5, 27.5),
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
    bone_parents = [
        ("root",   None),
        ("hips",   "root"),
        ("torso",  "hips"),
        ("head",   "torso"),
        ("armF_u", "torso"),
        ("armF_l", "armF_u"),
        ("weapon", "armF_l"),
        ("armB_u", "torso"),
        ("armB_l", "armB_u"),
        ("weaponB", "armB_l"),
        ("legF_u", "hips"),
        ("legF_l", "legF_u"),
        ("legB_u", "hips"),
        ("legB_l", "legB_u"),
    ]

    rot, ty = _rot, _ty
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
                      "translate": ty((0, 0), (dur / 4, bob), (dur / 2, 0),
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
                        "translate": ty((0, 0), (0.8, 0.35), (IDLE, 0))},
            "head":   {"rotate": rot((0, 0), (0.8, -1.2), (IDLE, 0))},
            "armF_u": {"rotate": rot((0, 0), (0.8, 2.5), (IDLE, 0))},
            "armB_u": {"rotate": rot((0, 0), (0.8, -2.5), (IDLE, 0))},
        }},
        "run": {"bones": {
            "torso":  {"rotate": rot((0, 5), (0.15, 2), (0.3, 5), (0.45, 2), (RUN, 5)),
                        "translate": ty((0, 0.4), (0.15, 1.1), (0.3, 0.4), (0.45, 1.1), (RUN, 0.4))},
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

    return {
        # Generator + output binding, read by the editor's regenerate action.
        "generator": "tools/gen_spine_character.py",
        "output": {
            "dir": "wails/frontend/public/assets/spine",
            "name": "h99doll",
        },
        "source": {
            "dir": "wails/frontend/public/assets/heroes99",
            "frame": 1,          # idle frame cell index (0-based) used as rig reference pose
            "footX": foot_x,
            "footY": foot_y,
            "pad": 1,            # atlas padding around each region
            "overlap": 1,        # px of neighboring art at part borders to hide seams
            "atlasWidth": 1024,
        },
        # Parts drawn back -> front within each layer.
        "partOrder": [
            "legB_l", "legB_u", "armB_l", "armB_u", "torso",
            "legF_u", "legF_l", "head", "armF_u", "armF_l", "weapon", "weaponB",
        ],
        # Ordered partition rules for skin/cloth pixels (first match wins).
        "partRules": [
            {"part": "head",   "conds": [["y<", 18]]},
            {"part": "armB_u", "conds": [["y<", 23], ["x<", 37]]},
            {"part": "armB_l", "conds": [["y<", 27], ["x<", 37]]},
            {"part": "armF_u", "conds": [["y<", 23], ["x>=", 45]]},
            {"part": "armF_l", "conds": [["y<", 27], ["x>=", 45]]},
            {"part": "torso",  "conds": [["y<", 27]]},
            {"part": "legB_u", "conds": [["y<", 30], ["x<=", 40]]},
            {"part": "legB_l", "conds": [["x<=", 40]]},
            {"part": "legF_u", "conds": [["y<", 30]]},
            {"part": "legF_l", "conds": []},
        ],
        # H99 layer draw order (bottom -> top) + how each layer's pixels map to
        # rig parts. "auto" = partRules; a name = fixed part; weapon5 staff is
        # held mid-shaft by the BACK hand so it rides weaponB to pivot at that
        # grip instead of the front fist.
        "layers": [
            {"name": "skin",       "part": "auto"},
            {"name": "cloth_bot",  "part": "auto"},
            {"name": "hair_bot",   "part": "head"},
            {"name": "face",       "part": "head"},
            {"name": "cloth_top",  "part": "auto"},
            {"name": "hair_top",   "part": "head"},
            {"name": "weapon_bot", "part": "weapon", "partByVariantPrefix": {"weapon5": "weaponB"}},
            {"name": "weapon_top", "part": "weapon", "partByVariantPrefix": {"weapon5": "weaponB"}},
        ],
        # Bone names/parents + spine world positions (x right, y up, feet origin).
        "bones": [
            {"name": n, "parent": p, "x": bones_world[n][0], "y": bones_world[n][1]}
            for n, p in bone_parents
        ],
        "animations": animations,
    }


def load_spec(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    spec = _default_spec()
    with open(path, "w", newline="\n") as f:
        json.dump(spec, f, indent=2)
    print(f"wrote default spec: {path}")
    return spec


def spec_output(spec, spec_path):
    """(out_dir, name) — explicit spec.output wins, else the spec file stem
    (h99doll.spec.json -> h99doll) and the runtime assets dir."""
    out = spec.get("output") or {}
    name = out.get("name") or os.path.basename(spec_path).replace(".spec.json", "")
    out_dir = out.get("dir") or "wails/frontend/public/assets/spine"
    return os.path.join(ROOT, out_dir), name


# ---------------------------------------------------------------------------
# Spec evaluation
# ---------------------------------------------------------------------------

def eval_cond(cond, x, y):
    op, v = cond
    a = x if op.startswith("x") else y
    return {"<": a < v, "<=": a <= v, ">": a > v, ">=": a >= v}[op[1:]]


def body_part(spec, x, y):
    """Partition skin/cloth pixels into rig parts via spec.partRules."""
    for rule in spec["partRules"]:
        if all(eval_cond(c, x, y) for c in rule["conds"]):
            return rule["part"]
    return spec["partRules"][-1]["part"]


def layer_part(spec, layer, x, y, variant_key=""):
    cfg = next(l for l in spec["layers"] if l["name"] == layer)
    for prefix, part in cfg.get("partByVariantPrefix", {}).items():
        if variant_key.startswith(prefix):
            return part
    if cfg["part"] == "auto":
        return body_part(spec, x, y)
    return cfg["part"]


def slot_name(layer, part):
    return f"{layer}_{part}"


def spec_bones(spec):
    """Return (BONES, BONE_PARENT, BONES_WORLD) from spec bone list."""
    bones = [(b["name"], b["parent"]) for b in spec["bones"]]
    parent = {b["name"]: b["parent"] for b in spec["bones"]}
    world = {b["name"]: (b.get("x", 0), b.get("y", 0)) for b in spec["bones"]}
    return bones, parent, world


def bone_local(parent_map, world, name):
    wx, wy = world[name]
    parent = parent_map[name]
    if parent is None:
        return wx, wy
    px, py = world[parent]
    return float(round(wx - px, 2)), float(round(wy - py, 2))


# ---------------------------------------------------------------------------
# Variant enumeration
# ---------------------------------------------------------------------------

def scan_variants(src):
    """Return {layer_key: (kind, style, color, path)} for every sheet file."""
    v = {}

    for fn in sorted(os.listdir(os.path.join(src, "skin"))):
        if fn.startswith("skin_"):
            v[f"skin_{fn[5:-4]}"] = ("skin", None, fn[5:-4], f"skin/{fn}")

    for fn in sorted(os.listdir(os.path.join(src, "face"))):
        if fn.startswith("face_"):
            v[f"face_{fn[5:-4]}"] = ("face", None, fn[5:-4], f"face/{fn}")

    cloth_dir = os.path.join(src, "cloth")
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

    hair_dir = os.path.join(src, "hair")
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

    weapon_dir = os.path.join(src, "weapon")
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

def cell_image(src, path, frame):
    img = Image.open(os.path.join(src, path)).convert("RGBA")
    cx = (frame % COLS) * FRAME_W
    cy = (frame // COLS) * FRAME_H
    return img.crop((cx, cy, cx + FRAME_W, cy + FRAME_H))


def slice_parts(spec, layer, img, variant_key=""):
    """Return {part: (Image, bbox_in_cell)} — boxes expanded by spec overlap.

    Each region contains ONLY pixels assigned to its part: neighboring parts'
    pixels inside the bounding rect are masked out, otherwise e.g. a jacket's
    chest pixels captured in the front-arm crop would move with the arm bone
    and draw over the torso. The expanded bbox is kept (transparent padding)
    so part regions still abut when bones rotate.
    """
    overlap = spec["source"].get("overlap", 1)
    px = img.load()
    owner = {}  # (x, y) -> part
    boxes = {}
    for y in range(FRAME_H):
        for x in range(FRAME_W):
            if px[x, y][3] > 0:
                part = layer_part(spec, layer, x, y, variant_key)
                owner[(x, y)] = part
                if part not in boxes:
                    boxes[part] = [x, y, x, y]
                else:
                    b = boxes[part]
                    b[0] = min(b[0], x); b[1] = min(b[1], y)
                    b[2] = max(b[2], x); b[3] = max(b[3], y)
    out = {}
    for part, (x0, y0, x1, y1) in boxes.items():
        ex0 = max(0, x0 - overlap); ey0 = max(0, y0 - overlap)
        ex1 = min(FRAME_W - 1, x1 + overlap); ey1 = min(FRAME_H - 1, y1 + overlap)
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

def pack(regions, atlas_width, pad):
    """regions: {name: PIL.Image} -> (atlas Image, {name: (x,y,w,h)})"""
    names = sorted(regions, key=lambda n: -regions[n].height * regions[n].width)
    placements = {}
    x = pad; y = pad; row_h = 0
    for n in names:
        im = regions[n]
        w, h = im.size
        if x + w + pad > atlas_width:
            x = pad; y += row_h + pad; row_h = 0
        placements[n] = (x, y, w, h)
        x += w + pad
        row_h = max(row_h, h)
    height = 1
    while height < y + row_h + pad:
        height <<= 1
    if height > 4096:
        sys.exit("atlas exceeds 4096px height")
    atlas = Image.new("RGBA", (atlas_width, height), (0, 0, 0, 0))
    for n, (px_, py_, w, h) in placements.items():
        atlas.paste(regions[n], (px_, py_))
    return atlas, placements


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(spec_path):
    spec = load_spec(spec_path)
    out_dir, out_name = spec_output(spec, spec_path)
    out_img, out_atlas, out_json = (f"{out_name}.{e}" for e in ("png", "atlas", "json"))
    src = os.path.join(ROOT, spec["source"]["dir"])
    foot_x = spec["source"]["footX"]
    foot_y = spec["source"]["footY"]
    pad = spec["source"].get("pad", 1)
    atlas_width = spec["source"].get("atlasWidth", 1024)
    frame = spec["source"].get("frame", 1)
    part_order = spec["partOrder"]
    layer_order = [l["name"] for l in spec["layers"]]
    bones_list, bone_parent, bones_world = spec_bones(spec)

    variants = scan_variants(src)

    # region name -> image ;  attachment record: (slot, att_name, region, bbox)
    regions = {}
    attachments = {}  # slot -> {att_name: (region, bbox)}

    def add_sheet(layer, variant_key, path):
        img = cell_image(src, path, frame)
        for part, (crop, bbox) in slice_parts(spec, layer, img, variant_key).items():
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

    atlas_img, placements = pack(regions, atlas_width, pad)
    os.makedirs(out_dir, exist_ok=True)
    atlas_img.save(os.path.join(out_dir, out_img))

    # ---- .atlas ----------------------------------------------------------
    lines = [
        out_img,
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
    with open(os.path.join(out_dir, out_atlas), "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    # ---- slots -----------------------------------------------------------
    slots = []
    slot_index = {}
    for layer in layer_order:
        for part in part_order:
            s = slot_name(layer, part)
            if s in attachments:
                slot_index[s] = len(slots)
                slots.append(s)

    SLOT_BONE = {}
    for layer in layer_order:
        for part in part_order:
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
    for name, parent in bones_list:
        lx, ly = bone_local(bone_parent, bones_world, name)
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
        bwx, bwy = bones_world[bone]
        smap = {}
        for att_name, (region, (x0, y0, x1, y1)) in sorted(atts.items()):
            # Region center in cell coords -> spine -> relative to bone.
            ccx = (x0 + x1 + 1) / 2.0
            ccy = (y0 + y1 + 1) / 2.0
            sx = ccx - foot_x
            sy = foot_y - ccy
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

    skeleton = {
        "skeleton": {
            "spine": "4.3.0",
            "hash": out_name,
            "x": -25, "y": -1, "width": 50, "height": 36,
            "fps": 30,
        },
        "bones": bones_json,
        "slots": slots_json,
        "skins": [{"name": "default", "attachments": skins["default"]}],
        "animations": spec["animations"],
    }
    with open(os.path.join(out_dir, out_json), "w", newline="\n") as f:
        json.dump(skeleton, f)

    n_att = sum(len(v) for v in attachments.values())
    print(f"regions={len(regions)} slots={len(slots)} attachments={n_att} "
          f"atlas={atlas_img.width}x{atlas_img.height}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else SPEC_PATH)
