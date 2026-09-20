"""Terrain-bake stamp compositing — synthetic map + catalog + stamps.

Verifies ground stamps land in every chunk they touch (border crossing),
rotation direction matches the editor contract, props are skipped,
stamps_hash lands in the manifest, and missing features don't crash.
"""

import json
import os
import sys
import tempfile
import unittest
import zlib

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import bake_terrain as bake

T = 32
CHUNK = 64
FALLBACK = (26, 58, 34, 255)  # gid 0 -> flat grass fill


def write_feature(root, category, fid, img):
    d = os.path.join(root, "assets", "map-features", category)
    os.makedirs(d, exist_ok=True)
    img.save(os.path.join(d, f"{fid}.png"))


class BakeStampsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = cls.tmp.name
        cls.assets = os.path.join(root, "public")
        cls.maps = os.path.join(root, "maps")
        cls.out = os.path.join(root, "baked")
        os.makedirs(cls.maps)

        # Feature PNGs: a solid red square, a solid blue prop, and a
        # top-red/bottom-blue square for the rotation-direction check.
        write_feature(cls.assets, "water", "red", Image.new("RGBA", (32, 32), (255, 0, 0, 255)))
        write_feature(cls.assets, "building", "hut", Image.new("RGBA", (16, 16), (0, 0, 255, 255)))
        halves = Image.new("RGBA", (16, 16))
        halves.paste((255, 0, 0, 255), (0, 0, 16, 8))   # top half red
        halves.paste((0, 0, 255, 255), (0, 8, 16, 16))  # bottom half blue
        write_feature(cls.assets, "land", "halves", halves)

        with open(os.path.join(cls.assets, "assets", "map-features", "catalog.json"), "w") as f:
            json.dump({"features": [
                {"id": "red", "category": "water",
                 "image": "/assets/map-features/water/red.png",
                 "w": 32, "h": 32, "collision": []},
                {"id": "hut", "category": "building",
                 "image": "/assets/map-features/building/hut.png",
                 "w": 16, "h": 16, "collision": []},
                {"id": "halves", "category": "land",
                 "image": "/assets/map-features/land/halves.png",
                 "w": 16, "h": 16, "collision": []},
            ]}, f)

        # 80x40 tiles with gid 0 (unresolved -> fallback fill). With CHUNK=64
        # that makes 2 horizontal chunks; the border is at world x=2048.
        cls.cols, cls.rows = 80, 40
        cls.map_path = os.path.join(cls.maps, "testmap.map.json")
        with open(cls.map_path, "w") as f:
            json.dump({
                "cols": cls.cols, "rows": cls.rows, "tile_size": T,
                "terrain": {"ground": [0] * (cls.cols * cls.rows)},
            }, f)

        cls.stamps_path = os.path.join(cls.maps, "testmap.stamps.json")
        cls.stamps_doc = {"stamps": [
            # Centered exactly on the chunk border -> paints both chunks.
            {"feature": "red", "x": CHUNK * T, "y": 640,
             "rotation": 0, "scale": 1, "flipX": False},
            # Rotated 90° clockwise: top half (red) swings to the RIGHT.
            {"feature": "halves", "x": 400, "y": 400,
             "rotation": 90, "scale": 1, "flipX": False},
            # Prop category — must not be baked.
            {"feature": "hut", "x": 96, "y": 96,
             "rotation": 0, "scale": 1, "flipX": False},
            # Unknown feature — warn + skip, no crash.
            {"feature": "ghost", "x": 200, "y": 200,
             "rotation": 0, "scale": 1, "flipX": False},
        ]}
        with open(cls.stamps_path, "w") as f:
            json.dump(cls.stamps_doc, f)

        bake.bake(cls.map_path, cls.out, CHUNK, assets_root=cls.assets)
        cls.out_dir = os.path.join(cls.out, "testmap")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def px(self, chunk, x, y):
        with Image.open(os.path.join(self.out_dir, f"base_{chunk}.png")) as img:
            return img.convert("RGBA").getpixel((x, y))

    def test_chunks_exist(self):
        self.assertTrue(os.path.exists(os.path.join(self.out_dir, "base_0_0.png")))
        self.assertTrue(os.path.exists(os.path.join(self.out_dir, "base_1_0.png")))
        self.assertTrue(os.path.exists(os.path.join(self.out_dir, "manifest.json")))

    def test_stamp_crosses_chunk_border(self):
        # Red square spans world x 2032..2064: chunk 0 local 2032..2047 and
        # chunk 1 local 0..15 (border at world x 2048).
        self.assertEqual(self.px("0_0", 2040, 640), (255, 0, 0, 255))
        self.assertEqual(self.px("0_0", 2047, 640), (255, 0, 0, 255))
        self.assertEqual(self.px("1_0", 0, 640), (255, 0, 0, 255))
        self.assertEqual(self.px("1_0", 8, 640), (255, 0, 0, 255))
        # Beyond the stamp's edge the fallback fill survives.
        self.assertEqual(self.px("0_0", 2000, 640), FALLBACK)
        self.assertEqual(self.px("1_0", 40, 640), FALLBACK)

    def test_rotation_direction(self):
        # 90° clockwise: the original TOP half (red) ends up on the right.
        self.assertEqual(self.px("0_0", 406, 400), (255, 0, 0, 255))
        self.assertEqual(self.px("0_0", 394, 400), (0, 0, 255, 255))
        # Center column is a blend of the two halves — anything but fallback.
        self.assertNotEqual(self.px("0_0", 400, 400), FALLBACK)

    def test_props_and_missing_features_skipped(self):
        # The building stamp at (96,96) stays fallback — props render live.
        self.assertEqual(self.px("0_0", 96, 96), FALLBACK)
        self.assertEqual(self.px("0_0", 200, 200), FALLBACK)

    def test_manifest_stamps_hash(self):
        with open(os.path.join(self.out_dir, "manifest.json")) as f:
            manifest = json.load(f)
        self.assertIn("stamps_hash", manifest)
        self.assertIsInstance(manifest["stamps_hash"], int)
        # Recomputed hash over the same inputs must match exactly.
        with open(self.stamps_path, "rb") as f:
            doc_bytes = f.read()
        catalog = bake.load_feature_catalog(
            os.path.join(self.assets, "assets", "map-features", "catalog.json"))
        self.assertEqual(
            manifest["stamps_hash"],
            bake.stamps_hash(doc_bytes, self.stamps_doc, catalog, self.assets),
        )
        self.assertIn("terrain_hash", manifest)

    def test_empty_stamps_hash(self):
        # A map with no stamps file still gets a stamps_hash: crc32 of the
        # canonical empty doc.
        map2 = os.path.join(self.maps, "bare.map.json")
        with open(map2, "w") as f:
            json.dump({"cols": 8, "rows": 8, "tile_size": T,
                       "terrain": {"ground": [0] * 64}}, f)
        bake.bake(map2, self.out, CHUNK, assets_root=self.assets)
        with open(os.path.join(self.out, "bare", "manifest.json")) as f:
            manifest = json.load(f)
        self.assertEqual(manifest["stamps_hash"], zlib.crc32(b'{"stamps":[]}'))


