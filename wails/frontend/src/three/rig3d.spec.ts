import { emptyClip, normalizeClip, normalizeRig, sampleClip, upsertKeyframe, type RigAnimClip, type RigTrack } from "./rig3d";
import { DEFAULT_RIGS } from "./rig3dDefaults";

function check(ok: boolean, message: string) { if (!ok) throw new Error(message); }
function near(a: number, b: number, message: string) { check(Math.abs(a - b) < 1e-6, `${message} (got ${a}, want ${b})`); }

const bones = new Set(["arm_l", "leg_r"]);

// --- normalizeClip -----------------------------------------------------------
const clip = normalizeClip({
  duration: 2,
  tracks: [
    { bone: "arm_l", channel: "rotation", keys: [{ t: .5, value: [10, 0, 0] }, { t: 0, value: [0, 0, 0] }, { t: 9, value: [90, 0, 0] }] },
    { bone: "ghost", channel: "rotation", keys: [{ t: 0, value: [1, 2, 3] }] },
    { bone: "leg_r", channel: "bogus", keys: [{ t: 0, value: [0, 0, 0] }] },
    { bone: "leg_r", channel: "position", keys: "nope" },
  ],
}, bones);
check(!!clip, "normalizeClip must return a clip for a sane doc");
check(clip!.duration === 2, "duration preserved");
check(clip!.loop === true, "loop defaults true");
check(clip!.tracks.length === 2, "tracks must drop unknown bones/channels but keep empty valid ones");
check(clip!.tracks[0].keys.map(k => k.t).join() === "0,0.5,2", "keys sorted and clamped to duration");
check(clip!.tracks[1].keys.length === 0, "non-array keys normalize to empty");

// --- normalizeRig round-trip --------------------------------------------------
const rig = normalizeRig({
  id: "test",
  bones: [{ name: "arm_l", parent: null, position: [0, 0, 0], rotation: [0, 0, 0] }],
  anims: { run: clip, cast: clip, hit: clip, attack_slash: clip, custom: clip, broken: "x" },
});
check(!!rig.anims?.run, "idle/run/attack clips must survive normalizeRig");
check(!!rig.anims?.cast && !!rig.anims?.hit && !!rig.anims?.attack_slash, "cast/hit/attack variant clips must survive normalizeRig");
const anims = rig.anims as Record<string, unknown> | undefined;
check(!anims!.custom && !anims!.broken, "non-anim clip names must be dropped");
check(normalizeRig({ id: "x" }).anims === undefined, "docs without anims stay backward compatible");

// --- sampleClip ---------------------------------------------------------------
const c: RigAnimClip = {
  duration: 1, loop: true,
  tracks: [
    { bone: "arm_l", channel: "rotation", keys: [{ t: 0, value: [0, 0, 0] }, { t: 1, value: [90, 0, 0] }] },
    { bone: "leg_r", channel: "scale", keys: [{ t: .5, value: [2, 2, 2] }] },
  ],
};
const mid = sampleClip(c, .5).get("arm_l")!;
near(mid.rotation![0], 45, "linear interpolation at midpoint");
near(sampleClip(c, 1.5).get("arm_l")!.rotation![0], 45, "looping clips wrap the playhead");
near(sampleClip(c, -.25).get("arm_l")!.rotation![0], 67.5, "negative time wraps from the end");
check(!sampleClip(c, .5).has("torso"), "untracked bones absent from the pose");
near(sampleClip(c, 0).get("leg_r")!.scale![0], 2, "single-key track holds its value");
const oneshot: RigAnimClip = { ...c, loop: false };
near(sampleClip(oneshot, 9).get("arm_l")!.rotation![0], 90, "one-shot clips clamp at the end");
near(sampleClip(oneshot, -1).get("arm_l")!.rotation![0], 0, "one-shot clips clamp before the start");
check(sampleClip(emptyClip(), .5).size === 0, "empty clip poses nothing");

// --- upsertKeyframe -----------------------------------------------------------
let tr: RigTrack = { bone: "arm_l", channel: "rotation", keys: [] };
tr = upsertKeyframe(tr, .5, [5, 0, 0]);
tr = upsertKeyframe(tr, .1, [1, 0, 0]);
tr = upsertKeyframe(tr, .9, [9, 0, 0]);
check(tr.keys.map(k => k.t).join() === "0.1,0.5,0.9", "upsert keeps keys sorted");
tr = upsertKeyframe(tr, .502, [7, 0, 0]);
check(tr.keys.length === 3 && tr.keys[1].value[0] === 7, "upsert merges keys within eps");
tr = upsertKeyframe(tr, .5, [8, 0, 0]);
check(tr.keys[1].value[0] === 8, "upsert overwrites an exact-time key");

// --- humanoid elbow/knee joints ------------------------------------------------
const humanoid = DEFAULT_RIGS.humanoid;
const joints = ["armLoL", "armLoR", "legLoL", "legLoR"];
check(joints.every(b => humanoid.bones.some(x => x.name === b)), "humanoid has elbow and knee bones");
for (const b of joints)
  check(humanoid.limbs.some(l => l.bone === b && (l.flex ?? 0) > 0), `${b} flexes during the procedural run`);
const humanoidAnims = humanoid.anims!;
for (const name of ["idle", "attack", "cast", "hit", "attack_slash", "attack_thrust", "attack_smash", "attack_spin", "attack_punch", "attack_leap"] as const) {
  const anim = humanoidAnims[name];
  check(!!anim, `humanoid has a ${name} clip`);
  check(anim!.tracks.some(t => joints.includes(t.bone)), `${name} bends at least one elbow or knee`);
}

console.log("rig3d animation checks passed");
