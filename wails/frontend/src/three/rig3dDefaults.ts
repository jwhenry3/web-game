// Compiled-in rigs — the procedural low-poly bodies the world shipped with,
// expressed as Rig3DDocs so the Scene editor can edit them and files under
// public/assets/rigs3d/ can override them. Keep ids stable: actors.ts maps
// entity kinds onto them.

import type { Rig3DDoc, RigBone, RigColor, RigColorRole, RigGeometry, RigPart, Vec3 } from "./rig3d";

const fixed = (hex: string): RigColor => ({ fixed: hex });
const role = (r: RigColorRole, shade?: number): RigColor => ({ role: r, ...(shade !== undefined ? { shade } : {}) });
const bone = (name: string, parent: string | null, position: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0]): RigBone => ({ name, parent, position, rotation });

let seq = 0;
function part(name: string, boneName: string, geometry: RigGeometry, color: RigColor, position: Vec3 = [0, 0, 0], extra: Partial<RigPart> = {}): RigPart {
  return { id: `${boneName}_${name}_${seq++}`, name, bone: boneName, geometry, color, position, rotation: [0, 0, 0], scale: [1, 1, 1], ...extra };
}
const box = (w: number, h: number, d: number): RigGeometry => ({ type: "box", params: [w, h, d] });
const sphere = (r: number): RigGeometry => ({ type: "sphere", params: [r] });
const capsule = (r: number, len: number): RigGeometry => ({ type: "capsule", params: [r, len] });
const cylinder = (rt: number, rb: number, h: number): RigGeometry => ({ type: "cylinder", params: [rt, rb, h] });
const cone = (r: number, h: number, segments = 6): RigGeometry => ({ type: "cone", params: [r, h, segments] });
const ico = (r: number, detail = 1): RigGeometry => ({ type: "icosahedron", params: [r, detail] });

// --- hand-held weapon props ----------------------------------------------------
// Weapons are separate parts parented to the forearm bone (armLo*) so the hilt
// sits in the fist and the prop swings with the arm. They carry tilted ~55°
// down-forward from vertical. `when` keys on the appearance weapon/subWeapon
// fields (Heroes 99 ids): weapon1 sword, weapon2 axe/mace/hammer, weapon3
// dagger, weapon4 spear, weapon5 staff/wand, weapon6 pitchfork; weapon7 is
// the off-hand shield. "" = unarmed → nothing renders.
const GRIP_AXIS: Vec3 = [0, -.5736, .8192]; // −55° about x from straight down
const GRIP_TILT: Vec3 = [-55, 0, 0];
/** Cone tips point local +y — 125° puts the apex along GRIP_AXIS. */
const TIP_TILT: Vec3 = [125, 0, 0];
const grip = (anchor: Vec3, d: number): Vec3 => [anchor[0] + GRIP_AXIS[0] * d, anchor[1] + GRIP_AXIS[1] * d, anchor[2] + GRIP_AXIS[2] * d];
const gripX = (anchor: Vec3, d: number, dx: number): Vec3 => { const p = grip(anchor, d); return [p[0] + dx, p[1], p[2]]; };

/** Main-hand weapon props — one family per H99 weapon id. `anchor` is the
 * fist position in the bone's local space. */
