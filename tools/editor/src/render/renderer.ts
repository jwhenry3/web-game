import { attachmentPlacement, worldToBoneLocal, type BonePose, type Pose } from "../model/rig";
import type { Atlas, Attachment, Skeleton, Spec } from "../model/types";

/** View transform: spine world coords (y-up, feet origin) -> screen. */
export interface View {
  cx: number; // screen px of world origin
  cy: number;
  scale: number; // screen px per world unit
}

export function toScreen(v: View, wx: number, wy: number): [number, number] {
  return [v.cx + wx * v.scale, v.cy - wy * v.scale];
}

export function toWorld(v: View, sx: number, sy: number): [number, number] {
  return [(sx - v.cx) / v.scale, (v.cy - sy) / v.scale];
}

export interface DrawOpts {
  showBones: boolean;
  selBone: string | null;
  /** Highlight outline for the attachment being pixel-edited. */
  selAttachment: { slot: string; att: string } | null;
  /** Per-slot attachment key override (variant selection). */
  attForSlot: (slot: string) => string | undefined;
}

/** Bone-local -> world for one mesh vertex influence. */
function skinVertex(b: BonePose, lx: number, ly: number): [number, number] {
  const r = (b.rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const x = lx * b.sx;
  const y = ly * b.sy;
  return [b.x + x * cos - y * sin, b.y + x * sin + y * cos];
}

/** Draw a weighted mesh attachment: verts skinned across the pose's bones,
 * texture mapped per triangle (clip + affine, nearest-neighbor). */
function drawMesh(
  ctx: CanvasRenderingContext2D,
  atlasImg: CanvasImageSource,
  region: { x: number; y: number; w: number; h: number },
  att: Attachment,
  skel: Skeleton,
  pose: Pose,
): void {
  const uvs = att.uvs!;
  const tris = att.triangles!;
  const verts = att.vertices!;
  // World-space vertex positions from the weighted influences.
  const nVerts = uvs.length / 2;
  const world = new Float64Array(nVerts * 2);
  let vi = 0;
  for (let v = 0; v < nVerts; v++) {
    const n = verts[vi++]!;
    let wx = 0;
    let wy = 0;
    for (let k = 0; k < n; k++) {
      const bi = verts[vi++]!;
      const lx = verts[vi++]!;
      const ly = verts[vi++]!;
      const w = verts[vi++]!;
      const b = pose.get(skel.bones[bi]?.name ?? "");
      if (!b) continue;
      const [px, py] = skinVertex(b, lx, ly);
      wx += px * w;
      wy += py * w;
    }
    world[v * 2] = wx;
    world[v * 2 + 1] = wy;
  }
  // Per-triangle: clip the world-space tri, then drawImage with the affine
  // that maps atlas px -> world coords.
  const inflate = 0.06; // world units — overlaps tri edges, hides seams
  for (let t = 0; t < tris.length; t += 3) {
    const [i0, i1, i2] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
    const [x0, y0] = [world[i0 * 2]!, world[i0 * 2 + 1]!];
    const [x1, y1] = [world[i1 * 2]!, world[i1 * 2 + 1]!];
    const [x2, y2] = [world[i2 * 2]!, world[i2 * 2 + 1]!];
    const [u0, v0] = [region.x + uvs[i0 * 2]! * region.w, region.y + uvs[i0 * 2 + 1]! * region.h];
    const [u1, v1] = [region.x + uvs[i1 * 2]! * region.w, region.y + uvs[i1 * 2 + 1]! * region.h];
    const [u2, v2] = [region.x + uvs[i2 * 2]! * region.w, region.y + uvs[i2 * 2 + 1]! * region.h];
    const den = (u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0);
    if (Math.abs(den) < 1e-6) continue;
    const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / den;
    const c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / den;
    const e = x0 - a * u0 - c * v0;
    const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / den;
    const d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / den;
    const f = y0 - b * u0 - d * v0;
    // Inflate the clip tri around its centroid so neighbors overlap a hair.
    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    const puff = (x: number, y: number): [number, number] => {
      const dx = x - cx;
      const dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * inflate, y + (dy / len) * inflate];
    };
    const [p0x, p0y] = puff(x0, y0);
    const [p1x, p1y] = puff(x1, y1);
    const [p2x, p2y] = puff(x2, y2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    // Dest rect = source rect in atlas-px space — the affine maps it to
    // world; restricting the source keeps the raster cheap.
    const su = Math.min(u0, u1, u2);
    const sv = Math.min(v0, v1, v2);
    const sw = Math.max(u0, u1, u2) - su;
    const sh = Math.max(v0, v1, v2) - sv;
    ctx.drawImage(atlasImg, su, sv, sw, sh, su, sv, sw, sh);
    ctx.restore();
  }
}

/** Draw the rig: slot attachments from the atlas, then bone overlays. */
export function drawRig(
  ctx: CanvasRenderingContext2D,
  view: View,
  atlasImg: CanvasImageSource,
  atlas: Atlas,
  spec: Spec,
  skel: Skeleton,
  pose: Pose,
  opts: DrawOpts,
): void {
  const skins = skel.skins[0]?.attachments ?? {};
  // World transform: x right, y up — compose onto the caller's transform
  // (DPR scale) rather than replacing it, so coords stay in CSS px.
  ctx.save();
  ctx.translate(view.cx, view.cy);
  ctx.scale(view.scale, -view.scale);
  ctx.imageSmoothingEnabled = false;

  for (const slot of skel.slots) {
    const bonePose = pose.get(slot.bone);
    if (!bonePose) continue;
    const atts = skins[slot.name];
    if (!atts) continue;
    const attName = opts.attForSlot(slot.name);
    const att = attName !== undefined ? atts[attName] : atts[slot.attachment ?? ""];
    if (!att?.path) continue;
    const region = atlas.regions.get(att.path);
    if (!region) continue;
    if (att.type === "mesh" && att.uvs && att.triangles && att.vertices) {
      drawMesh(ctx, atlasImg, region, att, skel, pose);
      continue;
    }
    const p = attachmentPlacement(bonePose, att);
    const w = att.width ?? region.w;
    const h = att.height ?? region.h;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.scale(p.sx, -p.sy); // image-top is bone-local +y; world transform flips y
    ctx.drawImage(atlasImg, region.x, region.y, region.w, region.h, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  // Selected-attachment outline.
  if (opts.selAttachment) {
    const { slot: slotName, att: attName } = opts.selAttachment;
    const slot = skel.slots.find((s) => s.name === slotName);
    const att = slot ? skins[slotName]?.[attName] : undefined;
    const bonePose = slot ? pose.get(slot.bone) : undefined;
    if (slot && att && bonePose) {
      const p = attachmentPlacement(bonePose, att);
      const w = att.width ?? 0;
      const h = att.height ?? 0;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.scale(p.sx, p.sy);
      ctx.strokeStyle = "#4df";
      ctx.lineWidth = 1 / view.scale;
      ctx.setLineDash([2 / view.scale, 2 / view.scale]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
  ctx.restore();

  // Bone overlay in screen space.
  if (opts.showBones) {
    for (const b of spec.bones) {
      const p = pose.get(b.name);
      if (!p) continue;
      const [sx, sy] = toScreen(view, p.x, p.y);
      if (b.parent) {
        const pp = pose.get(b.parent);
        if (pp) {
          const [px, py] = toScreen(view, pp.x, pp.y);
          ctx.strokeStyle = "rgba(120,160,255,0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
      }
      const sel = b.name === opts.selBone;
      ctx.fillStyle = sel ? "#4df" : "#f80";
      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.arc(sx, sy, sel ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (sel) {
        ctx.fillStyle = "#4df";
        ctx.font = "11px monospace";
        ctx.fillText(b.name, sx + 8, sy - 6);
      }
    }
  }
}

/** Nearest bone to a world point, within maxDist world units. */
export function pickBone(spec: Spec, pose: Pose, wx: number, wy: number, maxDist: number): string | null {
  let best: string | null = null;
  let bestD = maxDist;
  for (const b of spec.bones) {
    const p = pose.get(b.name);
    if (!p) continue;
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < bestD) {
      bestD = d;
      best = b.name;
    }
  }
  return best;
}

/** Topmost attachment under a world point (iterates draw order top→down). */
export function pickAttachment(
  skel: Skeleton,
  pose: Pose,
  attForSlot: (slot: string) => string | undefined,
  wx: number,
  wy: number,
): { slot: string; att: string } | null {
  const skins = skel.skins[0]?.attachments ?? {};
  for (let i = skel.slots.length - 1; i >= 0; i--) {
    const slot = skel.slots[i]!;
    const bonePose = pose.get(slot.bone);
    if (!bonePose) continue;
    const atts = skins[slot.name];
    if (!atts) continue;
    const attName = attForSlot(slot.name);
    const name = attName !== undefined ? attName : slot.attachment;
    const att = name ? atts[name] : undefined;
    if (!att || !name) continue;
    const local = worldToBoneLocal(bonePose, wx, wy);
    const dx = local.x - (att.x ?? 0);
    const dy = local.y - (att.y ?? 0);
    if (Math.abs(dx) <= (att.width ?? 0) / 2 && Math.abs(dy) <= (att.height ?? 0) / 2) {
      return { slot: slot.name, att: name };
    }
  }
  return null;
}
