"""Map-feature catalog sanity — run tools/gen_map_features.py first."""

import json
import os
import sys
import unittest

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import gen_map_features as gen

ASSETS = os.path.join(ROOT, "wails/frontend/public/assets/map-features")


class MapFeaturesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(ASSETS, "catalog.json")) as f:
            cls.catalog = json.load(f)

    def test_catalog_parses(self):
        features = self.catalog["features"]
        ids = [f["id"] for f in features]
        self.assertEqual(len(ids), len(set(ids)), "feature ids must be unique")
        for f in features:
            self.assertEqual(f["image"],
                             f"/assets/map-features/{f['category']}/{f['id']}.png")
            self.assertIsInstance(f["w"], int)
            self.assertIsInstance(f["h"], int)

    def test_four_per_kind(self):
        counts = {}
        for f in self.catalog["features"]:
            counts[f["category"]] = counts.get(f["category"], 0) + 1
        for cat, kinds in gen.KINDS.items():
            self.assertEqual(counts.get(cat), len(kinds) * gen.PER_KIND,
                             f"expected {len(kinds) * gen.PER_KIND} {cat} features")
        self.assertEqual(
            sum(counts.values()),
            sum(len(k) for k in gen.KINDS.values()) * gen.PER_KIND,
        )

    def test_images_exist_and_match_size(self):
        for f in self.catalog["features"]:
            path = os.path.join(ASSETS, f["category"], f"{f['id']}.png")
            self.assertTrue(os.path.exists(path), path)
            with Image.open(path) as img:
                self.assertEqual(img.size, (f["w"], f["h"]), f["id"])
                self.assertEqual(img.mode, "RGBA")
                # Features are stamped sprites — something must be visible.
                self.assertIsNotNone(img.getbbox(), f["id"])

    def test_collision_polys_valid(self):
        saw_poly = False
        for f in self.catalog["features"]:
            for poly in f["collision"]:
                saw_poly = True
                self.assertGreaterEqual(len(poly), 3, f["id"])
                for p in poly:
                    self.assertGreaterEqual(p["x"], 0, f["id"])
                    self.assertGreaterEqual(p["y"], 0, f["id"])
                    self.assertLessEqual(p["x"], f["w"], f["id"])
                    self.assertLessEqual(p["y"], f["h"], f["id"])
        # Every generated feature is opaque enough to carry an outline.
        self.assertTrue(saw_poly)
        for f in self.catalog["features"]:
            self.assertGreaterEqual(len(f["collision"]), 1,
                                    f"{f['id']} has no collision poly")


if __name__ == "__main__":
    unittest.main()
