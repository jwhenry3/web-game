#!/usr/bin/env python3
"""Bake terrain chunks — pre-render a map's ground layer into large PNGs so
the client doesn't rasterize tiles at scene startup.

Mirrors wails/frontend/src/world/terrainRaster.ts exactly: transparent props
sit on a grass underlay, 2x2 tree canopy tops go on a separate overhead image
(walk-under depth), and unresolved GIDs fall back to a flat grass fill.

    python tools/bake_terrain.py [--map data/maps/clara_mundi.map.json]

Outputs under wails/frontend/public/assets/baked/<map_id>/:
    manifest.json        — map dims, terrain/stamps hashes, chunk lists
    base_<cx>_<cy>.png   — ground layer for 64x64-tile chunk (cx,cy)
    over_<cx>_<cy>.png   — canopy tops (only written when non-empty)

Ground-category map-feature stamps ("water", "land" in
assets/map-features/catalog.json) from the sibling <id>.stamps.json are
alpha-composited into the base chunks in document order; all other categories
stay live client-side props. Run after regenerating the map (gencontinent),
editing terrain, or moving stamps. The client verifies manifest.terrain_hash
against the live layers and falls back to runtime rasterization when it
doesn't match; manifest.stamps_hash lets the editor flag a stale bake.
"""

import argparse
import json
import os
import sys
import zlib

import numpy as np
from PIL import Image, ImageFilter

try:  # script mode (python tools/bake_terrain.py)
    from stamp_from_terrain import category_grid
except ImportError:  # package mode (from tools import bake_terrain)
    from tools.stamp_from_terrain import category_grid

T = 32            # tile px
CHUNK = 64        # tiles per chunk side — must match TERRAIN_CHUNK_TILES

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILESETS = os.path.join(ROOT, "wails", "frontend", "public", "assets", "tilesets")
OUT_BASE = os.path.join(ROOT, "wails", "frontend", "public", "assets", "baked")
# Map-feature stamps: catalog + PNGs live under the public assets root; the
# catalog's "image" field is a "/assets/..." URL resolved against this dir.
PUBLIC_ASSETS = os.path.join(ROOT, "wails", "frontend", "public")
FEATURE_CATALOG = os.path.join(PUBLIC_ASSETS, "assets", "map-features", "catalog.json")

# Catalog categories baked INTO the base chunks. Everything else ("building",
# props, ...) stays a live client-side prop for y-sorting.
GROUND_CATS = {"water", "land"}

# --- terrain paint layer -----------------------------------------------------
#
# <id>.paint.png sits next to <id>.map.json: an RGBA mask at PAINT_SCALE
# world-px per pixel, each px an exact PAINT_COLORS category color. At bake
# time the mask is decoded to per-category weights (upscaled + blurred, so
# painted borders become soft gradients — shorelines for free) and each
# category fills from its seamless texture in assets/terrain-fills/.
# Fill-classified tile gids are then skipped (the paint IS the ground);
# prop tiles still draw on top. Mirrors PAINT_COLORS in
# tools/paint_from_terrain.py and the editor paint palette.

PAINT_SCALE = 8        # world px per mask px
PAINT_MARGIN = 8       # mask px of context around a chunk (blur bleed)
PAINT_Q = 4            # weight maps computed at quarter res — gradients are
                       # smooth, so upsample instead of full-res blurs
PAINT_BLUR = 22        # blend radius in world px
PAINT_FILL_WORLD = 512  # world px per fill tile period — world-aligned wrap.
                        # Fill PNGs may exceed this (higher texel density);
                        # mirrors PAINT_FILL_WORLD in gen_terrain_fills.py and
                        # the editor's MapWorkspace preview.

PAINT_COLORS = {       # exact mask RGB -> category index
    "water": (42, 109, 189),
    "grass": (96, 160, 80),
    "sand": (216, 192, 136),
    "snow": (232, 240, 248),
    "rock": (140, 120, 96),
}
PAINT_CATS = ("water", "grass", "sand", "snow", "rock")