function weaponParts(bone: string, anchor: Vec3): RigPart[] {
  const w = (weapon: string): Partial<RigPart> => ({ when: { weapon } });
  return [
    // weapon1 — sword / katana
    part("wHilt", bone, cylinder(.02, .024, .13), fixed("#5a4632"), grip(anchor, .02), { rotation: GRIP_TILT, ...w("weapon1") }),
    part("wGuard", bone, box(.13, .028, .04), fixed("#8a7a4d"), grip(anchor, .1), { rotation: GRIP_TILT, ...w("weapon1") }),
    part("wBlade", bone, box(.045, .38, .012), role("weapon"), grip(anchor, .33), { rotation: GRIP_TILT, ...w("weapon1") }),
    // weapon2 — axe / mace / hammer
    part("wHaft", bone, cylinder(.02, .024, .34), fixed("#6b5233"), grip(anchor, .12), { rotation: GRIP_TILT, ...w("weapon2") }),
    part("wHead", bone, box(.17, .09, .035), role("weapon"), grip(anchor, .27), { rotation: GRIP_TILT, ...w("weapon2") }),
    // weapon3 — dagger
    part("wHilt", bone, cylinder(.018, .022, .08), fixed("#5a4632"), grip(anchor, .01), { rotation: GRIP_TILT, ...w("weapon3") }),
    part("wBlade", bone, box(.035, .19, .01), role("weapon"), grip(anchor, .16), { rotation: GRIP_TILT, ...w("weapon3") }),
    // weapon4 — spear
    part("wShaft", bone, cylinder(.016, .02, .74), fixed("#6b5233"), grip(anchor, .27), { rotation: GRIP_TILT, ...w("weapon4") }),
    part("wTip", bone, cone(.04, .16), role("weapon"), grip(anchor, .66), { rotation: TIP_TILT, ...w("weapon4") }),
    // weapon5 — staff / wand
    part("wShaft", bone, cylinder(.02, .026, .56), fixed("#6b5233"), grip(anchor, .2), { rotation: GRIP_TILT, ...w("weapon5") }),
    part("wCollar", bone, cylinder(.032, .032, .05), fixed("#8a7a4d"), grip(anchor, .45), { rotation: GRIP_TILT, ...w("weapon5") }),
    part("wOrb", bone, sphere(.055), role("accent"), grip(anchor, .52), { ...w("weapon5"), emissive: .5 }),
    // weapon6 — pitchfork (imps)
    part("wShaft", bone, cylinder(.018, .022, .6), fixed("#6b5233"), grip(anchor, .22), { rotation: GRIP_TILT, ...w("weapon6") }),
    part("wBar", bone, box(.12, .02, .02), role("weapon"), grip(anchor, .5), { rotation: GRIP_TILT, ...w("weapon6") }),
    part("wTineL", bone, cone(.016, .16), role("weapon"), gripX(anchor, .6, -.035), { rotation: TIP_TILT, ...w("weapon6") }),
    part("wTineM", bone, cone(.016, .16), role("weapon"), grip(anchor, .6), { rotation: TIP_TILT, ...w("weapon6") }),
    part("wTineR", bone, cone(.016, .16), role("weapon"), gripX(anchor, .6, .035), { rotation: TIP_TILT, ...w("weapon6") }),
  ];
}

/** Off-hand shield (weapon7) strapped to the outer forearm. */
function shieldParts(bone: string): RigPart[] {
  const w: Partial<RigPart> = { when: { subWeapon: "weapon7" } };
  return [
    part("wShield", bone, box(.05, .36, .32), fixed("#8a7a5a"), [-.1, -.15, 0], w),
    part("wBoss", bone, sphere(.05), role("weapon"), [-.14, -.15, 0], w),
  ];
}

/** Player doll — limbs [legL, armL, legR, armR] with knee/elbow joints
 * (legLoL/armLoL/legLoR/armLoR) that flex during the walk; creature
 * features render by appearance. */
