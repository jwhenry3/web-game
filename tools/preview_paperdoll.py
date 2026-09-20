"""Render the generated rig's linear bone timelines for visual art/pose QA.

Run: python tools/preview_paperdoll.py
This is an offline preview, not a replacement for a Spine runtime check.
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "wails/frontend/public/assets/spine"
OUTPUT = ROOT / ".codex-tmp"


def sample(keys, time, field):
    if not keys:
        return 0
    for a, b in zip(keys, keys[1:]):
        if time < b["time"]:
            u = max(0, (time - a["time"]) / (b["time"] - a["time"]))
            return a.get(field, 0) * (1 - u) + b.get(field, 0) * u
    return keys[-1].get(field, 0)


def shape_maps(shape_keys, shape):
    """Shape-key values -> per-bone scale multipliers and translate shifts."""
    scales, shifts = {}, {}
    for key in shape_keys:
        v = (shape or {}).get(key["name"])
        if v is None or v == 1:
            continue
        for bone, axes in key["bones"].items():
            # damp = the bone's share of the delta (default 1 = full value).
            eff = 1 + (v - 1) * key.get("damp", {}).get(bone, 1)
            sx, sy = scales.get(bone, (1, 1))
            scales[bone] = (sx * eff if "x" in axes else sx,
                            sy * eff if "y" in axes else sy)
        for bone, off in key.get("translate", {}).items():
            dx, dy = shifts.get(bone, (0, 0))
            shifts[bone] = (dx + off.get("x", 0) * (v - 1),
                            dy + off.get("y", 0) * (v - 1))
    return scales, shifts


def render(skeleton, regions, animation, time, appearance=None, bare=False,
           shape=None, shape_keys=(), shape_neutral=(), overlay=None):
    tile = Image.new("RGBA", (180, 248), "#242736")
    scales, shifts = shape_maps(shape_keys, shape)
    neutral = set(shape_neutral)
    poses = {}
    for bone in skeleton["bones"]:
        # Partial overlay tracks (e.g. "guard") win for the bones they key —
        # the runtime's higher Spine track does the same.
        tracks = (overlay or {}).get(bone["name"]) or \
            animation.get("bones", {}).get(bone["name"], {})
        dx, dy = shifts.get(bone["name"], (0, 0))
        x = bone.get("x", 0) + sample(tracks.get("translate"), time, "x") + dx
        y = bone.get("y", 0) + sample(tracks.get("translate"), time, "y") + dy
        angle = math.radians(sample(tracks.get("rotate"), time, "value"))
        sc = scales.get(bone["name"], (1, 1))
        if "parent" in bone:
            px, py, pa, psx, psy = poses[bone["parent"]]
            # Shape-neutral bones cancel the ancestors' accumulated scale.
            if bone["name"] in neutral:
                sc = sc[0] / psx, sc[1] / psy
            x, y = (px + (math.cos(pa) * x * psx - math.sin(pa) * y * psy),
                    py + (math.sin(pa) * x * psx + math.cos(pa) * y * psy))
            angle += pa
            sc = sc[0] * psx, sc[1] * psy
        poses[bone["name"]] = x, y, angle, *sc
    for slot in skeleton["slots"]:
        name = slot["name"]
        if bare and not name.startswith("skin_"):
            continue
        key = slot.get("attachment")
        if appearance:
            for prefix, choice in appearance.items():
                if name.startswith(prefix + "_"):
                    key = choice
                    break
        att = skeleton["skins"][0]["attachments"][name].get(key)
        if not att:
            continue
        im = regions[att["path"]]
        bx, by, angle, bsx, bsy = poses[slot["bone"]]
        c, s = math.cos(angle), math.sin(angle)
        ax, ay = att.get("x", 0) * bsx, att.get("y", 0) * bsy
        # Region spins by bone + attachment rotation about its own origin —
        # which sits at bonePos + R(bone)·(x,y); bone scale sizes the art.
        c2, s2 = math.cos(angle + math.radians(att.get("rotation", 0))), \
                 math.sin(angle + math.radians(att.get("rotation", 0)))
        cx, cy = bx + c * ax - s * ay, by + s * ax + c * ay
        w, h = att["width"] * bsx, att["height"] * bsy
        rx, ry = im.width / w, im.height / h
        # Forward affine image px -> screen (6px/unit, origin at 90,220);
        # PIL wants the inverse (screen -> image).
        fx, fy = 90 + 6 * cx, 220 - 6 * cy
        fwd = (6 * c2 / rx, 6 * s2 / ry, fx - 6 * c2 * w / 2 - 6 * s2 * h / 2,
               -6 * s2 / rx, 6 * c2 / ry, fy + 6 * s2 * w / 2 - 6 * c2 * h / 2)
        a, b, c3, d, e, f = fwd
        det = a * e - b * d
        transform = (e / det, -b / det, (b * f - c3 * e) / det,
                     -d / det, a / det, (c3 * d - a * f) / det)
        tile.alpha_composite(im.transform(tile.size, Image.Transform.AFFINE,
                                         transform, Image.Resampling.NEAREST))
    return tile


def main():
    skeleton = json.loads((ASSETS / "paperdoll.json").read_text())
    spec = json.loads((ROOT / "tools/paperdoll.spec.json").read_text())
    shape_keys = spec.get("shapeKeys", [])
    shape_neutral = spec.get("shapeNeutral", [])
    atlas = Image.open(ASSETS / "paperdoll.png").convert("RGBA")
    lines = (ASSETS / "paperdoll.atlas").read_text().splitlines()
    regions = {}
    for i, line in enumerate(lines):
        if "__" in line and not line.startswith(" "):
            x, y = map(int, lines[i+2].split(":")[1].split(","))
            w, h = map(int, lines[i+3].split(":")[1].split(","))
            regions[line] = atlas.crop((x, y, x+w, y+h))
    OUTPUT.mkdir(exist_ok=True)
    render(skeleton, regions, {}, 0).save(OUTPUT / "paperdoll-ff5-preview.png")
    variants = Image.new("RGB", (900, 248), "#242736")
    for i, (label, selection) in enumerate([
        ("Bare base", None), ("Default / blue eyes", {}),
        ("MS face 3", {"skin": "skin_c3", "face": "face_ms3", "hair_top": "hair_f1_c3", "hair_bot": "hair_f1_c3", "cloth_top": "cloth3_c2"}),
        ("MS face 7", {"skin": "skin_c5", "face": "face_ms7", "hair_top": "hair_m4_c6", "hair_bot": "hair_m4_c6", "cloth_top": "cloth4_c4"}),
        ("MS face 11", {"skin": "skin_c2", "face": "face_ms11", "hair_top": "hair_m2_c4", "hair_bot": "hair_m2_c4", "cloth_top": "cloth5_c6"}),
    ]):
        tile = render(skeleton, regions, {}, 0, selection, bare=i == 0)
        ImageDraw.Draw(tile).text((8, 10), label, fill="white")
        variants.paste(tile, (i*180, 0))
    variants.save(OUTPUT / "paperdoll-variants.png")
    # Creature presets — the doll reused for humanoid enemies. Slot-prefix
    # keys mirror the frontend's attachmentForSlot.
    creature_looks = [
        ("Goblin", {"skin": "skin_c7", "face": "face_ms6_gob",
                    "hair_top": "", "hair_bot": "",
                    "cloth_top": "cloth5_c3", "cloth_bot": "cloth5_c3",
                    "weapon_top": "weapon3", "weapon_over": "weapon7_c3",
                    "ears": "ears_point_c7"},
         {"head": 1.15, "height": 0.9, "ears": 1.35}),
        ("Imp", {"skin": "skin_c8", "face": "face_ms9_imp",
                 "hair_top": "", "hair_bot": "",
                 "cloth_top": "cloth10_c8", "cloth_bot": "cloth10_c8",
                 "weapon_top": "weapon6", "ears": "ears_long_c8",
                 "horns": "horns_imp", "wings": "wings_bat",
                 "tail": "tail_spade_c8"},
         {"height": 0.9, "ears": 1.2, "horns": 1.15}),
        ("Stone Imp", {"skin": "skin_c9", "face": "face_ms12_stone",
                       "hair_top": "", "hair_bot": "",
                       "cloth_top": "", "cloth_bot": "", "weapon_top": "",
                       "ears": "ears_long_c9", "horns": "horns_imp",
                       "wings": "wings_stone", "tail": "tail_spade_c9"},
         {"chest": 1.2, "armWidth": 1.15, "legWidth": 1.1,
          "height": 0.95, "head": 0.9, "horns": 1.2, "wings": 1.25}),
    ]
    idle = skeleton["animations"]["idle"]
    guards = {layer: skeleton["animations"].get(anim, {}).get("bones")
              for layer, anim in (("weapon_over", "guardB"),
                                  ("weapon_front", "guardF"))}
    creatures = Image.new("RGB", (180 * len(creature_looks), 248), "#242736")
    for i, (label, look, shape) in enumerate(creature_looks):
        # Over-layer mounts (shields) put their arm into the guard pose.
        ov = {}
        for layer, bones in guards.items():
            if look.get(layer) and bones:
                ov.update(bones)
        ov = ov or None
        tile = render(skeleton, regions, idle, 0.35, look,
                      shape=shape, shape_keys=shape_keys,
                      shape_neutral=shape_neutral, overlay=ov)
        ImageDraw.Draw(tile).text((8, 10), label, fill="white")
        creatures.paste(tile, (i * 180, 0))
    creatures.save(OUTPUT / "paperdoll-creatures.png")
    frames = []
    for frame in range(60):
        sheet = Image.new("RGB", (900, 248), "#242736")
        for col, (name, animation) in enumerate(skeleton["animations"].items()):
            duration = max(key["time"] for bone in animation["bones"].values()
                           for track in bone.values() for key in track)
            tile = render(skeleton, regions, animation, (frame / 30) % duration)
            ImageDraw.Draw(tile).text((10, 10), name, fill="white")
            sheet.paste(tile, (180 * col, 0))
        frames.append(sheet)
    frames[0].save(OUTPUT / "paperdoll-motion.gif", save_all=True,
                   append_images=frames[1:], duration=[33, 33, 34]*20, loop=0)
    frames[10].save(OUTPUT / "paperdoll-motion-poses.png")
    print(f"Rendered setup portrait and 60 animation frames to {OUTPUT}")


if __name__ == "__main__":
    main()
