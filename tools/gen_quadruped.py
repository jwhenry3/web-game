"""Generate the quadruped Spine rig ("quaddoll") — a four-legged template
parallel to the humanoid paperdoll. Same conventions: 100x40 cell facing
+x, two-pixels-per-unit art grid, "{layer}_{bone}" slots, skin_/face_
attachment keys resolved by the shared attachmentForSlot.

Run from the repo root:  python tools/gen_quadruped.py
"""

import json
import math
import os
import sys
from PIL import Image

if __package__:
    from .gen_paperdoll import SDraw, capsule, new_part, pack, OUT_DIR, PAD
else:
    from gen_paperdoll import SDraw, capsule, new_part, pack, OUT_DIR, PAD

OUT_IMG = "quaddoll.png"
OUT_ATLAS = "quaddoll.atlas"
OUT_JSON = "quaddoll.json"
PREVIEW = os.path.join(OUT_DIR, "quaddoll_preview.png")

FRAME_W, FRAME_H = 100, 40
# Ground contact: feet bottom on cell row 34, root under the body midline.
FOOT_X, FOOT_Y = 45.0, 34.0


def S(cx, cy):
    return (round(cx - FOOT_X, 2), round(FOOT_Y - cy, 2))


# ---------------------------------------------------------------------------
# Palette — canonical fur is a mid gray; variants recolor it.
# ---------------------------------------------------------------------------
FUR = (96, 100, 114, 255)
FUR_DARK = (62, 66, 78, 255)      # far-side limbs, back ridge, tail tip
FUR_LIGHT = (138, 142, 158, 255)
BELLY = (168, 172, 184, 255)
OUTLINE = (30, 26, 40, 255)
NOSE = (28, 25, 34, 255)
EYE = (240, 176, 60, 255)         # amber

# Fur variants — attachment keys are skin_c<idx>, continuing the paperdoll's
# skin palette numbering (c1..c10 are humanoid skins; c11+ are furs).
FUR_VARIANTS = {
    "c11": (FUR, FUR_DARK, FUR_LIGHT, BELLY),                 # dire gray
    "c12": ((120, 90, 62, 255), (78, 58, 42, 255),           # timber brown
            (152, 120, 88, 255), (180, 150, 120, 255)),
    "c13": ((54, 56, 66, 255), (34, 36, 44, 255),            # shadow black
            (84, 88, 100, 255), (108, 112, 124, 255)),
    "c14": ((198, 202, 212, 255), (148, 152, 166, 255),      # snow
            (222, 225, 233, 255), (234, 236, 242, 255)),
}
# Eyes per variant — amber, amber, ice blue, dark.
EYE_VARIANTS = {"c11": EYE, "c12": EYE,
                "c13": (150, 190, 220, 255), "c14": (70, 68, 80, 255)}

# ---------------------------------------------------------------------------
# Joint layout (cell coords). Facing +x; far-side (B) legs sit a touch left
# and half a unit higher so they read as behind the body. Legs hang off two
# anchor bones — chest (front pair) and haunch (rear pair) — so fore/hind
# leg-length morphs can lift just their end while the paws stay planted.
# ---------------------------------------------------------------------------
BODY = (42, 20.5)                  # mid-barrel
NECK = (54, 18)                    # base of the neck
HEAD = (59, 12.5)                  # skull pivot
TAIL_U = (26, 19)                  # tail base
TAIL_L = (20, 14)                  # tail mid / tip start
CHEST = (50, 21.5)                 # front-leg anchor inside the ribcage
HAUNCH = (32, 21.5)                # hind-leg anchor inside the hip mass
SH_F, WRI_F = (52, 21), (52, 28)   # front near leg
SH_B, WRI_B = (48, 21.5), (48, 28.5)  # front far leg
HIP_F, HOCK_F = (31, 21), (33.5, 27)  # hind near leg (hock kicks forward)
HIP_B, HOCK_B = (28, 21.5), (30, 27.5)  # hind far leg
PAW_Y = 33.6

