// 3D character rig documents — a character is a skeletal rig (bones), an
// optional glTF/GLB model that rides that rig (or supplies its own), and
// primitive parts attached to bones. Authored in tools/editor (Scene
// workspace → Characters) and stored at public/assets/rigs3d/<id>.rig3d.json;
// the compiled defaults in rig3dDefaults.ts back every kind the game needs so
// the world renders before (or without) the files.
//
// Units are world units (a humanoid stands ~1.7 tall), y up. Rotations are
// Euler XYZ degrees. Bone transforms are parent-relative; parts are
// bone-relative.

import type { CharacterAppearance } from "../characters/heroes99";

export const RIG3D_VERSION = 1;

export type Vec3 = [number, number, number];

export type RigGeometryType = "box" | "sphere" | "capsule" | "cylinder" | "cone" | "icosahedron" | "dodecahedron";

/** Geometry params are positional, mirroring the Three.js constructors:
 * box [w,h,d]; sphere [r]; capsule [r, length]; cylinder [rTop, rBottom, h];
 * cone [r, h]; icosahedron/dodecahedron [r, detail]. */
export interface RigGeometry {
  type: RigGeometryType;
  params: number[];
}

/** Where a part's colour comes from: a fixed hex, or one of the appearance
 * palette roles so the same rig renders any character. */
export type RigColorRole = "skin" | "hair" | "cloth" | "accent" | "eye" | "legs" | "weapon";
export type RigColor = { fixed: string } | { role: RigColorRole; shade?: number };

export interface RigBone {
  name: string;
  parent: string | null;
  position: Vec3;
  rotation: Vec3;
  /** Rest-pose scale (shape keys multiply this). */
  scale?: Vec3;
}

export interface RigPart {
  id: string;
  name: string;
  bone: string;
  geometry: RigGeometry;
  color: RigColor;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** Only render when every listed appearance field equals the value
   * ("*" = any non-empty value). E.g. { horns: "*" } or { ears: "long" }. */
  when?: Record<string, string>;
  emissive?: number;
  castShadow?: boolean;
}

export interface RigModel {
  /** URL of a glTF/GLB under public/, e.g. /assets/models/knight.glb. */
  url: string;
  scale: number;
  position: Vec3;
  rotation: Vec3;
  /** Locomotion state → clip name inside the model. */
  clips: Partial<Record<RigAnimName, string>>;
  /** When true the model's own skeleton drives it; authored bones are only
   * attachment points. When false the model is a static mesh on `bone`. */
  skinned: boolean;
  bone?: string;
}

export type RigAnimName = "idle" | "run" | "attack";

// --- authored keyframe clips ---------------------------------------------------

/** Animatable bone transform channels — values are absolute local transforms
 * (Euler degrees for rotation), not offsets from rest. */
export type RigTrackChannel = "position" | "rotation" | "scale";
export interface RigKeyframe { t: number; value: Vec3 }
export interface RigTrack { bone: string; channel: RigTrackChannel; keys: RigKeyframe[] }
export interface RigAnimClip {
  /** Seconds. */
  duration: number;
  /** Loop wraps the playhead; one-shot clips (attack) clamp at the end. */
  loop: boolean;
  tracks: RigTrack[];
}

export function emptyClip(duration = 1, loop = true): RigAnimClip {
  return { duration, loop, tracks: [] };
}

export function normalizeClip(raw: unknown, bones: Set<string>): RigAnimClip | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const duration = Math.min(600, Math.max(.05, num(c.duration, 1)));
  const tracks: RigTrack[] = (Array.isArray(c.tracks) ? c.tracks : []).flatMap(t => {
    const o = (t ?? {}) as Record<string, unknown>;
    const channel = str(o.channel, "rotation");
    if (!bones.has(str(o.bone, "")) || (channel !== "position" && channel !== "rotation" && channel !== "scale")) return [];
    const keys: RigKeyframe[] = (Array.isArray(o.keys) ? o.keys : []).flatMap(k => {
      const q = (k ?? {}) as Record<string, unknown>;
      const tt = num(q.t, NaN);
      return Number.isFinite(tt) ? [{ t: Math.min(duration, Math.max(0, tt)), value: vec3(q.value, [0, 0, 0]) }] : [];
    }).sort((a, b) => a.t - b.t);
    return [{ bone: o.bone as string, channel, keys }];
  });
  return { duration, loop: c.loop !== false, tracks };
}

