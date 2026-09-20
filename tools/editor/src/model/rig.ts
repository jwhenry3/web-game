import type { BoneTracks, CatalogEntry, SkelBone, Skeleton, Spec } from "./types";

export interface BonePose {
  /** World position (spine coords: x right, y up, origin at feet). */
  x: number;
  y: number;
  /** World rotation in degrees. */
  rot: number;
  /** World scale from shape keys (1 = neutral). Non-uniform scale ignores
   * shear — fine for this rig's mild morphs. */
  sx: number;
  sy: number;
}

export type Pose = Map<string, BonePose>;

/** Skeleton local offsets, recomputed from spec world positions
 * (identical to the generator: local = world - parentWorld). */
export function specBoneLocals(spec: Spec): Map<string, { x: number; y: number }> {
  const world = new Map(spec.bones.map((b) => [b.name, b]));
  const out = new Map<string, { x: number; y: number }>();
  for (const b of spec.bones) {
    const p = b.parent ? world.get(b.parent) : undefined;
    out.set(b.name, {
      x: round2(b.x - (p?.x ?? 0)),
      y: round2(b.y - (p?.y ?? 0)),
    });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sampleRot(keys: { time: number; value: number }[] | undefined, t: number): number {
  if (!keys || keys.length === 0) return 0;
  if (t <= keys[0]!.time) return keys[0]!.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t <= b.time) {
      const span = b.time - a.time;
      const f = span > 0 ? (t - a.time) / span : 0;
      return a.value + (b.value - a.value) * f;
    }
  }
  return keys[keys.length - 1]!.value;
}

export function sampleTrans(
  keys: { time: number; x: number; y: number }[] | undefined,
  t: number,
): { x: number; y: number } {
  if (!keys || keys.length === 0) return { x: 0, y: 0 };
  if (t <= keys[0]!.time) return { x: keys[0]!.x, y: keys[0]!.y };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t <= b.time) {
      const span = b.time - a.time;
      const f = span > 0 ? (t - a.time) / span : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  const last = keys[keys.length - 1]!;
  return { x: last.x, y: last.y };
}

/** Latest key time across all bone tracks — the animation's loop duration. */
export function animDuration(tracks: Record<string, BoneTracks>): number {
  let d = 0;
  for (const bone of Object.values(tracks)) {
    for (const k of bone.rotate ?? []) d = Math.max(d, k.time);
    for (const k of bone.translate ?? []) d = Math.max(d, k.time);
  }
  return d;
}

/** Resolve shape keys into per-bone scale multipliers and translate shifts. */
function shapeMaps(
  spec: Spec,
  shape: Record<string, number> | undefined,
): { scales: Map<string, { x: number; y: number }>; shifts: Map<string, { x: number; y: number }> } {
  const scales = new Map<string, { x: number; y: number }>();
  const shifts = new Map<string, { x: number; y: number }>();
  const keys = Array.isArray(spec.shapeKeys) ? spec.shapeKeys : [];
  // Rig baseline morphs (spec.shapeDefaults) sit under the explicit shape,
  // mirroring { ...RIG_BASE_SHAPE, ...appearance.shape } in CharacterSprite.
  const merged = { ...spec.shapeDefaults, ...shape };
  for (const key of keys) {
    const v = merged[key.name];
    if (v === undefined || v === 1) continue;
    for (const [bone, axes] of Object.entries(key.bones)) {
      // damp = the bone's share of the delta (default 1 = full key value).
      const s = scales.get(bone) ?? { x: 1, y: 1 };
      const eff = 1 + (v - 1) * (key.damp?.[bone] ?? 1);
      if (axes.includes("x")) s.x *= eff;
      if (axes.includes("y")) s.y *= eff;
      scales.set(bone, s);
    }
    for (const [bone, off] of Object.entries(key.translate ?? {})) {
      const t = shifts.get(bone) ?? { x: 0, y: 0 };
      t.x += (off.x ?? 0) * (v - 1);
      t.y += (off.y ?? 0) * (v - 1);
      shifts.set(bone, t);
    }
  }
  return { scales, shifts };
}

