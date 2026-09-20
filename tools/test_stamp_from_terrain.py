"""stamp_from_terrain — gid classification, coverage, determinism, towns."""

import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from tools import stamp_from_terrain as st


def write_map(path, cols, rows, ground, regions=()):
    doc = {
        "cols": cols,
        "rows": rows,
        "tile_size": st.TILE,
        "terrain": {"ground": list(ground)},
        "regions": list(regions),
    }
    with open(path, "w") as f:
        json.dump(doc, f)


class ClassifyTest(unittest.TestCase):
    def test_core_gids(self):
        self.assertEqual(st.classify(2623), "water")   # Water_pipo fill
        self.assertEqual(st.classify(577), "grass")    # BaseChip grass
        self.assertEqual(st.classify(582), "sand")     # dirt path
        self.assertEqual(st.classify(693), "rock")     # cobble plaza
        self.assertEqual(st.classify(833), "rock")     # stone wall (crags)
        self.assertEqual(st.classify(6000), "snow")
        self.assertEqual(st.classify(6004), "sand")    # beach
        self.assertEqual(st.classify(6005), "rock")    # scree
        self.assertEqual(st.classify(6007), "grass")   # peat
        self.assertIsNone(st.classify(585))            # BaseChip tree top
        self.assertIsNone(st.classify(617))            # BaseChip bush
        self.assertIsNone(st.classify(6008))           # mundi pine
        self.assertIsNone(st.classify(0))


class StampMapTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.map_path = os.path.join(cls.tmp.name, "testmap.map.json")
        # 64x32 tiles: left half water, right half grass; a town region in
        # the grass half.
        ground = [2623] * (32 * 32) + [577] * (32 * 32)
        # Rebuild row-major: left half of each row is water.
        ground = [
            2623 if c < 32 else 577
            for r in range(32) for c in range(64)
        ]
        write_map(
            cls.map_path, 64, 32, ground,
            regions=[{
                "id": "test_town", "kind": "town",
                "minC": 40, "minR": 8, "maxC": 55, "maxR": 20,
            }],
        )
        cls.out = os.path.join(cls.tmp.name, "out.stamps.json")
        cls.doc = st.stamp_map(cls.map_path, cls.out, mirror=True, verbose=False)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_categories_cover_both_sides(self):
        water = [s for s in self.doc["stamps"] if s["feature"].startswith("water_")]
        grass = [s for s in self.doc["stamps"] if s["feature"].startswith("land_grass_")]
        self.assertTrue(water and grass)
        # Water stamps sit on the water half, grass on the grass half.
        for s in water:
            self.assertLess(s["x"], 40 * st.TILE)
        for s in grass:
            self.assertGreater(s["x"], 24 * st.TILE)

    def test_buildings_inside_town(self):
        bd = [s for s in self.doc["stamps"] if s["feature"].startswith("building_")]
        self.assertGreaterEqual(len(bd), 2)
        for s in bd:
            self.assertTrue(40 * 32 <= s["x"] <= 56 * 32, s)
            self.assertTrue(8 * 32 <= s["y"] <= 21 * 32, s)

    def test_stamp_schema(self):
        for s in self.doc["stamps"]:
            self.assertEqual(
                set(s), {"feature", "x", "y", "rotation", "scale", "flipX"})

    def test_deterministic(self):
        doc2 = st.stamp_map(self.map_path, self.out, mirror=False, verbose=False)
        self.assertEqual(self.doc, doc2)

    def test_writes_out_and_mirror(self):
        self.assertTrue(os.path.exists(self.out))
        mirror = os.path.join(st.PUBLIC_MAPS, "out.stamps.json")
        self.assertTrue(os.path.exists(mirror))
        os.remove(mirror)

    def test_all_prop_region_does_not_crash(self):
        # A pocket of tree/prop cells — unclassified votes are skipped.
        path = os.path.join(self.tmp.name, "props.map.json")
        ground = [577] * (16 * 16)
        for r in range(4, 12):
            for c in range(4, 12):
                ground[r * 16 + c] = 585  # tree top — transparent vote
        write_map(path, 16, 16, ground)
        doc = st.stamp_map(path, None, mirror=False, verbose=False)
        self.assertTrue(doc["stamps"])


if __name__ == "__main__":
    unittest.main()
