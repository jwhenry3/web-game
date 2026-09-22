/** In-scene floating marks — nameplates, HP/MP/cast bars, status chips, POI
 * labels and interact prompts — rendered as Three.js billboards. Replaces the
 * DOM overlay layer: marks hold a fixed screen size by rescaling from camera
 * distance every frame, so text stays crisp at any zoom. */

import * as THREE from "three";
import { ALL_JOBS, type StatusSnapshot } from "../types";
import { statusColor, statusLabel } from "../ui/statusDisplay";
import { ROLE_COLORS } from "../ui/JobIdentity";

export type EntityMarkVariant = "self" | "player" | "enemy";
export type PoiMarkVariant =
  | "save"
  | "save-active"
  | "job"
  | "camp"
  | "house-poi"
  | "furniture";

const SS = 3; // canvas supersample per screen pixel
const FONT_BODY = `"Noto Sans", ui-sans-serif, system-ui, sans-serif`;
const FONT_MONO = `ui-monospace, "Cascadia Code", Consolas, monospace`;

/** World units covered by one screen pixel at `dist` — the scale factor that
 * keeps a mark the same size on screen regardless of zoom. */
export function unitPerPixel(
  camera: THREE.PerspectiveCamera,
  dist: number,
  viewportH: number,
): number {
  return (
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * dist) /
    Math.max(1, viewportH)
  );
}

const measure = document.createElement("canvas").getContext("2d")!;

function roundedRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* Weapon glyphs for the self nameplate job badge — same `d` data as
 * JobIdentity.WEAPON_PATHS (24×24 box). */
const WEAPON_PATH_D: Record<string, string> = {
  sword: "M5 19 18 6 M17 3.5 20.5 7 M9 17 12 20",
  hammer: "M6.5 19.5 15 11 M12 4h6v5h-6z",
  axe: "M8 21 17 6 M14 4c3.5 0 6 2 6 6-3-2-5.8-1.5-8 .5",
  spear: "M5 19 17 7 M16 3l5 5-4 1-2-2z",
  katana: "M5 18c5-4 10-9 15-14 M10 16l3 3 M5 18l2 2",
  staff: "M6 21 15 12 M17 3a4 4 0 1 0 .01 0 M17 5v4 M15 7h4",
  wand: "M5 20 14 11 M17 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z",
  dagger: "M7 21 17 11 M17 11l4-4 M10 18l3 3",
  knuckles: "M5 14c0-4 3-7 7-7s7 3 7 7v4H5z M8 14v-3 M12 14V8 M16 14v-3",
};
const weaponPathCache = new Map<string, Path2D>();
function weaponPath(type: string): Path2D | null {
  const d = WEAPON_PATH_D[type] ?? WEAPON_PATH_D.sword;
  let p = weaponPathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    weaponPathCache.set(d, p);
  }
  return p;
}

/** Job badge for a job id — weapon glyph + role tint, mirroring
 * JobIdentityBadges iconOnly mode. */
export function jobBadge(
  jobId?: string,
): { path: Path2D; color: string } | null {
  const meta = jobId ? ALL_JOBS.find((j) => j.id === jobId) : undefined;
  if (!meta?.weapon) return null;
  const path = weaponPath(meta.weapon);
  return path
    ? { path, color: (meta.role && ROLE_COLORS[meta.role]) || "#e8c96a" }
    : null;
}

/* ------------------------------------------------------------------ */
/* TextMark — canvas-texture sprite, redraws only on signature change. */
/* ------------------------------------------------------------------ */

export interface LabelOpts {
  color?: string;
  font?: string;
  size?: number;
  weight?: number;
  bg?: string;
  border?: string;
  padX?: number;
  icon?: Path2D | null;
  iconColor?: string;
}

export class TextMark {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private tex = new THREE.CanvasTexture(this.canvas);
  private sig = "";
  pxW = 0;
  pxH = 0;

  constructor(renderOrder = 50) {
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.center.set(0.5, 0.5);
    this.sprite.renderOrder = renderOrder;
  }

  /** Repaints the texture when `sig` (content+style signature) changed. */
  set(
    sig: string,
    w: number,
    h: number,
    draw: (c: CanvasRenderingContext2D, w: number, h: number) => void,
  ): void {
    if (sig === this.sig) return;
    this.sig = sig;
    this.pxW = w;
    this.pxH = h;
    this.canvas.width = Math.max(1, Math.round(w * SS));
    this.canvas.height = Math.max(1, Math.round(h * SS));
    const c = this.ctx;
    c.setTransform(SS, 0, 0, SS, 0, 0);
    c.clearRect(0, 0, w, h);
    draw(c, w, h);
    this.tex.needsUpdate = true;
  }

  /** Fixed-pixel scale + px offset inside the mark anchor for this frame. */
  layout(u: number, xPx = 0, yPx = 0): void {
    this.sprite.scale.set(Math.max(this.pxW, 0.001) * u, Math.max(this.pxH, 0.001) * u, 1);
    this.sprite.position.set(xPx * u, yPx * u, 0);
  }