# Pivot-to-sole chain lengths (paw art bottoms out on cell row 34 = y 0).
# The far chains are a touch shorter — their damp compensates so a shared
# anchor lift lands all four paws on the ground exactly.
LEG_CHAIN_NEAR = 34.0 - SH_F[1]      # 13.0
LEG_CHAIN_FAR = 34.0 - SH_B[1]       # 12.5
FAR_DAMP = round(LEG_CHAIN_NEAR / LEG_CHAIN_FAR, 3)

_BONES_WORLD = {
    "root": S(FOOT_X, FOOT_Y),
    "body": S(*BODY),
    # Rider anchor: just under the back line, behind mid-body, so the
    # rider's feet land mid-flank in a straddle rather than standing on top.
    # Child of `body` so the rider follows the mount's pitch and sway.
    "seat": S(40, 22),
    "neck": S(*NECK),
    "head": S(*HEAD),
    "tail_u": S(*TAIL_U), "tail_l": S(*TAIL_L),
    "chest": S(*CHEST), "haunch": S(*HAUNCH),
    "legFF_u": S(*SH_F), "legFF_l": S(*WRI_F),
    "legFB_u": S(*SH_B), "legFB_l": S(*WRI_B),
    "legHF_u": S(*HIP_F), "legHF_l": S(*HOCK_F),
    "legHB_u": S(*HIP_B), "legHB_l": S(*HOCK_B),
}
BONES = [
    ("root", None), ("body", "root"), ("neck", "body"), ("head", "neck"),
    ("tail_u", "body"), ("tail_l", "tail_u"),
    ("chest", "body"), ("haunch", "body"), ("seat", "body"),
    ("legFF_u", "chest"), ("legFF_l", "legFF_u"),
    ("legFB_u", "chest"), ("legFB_l", "legFB_u"),
    ("legHF_u", "haunch"), ("legHF_l", "legHF_u"),
    ("legHB_u", "haunch"), ("legHB_l", "legHB_u"),
]

# Shape keys — same schema as the paperdoll. "size" scales the whole wolf
# about the ground-level root; "bodyLen" stretches the barrel on X so the
# neck, tail and leg anchors spread with it. The leg-length keys scale one
# pair's chains on Y and translate its anchor (chest/haunch) up by the chain
# growth, so paws stay planted — fore and hind morph independently (a hyena
# build is legLenF > legLenH). Far legs get a touch more damp so their
# shorter chain grows by the same absolute amount as the near pair.
SHAPE_KEYS = [
    {"name": "size", "label": "Size", "group": "Body", "min": 0.7,
     "max": 1.5, "bones": {"root": "xy"}},
    {"name": "bodyLen", "label": "Body length", "group": "Body", "min": 0.8,
     "max": 1.4, "bones": {"body": "x"}},
    # Height is leg-driven like the humanoid rig: all four chains scale on
    # Y while `body` lifts by the grown length, so the whole animal stands
    # taller with every paw planted (chest/haunch anchors ride the body).
    {"name": "height", "label": "Height", "group": "Body", "min": 0.7,
     "max": 1.5,
     "bones": {"legFF_u": "y", "legFF_l": "y", "legFB_u": "y", "legFB_l": "y",
               "legHF_u": "y", "legHF_l": "y", "legHB_u": "y", "legHB_l": "y"},
     "damp": {"legFB_u": FAR_DAMP, "legFB_l": FAR_DAMP,
              "legHB_u": FAR_DAMP, "legHB_l": FAR_DAMP},
     "translate": {"body": {"y": LEG_CHAIN_NEAR}}},
    {"name": "legWidth", "label": "Leg width", "group": "Legs", "min": 0.7,
     "max": 1.6,
     "bones": {"legFF_u": "x", "legFF_l": "x", "legFB_u": "x", "legFB_l": "x",
               "legHF_u": "x", "legHF_l": "x", "legHB_u": "x", "legHB_l": "x"}},
    {"name": "head", "label": "Head", "group": "Head", "min": 0.7,
     "max": 1.6, "bones": {"head": "xy"}},
    {"name": "tail", "label": "Tail", "group": "Creature", "min": 0.6,
     "max": 1.8, "bones": {"tail_u": "xy"}},
]
SHAPE_NEUTRAL = []


