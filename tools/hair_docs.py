"""Rigged hair documents — tools/hairs/<id>.hair.json.

Each doc is one hair style built from up to three painted parts (bangs,
top, tail) plus a per-style sway multiplier. Parts are painted in a shared
cell-space window (WIN_X0/Y0/W/H below, at DS px per cell unit) using the
canonical hair ramp — HAIR main plus its shade() light/dark steps — so the
bake can recolor them to every palette color.

gen_paperdoll.py bakes every doc in HAIR_DIR into the paperdoll rig: each
enabled part gets its own head-child bone ("<id>_<part>", pivot in cell
coords), a "hair_<part>_<bone>" slot, and sway tracks in the shared
animations. The Hair workspace in tools/editor authors the docs; keep
HAIR_* constants in sync with tools/editor/src/model/hair.ts.
"""

import base64
import io
import json
import math
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HAIR_DIR = os.path.join(ROOT, "tools", "hairs")

FRAME_W, FRAME_H = 100, 40   # cell units — the generator's full frame
DS = 8                       # frame density — matches gen_paperdoll's DS
PAINT_DS = 2                 # Hair workspace paints PNGs at 2px per unit

# Paint window in cell coords (x right, y down). Covers tall crown spikes
# through mid-back tails; all parts share it so they composite in place.
WIN_X0, WIN_Y0, WIN_W, WIN_H = 26.0, 0.0, 28.0, 30.0
CANVAS_W = int(WIN_W * PAINT_DS)   # 56 — authored paint-buffer size
CANVAS_H = int(WIN_H * PAINT_DS)   # 60

# Cell -> spine world origin (mirror of FOOT_X/FOOT_Y in gen_paperdoll.py).
FOOT_X, FOOT_Y = 39.5, 34.0

PARTS = ("bangs", "top", "tail")
# Pivot == the part's bone position (cell coords). Bangs hinge at the front
# hairline, top at the crown, tail at the back of the skull.
DEFAULT_PIVOTS = {"bangs": (44.0, 7.5), "top": (40.0, 4.5), "tail": (35.5, 9.0)}

# Keep the leading eye readable: painted hair clears this cell rect (the
# same window the procedural hair uses).
EYE_WINDOW = (44.0, 10.0, 46.0, 13.5)

# Sway baked into the shared body animations — per-part amplitudes
# (degrees), phase lags, attack flick, and a tip bob (world units) that
# reads as bounce on hanging parts. Mirrored by hairChainTracks in the
# editor's model/hair.ts.
#              idle amp, idle ph, run amp, run ph, attack amp, tip bob
HAIR_SWAY = {
    "bangs": (1.5, 0.55, 4.0, 0.60, 3.0, 0.25),
    "top":   (1.0, 0.30, 2.5, 0.35, 1.5, 0.10),
    "tail":  (4.0, 0.90, 9.0, 0.30, 8.0, 0.35),
}

# Deform chain — each part's sprite is a weighted grid mesh skinned to a
# 3-bone chain. The ROOT bone carries no sway track: verts near the pivot
# stay glued to the head, while mid/tip rotations grow so the wave travels
# outward (bangs bounce, spikes whip, tails flow).
PART_DIR = {"bangs": (0.3, 1.0), "top": (0.0, -1.0), "tail": (-0.3, 1.0)}
CHAIN_FRAC = (0.0, 0.5, 1.0)   # bone positions along the flow span
CHAIN_AMP = (0.45, 1.0)        # sway scale on mid, tip (root: none)
CHAIN_LAG = (0.35, 0.7)        # extra phase lag on mid, tip
MIN_SPAN = 0.5                 # floor so reach=0 parts still emit a chain
MESH_STEP = 2.0                # cell units between grid verts

VALID_ID = __import__("re").compile(r"^[a-zA-Z0-9_-]+$")


def hair_bone(style_id, part):
    return f"{style_id}_{part}"


def hair_chain(style_id, part):
    """[root, mid, tip] bone names — root is the slot/pivot bone."""
    root = hair_bone(style_id, part)
    return [root, f"{root}_a", f"{root}_b"]


def hair_slot(style_id, part):
    # "{layer}_{bone}" — the spec emit derives the layer by stripping the
    # bone suffix, so the slot must end with the bone name.
    return f"hair_{part}_{hair_bone(style_id, part)}"


def hair_flow_span(part, pivot, bbox_cell):
    """Flow length in cell units: max projection of the painted bbox on
    the part's flow axis — the chain tip lands on the art's far edge, so
    the span must be the real reach, not a padded one. Only floored to
    MIN_SPAN to keep reach<=0 parts from emitting a degenerate chain."""
    dx, dy = PART_DIR[part]
    n = math.hypot(dx, dy)
    dx, dy = dx / n, dy / n
    x0, y0, x1, y1 = bbox_cell
    px, py = pivot
    return max(MIN_SPAN, max(
        (cx - px) * dx + (cy - py) * dy
        for cx in (x0, x1) for cy in (y0, y1)))


def hair_chain_cells(part, pivot, span):
    """Chain bone positions in cell coords along the flow axis."""
    dx, dy = PART_DIR[part]
    n = math.hypot(dx, dy)
    dx, dy = dx / n, dy / n
    return [(pivot[0] + dx * span * f, pivot[1] + dy * span * f)
            for f in CHAIN_FRAC]