def load_paint_mask(mask_path):
    """<id>.paint.png -> (raw_bytes, uint8 category-index array at mask res).
    (None, None) when absent; unknown colors fall back to grass."""
    if not os.path.exists(mask_path):
        return None, None
    with open(mask_path, "rb") as f:
        raw = f.read()
    try:
        arr = np.asarray(Image.open(mask_path).convert("RGBA"))
    except Exception as e:
        print(f"  warn: unreadable paint mask {mask_path}: {e} — skipped",
              file=sys.stderr)
        return None, None
    idx = np.zeros(arr.shape[:2], dtype=np.uint8)
    matched = np.zeros(arr.shape[:2], dtype=bool)
    rgb = arr[..., :3]
    for ci, cat in enumerate(PAINT_CATS):
        m = np.all(rgb == PAINT_COLORS[cat], axis=-1)
        idx[m] = ci
        matched |= m
    n_unknown = int((~matched).sum())
    if n_unknown:
        print(f"  warn: {n_unknown} mask px don't match a paint color — "
              f"painted as grass", file=sys.stderr)
    return raw, idx


def load_fill_textures(assets_root):
    """Category index -> uint8 (PAINT_FILL_SIZE², 3) seamless fill array."""
    fills = []
    for cat in PAINT_CATS:
        p = os.path.join(assets_root, "assets", "terrain-fills", f"{cat}.png")
        if not os.path.exists(p):
            raise SystemExit(
                f"paint mask present but missing fill texture {p} — "
                f"run tools/gen_terrain_fills.py")
        fills.append(np.asarray(Image.open(p).convert("RGB"), dtype=np.float32))
    return fills


def mask_region(idx, wx0, wy0, wpx, hpx):
    """Category-index mask region covering the chunk plus PAINT_MARGIN context
    (edge-padded where the map border clamps it). Returns (region, world-x
    origin, world-y origin) — the region starts at a mask-cell boundary."""
    mh, mw = idx.shape
    x0m, y0m = wx0 // PAINT_SCALE, wy0 // PAINT_SCALE
    x1m = (wx0 + wpx + PAINT_SCALE - 1) // PAINT_SCALE
    y1m = (wy0 + hpx + PAINT_SCALE - 1) // PAINT_SCALE
    rx0, ry0 = max(0, x0m - PAINT_MARGIN), max(0, y0m - PAINT_MARGIN)
    rx1, ry1 = min(mw, x1m + PAINT_MARGIN), min(mh, y1m + PAINT_MARGIN)
    reg = np.pad(
        idx[ry0:ry1, rx0:rx1],
        ((PAINT_MARGIN - (y0m - ry0), PAINT_MARGIN - (ry1 - y1m)),
         (PAINT_MARGIN - (x0m - rx0), PAINT_MARGIN - (rx1 - x1m))),
        mode="edge")
    return (reg, (x0m - PAINT_MARGIN) * PAINT_SCALE,
            (y0m - PAINT_MARGIN) * PAINT_SCALE)


def paint_chunk(idx, fills, wx0, wy0, wpx, hpx):
    """Painted RGB base for the chunk at world px (wx0,wy0,wpx,hpx).

    Blurs each category indicator into a weight at quarter res, upsamples, and
    takes the weighted sum of world-aligned fill tiles — so adjacent chunks
    tile the fills identically and category borders blend into shorelines."""
    reg, rox, roy = mask_region(idx, wx0, wy0, wpx, hpx)
    rh, rw = reg.shape[0] * PAINT_SCALE, reg.shape[1] * PAINT_SCALE
    qw, qh = rw // PAINT_Q, rh // PAINT_Q
    blur = PAINT_BLUR / PAINT_Q

    acc = np.zeros((rh, rw, 3), dtype=np.float32)
    wsum = np.zeros((rh, rw), dtype=np.float32)
    for ci in range(len(PAINT_CATS)):
        if not (reg == ci).any():
            continue
        wimg = Image.fromarray((reg == ci) * np.uint8(255))
        wimg = wimg.resize((qw, qh), Image.BICUBIC)
        wimg = wimg.filter(ImageFilter.GaussianBlur(blur))
        w = np.asarray(wimg.resize((rw, rh), Image.BICUBIC), dtype=np.float32)
        w = np.clip(w, 0, 255) / 255.0
        fill = fills[ci]
        fsz = fill.shape[0]
        # World-aligned wrap: adjacent chunks tile the fill identically.
        # fsz may exceed PAINT_FILL_WORLD for higher texel density.
        k = fsz / PAINT_FILL_WORLD
        acc += w[..., None] * fill[np.ix_(
            ((roy + np.arange(rh)) * k).astype(np.int64) % fsz,
            ((rox + np.arange(rw)) * k).astype(np.int64) % fsz)]
        wsum += w
    np.divide(acc, np.maximum(wsum, 1e-6)[..., None], out=acc)
    offx, offy = wx0 - rox, wy0 - roy
    return Image.fromarray(
        acc[offy:offy + hpx, offx:offx + wpx].astype(np.uint8), "RGB")