  dispose(): void {
    this.tex.dispose();
    (this.sprite.material as THREE.Material).dispose();
  }
}

/** Draws text (with optional stroke-outline, chip background, icon) into a
 * TextMark. Sizes in screen px; the sprite rescales for distance. */
export function setLabel(
  m: TextMark,
  text: string,
  sigExtra: string,
  o: LabelOpts = {},
): void {
  const size = o.size ?? 11;
  const font = o.font ?? `${o.weight ?? 600} ${size}px ${FONT_BODY}`;
  const color = o.color ?? "#e6e2d6";
  measure.font = font;
  const iconW = o.icon ? size + 2 : 0;
  const tw = Math.ceil(measure.measureText(text).width);
  const padX = o.padX ?? (o.bg || o.border ? 5 : 2);
  const w = tw + iconW + padX * 2 + 2;
  const h = size + 5;
  m.set(
    `${text}|${color}|${font}|${o.bg ?? ""}|${o.border ?? ""}|${o.iconColor ?? ""}|${iconW}|${padX}|${sigExtra}`,
    w,
    h,
    (c) => {
      if (o.bg || o.border) {
        roundedRect(c, 0.5, 0.5, w - 1, h - 1, 3);
        if (o.bg) {
          c.fillStyle = o.bg;
          c.fill();
        }
        if (o.border) {
          c.strokeStyle = o.border;
          c.lineWidth = 1;
          c.stroke();
        }
      }
      let x = padX;
      if (o.icon) {
        const s = size / 24;
        c.save();
        c.translate(x + (size + 2) / 2, h / 2);
        c.scale(s, s);
        c.translate(-12, -12);
        c.strokeStyle = o.iconColor ?? color;
        c.lineWidth = 1.8;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.stroke(o.icon);
        c.restore();
        x += iconW;
      }
      c.font = font;
      c.textBaseline = "middle";
      c.lineWidth = 2.4;
      c.strokeStyle = "rgba(8,10,14,.92)";
      c.strokeText(text, x, h / 2);
      c.fillStyle = color;
      c.fillText(text, x, h / 2);
    },
  );
}

/* ------------------------------------------------------------------ */
/* BarMark — track + left-anchored fill sprites, no texture churn.     */
/* ------------------------------------------------------------------ */

export class BarMark {
  readonly group = new THREE.Group();
  private bg: THREE.Sprite;
  private fill: THREE.Sprite;
  private ratio = 0;

  constructor(
    public pxW: number,
    public pxH: number,
    private pad = 1,
    renderOrder = 51,
  ) {
    this.bg = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: 0x0b0e14,
        transparent: true,
        opacity: 0.82,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.fill = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.fill.center.set(0, 0.5); // grow from the left edge
    this.bg.renderOrder = renderOrder;
    this.fill.renderOrder = renderOrder + 1;
    this.group.add(this.bg, this.fill);
  }

  set(ratio: number, color: THREE.ColorRepresentation): void {
    this.ratio = THREE.MathUtils.clamp(ratio, 0, 1);
    (this.fill.material as THREE.SpriteMaterial).color.set(color);
  }

  layout(u: number, xPx = 0, yPx = 0): void {
    this.bg.scale.set(this.pxW * u, this.pxH * u, 1);
    this.bg.position.set(xPx * u, yPx * u, 0);
    const innerW = this.pxW - this.pad * 2;
    this.fill.scale.set(
      Math.max(innerW * this.ratio, 0.001) * u,
      (this.pxH - this.pad * 2) * u,
      1,
    );
    this.fill.position.set((xPx - this.pxW / 2 + this.pad) * u, yPx * u, 0);
  }

  dispose(): void {
    for (const s of [this.bg, this.fill])
      (s.material as THREE.Material).dispose();
  }
}

/* ------------------------------------------------------------------ */
/* EntityMark — the full stack over an actor.                          */
/*                                                                     */
/* group      → head anchor (name, arrow, hp, mp, statuses)            */
/* castGroup  → feet anchor (cast bar)                                 */
/* Renderer positions both anchors in world space each frame and calls */
/* update() with the unit-per-pixel scale.                             */
/* ------------------------------------------------------------------ */

export interface EntityMarkData {
  label: string;
  variant: EntityMarkVariant;
  visible?: boolean;
  hp?: { value: number; max: number } | null;
  mp?: { value: number; max: number } | null;
  castPct?: number | null;
  statuses?: StatusSnapshot[] | null;
  targeted?: boolean;
  locked?: boolean;
  /** Job badge on the nameplate (self only). */
  jobId?: string | null;
}

const NAME_COLOR: Record<EntityMarkVariant, string> = {
  self: "#e6e2d6",
  player: "#ffffff",
  enemy: "#e6e2d6",
};

/** px offsets inside the head anchor, +y up. */
const HEAD = { arrow: 27, mp: 17, hp: 11, name: 0, statuses: -17 };
const CHIP_GAP = 3;

export class EntityMark {
  readonly group = new THREE.Group();
  readonly castGroup = new THREE.Group();
  private name = new TextMark();
  private arrow = new TextMark();
  private statuses: TextMark[] = [];
  private hp = new BarMark(46, 5);
  private mp = new BarMark(46, 3);
  private cast = new BarMark(48, 6);