def hair_mesh(grid_rect, uv_rect, pivot, part, span, bones_world, bone_index):
    """Weighted grid mesh for one part attachment.

    grid_rect: (x0,y0,x1,y1) cell-unit rect the grid covers (painted bbox).
    uv_rect:   cell-unit rect the region's uv space covers (atlas crop).
    bones_world/bone_index: [(wx,wy)] / [skeleton index] for root,mid,tip.
    Vertex s = projection onto the flow axis; s<=0 pins to the root bone,
    s>=span pins to the tip, between blends across the chain.
    """
    gx0, gy0, gx1, gy1 = grid_rect
    ux0, uy0, uw, uh = uv_rect[0], uv_rect[1], uv_rect[2] - uv_rect[0], uv_rect[3] - uv_rect[1]
    xs = [gx0 + i * MESH_STEP for i in range(int((gx1 - gx0) / MESH_STEP) + 1)]
    ys = [gy0 + i * MESH_STEP for i in range(int((gy1 - gy0) / MESH_STEP) + 1)]
    if xs[-1] < gx1:
        xs.append(gx1)
    if ys[-1] < gy1:
        ys.append(gy1)
    nx, ny = len(xs), len(ys)

    dx, dy = PART_DIR[part]
    n = math.hypot(dx, dy)
    dx, dy = dx / n, dy / n

    # Hull verts must come first — emit the boundary ring, then interior.
    order = [i for i in range(nx * ny)
             if i % nx in (0, nx - 1) or i // nx in (0, ny - 1)]
    order += [i for i in range(nx * ny)
              if i % nx not in (0, nx - 1) and i // nx not in (0, ny - 1)]

    vertices, uvs = [], []
    for i in order:
        cx, cy = xs[i % nx], ys[i // nx]
        uvs += [(cx - ux0) / uw, (cy - uy0) / uh]
        wx, wy = cx - FOOT_X, FOOT_Y - cy   # S(): cell -> spine world
        s = (cx - pivot[0]) * dx + (cy - pivot[1]) * dy
        f = max(0.0, min(1.0, s / span)) * (len(CHAIN_FRAC) - 1)
        i0 = min(int(f), len(CHAIN_FRAC) - 2)
        w = f - i0
        inf = [(bone_index[i0], bones_world[i0], 1.0 - w),
               (bone_index[i0 + 1], bones_world[i0 + 1], w)]
        vertices.append(len(inf))
        for bidx, (bx, by), bw in inf:
            vertices += [bidx, round(wx - bx, 3), round(wy - by, 3), round(bw, 3)]

    remap = {old: new for new, old in enumerate(order)}
    triangles = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            a, b, c, d = j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1
            triangles += [remap[a], remap[c], remap[b],
                          remap[b], remap[c], remap[d]]
    hull = nx * ny - (nx - 2) * (ny - 2)
    return {"uvs": uvs, "triangles": triangles, "vertices": vertices,
            "hull": hull}


def _decode_png(s):
    if not isinstance(s, str) or not s:
        return None
    if s.startswith("data:"):
        s = s.split(",", 1)[-1]
    try:
        return Image.open(io.BytesIO(base64.b64decode(s))).convert("RGBA")
    except Exception:
        return None


def _layer_mod():
    if __package__:
        from . import paperdoll_layers as pl
    else:
        import paperdoll_layers as pl
    return pl


def hair_color_variants(img):
    """Recolor a canonical-ramp part image for all 10 hair colors."""
    pl = _layer_mod()
    base = pl.HAIR_COLORS[0]
    canon_main = (*base, 255)
    canon_light = pl.shade(base, 1.5)
    canon_dark = pl.shade(base, 0.6)
    out = {}
    for i, c in enumerate(pl.HAIR_COLORS, 1):
        out[f"c{i}"] = pl.recolor(img, {
            canon_main: (*c, 255),
            canon_light: pl.shade(c, 1.5),
            canon_dark: pl.shade(c, 0.6),
        })
    return out


def load_hair_docs():
    """-> [{id, label, sway, preset, parts: {part: {pivot, img}}}]

    Part images are returned pasted onto a full transparent frame so the
    generator's bbox math sees ordinary cell coords. Empty/disabled parts
    are skipped; docs with no usable parts are skipped entirely.
    """
    docs = []
    if not os.path.isdir(HAIR_DIR):
        return docs
    for fname in sorted(os.listdir(HAIR_DIR)):
        if not fname.endswith(".hair.json"):
            continue
        try:
            with open(os.path.join(HAIR_DIR, fname), encoding="utf-8") as f:
                doc = json.load(f)
        except (OSError, ValueError):
            continue
        hid = doc.get("id") or fname[: -len(".hair.json")]
        if not VALID_ID.match(hid):
            continue
        parts = {}
        for part in PARTS:
            p = (doc.get("parts") or {}).get(part)
            if not p or p.get("enabled") is False:
                continue
            img = _decode_png(p.get("png"))
            if img is None:
                continue
            # Painted PNGs are PAINT_DS px/unit; the generator frame is DS
            # px/unit — integer NEAREST upscale keeps the painted clusters
            # exact, and the generator's LANCZOS atlas pass softens edges
            # like every other part.
            k = DS // PAINT_DS
            if k != 1:
                img = img.resize((img.width * k, img.height * k),
                                 Image.Resampling.NEAREST)
            frame = Image.new("RGBA", (FRAME_W * DS, FRAME_H * DS), (0, 0, 0, 0))
            frame.paste(img, (round(WIN_X0 * DS), round(WIN_Y0 * DS)))
            if frame.getbbox() is None:
                continue
            pv = p.get("pivot") or DEFAULT_PIVOTS[part]
            parts[part] = {
                "pivot": (float(pv[0]), float(pv[1])),
                "img": frame,
            }
        if parts:
            try:
                sway = float(doc.get("sway", 1))
            except (TypeError, ValueError):
                sway = 1.0
            docs.append({
                "id": hid,
                "label": doc.get("label") or hid,
                "sway": sway,
                "preset": bool(doc.get("preset")),
                "parts": parts,
            })
    return docs