/** Evaluate bone world poses. anim null = setup pose. Parents are resolved
 * via memoized recursion, so spec bone order does not matter. `overlay` is a
 * partial animation — its tracks win for the bones it keys, mirroring a
 * higher Spine track (e.g. "guard" pinning the shield arm). `additive`
 * layers a modifier clip on top: its sampled offsets are *added* to whatever
 * the base/overlay produced (Spine TrackEntry.additive semantics). */
export function poseAt(
  spec: Spec,
  anim: Record<string, BoneTracks> | null,
  t: number,
  shape?: Record<string, number>,
  overlay?: Record<string, BoneTracks> | null,
  additive?: { tracks: Record<string, BoneTracks>; t: number } | null,
): Pose {
  const locals = specBoneLocals(spec);
  const byName = new Map(spec.bones.map((b) => [b.name, b]));
  const { scales, shifts } = shapeMaps(spec, shape);
  const neutral = new Set(spec.shapeNeutral ?? []);
  const pose: Pose = new Map();
  const resolving = new Set<string>();

  const resolve = (b: (typeof spec.bones)[number]): BonePose => {
    const cached = pose.get(b.name);
    if (cached) return cached;
    if (resolving.has(b.name)) return { x: b.x, y: b.y, rot: 0, sx: 1, sy: 1 }; // cycle guard
    resolving.add(b.name);
    const local = locals.get(b.name)!;
    const tracks = overlay?.[b.name] ?? anim?.[b.name];
    const add = additive?.tracks[b.name];
    const rotDeg =
      (tracks ? sampleRot(tracks.rotate, t) : 0) +
      (add ? sampleRot(add.rotate, additive!.t) : 0);
    const base = tracks ? sampleTrans(tracks.translate, t) : { x: 0, y: 0 };
    const addTr = add ? sampleTrans(add.translate, additive!.t) : { x: 0, y: 0 };
    const tr = { x: base.x + addTr.x, y: base.y + addTr.y };
    const sh = shifts.get(b.name);
    const lx = local.x + tr.x + (sh?.x ?? 0);
    const ly = local.y + tr.y + (sh?.y ?? 0);
    const parent = b.parent ? byName.get(b.parent) : undefined;
    const p = parent ? resolve(parent) : undefined;
    // Shape-neutral bones divide out the ancestors' accumulated scale so the
    // attachment renders at authored size while its position still follows.
    let sc = scales.get(b.name) ?? { x: 1, y: 1 };
    if (p && neutral.has(b.name)) sc = { x: sc.x / p.sx, y: sc.y / p.sy };
    const out = p
      ? (() => {
          const pr = (p.rot * Math.PI) / 180;
          const cos = Math.cos(pr);
          const sin = Math.sin(pr);
          return {
            x: p.x + lx * p.sx * cos - ly * p.sy * sin,
            y: p.y + lx * p.sx * sin + ly * p.sy * cos,
            rot: p.rot + rotDeg,
            sx: p.sx * sc.x,
            sy: p.sy * sc.y,
          };
        })()
      : { x: lx, y: ly, rot: rotDeg, sx: sc.x, sy: sc.y };
    pose.set(b.name, out);
    resolving.delete(b.name);
    return out;
  };

  for (const b of spec.bones) resolve(b);
  return pose;
}