/** Pose at time t: bone → channel → value. Untracked bones are absent (they
 * hold rest pose); looping wraps, one-shot clamps. Linear interpolation. */
export function sampleClip(clip: RigAnimClip, time: number): Map<string, Partial<Record<RigTrackChannel, Vec3>>> {
  const out = new Map<string, Partial<Record<RigTrackChannel, Vec3>>>();
  if (clip.duration <= 0) return out;
  const t = clip.loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.min(clip.duration, Math.max(0, time));
  for (const track of clip.tracks) {
    const keys = track.keys;
    if (!keys.length) continue;
    let v: Vec3;
    if (t <= keys[0].t) v = keys[0].value;
    else if (t >= keys[keys.length - 1].t) v = keys[keys.length - 1].value;
    else {
      let i = 1;
      while (keys[i].t < t) i++;
      const a = keys[i - 1], b = keys[i];
      const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
      v = [a.value[0] + (b.value[0] - a.value[0]) * f, a.value[1] + (b.value[1] - a.value[1]) * f, a.value[2] + (b.value[2] - a.value[2]) * f];
    }
    const e = out.get(track.bone) ?? {};
    e[track.channel] = v;
    out.set(track.bone, e);
  }
  return out;
}

/** Insert or overwrite a key near t (eps = merge tolerance in seconds). */
export function upsertKeyframe(track: RigTrack, t: number, value: Vec3, eps = .005): RigTrack {
  const keys = track.keys.filter(k => Math.abs(k.t - t) > eps);
  keys.push({ t, value });
  keys.sort((a, b) => a.t - b.t);
  return { ...track, keys };
}

/** Procedural locomotion: bones that swing during `run`, grouped by phase.
 * Phase 0 and 1 alternate (left/right); contralateral limbs share a phase. */
export interface RigLimb {
  bone: string;
  phase: 0 | 1;
  /** Swing amplitude in degrees (default 27). */
  amplitude?: number;
  /** One-way joint bend in degrees — knees and elbows flex while their limb
   * is in the forward half of the swing cycle (default 0). */
  flex?: number;
  /** Bend direction along rotation.x: +1 bends backward like a knee,
   * -1 bends forward like an elbow (default +1). */
  flexSign?: -1 | 1;
}

export interface Rig3DDoc {
  version: number;
  id: string;
  label: string;
  /** Overall model scale applied at the root (goblin .85 etc). */
  scale: number;
  /** Height on this rig where a rider sits when it is used as a mount. */
  seat: number;
  /** Height of the name label / head anchor. */
  height: number;
  bones: RigBone[];
  parts: RigPart[];
  limbs: RigLimb[];
  /** Authored keyframe clips per locomotion state — take precedence over the
   * procedural `limbs` swing when present for that state. */
  anims?: Partial<Record<RigAnimName, RigAnimClip>>;
  model?: RigModel;
  /** Rider pose when mounted (bone → rotation) — applied to the rider rig. */
  ridePose?: Record<string, Vec3>;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
const vec3 = (v: unknown, fallback: Vec3): Vec3 =>
  Array.isArray(v) && v.length === 3 ? [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])] : [...fallback];

export const GEOMETRY_TYPES: RigGeometryType[] = ["box", "sphere", "capsule", "cylinder", "cone", "icosahedron", "dodecahedron"];
export const COLOR_ROLES: RigColorRole[] = ["skin", "hair", "cloth", "accent", "eye", "legs", "weapon"];

export function defaultGeometryParams(type: RigGeometryType): number[] {
  switch (type) {
    case "box": return [.2, .2, .2];
    case "sphere": return [.12];
    case "capsule": return [.08, .3];
    case "cylinder": return [.08, .09, .4];
    case "cone": return [.1, .3];
    default: return [.15, 0];
  }
}