function humanoid(): Rig3DDoc {
  seq = 0;
  const bones = [
    bone("root", null),
    bone("head", "root", [0, 1.38, 0]),
    bone("legL", "root", [-.14, .57, 0]),
    bone("legLoL", "legL", [0, -.4, 0]),
    bone("armL", "root", [-.3, 1.06, 0]),
    bone("armLoL", "armL", [0, -.3, 0]),
    bone("legR", "root", [.14, .57, 0]),
    bone("legLoR", "legR", [0, -.4, 0]),
    bone("armR", "root", [.3, 1.06, 0]),
    bone("armLoR", "armR", [0, -.3, 0]),
  ];
  const parts: RigPart[] = [
    part("torso", "root", capsule(.23, .35), role("cloth"), [0, .82, 0]),
    part("head", "head", sphere(.23), role("skin")),
    part("hair", "head", sphere(.25), role("hair"), [0, .11, -.025], { scale: [1, .65, 1], when: { hair: "*" } }),
    part("headband", "head", box(.32, .035, .025), fixed("#d7b874"), [0, .05, .22]),
    part("eyeL", "head", box(.035, .035, .035), role("eye"), [-.085, -.01, .218]),
    part("eyeR", "head", box(.035, .035, .035), role("eye"), [.085, -.01, .218]),
    part("cape", "root", cone(.35, .75, 4), fixed("#365460"), [0, .77, -.16], { rotation: [0, 45, 0] }),
    // Creature features (paperdoll parity) — only for appearances that set them.
    part("earL", "head", cone(.06, .22, 4), role("skin"), [-.24, .08, 0], { rotation: [0, 0, 72], when: { ears: "point" } }),
    part("earR", "head", cone(.06, .22, 4), role("skin"), [.24, .08, 0], { rotation: [0, 0, -72], when: { ears: "point" } }),
    part("longEarL", "head", cone(.06, .34, 4), role("skin"), [-.26, .1, 0], { rotation: [0, 0, 72], when: { ears: "long" } }),
    part("longEarR", "head", cone(.06, .34, 4), role("skin"), [.26, .1, 0], { rotation: [0, 0, -72], when: { ears: "long" } }),
    part("hornL", "head", cone(.045, .18, 4), fixed("#d8cfc0"), [-.11, .2, 0], { rotation: [0, 0, 29], when: { horns: "*" } }),
    part("hornR", "head", cone(.045, .18, 4), fixed("#d8cfc0"), [.11, .2, 0], { rotation: [0, 0, -29], when: { horns: "*" } }),
    part("batWingL", "root", cone(.17, .52, 3), fixed("#7a3f3a"), [-.3, 1.05, -.2], { rotation: [26, 0, -97], scale: [1, 1, .3], when: { wings: "bat" } }),
    part("batWingR", "root", cone(.17, .52, 3), fixed("#7a3f3a"), [.3, 1.05, -.2], { rotation: [26, 0, 97], scale: [1, 1, .3], when: { wings: "bat" } }),
    part("stoneWingL", "root", cone(.17, .52, 3), fixed("#55555f"), [-.3, 1.05, -.2], { rotation: [26, 0, -97], scale: [1, 1, .3], when: { wings: "stone" } }),
    part("stoneWingR", "root", cone(.17, .52, 3), fixed("#55555f"), [.3, 1.05, -.2], { rotation: [26, 0, 97], scale: [1, 1, .3], when: { wings: "stone" } }),
    part("tail", "root", cone(.05, .42, 4), role("skin"), [0, .68, -.3], { rotation: [-120, 0, 0], when: { tail: "*" } }),
    part("tailTip", "root", cone(.09, .15, 4), role("skin"), [0, .5, -.44], { rotation: [40, 0, 0], when: { tail: "*" } }),
  ];
  for (const side of ["L", "R"] as const) {
    parts.push(
      part("thigh", `leg${side}`, cylinder(.08, .09, .42), fixed("#4b4543"), [0, -.18, 0]),
      part("shin", `legLo${side}`, cylinder(.065, .075, .14), fixed("#4b4543"), [0, -.06, 0]),
      part("boot", `legLo${side}`, box(.18, .15, .29), fixed("#3e3834"), [0, -.05, .035]),
      part("sleeve", `arm${side}`, capsule(.085, .29), role("cloth"), [0, -.15, 0]),
      part("forearm", `armLo${side}`, capsule(.055, .14), role("skin"), [0, -.09, 0]),
      part("hand", `armLo${side}`, sphere(.085), role("skin"), [0, -.2, 0]),
      part("shoulder", `arm${side}`, sphere(.135), role("accent")),
    );
  }
  parts.push(...weaponParts("armLoR", [0, -.2, 0]), ...shieldParts("armLoL"));
  return {
    version: 1, id: "humanoid", label: "Humanoid", scale: 1, seat: .55, height: 1.85, bones, parts,
    limbs: [
      { bone: "legL", phase: 0 }, { bone: "armL", phase: 1 }, { bone: "legR", phase: 1 }, { bone: "armR", phase: 0 },
      // Knees trail backward while the leg steps forward; elbows flex
      // forward on the arm's forward pump.
      { bone: "legLoL", phase: 0, amplitude: 0, flex: 55 },
      { bone: "legLoR", phase: 1, amplitude: 0, flex: 55 },
      { bone: "armLoL", phase: 1, amplitude: 0, flex: 30, flexSign: -1 },
      { bone: "armLoR", phase: 0, amplitude: 0, flex: 30, flexSign: -1 },
    ],
    ridePose: { legL: [-60, 0, 0], legR: [-60, 0, 0], armL: [-20, 0, 0], armR: [-20, 0, 0], legLoL: [55, 0, 0], legLoR: [55, 0, 0], armLoL: [-25, 0, 0], armLoR: [-25, 0, 0] },
  };
}