  constructor() {
    // Name over chips, arrow over everything when sprites overlap.
    this.name.sprite.renderOrder = 54;
    this.arrow.sprite.renderOrder = 55;
    this.group.add(this.name.sprite, this.arrow.sprite, this.hp.group, this.mp.group);
    this.castGroup.add(this.cast.group);
  }

  update(d: EntityMarkData, u: number): void {
    this.group.visible = d.visible !== false;
    this.castGroup.visible = this.group.visible && d.castPct != null;
    if (!this.group.visible) return;

    const badge = d.jobId ? jobBadge(d.jobId) : null;
    setLabel(this.name, d.label, `${d.variant}|${d.jobId ?? ""}`, {
      color: NAME_COLOR[d.variant],
      size: 11,
      weight: 600,
      icon: badge?.path,
      iconColor: badge?.color,
    });
    this.name.layout(u, 0, HEAD.name);

    const showArrow = !!d.targeted;
    this.arrow.sprite.visible = showArrow;
    if (showArrow) {
      const color = d.locked ? "#8fd8ff" : "#e8c96a";
      this.arrow.set(`arrow|${color}`, 14, 9, (c) => {
        c.beginPath();
        c.moveTo(1, 1);
        c.lineTo(13, 1);
        c.lineTo(7, 8);
        c.closePath();
        c.lineWidth = 2;
        c.strokeStyle = "rgba(8,10,14,.9)";
        c.stroke();
        c.fillStyle = color;
        c.fill();
      });
      this.arrow.layout(u, 0, HEAD.arrow);
    }

    const hpOn = !!d.hp && d.hp.max > 0;
    this.hp.group.visible = hpOn;
    if (hpOn && d.hp) {
      const r = d.hp.value / d.hp.max;
      this.hp.set(r, r > 0.5 ? 0x3dcc6e : r > 0.25 ? 0xfacc15 : 0xef4444);
      this.hp.layout(u, 0, HEAD.hp);
    }

    const mpOn = !!d.mp && d.mp.max > 0;
    this.mp.group.visible = mpOn;
    if (mpOn && d.mp) {
      this.mp.set(d.mp.value / d.mp.max, 0x5aa9f0);
      this.mp.layout(u, 0, HEAD.mp);
    }

    const list = d.statuses ?? [];
    while (this.statuses.length < list.length) {
      const m = new TextMark();
      this.statuses.push(m);
      this.group.add(m.sprite);
    }
    let rowW = -CHIP_GAP;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const m = this.statuses[i];
      const label = statusLabel(s.kind);
      const color = statusColor(s.kind);
      setLabel(m, label, `chip|${s.kind}:${s.potency}`, {
        color,
        size: 8,
        weight: 700,
        bg: "rgba(12,14,18,.85)",
        border: color,
        padX: 3,
      });
      rowW += m.pxW + CHIP_GAP;
    }
    let sx = -rowW / 2;
    this.statuses.forEach((m, i) => {
      const on = i < list.length;
      m.sprite.visible = on;
      if (on) {
        m.layout(u, sx + m.pxW / 2, HEAD.statuses);
        sx += m.pxW + CHIP_GAP;
      }
    });

    if (d.castPct != null) {
      const pct = THREE.MathUtils.clamp(d.castPct, 0, 1);
      this.cast.set(pct, pct >= 1 ? 0xc4b5fd : 0xa78bfa);
      this.cast.layout(u, 0, 0);
    }
  }

  dispose(): void {
    this.name.dispose();
    this.arrow.dispose();
    for (const m of this.statuses) m.dispose();
    this.hp.dispose();
    this.mp.dispose();
    this.cast.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* POI labels + interact prompts — single TextMarks.                   */
/* ------------------------------------------------------------------ */

const POI_STYLE: Record<PoiMarkVariant, LabelOpts> = {
  save: { color: "#a8e8ff", font: `600 10px ${FONT_MONO}` },
  "save-active": { color: "#f2e8c9", font: `600 10px ${FONT_MONO}` },
  job: { color: "#e8c96a", font: `600 10px ${FONT_MONO}` },
  camp: { color: "#d8f5c8", bg: "rgba(16,32,24,.8)", size: 11, weight: 600, padX: 5 },
  "house-poi": { color: "#e6e2d6", bg: "rgba(16,32,24,.8)", size: 11, weight: 600, padX: 5 },
  furniture: { color: "#e6e2d6", bg: "rgba(16,32,24,.8)", size: 9, weight: 600, padX: 4 },
};

export function setPoiLabel(m: TextMark, text: string, variant: PoiMarkVariant): void {
  setLabel(m, text, variant, POI_STYLE[variant]);
}

export function setInteractPrompt(m: TextMark, keyLabel: string): void {
  setLabel(m, keyLabel, "ix", {
    color: "#e8c96a",
    font: `700 9px ${FONT_MONO}`,
    bg: "rgba(40,34,18,.92)",
    border: "#e8c96a",
    padX: 6,
  });
}