export function newPartId(): string {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeColor(raw: unknown): RigColor {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.role === "string" && (COLOR_ROLES as string[]).includes(r.role)) {
    return { role: r.role as RigColorRole, ...(typeof r.shade === "number" ? { shade: r.shade } : {}) };
  }
  return { fixed: typeof r.fixed === "string" && /^#[0-9a-f]{6}$/i.test(r.fixed) ? r.fixed : "#9aa4b0" };
}

export function normalizeRig(raw: unknown, fallbackId = "rig"): Rig3DDoc {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bones: RigBone[] = (Array.isArray(r.bones) ? r.bones : []).map((b, i) => {
    const o = (b ?? {}) as Record<string, unknown>;
    return {
      name: str(o.name, "") || `bone_${i}`,
      parent: typeof o.parent === "string" && o.parent ? o.parent : null,
      position: vec3(o.position, [0, 0, 0]),
      rotation: vec3(o.rotation, [0, 0, 0]),
      ...(o.scale ? { scale: vec3(o.scale, [1, 1, 1]) } : {}),
    };
  });
  if (!bones.length) bones.push({ name: "root", parent: null, position: [0, 0, 0], rotation: [0, 0, 0] });
  const names = new Set(bones.map(b => b.name));
  for (const b of bones) if (b.parent && (!names.has(b.parent) || b.parent === b.name)) b.parent = null;
  const root = bones.find(b => !b.parent)?.name ?? bones[0].name;
  const parts: RigPart[] = (Array.isArray(r.parts) ? r.parts : []).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const g = (o.geometry ?? {}) as Record<string, unknown>;
    const type = (GEOMETRY_TYPES as string[]).includes(str(g.type, "")) ? (g.type as RigGeometryType) : "box";
    return {
      id: str(o.id, "") || `p_${i}`,
      name: str(o.name, "") || type,
      bone: names.has(str(o.bone, "")) ? (o.bone as string) : root,
      geometry: { type, params: Array.isArray(g.params) ? g.params.map(v => num(v, 0)) : defaultGeometryParams(type) },
      color: normalizeColor(o.color),
      position: vec3(o.position, [0, 0, 0]),
      rotation: vec3(o.rotation, [0, 0, 0]),
      scale: vec3(o.scale, [1, 1, 1]),
      ...(o.when && typeof o.when === "object" ? { when: Object.fromEntries(Object.entries(o.when as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string> } : {}),
      ...(typeof o.emissive === "number" ? { emissive: o.emissive } : {}),
      ...(o.castShadow === false ? { castShadow: false } : {}),
    };
  });
  const limbs: RigLimb[] = (Array.isArray(r.limbs) ? r.limbs : []).flatMap(l => {
    const o = (l ?? {}) as Record<string, unknown>;
    if (!names.has(str(o.bone, ""))) return [];
    return [{
      bone: o.bone as string,
      phase: o.phase === 1 ? 1 : 0,
      ...(typeof o.amplitude === "number" ? { amplitude: o.amplitude } : {}),
      ...(typeof o.flex === "number" ? { flex: o.flex } : {}),
      ...(o.flexSign === -1 || o.flexSign === 1 ? { flexSign: o.flexSign } : {}),
    }];
  });
  let model: RigModel | undefined;
  if (r.model && typeof r.model === "object") {
    const m = r.model as Record<string, unknown>;
    if (typeof m.url === "string" && m.url) {
      model = {
        url: m.url,
        scale: num(m.scale, 1),
        position: vec3(m.position, [0, 0, 0]),
        rotation: vec3(m.rotation, [0, 0, 0]),
        clips: m.clips && typeof m.clips === "object" ? Object.fromEntries(Object.entries(m.clips as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as RigModel["clips"] : {},
        skinned: m.skinned !== false,
        ...(names.has(str(m.bone, "")) ? { bone: m.bone as string } : {}),
      };
    }
  }
  const ridePose = r.ridePose && typeof r.ridePose === "object"
    ? Object.fromEntries(Object.entries(r.ridePose as Record<string, unknown>).filter(([k]) => names.has(k)).map(([k, v]) => [k, vec3(v, [0, 0, 0])]))
    : undefined;
  let anims: Rig3DDoc["anims"];
  if (r.anims && typeof r.anims === "object") {
    for (const [name, raw] of Object.entries(r.anims as Record<string, unknown>)) {
      if (name !== "idle" && name !== "run" && name !== "attack") continue;
      const c = normalizeClip(raw, names);
      if (c) (anims ??= {})[name] = c;
    }
  }
  return {
    version: RIG3D_VERSION,
    id: str(r.id, fallbackId) || fallbackId,
    label: str(r.label, "") || str(r.id, fallbackId),
    scale: num(r.scale, 1) || 1,
    seat: num(r.seat, .5),
    height: num(r.height, 1.85),
    bones,
    parts,
    limbs,
    ...(anims ? { anims } : {}),
    ...(model ? { model } : {}),
    ...(ridePose && Object.keys(ridePose).length ? { ridePose } : {}),
  };
}

export function emptyRig(id: string, label = id): Rig3DDoc {
  return {
    version: RIG3D_VERSION, id, label, scale: 1, seat: .5, height: 1.85,
    bones: [{ name: "root", parent: null, position: [0, 0, 0], rotation: [0, 0, 0] }],
    parts: [], limbs: [],
  };
}

// --- appearance palette -------------------------------------------------------

/** H99 palette indices → hex. Skin c1..c6 are human tones; c7+ are creature
 * skins used by the enemy presets (green goblin, red imp, grey stone). */
export const SKIN_HEX: Record<string, string> = {
  c1: "#d5ad87", c2: "#e8c6a4", c3: "#b98a63", c4: "#8d5e3c", c5: "#f1d9c2", c6: "#5e3b26",
  c7: "#5a9e3c", c8: "#c45c50", c9: "#6a6a8a", c10: "#9db8a3", c11: "#8a6a4a",
};
export const HAIR_HEX: Record<string, string> = {
  c1: "#483d37", c2: "#2a2320", c3: "#8a5a2b", c4: "#c98b3e", c5: "#e0c27a", c6: "#b7413a",
  c7: "#7c7c86", c8: "#e9e4dc", c9: "#4a6d9c", c10: "#6f4c8f",
};
export const CLOTH_HEX: Record<string, string> = {
  c1: "#456879", c2: "#796584", c3: "#58492f", c4: "#7a3b3b", c5: "#3f6b4a", c6: "#8a7a4d", c7: "#3c4a6e", c8: "#5d4038",
};
/** Weapon blade/head tints for the four H99 weapon color picks. */
export const WEAPON_HEX: Record<string, string> = {
  c1: "#c8ccd4", c2: "#c9a05a", c3: "#7a8088", c4: "#a8563e",
};

export interface RigPalette { skin: string; hair: string; cloth: string; accent: string; eye: string; legs: string; weapon: string }

export function paletteFromAppearance(a: Partial<CharacterAppearance> | undefined, accent = "#b9ad90"): RigPalette {
  const skin = SKIN_HEX[a?.skin ?? ""] ?? SKIN_HEX.c1;
  return {
    skin,
    hair: HAIR_HEX[a?.hairColor ?? ""] ?? HAIR_HEX.c1,
    cloth: CLOTH_HEX[a?.clothColor ?? ""] ?? CLOTH_HEX.c1,
    accent,
    eye: "#293743",
    // Creature trousers default to skin; enemy presets override (goblin pants).
    legs: skin,
    weapon: WEAPON_HEX[a?.weaponColor ?? ""] ?? WEAPON_HEX.c1,
  };
}

/** Whether a conditional part renders for the given appearance. */
export function partVisible(part: RigPart, appearance: Partial<CharacterAppearance> | undefined): boolean {
  if (!part.when) return true;
  const a = (appearance ?? {}) as Record<string, unknown>;
  return Object.entries(part.when).every(([key, want]) => {
    const have = a[key];
    return want === "*" ? typeof have === "string" && have !== "" : have === want;
  });
}