/** Attachment draw placement: center + rotation + scale, world space. */
export function attachmentPlacement(
  bonePose: BonePose,
  att: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number },
): { x: number; y: number; rot: number; sx: number; sy: number } {
  const r = (bonePose.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const ax = (att.x ?? 0) * bonePose.sx;
  const ay = (att.y ?? 0) * bonePose.sy;
  return {
    x: bonePose.x + ax * cos - ay * sin,
    y: bonePose.y + ax * sin + ay * cos,
    rot: bonePose.rot + (att.rotation ?? 0),
    sx: bonePose.sx * (att.scaleX ?? 1),
    sy: bonePose.sy * (att.scaleY ?? 1),
  };
}

/** Inverse of attachmentPlacement's positional part: world -> bone local. */
export function worldToBoneLocal(bonePose: BonePose, wx: number, wy: number): { x: number; y: number } {
  const r = (-bonePose.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = wx - bonePose.x;
  const dy = wy - bonePose.y;
  return {
    x: (dx * cos - dy * sin) / bonePose.sx,
    y: (dx * sin + dy * cos) / bonePose.sy,
  };
}

/** Move a bone (and descendants, keeping their local offsets) to a world pos. */
export function moveBoneWorld(spec: Spec, name: string, wx: number, wy: number): Spec {
  const cur = spec.bones.find((b) => b.name === name);
  if (!cur) return spec;
  const dx = wx - cur.x;
  const dy = wy - cur.y;
  const descendants = new Set<string>([name]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of spec.bones) {
      if (b.parent && descendants.has(b.parent) && !descendants.has(b.name)) {
        descendants.add(b.name);
        grew = true;
      }
    }
  }
  return {
    ...spec,
    bones: spec.bones.map((b) =>
      descendants.has(b.name) ? { ...b, x: round2(b.x + dx), y: round2(b.y + dy) } : b,
    ),
  };
}

/** Synthesize an editable spec for a skeleton that has none (imported rig):
 * bone locals are resolved to world positions; no layers/part rules, so the
 * Template tab is empty and the spec is not regenerable. */
export function specFromSkeleton(skel: Skeleton, name: string): Spec {
  const byName = new Map(skel.bones.map((b) => [b.name, b]));
  const world = new Map<string, { x: number; y: number }>();
  const resolving = new Set<string>();
  const resolve = (b: SkelBone): { x: number; y: number } => {
    const cached = world.get(b.name);
    if (cached) return cached;
    if (resolving.has(b.name)) return { x: b.x ?? 0, y: b.y ?? 0 };
    resolving.add(b.name);
    const p = b.parent ? byName.get(b.parent) : undefined;
    const pw = p ? resolve(p) : { x: 0, y: 0 };
    const w = { x: pw.x + (b.x ?? 0), y: pw.y + (b.y ?? 0) };
    world.set(b.name, w);
    resolving.delete(b.name);
    return w;
  };
  // Layers derive from slot names ("cloth_top_torso" -> "cloth_top") so any
  // rig — including creature slots like ears_head/wings_wings — is editable.
  // Slot names are "{layer}_{bone}"; bone names may contain underscores.
  const layerNames: string[] = [];
  const catalog: Record<string, CatalogEntry[]> = {};
  for (const s of skel.slots) {
    const suffix = `_${s.bone}`;
    const name = s.name.endsWith(suffix) ? s.name.slice(0, -suffix.length) : s.name;
    if (!layerNames.includes(name)) layerNames.push(name);
    const entries = catalog[name] ?? (catalog[name] = []);
    for (const [key, att] of Object.entries(
      skel.skins[0]?.attachments[s.name] ?? {},
    )) {
      const e: CatalogEntry = { key, slot: s.name };
      if (att.rotation) e.rotation = att.rotation;
      if (att.scaleX !== undefined && att.scaleX !== 1) e.scaleX = att.scaleX;
      if (att.scaleY !== undefined && att.scaleY !== 1) e.scaleY = att.scaleY;
      entries.push(e);
    }
  }
  return {
    output: { name },
    source: { dir: "", frame: 0, footX: 0, footY: 0, pad: 1, overlap: 0, atlasWidth: 256 },
    partOrder: [],
    partRules: [],
    layers: layerNames.map((name) => ({ name, part: "auto" })),
    catalog,
    bones: skel.bones.map((b) => ({
      name: b.name,
      parent: b.parent ?? null,
      ...resolve(b),
    })),
    animations: skel.animations,
  };
}

/** Rebuild skeleton JSON from spec bones + animations, carrying slots/skins
 * (attachment metadata) over from the loaded skeleton unchanged. */
export function buildSkeleton(spec: Spec, skel: Skeleton): Skeleton {
  const locals = specBoneLocals(spec);
  return {
    ...skel,
    bones: spec.bones.map((b) => {
      const l = locals.get(b.name)!;
      const out: { name: string; parent?: string; x?: number; y?: number } = { name: b.name };
      if (b.parent) out.parent = b.parent;
      if (l.x) out.x = l.x;
      if (l.y) out.y = l.y;
      return out;
    }),
    animations: spec.animations,
  };
}
