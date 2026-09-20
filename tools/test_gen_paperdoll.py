import unittest
import contextlib
import io
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from tools import gen_paperdoll as doll
from tools import paperdoll_layers as layers
from tools.preview_paperdoll import sample


class GeneratedRigTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(doll, "OUT_DIR", tmp), patch.object(doll, "PREVIEW", str(Path(tmp) / "preview.png")), contextlib.redirect_stdout(io.StringIO()):
                doll.main()
            cls.rig = json.loads((Path(tmp) / "paperdoll.json").read_text())

    def test_knee_flexes_on_forward_recovery_not_planted_stride(self):
        run = self.rig["animations"]["run"]["bones"]
        knee = run["legF_l"]["rotate"]
        self.assertGreater(sample(knee, .15, "value"), -10)
        self.assertLess(sample(knee, .45, "value"), -30)
        self.assertLess(sample(run["torso"]["rotate"], 0, "value"), 0)

    def test_appearance_layers_cover_existing_character_options(self):
        attachments = self.rig["skins"][0]["attachments"]
        self.assertEqual(set(attachments["skin_head"]), {f"skin_c{i}" for i in range(1, 10)})
        self.assertEqual(
            set(attachments["face_head"]),
            {f"face_ms{i}{s}" for i in range(1, 15)
             for s in ("", "_gob", "_imp", "_stone")})
        hair = {f"hair_{s}{i}_c{c}" for s, count in (("f", 9), ("m", 14))
                for i in range(1, count+1) for c in range(1, 11)}
        self.assertEqual(set(attachments["hair_top_head"]), hair)
        self.assertEqual(set(attachments["cloth_top_torso"]),
                         {f"cloth{i}_c{c}" for i in range(1, 18) for c in range(1, 9)})

    def test_creature_feature_slots_ride_their_bones(self):
        bones = {b["name"]: b.get("parent") for b in self.rig["bones"]}
        self.assertEqual(bones["wings"], "torso")
        self.assertEqual(bones["tail"], "torso")
        # Ears/horns ride dedicated head-child bones so shape keys size them.
        self.assertEqual(bones["ears"], "head")
        self.assertEqual(bones["horns"], "head")
        slots = {s["name"]: s["bone"] for s in self.rig["slots"]}
        self.assertEqual(slots["wings_wings"], "wings")
        self.assertEqual(slots["tail_tail"], "tail")
        self.assertEqual(slots["ears_ears"], "ears")
        self.assertEqual(slots["horns_horns"], "horns")
        attachments = self.rig["skins"][0]["attachments"]
        for style in ("point", "long"):
            self.assertEqual(set(attachments["ears_ears"]) & {f"ears_{style}_c{i}" for i in range(1, 10)},
                             {f"ears_{style}_c{i}" for i in range(1, 10)})
        self.assertIn("wings_bat", attachments["wings_wings"])
        self.assertIn("wings_stone", attachments["wings_wings"])
        self.assertIn("horns_imp", attachments["horns_horns"])
        self.assertIn(f"tail_spade_c9", attachments["tail_tail"])
        self.assertIn("weapon6", attachments["weapon_top_weapon"])

    def test_main_and_sub_weapon_slots_carry_the_full_arsenal(self):
        slots = {s["name"]: s["bone"] for s in self.rig["slots"]}
        self.assertEqual(slots["weapon_top_weapon"], "weapon")
        self.assertEqual(slots["weapon_bot_weaponB"], "weaponB")
        attachments = self.rig["skins"][0]["attachments"]
        gripped = {f"weapon{i}" for i in (1, 2, 3, 4, 6)} | {f"weapon5_c{i}" for i in range(1, 5)}
        shields = {f"weapon7_c{i}" for i in range(1, 5)}
        self.assertEqual(set(attachments["weapon_top_weapon"]), gripped)
        self.assertEqual(set(attachments["weapon_bot_weaponB"]), gripped)
        # Shields cover the torso — their own layer above the body so a
        # raised shield reads as protecting the wearer. On the near hand a
        # shield overlaps everything, including its own fist.
        self.assertEqual(set(attachments["weapon_over_weaponB"]), shields)
        self.assertEqual(slots["weapon_front_weapon"], "weapon")
        self.assertEqual(set(attachments["weapon_front_weapon"]), shields)
        names = [s["name"] for s in self.rig["slots"]]
        # The sub weapon tucks under the far fist, itself behind the torso;
        # the main weapon tucks under the near fist in front of the body.
        self.assertLess(names.index("weapon_bot_weaponB"), names.index("skin_armB_l"))
        self.assertLess(names.index("cloth_top_torso"), names.index("weapon_over_weaponB"))
        # The near arm still paints over a raised far-hand shield.
        self.assertLess(names.index("weapon_over_weaponB"), names.index("skin_armF_u"))
        # The near leg tucks under the torso — tunics cover the thigh top.
        self.assertLess(names.index("skin_legF_u"), names.index("skin_torso"))
        self.assertLess(names.index("weapon_top_weapon"), names.index("skin_armF_l"))
        self.assertEqual(names[-1], "weapon_front_weapon")
        # Weapon mounts pivot mid-fist — below the wrist joint, on the hand.
        bones = {b["name"]: b for b in self.rig["bones"]}
        for side, hand in (("F", doll.HAND_F), ("B", doll.HAND_B)):
            wb = "weapon" if side == "F" else "weaponB"
            wx = sum(bones[n].get("x", 0) for n in ("hips", "torso", f"arm{side}_u", f"arm{side}_l", wb))
            wy = sum(bones[n].get("y", 0) for n in ("hips", "torso", f"arm{side}_u", f"arm{side}_l", wb))
            self.assertEqual((round(wx, 2), round(wy, 2)), doll.S(*hand))

    def test_guard_overlay_keys_only_the_shield_arm(self):
        # The guard anims are partial animations — each keys only its arm
        # chain so a higher Spine track pins the shield out from the body
        # while the base animation drives everything else.
        guard = self.rig["animations"]["guardB"]["bones"]
        self.assertEqual(set(guard), {"armB_u", "armB_l", "weaponB"})
        # Forearm swung out from the torso (+x on the downward-pointing
        # bones) while weaponB unwinds the arm rotation to ~0° total so the
        # shield's tapered point stays down for the whole loop.
        self.assertGreater(
            min(k["value"] for k in guard["armB_l"]["rotate"]), 45)
        self.assertLess(
            max(k["value"] for k in guard["weaponB"]["rotate"]), -50)
        # The near-hand guard mirrors it onto the armF/weapon chain.
        guard_f = self.rig["animations"]["guardF"]["bones"]
        self.assertEqual(set(guard_f), {"armF_u", "armF_l", "weapon"})
        self.assertGreater(
            min(k["value"] for k in guard_f["armF_l"]["rotate"]), 45)
        self.assertLess(
            max(k["value"] for k in guard_f["weapon"]["rotate"]), -50)

    def test_attack_variants_swing_opposite_hands(self):
        # "attack" swings the near arm; "attackB" mirrors it onto the far
        # arm for when the main hand carries a shield instead.
        atk = self.rig["animations"]["attack"]["bones"]
        atk_b = self.rig["animations"]["attackB"]["bones"]
        self.assertEqual(atk_b["armB_u"], atk["armF_u"])
        self.assertEqual(atk_b["armB_l"], atk["armF_l"])
        self.assertEqual(atk_b["weaponB"], atk["weapon"])
        self.assertEqual(atk_b["armF_u"], atk["armB_u"])
        self.assertEqual(atk_b["weapon"], atk["weaponB"])
        for shared in ("torso", "head"):
            self.assertEqual(atk_b[shared], atk[shared])

    def test_shape_keys_only_reference_rig_bones(self):
        bones = {b["name"] for b in self.rig["bones"]}
        for key in doll.SHAPE_KEYS:
            with self.subTest(key=key["name"]):
                for b in key["bones"]:
                    self.assertIn(b, bones)
                for b in key.get("translate", {}):
                    self.assertIn(b, bones)
        # Height is a waist-depth morph: hips scale on Y lifts the torso
        # offset while the leg attach points sit on the hip line, so feet
        # never move. Torso/legs are shape-neutral so no art stretches.
        height = next(k for k in doll.SHAPE_KEYS if k["name"] == "height")
        self.assertEqual(height["bones"], {"hips": "y"})
        self.assertNotIn("translate", height)
        for n in ("torso", "legF_u", "legB_u"):
            self.assertIn(n, doll.SHAPE_NEUTRAL)
        parents = {b["name"]: b.get("parent") for b in self.rig["bones"]}
        self.assertEqual(parents["hips"], "root")
        for n in ("torso", "legF_u", "legB_u"):
            self.assertEqual(parents[n], "hips")
        # Shape-neutral bones exist and host the per-hand weapon size keys.
        self.assertTrue(set(doll.SHAPE_NEUTRAL) <= bones)
        wsize = {k["name"]: k["bones"] for k in doll.SHAPE_KEYS
                 if k["name"] in ("weaponSize", "subWeaponSize")}
        self.assertEqual(wsize, {"weaponSize": {"weapon": "xy"},
                                 "subWeaponSize": {"weaponB": "xy"}})

    def test_base_skin_has_no_hair_face_or_equipment(self):
        base = next(s for s in self.rig["skins"] if s["name"] == "base")
        self.assertEqual(set(base["attachments"]), {f"skin_{part}" for part in doll.SLOT_ORDER})

    def test_reference_style_attachment_families_are_available(self):
        # The assets/spine-character rig composes humanoids from broad body,
        # cloak, head and hand object plates. Our humanoid rig keeps the
        # existing animation bones but exposes equivalent modular families so
        # outfits can be built as coherent silhouettes instead of only many
        # tiny limb decals.
        slots = {s["name"]: s["bone"] for s in self.rig["slots"]}
        self.assertEqual(slots["cloak_object_torso"], "torso")
        self.assertEqual(slots["body_object_torso"], "torso")
        self.assertEqual(slots["head_object_head"], "head")
        self.assertEqual(slots["hand_object_weapon"], "weapon")
        self.assertEqual(slots["hand_object_weaponB"], "weaponB")

        attachments = self.rig["skins"][0]["attachments"]
        self.assertEqual(
            set(attachments["body_object_torso"]),
            {f"bodyObject_{i}_c{c}" for i in range(1, 6) for c in range(1, 9)},
        )
        self.assertEqual(
            set(attachments["cloak_object_torso"]),
            {f"cloakObject_{i}_c{c}" for i in range(1, 5) for c in range(1, 9)},
        )
        self.assertEqual(
            set(attachments["head_object_head"]),
            {f"headObject_{i}_c{c}" for i in range(1, 6) for c in range(1, 9)},
        )
        self.assertEqual(
            set(attachments["hand_object_weapon"]),
            {f"handObject_{i}_c{c}" for i in range(1, 6) for c in range(1, 9)},
        )
        self.assertEqual(
            set(attachments["hand_object_weaponB"]),
            {f"handObject_{i}_c{c}" for i in range(1, 6) for c in range(1, 9)},
        )

        names = [s["name"] for s in self.rig["slots"]]
        self.assertLess(names.index("cloak_object_torso"), names.index("skin_torso"))
        self.assertGreater(names.index("body_object_torso"), names.index("cloth_top_torso"))
        self.assertGreater(names.index("head_object_head"), names.index("hair_top_head"))
        self.assertGreater(names.index("hand_object_weapon"), names.index("skin_armF_l"))