/** Small bipedal creature (goblin / imp / stone imp) — same appearance-driven features as the doll. */
function biped(): Rig3DDoc {
  seq = 0;
  const bones = [
    bone("root", null),
    bone("head", "root", [0, 1.32, 0]),
    bone("legL", "root", [-.13, .55, 0]),
    bone("legLoL", "legL", [0, -.36, 0]),
    bone("armL", "root", [-.27, 1.02, 0]),
    bone("armLoL", "armL", [0, -.28, 0]),
    bone("legR", "root", [.13, .55, 0]),
    bone("legLoR", "legR", [0, -.36, 0]),
    bone("armR", "root", [.27, 1.02, 0]),
    bone("armLoR", "armR", [0, -.28, 0]),
  ];
  const parts: RigPart[] = [
    part("torso", "root", capsule(.21, .3), role("cloth"), [0, .78, 0]),
    part("head", "head", sphere(.24), role("skin")),
    part("eyeL", "head", box(.05, .045, .02), role("eye"), [-.09, .01, .21]),
    part("eyeR", "head", box(.05, .045, .02), role("eye"), [.09, .01, .21]),
    part("earL", "head", cone(.06, .22, 4), role("skin"), [-.24, .08, 0], { rotation: [0, 0, 72], when: { ears: "point" } }),
    part("earR", "head", cone(.06, .22, 4), role("skin"), [.24, .08, 0], { rotation: [0, 0, -72], when: { ears: "point" } }),
    part("longEarL", "head", cone(.06, .34, 4), role("skin"), [-.24, .08, 0], { rotation: [0, 0, 72], when: { ears: "long" } }),
    part("longEarR", "head", cone(.06, .34, 4), role("skin"), [.24, .08, 0], { rotation: [0, 0, -72], when: { ears: "long" } }),
    part("hornL", "head", cone(.045, .18, 4), fixed("#d8cfc0"), [-.11, .2, 0], { rotation: [0, 0, 29], when: { horns: "*", wings: "bat" } }),
    part("hornR", "head", cone(.045, .18, 4), fixed("#d8cfc0"), [.11, .2, 0], { rotation: [0, 0, -29], when: { horns: "*", wings: "bat" } }),
    part("stoneHornL", "head", cone(.045, .18, 4), fixed("#9a9aae"), [-.11, .2, 0], { rotation: [0, 0, 29], when: { horns: "*", wings: "stone" } }),
    part("stoneHornR", "head", cone(.045, .18, 4), fixed("#9a9aae"), [.11, .2, 0], { rotation: [0, 0, -29], when: { horns: "*", wings: "stone" } }),
    part("batWingL", "root", cone(.17, .52, 3), fixed("#7a3f3a"), [-.3, 1.05, -.2], { rotation: [26, 0, -97], scale: [1, 1, .3], when: { wings: "bat" } }),
    part("batWingR", "root", cone(.17, .52, 3), fixed("#7a3f3a"), [.3, 1.05, -.2], { rotation: [26, 0, 97], scale: [1, 1, .3], when: { wings: "bat" } }),
    part("stoneWingL", "root", cone(.17, .52, 3), fixed("#55555f"), [-.3, 1.05, -.2], { rotation: [26, 0, -97], scale: [1, 1, .3], when: { wings: "stone" } }),
    part("stoneWingR", "root", cone(.17, .52, 3), fixed("#55555f"), [.3, 1.05, -.2], { rotation: [26, 0, 97], scale: [1, 1, .3], when: { wings: "stone" } }),
    part("rockL", "root", ico(.11, 0), role("cloth"), [-.3, 1.12, 0], { when: { wings: "stone" } }),
    part("rockR", "root", ico(.11, 0), role("cloth"), [.3, 1.12, 0], { when: { wings: "stone" } }),
    part("tail", "root", cone(.05, .42, 4), role("skin"), [0, .68, -.3], { rotation: [-120, 0, 0], when: { tail: "*" } }),
    part("tailTip", "root", cone(.09, .15, 4), role("skin"), [0, .5, -.44], { rotation: [40, 0, 0], when: { tail: "*" } }),
    part("tailTip", "root", cone(.09, .15, 4), role("skin"), [0, .5, -.44], { rotation: [40, 0, 0], when: { tail: "*" } }),
  ];
  for (const side of ["L", "R"] as const) {
    parts.push(
      part("thigh", `leg${side}`, cylinder(.07, .08, .4), role("legs"), [0, -.17, 0]),
      part("shin", `legLo${side}`, cylinder(.05, .06, .12), role("legs"), [0, -.05, 0]),
      part("foot", `legLo${side}`, box(.15, .1, .2), role("legs"), [0, -.02, .03]),
      part("upperArm", `arm${side}`, capsule(.065, .26), role("skin"), [0, -.14, 0]),
      part("forearm", `armLo${side}`, capsule(.05, .12), role("skin"), [0, -.07, 0]),
      part("hand", `armLo${side}`, sphere(.07), role("skin"), [0, -.15, 0]),
    );
  }
  parts.push(...weaponParts("armLoR", [0, -.15, 0]), ...shieldParts("armLoL"));
  return {
    version: 1, id: "biped", label: "Biped Creature", scale: 1, seat: .45, height: 1.6, bones, parts,
    limbs: [
      { bone: "legL", phase: 0 }, { bone: "armL", phase: 1 }, { bone: "legR", phase: 1 }, { bone: "armR", phase: 0 },
      { bone: "legLoL", phase: 0, amplitude: 0, flex: 48 },
      { bone: "legLoR", phase: 1, amplitude: 0, flex: 48 },
      { bone: "armLoL", phase: 1, amplitude: 0, flex: 26, flexSign: -1 },
      { bone: "armLoR", phase: 0, amplitude: 0, flex: 26, flexSign: -1 },
    ],
  };
}