# ---------------------------------------------------------------------------
# Parts — drawn in canonical fur; variants recolor.
# ---------------------------------------------------------------------------
def draw_body(img):
    d = SDraw(img)
    # Barrel: deep chest in front tapering to a tucked waist behind.
    capsule(d, (44, 20.5), (55, 20), 9.5, FUR, OUTLINE, cap_r=3)
    capsule(d, (28, 20.5), (46, 20.5), 8, FUR, OUTLINE, cap_r=3)
    d.line([(30, 16.8), (52, 16.1)], fill=FUR_DARK, width=1.2)  # back ridge
    d.line([(33, 24.1), (49, 23.7)], fill=BELLY, width=1.6)     # belly
    # Haunch curve over the hindquarters.
    d.ellipse([26, 16, 36, 25], fill=FUR, outline=OUTLINE)
    d.line([(33, 24.1), (36, 24.5)], fill=BELLY, width=1.4)


def draw_neck(img):
    d = SDraw(img)
    capsule(d, (51, 19.5), (57.5, 13.5), 6, FUR, OUTLINE, cap_r=2.5)
    # Scruff silhouette along the neck's top edge.
    d.polygon([(50.5, 16.5), (53, 13), (55, 15), (57, 11), (59, 13.5)],
              fill=FUR_DARK)


def draw_head(img):
    d = SDraw(img)
    # Skull wedge.
    d.polygon([(55, 14.5), (56, 10), (60, 8.5), (64, 10), (65.5, 13),
               (62.5, 16.5), (57, 16.5)], fill=FUR, outline=OUTLINE)
    # Ears — back ear darker (far side).
    d.polygon([(56.5, 9.5), (58, 6), (60.5, 9.5)], fill=FUR_DARK,
              outline=OUTLINE)
    d.polygon([(61, 9.5), (63, 5.5), (65, 10)], fill=FUR, outline=OUTLINE)
    # Snout + jaw line.
    d.polygon([(62, 12.5), (70.5, 13.5), (71.5, 15.5), (63, 16)],
              fill=FUR, outline=OUTLINE)
    d.line([(63, 15.6), (70, 15.6)], fill=FUR_DARK, width=1)
    d.rectangle([69.5, 13.3, 71.8, 15.6], fill=NOSE)  # nose


def draw_face(img, eye=EYE):
    d = SDraw(img)
    d.ellipse([59.5, 10.8, 61.7, 12.8], fill=eye)
    d.line([(60.6, 11), (60.6, 12.6)], fill=NOSE, width=0.8)  # pupil slit
    d.line([(58.5, 10), (62.5, 9.4)], fill=FUR_DARK, width=1)  # brow


def leg_upper(img, pivot, joint, fill):
    d = SDraw(img)
    capsule(d, pivot, joint, 3.2, fill, OUTLINE, cap_r=1.8)


def leg_lower(img, joint, paw_x, fill):
    d = SDraw(img)
    capsule(d, joint, (paw_x, PAW_Y - 0.8), 2.4, fill, OUTLINE, cap_r=1.4)
    # Paw block — toes slightly ahead of the leg line.
    d.rectangle([paw_x - 1.4, PAW_Y - 1.4, paw_x + 2.8, PAW_Y + 0.4],
                fill=FUR_DARK, outline=OUTLINE)


def draw_tail_u(img):
    d = SDraw(img)
    capsule(d, TAIL_U, TAIL_L, 3.4, FUR, OUTLINE, cap_r=1.8)


def draw_tail_l(img):
    d = SDraw(img)
    capsule(d, TAIL_L, (17.5, 10.5), 2.8, FUR, OUTLINE, cap_r=1.5)
    d.ellipse([14.5, 8, 19.5, 13], fill=FUR_LIGHT, outline=OUTLINE)  # bushy tip


def recolor(img, mapping):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            p = px[x, y]
            if p in mapping:
                px[x, y] = mapping[p]
    return img


