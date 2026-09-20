"""Quaddoll rig sanity — run tools/gen_quadruped.py first."""

import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "wails/frontend/public/assets/spine")


class QuadrupedRigTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(ASSETS, "quaddoll.json")) as f:
            cls.rig = json.load(f)
        with open(os.path.join(ROOT, "tools/quaddoll.spec.json")) as f:
            cls.spec = json.load(f)

    def test_skeleton_shape(self):
        bones = {b["name"]: b.get("parent") for b in self.rig["bones"]}
        # Four two-segment legs on chest/haunch anchors + spine/head/tail.
        for side in ("FF", "FB"):
            self.assertEqual(bones[f"leg{side}_u"], "chest")
            self.assertEqual(bones[f"leg{side}_l"], f"leg{side}_u")
        for side in ("HF", "HB"):
            self.assertEqual(bones[f"leg{side}_u"], "haunch")
            self.assertEqual(bones[f"leg{side}_l"], f"leg{side}_u")
        self.assertEqual(bones["chest"], "body")
        self.assertEqual(bones["haunch"], "body")
        self.assertEqual(bones["body"], "root")
        self.assertEqual(bones["neck"], "body")
        self.assertEqual(bones["head"], "neck")
        self.assertEqual(bones["tail_l"], "tail_u")

    def test_slots_and_variants(self):
        slots = {s["name"]: s["bone"] for s in self.rig["slots"]}
        self.assertEqual(len(slots), 14)
        attachments = self.rig["skins"][0]["attachments"]
        # Every skin slot carries all four fur palettes; face matches.
        for slot, bone in slots.items():
            layer = slot.rsplit("_" + bone, 1)[0]
            if layer == "skin":
                self.assertEqual(
                    set(attachments[slot]),
                    {f"skin_c{i}" for i in (11, 12, 13, 14)})
            elif layer == "face":
                self.assertEqual(
                    set(attachments[slot]),
                    {f"face_c{i}" for i in (11, 12, 13, 14)})

    def test_animations_and_shape_keys(self):
        anims = self.rig["animations"]
        for name in ("idle", "run", "attack"):
            self.assertIn(name, anims)
        # The gallop keys all four legs.
        for side in ("FF", "FB", "HF", "HB"):
            self.assertIn(f"leg{side}_u", anims["run"]["bones"])
        bones = {b["name"] for b in self.rig["bones"]}
        for key in self.spec["shapeKeys"]:
            for b in key["bones"]:
                self.assertIn(b, bones)
            for b in key.get("translate", {}):
                self.assertIn(b, bones)

    def test_height_lifts_body_by_the_leg_chain(self):
        # Height scales all four leg chains on Y and lifts `body` by the
        # pivot-to-sole distance so the animal stands taller with paws
        # planted — the quadruped analogue of the humanoid hips morph.
        keys = {k["name"]: k for k in self.spec["shapeKeys"]}
        world = {b["name"]: (b["x"], b["y"]) for b in self.spec["bones"]}
        key = keys["height"]
        legs = tuple(f"leg{s}_{p}" for s in ("FF", "FB", "HF", "HB")
                     for p in ("u", "l"))
        self.assertEqual(set(key["bones"]), set(legs))
        self.assertTrue(all(a == "y" for a in key["bones"].values()))
        self.assertAlmostEqual(key["translate"]["body"]["y"],
                               world["legFF_u"][1])

    def test_preset_spec_shares_assets(self):
        with open(os.path.join(ROOT, "tools/quaddoll_dire_wolf.spec.json")) as f:
            pspec = json.load(f)
        self.assertEqual(pspec["output"]["name"], "quaddoll")
        self.assertEqual(pspec["preset"]["skin"], "c11")


if __name__ == "__main__":
    unittest.main()