# Tileset catalog — mirrors PIPOYA_TILESETS in world/pipoyaTilesets.ts plus the
# MundiTerrain supplemental sheet (internal/game/mundi_tiles.go).
SHEETS = [  # (id, firstgid, tilecount, columns, image path under tilesets/)
    ("waterfall", 1, 576, 32, "pipoya/WaterFall_pipo.png"),
    ("basechip", 577, 1064, 8, "pipoya/BaseChip_pipo.png"),
    ("grass", 1641, 528, 8, "pipoya/Grass_pipo.png"),
    ("water", 2169, 3072, 64, "pipoya/Water_pipo.png"),
    ("flower", 5241, 48, 8, "pipoya/Flower_pipo.png"),
    ("dirt", 5289, 336, 8, "pipoya/Dirt_pipo.png"),
    ("mundi", 6000, 64, 8, "mundi/MundiTerrain.png"),
]

BASE_CHIP_FIRST_GID = 577
GRASS_FILL_GID = BASE_CHIP_FIRST_GID + 0
DIRT_FILL_GID = BASE_CHIP_FIRST_GID + 5

# Solid BaseChip fills that fully cover a cell — mirrors SOLID_BASECHIP_LOCALS.
SOLID_BASECHIP_LOCALS = {
    0, 1, 2,
    5, 7, 115,
    116, 117, 118, 119, 120, 122, 123, 124, 125, 126,
    128, 129, 130, 131, 132,
    256, 257, 258, 259, 260,
}

# Sheets whose locals 8-15 are 2x2 tree canopy tops (walk-under layer).
CANOPY_SHEETS = {"basechip", "mundi"}

FALLBACK_RGB = (26, 58, 34)  # flat grass — matches client FILL['.']

GRASS_CHAR_SOLID = {0, 1, 2}
DIRT_LOCALS = {5, 115}


def load_sheets():
    sheets = []
    for sid, firstgid, tilecount, cols, rel in SHEETS:
        path = os.path.join(TILESETS, rel)
        if not os.path.exists(path):
            print(f"  warn: missing tileset {rel} — its tiles use the fallback fill", file=sys.stderr)
            continue
        sheets.append({
            "id": sid,
            "firstgid": firstgid,
            "tilecount": tilecount,
            "cols": cols,
            "img": Image.open(path).convert("RGBA"),
        })
    # Highest firstgid first so local index resolves to the correct sheet.
    sheets.sort(key=lambda s: -s["firstgid"])
    return sheets