class JointAlignmentTest(unittest.TestCase):
    def test_heel_and_forefoot_share_a_level_sole(self):
        for side, ankle in (("B", doll.ANK_B), ("F", doll.ANK_F)):
            with self.subTest(side=side):
                img = doll.new_part()
                doll.PARTS[f"leg{side}_l"](img)
                alpha = img.getchannel("A")
                sole = round((ankle[1] + 1.5) * doll.DS)
                self.assertEqual(alpha.getbbox()[3] - 1, sole)
                for x in (ankle[0] - 1, ankle[0] + 2):
                    column = alpha.crop((round(x * doll.DS), 0, round(x * doll.DS) + 1, img.height))
                    self.assertEqual(column.getbbox()[3] - 1, sole)

    def test_drawn_joint_caps_are_centered_on_spine_pivots(self):
        for name, draw in doll.PARTS.items():
            if not name.startswith(("arm", "leg")):
                continue
            with self.subTest(part=name):
                circles = []
                ellipse = doll.SDraw.ellipse

                def record(d, box, **kwargs):
                    if abs((box[2] - box[0]) - (box[3] - box[1])) < 1e-6:
                        circles.append(box)
                    return ellipse(d, box, **kwargs)

                with patch.object(doll.SDraw, "ellipse", record):
                    draw(doll.new_part())
                self.assertGreaterEqual(len(circles), 1)
                # capsule() draws its joint-covering child cap last.
                x0, y0, x1, y1 = circles[-1]
                pivot = doll.S((x0 + x1) / 2, (y0 + y1) / 2)
                self.assertEqual(pivot, doll._BONES_WORLD[name])

    def test_limb_art_does_not_extend_above_its_joint_radius(self):
        for name, draw in doll.PARTS.items():
            if not name.startswith(("arm", "leg")):
                continue
            with self.subTest(part=name):
                img = doll.new_part()
                draw(img)
                pivot_y = doll.FOOT_Y - doll._BONES_WORLD[name][1]
                # Thigh outline radius is 3; other limbs have a 2.6 cap.
                radius = 3 if name.startswith("leg") and name.endswith("_u") else 2.6
                self.assertGreaterEqual(img.getbbox()[1], int((pivot_y - radius) * doll.DS))

    def test_shape_primitives_do_not_bake_silhouette_outlines(self):
        image = doll.new_part()
        draw = doll.SDraw(image)
        draw.polygon([(10, 10), (18, 10), (18, 18), (10, 18)],
                     fill=doll.SKIN, outline=doll.OUTLINE)
        self.assertNotIn(doll.OUTLINE, set(image.getdata()))

    def test_capsules_leave_the_outer_contour_to_the_renderer(self):
        image = doll.new_part()
        draw = doll.SDraw(image)
        doll.capsule(draw, (10, 10), (10, 20), 3, doll.SKIN, doll.OUTLINE)
        self.assertNotIn(doll.OUTLINE, set(image.getdata()))