def fur_variants(draw, *args):
    """Draw once in canonical fur, then recolor to every palette."""
    out = {}
    for key, (fur, dark, light, belly) in FUR_VARIANTS.items():
        img = new_part()
        draw(img, *args)
        out[f"skin_{key}"] = recolor(img, {FUR: fur, FUR_DARK: dark,
                                           FUR_LIGHT: light, BELLY: belly})
    return out


def build_layers():
    """Slot list in draw order: (slot, bone, default, variants, rots)."""
    layers = []

    def skin_slot(bone, draw, *args):
        v = fur_variants(draw, *args)
        layers.append((f"skin_{bone}", bone, f"skin_c11", v, {}))

    # Back-to-front: tail, far legs, body mass, head, near legs on top.
    skin_slot("tail_l", draw_tail_l)
    skin_slot("tail_u", draw_tail_u)
    skin_slot("legFB_u", leg_upper, SH_B, WRI_B, FUR_DARK)
    skin_slot("legFB_l", leg_lower, WRI_B, 48, FUR_DARK)
    skin_slot("legHB_u", leg_upper, HIP_B, HOCK_B, FUR_DARK)
    skin_slot("legHB_l", leg_lower, HOCK_B, 29, FUR_DARK)
    skin_slot("body", draw_body)
    skin_slot("neck", draw_neck)
    skin_slot("head", draw_head)
    layers.append(("face_head", "head", "face_c11",
                   {f"face_{k}": _face_variant(e) for k, e in
                    EYE_VARIANTS.items()}, {}))
    skin_slot("legHF_u", leg_upper, HIP_F, HOCK_F, FUR)
    skin_slot("legHF_l", leg_lower, HOCK_F, 32, FUR)
    skin_slot("legFF_u", leg_upper, SH_F, WRI_F, FUR)
    skin_slot("legFF_l", leg_lower, WRI_F, 52, FUR)
    return layers


def _face_variant(eye):
    img = new_part()
    draw_face(img, eye)
    return img


# One entry per beast kind — drives the baked previews and per-kind editor
# spec. Mirrors ENEMY_DOLL_PRESETS in wails/frontend/src/characters/enemies.ts.
BEAST_PRESETS = {
    "dire_wolf": {"appearance": {"skin": "c11", "face": "c11"}, "scale": 1.0},
}


def bone_local(name):
    parent = dict(BONES)[name]
    if parent is None:
        return (0, 0)
    px, py = _BONES_WORLD[parent]
    x, y = _BONES_WORLD[name]
    return (round(x - px, 3), round(y - py, 3))


