import * as THREE from "three";
import { attachEquipment, equipmentModel, equipmentMounts, itemMaterial, modelIdFor } from "./equipmentModels";
import { buildRig, getRig } from "./rigBuilder";

function check(ok: boolean, message: string) { if (!ok) throw new Error(message); }
const meshCount = (o: THREE.Object3D) => { let n = 0; o.traverse(c => { if ((c as THREE.Mesh).isMesh) n++; }); return n; };

// --- itemMaterial -------------------------------------------------------------
check(itemMaterial("bronze_axe") === "bronze", "tier parses from id prefix");
check(itemMaterial("starter-sword") === "starter", "hyphenated ids parse");
check(itemMaterial("potion") === "iron", "unknown tiers default to iron");

// --- modelIdFor — explicit model wins over slot/weaponType derivation -----------
check(modelIdFor({ slot: "weapon", weaponType: "axe" }) === "axe", "weapon slot derives the weaponType model");
check(modelIdFor({ slot: "weapon" }) === "sword", "unknown weaponType falls back to sword");
check(modelIdFor({ slot: "head" }) === "helmet", "armor slots derive their model");
check(modelIdFor({}) === "flask", "non-equipment defaults to flask");
check(modelIdFor({ slot: "head", model: "cape" }) === "cape", "explicit data.model overrides the slot");
check(modelIdFor({ slot: "head", model: "bogus" }) === "helmet", "invalid model ids fall back to the slot");
check(equipmentMounts({ slot: "head", model: "sword" })[0].bone === "head", "model override keeps the slot's bone");

// --- equipmentModel — one model per kind --------------------------------------
const slots = ["weapon", "head", "chest", "legs", "hands", "feet", "back", ""];
for (const slot of slots) {
  const model = equipmentModel({ slot, weaponType: "sword" });
  check(meshCount(model) > 0, `slot ${slot || "(none)"} must produce meshes`);
  const box = new THREE.Box3().setFromObject(model);
  check(Number.isFinite(box.min.y), `slot ${slot || "(none)"} model must have finite bounds`);
}
for (const weaponType of ["sword", "katana", "axe", "hammer", "dagger", "spear", "staff", "wand", "knuckles", "shield"])
  check(meshCount(equipmentModel({ slot: "weapon", weaponType })) > 0, `weaponType ${weaponType} must produce meshes`);

// --- equipmentMounts — slot → bone --------------------------------------------
const BONES: Record<string, string[]> = {
  weapon: ["armLoR"], head: ["head"], chest: ["root"],
  legs: ["legL", "legR"], hands: ["armLoL", "armLoR"], feet: ["legLoL", "legLoR"], back: ["root"],
};
for (const [slot, bones] of Object.entries(BONES)) {
  const mounts = equipmentMounts({ slot, weaponType: "axe" });
  check(mounts.map(m => m.bone).join() === bones.join(), `${slot} must mount on ${bones} (got ${mounts.map(m => m.bone)})`);
  check(mounts.every(m => meshCount(m.object) > 0), `${slot} mounts must carry geometry`);
}
check(equipmentMounts({ slot: "weapon", attachment: "head" })[0].bone === "head", "attachment field overrides the slot bone");
check(equipmentMounts({ slot: "weapon", attachment: "weapon" })[0].bone === "armLoR", "attachment equal to the slot keeps the default bone");

// --- attachEquipment on a live rig ----------------------------------------------
const rig = buildRig(getRig("humanoid"), { appearance: {} });
const mounts = equipmentMounts({ slot: "weapon", weaponType: "axe", material: "bronze" });
const armLoR = rig.bones.get("armLoR")!;
const before = armLoR.children.length;
const detach = attachEquipment(rig.bones, mounts);
check(armLoR.children.length === before + 1, "weapon must parent onto the fist bone");
const weapon = armLoR.children[armLoR.children.length - 1];
check(Math.abs(weapon.rotation.x - THREE.MathUtils.degToRad(-55)) < 1e-4, "held weapon must use the rig's −55° grip tilt");

// The held model must follow the bone — pose the arm and check world position.
rig.root.updateMatrixWorld(true);
const p1 = new THREE.Vector3(); weapon.getWorldPosition(p1);
armLoR.rotation.x += .5; rig.root.updateMatrixWorld(true);
const p2 = new THREE.Vector3(); weapon.getWorldPosition(p2);
check(p1.distanceTo(p2) > .01, "attached weapon must move with the bone");

detach();
check(armLoR.children.length === before, "detach must restore the bone");
check(attachEquipment(rig.bones, equipmentMounts({ slot: "weapon", attachment: "no_such_bone" })).constructor === Function, "missing bones must not throw");
rig.dispose();

console.log("equipment checks passed: tier parsing, models per slot/weapon type, bone mounts, grip tilt, bone-follow, detach");