class PhaserOutlineContractTest(unittest.TestCase):
    def test_character_container_owns_one_internal_outline_filter(self):
        source = (Path(__file__).parents[1] / "wails" / "frontend" / "src" /
                  "phaser" / "CharacterSprite.ts").read_text()
        self.assertIn("this.container.enableFilters()", source)
        self.assertIn("filters?.internal.addGlow", source)


class AppearanceReadabilityTest(unittest.TestCase):
    def test_every_foreground_hairstyle_leaves_leading_eye_visible(self):
        # The leading eye is the right-hand eye in the authored right-facing
        # pose. Hair may frame it, but must not paint over its face pixels.
        face = layers.ms_face(doll, "ms1")
        x0, y0, x1, y1 = (44 * doll.DS, 10 * doll.DS,
                          46 * doll.DS, 13.5 * doll.DS)
        eye_pixels = {
            (x, y) for y in range(round(y0), round(y1))
            for x in range(round(x0), round(x1))
            if face.getpixel((x, y))[3]
        }
        self.assertTrue(eye_pixels)
        for prefix, count in (("f", 9), ("m", 14)):
            for i in range(1, count + 1):
                with self.subTest(style=f"{prefix}{i}"):
                    hair = layers.hair(
                        doll, f"{prefix}{i}", layers.HAIR_COLORS[0], False)
                    covered = {
                        p for p in eye_pixels if hair.getpixel(p)[3]
                    }
                    self.assertEqual(covered, set())


if __name__ == "__main__":
    unittest.main()