def main():
    layers = build_layers()
    os.makedirs(OUT_DIR, exist_ok=True)
    regions, bboxes = {}, {}
    assembled = new_part()
    bare = new_part()
    for slot, bone, default, variants, _rots in layers:
        for key, img in variants.items():
            bbox = img.getbbox() or (0, 0, 1, 1)
            path = f'{slot}__{key}'
            regions[path] = img.crop(bbox)
            bboxes[path] = tuple(v / 2 for v in bbox)  # DS = 2
        if default:
            assembled.alpha_composite(variants[default])
            if slot.startswith('skin_'):
                bare.alpha_composite(variants[default])
    assembled.save(PREVIEW)
    bare.save(os.path.join(OUT_DIR, 'quaddoll_base_preview.png'))

    # Baked per-kind previews — 100x40 cell + tight icon, like doll_*.
    for kind, preset in BEAST_PRESETS.items():
        a = preset["appearance"]
        comp = new_part()
        for slot, _bone, _default, variants, _rots in layers:
            if slot.startswith("skin_"):
                key = f"skin_{a['skin']}"
            elif slot.startswith("face_"):
                key = f"face_{a['face']}"
            else:
                continue
            if key in variants:
                comp.alpha_composite(variants[key])
        comp.resize((FRAME_W, FRAME_H), Image.NEAREST).save(
            os.path.join(OUT_DIR, f"doll_{kind}.png"))
        bbox = comp.getbbox()
        if bbox:
            comp.crop(bbox).save(os.path.join(OUT_DIR, f"doll_{kind}_icon.png"))

    atlas_img, placements = pack(regions)
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
    for name, parent in BONES:
        lx, ly = bone_local(name)
        b = {"name": name}
        if parent:
            b["parent"] = parent
        if lx:
            b["x"] = lx
        if ly:
            b["y"] = ly
        bones_json.append(b)

    slots_json = []
    skin_atts = {}
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
            skin_atts[slot][key] = {
                'path': path, 'x': round(sx - bx, 3), 'y': round(sy - by, 3),
                'width': x1 - x0, 'height': y1 - y0,
            }

    # ------------------------------------------------------------------
    # Animations — same baked-easing convention as the paperdoll.
    # ------------------------------------------------------------------
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

    def rot(*keys):
        return eased([{"time": t, "value": v} for t, v in keys])

    def txy(*keys):
        return eased([{"time": t, "x": round(dx, 3), "y": round(dy, 3)}
                      for t, dx, dy in keys])

    def cycle(duration, fn, kind="rot"):
        steps = math.ceil(duration * 60)
        keys = []
        for i in range(steps + 1):
            phase = 2 * math.pi * i / steps if i < steps else 0
            value = round(fn(phase), 4)
            if kind == "rot":
                keys.append({'time': round(duration * i / steps, 6),
                             'value': value})
            elif kind == "y":
                keys.append({'time': round(duration * i / steps, 6),
                             'x': 0, 'y': value})
            else:  # x
                keys.append({'time': round(duration * i / steps, 6),
                             'x': value, 'y': 0})
        return keys

    IDLE, RUN = 2.2, 0.7
    animations = {"idle": {"bones": {}}, "run": {"bones": {}},
                  "attack": {"bones": {}}}

    # Idle: breathing, head drift, tail sway — legs planted.
    idle = animations['idle']['bones']
    idle['body'] = {'rotate': cycle(IDLE, lambda p: .6 * math.sin(p)),
                    'translate': cycle(IDLE, lambda p: .14 * (1 - math.cos(p)), "y")}
    idle['neck'] = {'rotate': cycle(IDLE, lambda p: 1.4 * math.sin(p - .3))}
    idle['head'] = {'rotate': cycle(IDLE, lambda p: -2 * math.sin(p - .6))}
    idle['tail_u'] = {'rotate': cycle(IDLE, lambda p: 7 * math.sin(p - .9))}
    idle['tail_l'] = {'rotate': cycle(IDLE, lambda p: 10 * math.sin(p - 1.4))}

    # Run: gallop — front and hind pairs counter-phase. The body wobble runs
    # once per stride, keyed to the front limbs (legFF peaks forward at
    # p=0): the body extends nose-up as the fronts reach, the lift crests
    # just after they plant, and neck/head/tail lag the body in sequence.
    # Bones point down (-y); +rot swings the paw toward +x.
    run = animations['run']['bones']
    run['root'] = {'translate': cycle(RUN, lambda p: .18 * (1 + math.cos(p - .4)), "y")}
    run['body'] = {'rotate': cycle(RUN, lambda p: 2 * math.cos(p - .3))}
    run['neck'] = {'rotate': cycle(RUN, lambda p: -2 + 1.6 * math.cos(p - .8))}
    run['head'] = {'rotate': cycle(RUN, lambda p: -1.5 * math.cos(p - 1.1))}
    run['tail_u'] = {'rotate': cycle(RUN, lambda p: 10 + 8 * math.cos(p - 1.6))}
    run['tail_l'] = {'rotate': cycle(RUN, lambda p: 10 * math.cos(p - 2.0))}
    for side, phase in (("FF", 0), ("FB", .5), ("HF", math.pi), ("HB", math.pi + .5)):
        run[f'leg{side}_u'] = {'rotate': cycle(RUN, lambda p, q=phase: 32 * math.cos(p + q))}
        run[f'leg{side}_l'] = {'rotate': cycle(
            RUN, lambda p, q=phase: -8 - 38 * max(0, -math.sin(p + q)) ** 2)}

    # Attack: crouch then lunge — head snaps down, forelegs tuck, tail up.
    atk = animations['attack']['bones']
    atk['root'] = {'translate': txy((0, 0, 0), (.16, 2.5, .4), (.32, 3.5, 0), (.55, 0, 0))}
    atk['body'] = {'rotate': rot((0, 0), (.14, -5), (.3, 7), (.55, 0))}
    atk['neck'] = {'rotate': rot((0, 0), (.14, -9), (.3, 12), (.55, 0))}
    atk['head'] = {'rotate': rot((0, 0), (.14, 6), (.3, -14), (.45, -4), (.55, 0))}
    atk['legFF_u'] = {'rotate': rot((0, 0), (.14, -18), (.3, -34), (.55, 0))}
    atk['legFF_l'] = {'rotate': rot((0, 0), (.14, 14), (.3, 26), (.55, 0))}
    atk['legHF_u'] = {'rotate': rot((0, 0), (.16, 16), (.32, -10), (.55, 0))}
    atk['tail_u'] = {'rotate': rot((0, 0), (.2, 16), (.55, 0))}

    skeleton = {
        "skeleton": {"spine": "4.3.0", "hash": "quaddoll",
                     "x": -31, "y": -1, "width": 60, "height": 30, "fps": 30},
        "bones": bones_json,
        "slots": slots_json,
        "skins": [{"name": "default", "attachments": skin_atts}],
        "animations": animations,
    }
    with open(os.path.join(OUT_DIR, OUT_JSON), "w", newline="\n") as f:
        json.dump(skeleton, f)

    # Editor spec — same shape as paperdoll.spec.json so the editor treats
    # quaddoll as a first-class rig (bones/anims/variants/catalog).
    spec_layers = []
    catalog = {}
    seen = set()
    for slot, bone, _default, variants, rots in layers:
        suffix = "_" + bone
        lname = slot[:-len(suffix)] if slot.endswith(suffix) else slot
        entries = catalog.setdefault(lname, [])
        for key in variants:
            e = {"key": key, "slot": slot}
            if rots.get(key):
                e["rotation"] = rots[key]
            entries.append(e)
        if lname not in seen:
            seen.add(lname)
            spec_layers.append({"name": lname, "part": "auto"})
    spec = {
        "generator": "tools/gen_quadruped.py",
        "output": {"dir": "wails/frontend/public/assets/spine", "name": "quaddoll"},
        "source": {"dir": "tools", "frame": 0, "footX": FOOT_X, "footY": FOOT_Y,
                   "pad": PAD, "overlap": 0, "atlasWidth": atlas_img.width},
        "partOrder": [s["name"] for s in slots_json],
        "partRules": [],
        "layers": spec_layers,
        "bones": [{"name": name, "parent": parent,
                   "x": round(_BONES_WORLD[name][0], 2),
                   "y": round(_BONES_WORLD[name][1], 2)}
                  for name, parent in BONES],
        "shapeKeys": SHAPE_KEYS,
        "shapeNeutral": SHAPE_NEUTRAL,
        "catalog": catalog,
        "animations": animations,
    }
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "tools", "quaddoll.spec.json"), "w",
              newline="\n") as f:
        json.dump(spec, f, indent=2)
        f.write("\n")

    for kind, preset in BEAST_PRESETS.items():
        a = preset["appearance"]
        pspec = dict(spec)
        pspec["preset"] = {
            "skin": a.get("skin", "c11"), "face": a.get("face", "c11"),
            "hair": "", "hairColor": "c1", "cloth": "", "clothColor": "c1",
            "weapon": "", "weaponColor": "c1", "subWeapon": "",
            "subWeaponColor": "c1", "ears": "", "horns": "", "wings": "",
            "tail": "", "shape": preset.get("shape", {}),
        }
        with open(os.path.join(root, "tools", f"quaddoll_{kind}.spec.json"),
                  "w", newline="\n") as f:
            json.dump(pspec, f, indent=2)
            f.write("\n")

    print(f"regions={len(regions)} slots={len(slots_json)} "
          f"atlas={atlas_img.width}x{atlas_img.height}")


if __name__ == "__main__":
    main()