def resolve(gid, sheets):
    """gid -> (sheet, local, tile Image) or None — mirrors resolvePipoyaTile."""
    raw = gid & 0x1FFFFFFF
    if raw <= 0:
        return None
    for s in sheets:
        if raw < s["firstgid"]:
            continue
        local = raw - s["firstgid"]
        if local < 0 or local >= s["tilecount"]:
            continue
        sx = (local % s["cols"]) * T
        sy = (local // s["cols"]) * T
        return s, local, s["img"].crop((sx, sy, sx + T, sy + T))
    return None


def is_canopy(sheet_id, local):
    return sheet_id in CANOPY_SHEETS and 8 <= local <= 15


def needs_underlay(sheet_id, local):
    """Transparent tiles that need a ground fill painted beneath them."""
    if sheet_id == "basechip":
        return local not in SOLID_BASECHIP_LOCALS
    if sheet_id == "mundi":
        return local >= 8  # fills are 0-7; trees/props are transparent
    return False


def pick_canopy_underlay(ground):
    """Dirt-vs-grass underlay for canopy cells — mirrors pickGroundUnderlayGid."""
    dirt = grass = 0
    for i in range(0, len(ground), 97):
        local = (ground[i] & 0x1FFFFFFF) - BASE_CHIP_FIRST_GID
        if local in GRASS_CHAR_SOLID:
            grass += 1
        elif local in DIRT_LOCALS:
            dirt += 1
    return DIRT_FILL_GID if dirt > grass else GRASS_FILL_GID


def terrain_hash(ground):
    """Sampled hash over the ground layer only — mirrors terrainLayerHash with
    an empty collision array (terrainRaster.ts). Collision is excluded because
    the server normalizes it at load (normalizeTreeCollision) before clients
    see it, and it never changes baked pixels anyway."""
    h = len(ground) & 0xFFFFFFFF
    for i in range(0, len(ground), 97):
        h = ((h * 31) + (ground[i] & 0xFFFFFFFF)) & 0xFFFFFFFF
    return h


# --- map-feature stamps ------------------------------------------------------
#
# <id>.stamps.json sits next to <id>.map.json:
#   {stamps: [{feature, x, y, rotation, scale, flipX, collision?}]}
# x,y is the feature-image CENTER in world px; rotation is clockwise
# screen-space degrees; flipX mirrors in feature-local space.
# Transform order (tools/editor/src/model/stamps.ts): recenter around the
# image center → flipX → scale → rotate → translate to (x,y).

EMPTY_STAMPS_DOC = b'{"stamps":[]}'


def load_stamps_doc(stamps_path):
    """Returns (raw_bytes, doc). Missing file -> canonical empty doc bytes."""
    if not os.path.exists(stamps_path):
        return EMPTY_STAMPS_DOC, {"stamps": []}
    with open(stamps_path, "rb") as f:
        raw = f.read()
    try:
        doc = json.loads(raw)
    except ValueError:
        print(f"  warn: corrupt stamps file {stamps_path} — treated as empty", file=sys.stderr)
        doc = {"stamps": []}
    if not isinstance(doc, dict) or not isinstance(doc.get("stamps"), list):
        doc = {"stamps": []}
    return raw, doc


def load_feature_catalog(catalog_path):
    """Catalog id -> feature dict, or {} when the catalog is absent."""
    if not os.path.exists(catalog_path):
        print(f"  warn: no feature catalog at {catalog_path} — stamps skipped", file=sys.stderr)
        return {}
    with open(catalog_path) as f:
        cat = json.load(f)
    return {f["id"]: f for f in cat.get("features", []) if isinstance(f.get("id"), str)}


def feature_png_path(feature, assets_root):
    """'/assets/map-features/<cat>/<id>.png' -> file under the assets root."""
    rel = str(feature.get("image", "")).lstrip("/")
    return os.path.join(assets_root, *rel.split("/"))


def stamps_hash(doc_bytes, doc, catalog, assets_root):
    """CRC32 over the raw stamps-doc bytes, then one folded record per
    referenced feature id (sorted): id|category|wxh|<png crc32>. Covers the
    placements plus the pixels/catalog dims they bake with, so editing a
    feature PNG or a stamp invalidates the manifest. Byte-level: any rewrite
    of the stamps file (even whitespace) marks the bake stale — conservative
    but simple. Mirrored by stampsHash() in tools/editor/vite/mapsApi.ts."""
    h = zlib.crc32(doc_bytes)
    ids = sorted({
        s.get("feature")
        for s in doc.get("stamps", [])
        if isinstance(s, dict) and isinstance(s.get("feature"), str) and s.get("feature")
    })
    for fid in ids:
        f = catalog.get(fid)
        if f is None:
            entry = f"{fid}|unknown"
        else:
            p = feature_png_path(f, assets_root)
            if os.path.exists(p):
                with open(p, "rb") as fh:
                    png_crc = zlib.crc32(fh.read())
                entry = f"{fid}|{f.get('category')}|{f.get('w')}x{f.get('h')}|{png_crc:08x}"
            else:
                entry = f"{fid}|no-image"
        h = zlib.crc32(entry.encode("utf-8"), h)
    return h


def transform_stamp(img, stamp):
    """Apply flipX → scale → rotate to a feature image. Returns None when the
    placement is unusable. Rotation is clockwise screen-space degrees, so PIL
    (which rotates counterclockwise about the center) gets the negated angle;
    expand=True keeps the center anchored so the result is pasted centered on
    (stamp.x, stamp.y)."""
    if stamp.get("flipX"):
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    scale = stamp.get("scale") or 1
    if not isinstance(scale, (int, float)) or scale <= 0:
        return None
    if scale != 1:
        w = max(1, round(img.width * scale))
        h = max(1, round(img.height * scale))
        img = img.resize((w, h), Image.LANCZOS)
    rot = stamp.get("rotation") or 0
    if isinstance(rot, (int, float)) and rot % 360:
        img = img.rotate(-rot, expand=True, resample=Image.BICUBIC)
    return img


def prepare_ground_stamps(doc, catalog, assets_root):
    """Transformed (world_left, world_top, image, rec) tuples in document
    order — painter's order, ground categories only. rec is a compact string
    covering everything that shapes the pixels (feature id, placement,
    catalog dims, feature PNG crc) so chunks can hash it without re-reading
    images."""
    prepared = []
    for i, s in enumerate(doc.get("stamps", [])):
        if not isinstance(s, dict):
            continue
        fid = s.get("feature")
        f = catalog.get(fid) if isinstance(fid, str) else None
        if f is None:
            print(f"  warn: stamp {i} references unknown feature '{fid}' — skipped", file=sys.stderr)
            continue
        if f.get("category") not in GROUND_CATS:
            continue  # prop — the client draws it live for y-sorting
        path = feature_png_path(f, assets_root)
        if not os.path.exists(path):
            print(f"  warn: missing feature image {path} — stamp skipped", file=sys.stderr)
            continue
        try:
            img = Image.open(path).convert("RGBA")
        except Exception as e:
            print(f"  warn: unreadable feature image {path}: {e} — stamp skipped", file=sys.stderr)
            continue
        with open(path, "rb") as fh:
            png_crc = zlib.crc32(fh.read())
        img = transform_stamp(img, s)
        if img is None:
            print(f"  warn: stamp {i} ({fid}) has a bad transform — skipped", file=sys.stderr)
            continue
        sx, sy = s.get("x"), s.get("y")
        if not isinstance(sx, (int, float)) or not isinstance(sy, (int, float)):
            print(f"  warn: stamp {i} ({fid}) has non-numeric x/y — skipped", file=sys.stderr)
            continue
        rec = "|".join(str(s.get(k)) for k in
                       ("feature", "x", "y", "rotation", "scale", "flipX"))
        rec += f"|{f.get('w')}x{f.get('h')}|{png_crc:08x}"
        prepared.append((sx - img.width / 2, sy - img.height / 2, img, rec))
    return prepared


def chunk_input_hash(ground_arr, paint_idx, stamps, extra, c0, r0, w, h):
    """CRC32 of every input that shapes a chunk's pixels — ground tile cells,
    the paint-mask region (with blur margin), intersecting stamp records, and
    global extras (fill-texture + canopy-underlay crc). Chunks whose hash
    matches the manifest and whose PNGs still exist are skipped on re-bake.
    Collision is deliberately absent: it never changes pixels."""
    crc = zlib.crc32(ground_arr[r0:r0 + h, c0:c0 + w].tobytes())
    crc = zlib.crc32(str(extra).encode("utf-8"), crc)
    if paint_idx is not None:
        reg, _, _ = mask_region(paint_idx, c0 * T, r0 * T, w * T, h * T)
        crc = zlib.crc32(reg.tobytes(), crc)
    cx0, cy0 = c0 * T, r0 * T
    cx1, cy1 = cx0 + w * T, cy0 + h * T
    for sx, sy, img, rec in stamps:
        if sx < cx1 and sx + img.width > cx0 and \
                sy < cy1 and sy + img.height > cy0:
            crc = zlib.crc32(rec.encode("utf-8"), crc)
    return crc


def composite_stamp(base, stamp, chunk_x0, chunk_y0):
    """Alpha-composite one transformed stamp into a base chunk. chunk_x0/y0 is
    the chunk's world-pixel origin; the stamp's world rect is cropped to the
    chunk, so stamps straddling borders land in every chunk they touch."""
    sx, sy, img = stamp[:3]
    x0, y0 = int(round(sx)), int(round(sy))
    ix0 = max(x0, chunk_x0)
    iy0 = max(y0, chunk_y0)
    ix1 = min(x0 + img.width, chunk_x0 + base.width)
    iy1 = min(y0 + img.height, chunk_y0 + base.height)
    if ix1 <= ix0 or iy1 <= iy0:
        return
    piece = img.crop((ix0 - x0, iy0 - y0, ix1 - x0, iy1 - y0))
    base.alpha_composite(piece, (ix0 - chunk_x0, iy0 - chunk_y0))


def bake(map_path: str, out_base: str, chunk: int, assets_root: str = PUBLIC_ASSETS) -> None:
    with open(map_path) as f:
        m = json.load(f)
    cols, rows = m["cols"], m["rows"]
    ground = m["terrain"]["ground"]
    if len(ground) != cols * rows:
        raise SystemExit(f"terrain.ground length {len(ground)} != {cols}x{rows}")

    map_id = os.path.basename(map_path)
    if map_id.endswith(".map.json"):
        map_id = map_id[: -len(".map.json")]
    else:
        map_id = os.path.splitext(map_id)[0]
    out_dir = os.path.join(out_base, map_id)
    os.makedirs(out_dir, exist_ok=True)

    # Map-feature stamps — sibling <id>.stamps.json; ground categories are
    # composited into the base chunks, everything else stays a live prop.
    stamps_path = os.path.join(os.path.dirname(os.path.abspath(map_path)),
                               map_id + ".stamps.json")
    doc_bytes, stamps_doc = load_stamps_doc(stamps_path)
    catalog = load_feature_catalog(
        os.path.join(assets_root, "assets", "map-features", "catalog.json"))
    s_hash = stamps_hash(doc_bytes, stamps_doc, catalog, assets_root)
    ground_stamps = prepare_ground_stamps(stamps_doc, catalog, assets_root)

    # Terrain paint layer — when <id>.paint.png exists it replaces the fill
    # tiles as the ground: chunks start from blended fill textures and only
    # prop tiles draw on top.
    paint_bytes, paint_idx = load_paint_mask(
        os.path.join(os.path.dirname(os.path.abspath(map_path)),
                     map_id + ".paint.png"))
    fills = fill_grid = fills_crc = None
    if paint_idx is not None:
        fills = load_fill_textures(assets_root)
        fills_crc = 0
        for fa in fills:
            fills_crc = zlib.crc32(fa.tobytes(), fills_crc)
        fill_grid = category_grid(ground, cols, rows)  # 0 = prop cell

    # Incremental re-bake: the manifest records each chunk's input hash, so a
    # bake after a small paint/stamp edit re-renders only the chunks whose
    # inputs changed. No hash (old manifest) -> everything renders.
    old_chunks, old_over = {}, set()
    manifest_path = os.path.join(out_dir, "manifest.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path) as f:
                old = json.load(f)
            old_chunks = old.get("chunks") or {}
            old_over = set(old.get("over") or [])
        except Exception:
            pass

    sheets = load_sheets()
    fallback = Image.new("RGBA", (T, T), FALLBACK_RGB + (255,))
    tile_cache = {}

    def tile_img(gid):
        if gid not in tile_cache:
            hit = resolve(gid, sheets)
            tile_cache[gid] = hit
        return tile_cache[gid]

    underlay_gid = pick_canopy_underlay(ground)
    canopy_underlay_hit = tile_img(underlay_gid)
    canopy_underlay = canopy_underlay_hit[2] if canopy_underlay_hit else fallback
    ground_arr = np.asarray(ground, dtype=np.uint32).reshape(rows, cols)
    extra = f"{fills_crc}|{underlay_gid}"
    grass_underlay_hit = tile_img(GRASS_FILL_GID)
    grass_underlay = grass_underlay_hit[2] if grass_underlay_hit else fallback

    base_keys, over_keys = [], []
    chunk_hashes = {}
    skipped = 0
    ncx = (cols + chunk - 1) // chunk
    ncy = (rows + chunk - 1) // chunk
    for cy in range(ncy):
        for cx in range(ncx):
            c0, r0 = cx * chunk, cy * chunk
            w = min(chunk, cols - c0)
            h = min(chunk, rows - r0)
            key = f"{cx},{cy}"
            base_path = os.path.join(out_dir, f"base_{cx}_{cy}.png")
            over_path = os.path.join(out_dir, f"over_{cx}_{cy}.png")
            ch = chunk_input_hash(ground_arr, paint_idx, ground_stamps,
                                  extra, c0, r0, w, h)
            chunk_hashes[key] = ch
            if (old_chunks.get(key) == ch and os.path.exists(base_path)
                    and (key not in old_over or os.path.exists(over_path))):
                base_keys.append(key)
                if key in old_over:
                    over_keys.append(key)
                skipped += 1
                continue
            if paint_idx is not None:
                base = paint_chunk(
                    paint_idx, fills, c0 * T, r0 * T, w * T, h * T
                ).convert("RGBA")
            else:
                base = Image.new("RGBA", (w * T, h * T))
            over = Image.new("RGBA", (w * T, h * T))
            over_used = False
            for r in range(r0, r0 + h):
                i0 = r * cols
                for c in range(c0, c0 + w):
                    if fill_grid is not None and fill_grid[r, c] != 0:
                        continue  # ground fill — the paint layer covers it
                    gid = ground[i0 + c]
                    x, y = (c - c0) * T, (r - r0) * T
                    hit = tile_img(gid)
                    if hit and is_canopy(hit[0]["id"], hit[1]):
                        if fill_grid is None:
                            base.paste(canopy_underlay, (x, y))
                        over.paste(hit[2], (x, y), hit[2])
                        over_used = True
                        continue
                    if hit:
                        if fill_grid is None and needs_underlay(
                                hit[0]["id"], hit[1]):
                            base.paste(grass_underlay, (x, y))
                        base.paste(hit[2], (x, y), hit[2])
                    elif fill_grid is None:
                        base.paste(fallback, (x, y))
            for stamp in ground_stamps:
                composite_stamp(base, stamp, c0 * T, r0 * T)
            base.save(base_path, optimize=True)
            base_keys.append(key)
            if over_used:
                over.save(over_path, optimize=True)
                over_keys.append(key)

    # Drop chunk files no longer produced (map shrank, canopy emptied).
    keep = {f"base_{k.replace(',', '_')}.png" for k in base_keys}
    keep |= {f"over_{k.replace(',', '_')}.png" for k in over_keys}
    for fn in os.listdir(out_dir):
        if (fn.startswith("base_") or fn.startswith("over_")) \
                and fn.endswith(".png") and fn not in keep:
            os.remove(os.path.join(out_dir, fn))

    manifest = {
        "map": map_id,
        "tile_size": T,
        "chunk_tiles": chunk,
        "cols": cols,
        "rows": rows,
        "terrain_hash": terrain_hash(ground),
        "stamps_hash": s_hash,
        "paint_hash": zlib.crc32(paint_bytes) if paint_bytes else 0,
        "base": base_keys,
        "over": over_keys,
        "chunks": chunk_hashes,
    }
    with open(manifest_path, "w") as f:
        json.dump(manifest, f)
    print(f"baked {len(base_keys) - skipped} chunks "
          f"({skipped} unchanged skipped, {len(over_keys)} with canopy, "
          f"{len(ground_stamps)} ground stamps) -> {out_dir}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Bake terrain chunks to PNGs")
    ap.add_argument("--map", default=os.path.join(ROOT, "data", "maps", "clara_mundi.map.json"))
    ap.add_argument("--out", default=OUT_BASE)
    ap.add_argument("--chunk", type=int, default=CHUNK)
    args = ap.parse_args()
    bake(args.map, args.out, args.chunk)


if __name__ == "__main__":
    main()