# Solid test fills — a painted pixel at full weight is exactly this color.
FILL_RGB = {
    "water": (10, 20, 30),
    "grass": (40, 50, 60),
    "sand": (70, 80, 90),
    "snow": (100, 110, 120),
    "rock": (130, 140, 150),
}
# Exact mask colors — mirrors PAINT_COLORS in bake_terrain.py.
MASK_RGB = {
    "water": (42, 109, 189), "grass": (96, 160, 80), "sand": (216, 192, 136),
    "snow": (232, 240, 248), "rock": (140, 120, 96),
}


class PaintLayerTest(unittest.TestCase):
    """Paint-mask baking: blended fill textures, fill-gid suppression,
    paint_hash, and incremental per-chunk skipping."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = cls.tmp.name
        cls.assets = os.path.join(root, "public")
        cls.maps = os.path.join(root, "maps")
        cls.out = os.path.join(root, "baked")
        os.makedirs(cls.maps)

        fill_dir = os.path.join(cls.assets, "assets", "terrain-fills")
        os.makedirs(fill_dir)
        for cat, rgb in FILL_RGB.items():
            Image.new("RGB", (256, 256), rgb).save(
                os.path.join(fill_dir, f"{cat}.png"))
        os.makedirs(os.path.join(cls.assets, "assets", "map-features"))
        with open(os.path.join(cls.assets, "assets", "map-features",
                               "catalog.json"), "w") as f:
            json.dump({"features": []}, f)

        # 96x64 tiles -> chunks (0,0) and (1,0). All grass-fill gids; none of
        # them should draw once the paint mask covers the ground.
        cls.cols, cls.rows = 96, 64
        cls.map_path = os.path.join(cls.maps, "painted.map.json")
        with open(cls.map_path, "w") as f:
            json.dump({
                "cols": cls.cols, "rows": cls.rows, "tile_size": T,
                "terrain": {"ground": [577] * (cls.cols * cls.rows)},
            }, f)

        cls.mask_path = os.path.join(cls.maps, "painted.paint.png")
        mw, mh = cls.cols * T // 8, cls.rows * T // 8  # 384 x 256
        cls.mask = np.zeros((mh, mw, 4), dtype=np.uint8)
        cls.mask[:, : mw // 2] = MASK_RGB["water"] + (255,)
        cls.mask[:, mw // 2:] = MASK_RGB["grass"] + (255,)
        Image.fromarray(cls.mask).save(cls.mask_path)

        bake.bake(cls.map_path, cls.out, CHUNK, assets_root=cls.assets)
        cls.out_dir = os.path.join(cls.out, "painted")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def px(self, chunk, x, y):
        with Image.open(os.path.join(self.out_dir, f"base_{chunk}.png")) as img:
            return img.convert("RGBA").getpixel((x, y))

    def test_paint_replaces_fill_tiles(self):
        # Deep inside each half: exactly the solid fill color — the grass
        # tile (gid 577) must NOT have drawn under/over the paint.
        self.assertEqual(self.px("0_0", 200, 600)[:3], FILL_RGB["water"])
        self.assertEqual(self.px("0_0", 1900, 600)[:3], FILL_RGB["grass"])
        self.assertEqual(self.px("1_0", 300, 600)[:3], FILL_RGB["grass"])

    def test_boundary_blends(self):
        # Mask border sits at world x = 1536 (mask px 192 * 8); the blurred
        # weight gradient spans ~±PAINT_BLUR px around it.
        edge = self.px("0_0", 1536, 600)[:3]
        self.assertNotEqual(edge, FILL_RGB["water"])
        self.assertNotEqual(edge, FILL_RGB["grass"])

    def test_paint_hash(self):
        with open(os.path.join(self.out_dir, "manifest.json")) as f:
            manifest = json.load(f)
        with open(self.mask_path, "rb") as f:
            self.assertEqual(manifest["paint_hash"], zlib.crc32(f.read()))
        self.assertIn("chunks", manifest)

    def test_incremental_skip(self):
        calls = []
        orig = bake.paint_chunk
        bake.paint_chunk = lambda *a: (calls.append(a), orig(*a))[1]
        try:
            # Untouched inputs -> nothing re-renders.
            bake.bake(self.map_path, self.out, CHUNK, assets_root=self.assets)
            self.assertEqual(calls, [])

            # Edit the mask inside chunk (1,0)'s region only.
            self.mask[40:60, 300:330] = MASK_RGB["water"] + (255,)
            Image.fromarray(self.mask).save(self.mask_path)
            bake.bake(self.map_path, self.out, CHUNK, assets_root=self.assets)
            self.assertEqual(len(calls), 1)
            wx0 = calls[0][2]
            self.assertEqual(wx0, 64 * T)  # only chunk (1,0) re-painted
        finally:
            bake.paint_chunk = orig

        # The painted water patch is visible in the re-rendered chunk.
        # mask px (315,50) -> world (2520,400) -> chunk1 local (472,400).
        self.assertEqual(self.px("1_0", 472, 400)[:3], FILL_RGB["water"])


if __name__ == "__main__":
    unittest.main()
