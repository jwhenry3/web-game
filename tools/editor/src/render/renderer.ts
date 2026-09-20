import { attachmentPlacement, worldToBoneLocal, type Pose } from "../model/rig";
import type { Atlas, Skeleton, Spec } from "../model/types";

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