/** Dire wolf — limbs [FL, FR, BL, BR] trot. */
function quadruped(): Rig3DDoc {
  seq = 0;
  const bones = [bone("root", null), bone("head", "root", [0, .72, .46]), bone("legFL", "root", [-.24, .43, .36]), bone("legFR", "root", [.24, .43, .36]), bone("legBL", "root", [-.24, .43, -.35]), bone("legBR", "root", [.24, .43, -.35])];
  const parts: RigPart[] = [
    part("torso", "root", ico(.4), role("skin"), [0, .48, 0], { scale: [1, .85, 1.6] }),
    part("head", "head", ico(.28), role("skin")),
    part("snout", "head", box(.28, .15, .27), fixed("#493e3c"), [0, -.07, .22]),
    part("tail", "root", cone(.09, .5, 5), role("skin"), [0, .62, -.72], { rotation: [-63, 0, 0] }),
    part("earL", "head", cone(.12, .26, 3), role("skin"), [-.18, .28, -.03]),
    part("earR", "head", cone(.12, .26, 3), role("skin"), [.18, .28, -.03]),
    part("eyeL", "head", sphere(.035), fixed("#e7bf73"), [-.2, .06, .2]),
    part("eyeR", "head", sphere(.035), fixed("#e7bf73"), [.2, .06, .2]),
  ];
  for (const leg of ["legFL", "legFR", "legBL", "legBR"]) parts.push(part("leg", leg, cylinder(.065, .09, .4), role("skin"), [0, -.16, 0]));
  return {
    version: 1, id: "quadruped", label: "Quadruped", scale: 1, seat: .3, height: 1.25, bones, parts,
    limbs: [{ bone: "legFL", phase: 0 }, { bone: "legFR", phase: 1 }, { bone: "legBL", phase: 1 }, { bone: "legBR", phase: 0 }],
  };
}

export const DEFAULT_RIGS: Record<string, Rig3DDoc> = Object.fromEntries([humanoid(), biped(), quadruped()].map(r => [r.id, r]));
