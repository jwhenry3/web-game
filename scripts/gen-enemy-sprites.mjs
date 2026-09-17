// Generates pixel-art enemy sprite sheets in the Heroes 99 layout
// (800×680, 8×17 grid of 100×40 cells, feet anchored at ~x40/y34).
// Usage: node scripts/gen-enemy-sprites.mjs
import zlib from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "wails/frontend/public/assets/enemies");

const SHEET = { frameWidth: 100, frameHeight: 40, columns: 8, width: 800, height: 680 };
const FOOT_X = 42; // ground-contact column inside a cell
const FOOT_Y = 34; // ground line inside a cell

// Frames used by H99_ANIMS: idle 0–5, run 16–23, attack 36–41.
const USED_FRAMES = [0, 1, 2, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 36, 37, 38, 39, 40, 41];

// ---------------------------------------------------------------- png encode
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- pixel art
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
}

/** Pixel buffer: parts are stamped back-to-front; each part gets a 1px outline. */
class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.buf = new Array(w * h).fill(null);
    this.part = null;
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  put(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (this.part) this.part.set(y * this.w + x, c);
    else if (this.inside(x, y)) this.buf[y * this.w + x] = c;
  }
  begin() {
    this.part = new Map();
  }
  end(outline, noOutlineAgainst) {
    const pts = [...this.part.keys()];
    for (const k of pts) {
      const x = k % this.w;
      const y = (k / this.w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const qx = x + dx;
          const qy = y + dy;
          if (this.part.has(qy * this.w + qx)) continue;
          if (this.inside(qx, qy)) {
            const existing = this.buf[qy * this.w + qx];
            if (existing && noOutlineAgainst && noOutlineAgainst.has(existing)) continue;
            this.buf[qy * this.w + qx] = outline;
          }
        }
      }
    }
    for (const [k, c] of this.part) this.buf[k] = c;
    this.part = null;
  }
  px(x, y, c) {
    this.put(x, y, c);
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++) {
      for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.05) this.put(cx + x, cy + y, c);
      }
    }
  }
  /** Shaded ellipse: light top-left, shadow lower-right, dithered boundary, 1px highlight. */
  shadeEllipse(cx, cy, rx, ry, ramp) {
    for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++) {
      for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
        const nx = x / rx;
        const ny = y / ry;
        if (nx * nx + ny * ny > 1.05) continue;
        const s = nx + ny * 1.3;
        let c = ramp.base;
        if (s < -0.45) c = ramp.light;
        else if (s > 0.62) c = ramp.shadow;
        else if (s > 0.3 && ((x + y) & 1) === 0) c = ramp.shadow;
        this.put(cx + x, cy + y, c);
      }
    }
    this.put(Math.round(cx - rx * 0.55), Math.round(cy - ry * 0.6), ramp.hi);
  }
  /** Vertical limb: base fill, light column on left edge, shadow column on right. */
  limb(x, y, w, h, ramp) {
    this.rect(x, y, w, h, ramp.base);
    for (let j = 0; j < h; j++) {
      this.put(x, y + j, ramp.light);
      this.put(x + w - 1, y + j, ramp.shadow);
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.put(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  /** Filled triangle. */
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (d === 0) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
        const b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
        const g = 1 - a - b;
        if (a >= 0 && b >= 0 && g >= 0) this.put(x, y, c);
      }
    }
  }
  blit(dst, dstW, ox, oy) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.buf[y * this.w + x];
        if (!c) continue;
        const i = ((oy + y) * dstW + ox + x) * 4;
        const [r, g, b, a] = hex(c);
        dst[i] = r;
        dst[i + 1] = g;
        dst[i + 2] = b;
        dst[i + 3] = a;
      }
    }
  }
}

function phase(frame) {
  if (frame < 6) return { anim: "idle", t: frame / 5, i: frame };
  if (frame >= 16 && frame <= 23) return { anim: "run", t: (frame - 16) / 7, i: frame - 16 };
  if (frame >= 36) return { anim: "attack", t: (frame - 36) / 5, i: frame - 36 };
  return { anim: "idle", t: 0, i: 0 };
}

// ---------------------------------------------------------------- goblin
const GOBLIN = {
  skinOut: "#152a0c",
  skin: { shadow: "#3f6b28", base: "#6fae4a", light: "#95cc66", hi: "#c8eda4" },
  clothOut: "#2b0d09",
  cloth: { shadow: "#6e1a14", base: "#b8352b", light: "#d65a45", hi: "#f08a70" },
  rope: "#c9a15a",
  ropeD: "#8a6b3a",
  steelOut: "#12161b",
  steel: { shadow: "#4c5560", base: "#8b98a5", light: "#c3ccd6", hi: "#eef4fa" },
  hilt: "#3a2a1c",
  earIn: "#d98a8f",
  eye: "#ffd94a",
  pupil: "#14140a",
  teeth: "#f4f0dd",
};
// Skin and cloth never get a hard outline against each other.
const GOBLIN_BLEND = new Set([
  GOBLIN.skinOut, GOBLIN.skin.shadow, GOBLIN.skin.base, GOBLIN.skin.light, GOBLIN.skin.hi,
  GOBLIN.clothOut, GOBLIN.cloth.shadow, GOBLIN.cloth.base, GOBLIN.cloth.light, GOBLIN.cloth.hi,
  GOBLIN.earIn,
]);
const GOBLIN_SKIN_FAR = { shadow: "#2c4d1a", base: "#4c7c33", light: "#5f9440", hi: "#74b34c" };

function drawGoblin(p, frame) {
  const { anim, t, i } = phase(frame);
  const bob = anim === "idle" ? Math.round(Math.sin(t * Math.PI * 2) * 1) : anim === "run" ? Math.round(Math.sin(t * Math.PI * 4) * 1) : 0;
  const breath = anim === "idle" && i >= 2 && i <= 3 ? -1 : 0;
  const lean = anim === "attack" ? (t < 0.4 ? -1 : t < 0.7 ? 2 : 1) : 0;
  const fx = FOOT_X + (anim === "attack" && t >= 0.4 && t < 0.8 ? 2 : 0);
  const fy = FOOT_Y;
  const rise = bob + breath;

  const stride = anim === "run" ? Math.sin(t * Math.PI * 2) : anim === "idle" ? Math.sin(t * Math.PI * 2) * 0.15 : 0;
  const legA = Math.round(stride * 3); // front leg
  const legB = Math.round(-stride * 3); // back leg
  const liftA = anim === "run" ? Math.max(0, Math.round(-Math.cos(t * Math.PI * 2) * 2)) : 0;
  const liftB = anim === "run" ? Math.max(0, Math.round(Math.cos(t * Math.PI * 2) * 2)) : 0;

  // Back arm (far side, darker).
  p.begin();
  p.limb(fx - 7 + lean, fy - 16 + rise, 3, 6, GOBLIN_SKIN_FAR);
  p.end(GOBLIN.skinOut, GOBLIN_BLEND);

  // Back leg.
  p.begin();
  p.limb(fx - 4 + legB, fy - 8 - liftB, 3, 8, GOBLIN_SKIN_FAR);
  p.rect(fx - 4 + legB, fy - 1 - liftB, 4, 1 + liftB, GOBLIN_SKIN_FAR.shadow);
  p.end(GOBLIN.skinOut, GOBLIN_BLEND);

  // Torso — red tunic + rope belt.
  p.begin();
  p.shadeEllipse(fx - 1 + lean, fy - 13 + rise, 6, 6, GOBLIN.cloth);
  p.rect(fx - 6 + lean, fy - 10 + rise, 11, 1, GOBLIN.rope); // rope belt
  p.px(fx + 3 + lean, fy - 10 + rise, GOBLIN.ropeD); // knot
  p.rect(fx - 4 + lean, fy - 8 + rise, 8, 1, GOBLIN.cloth.shadow); // ragged hem
  p.end(GOBLIN.clothOut, GOBLIN_BLEND);

  // Front leg.
  p.begin();
  p.limb(fx + 1 + legA, fy - 8 - liftA, 3, 8, GOBLIN.skin);
  p.rect(fx + 1 + legA, fy - 1 - liftA, 4, 1 + liftA, GOBLIN.skin.shadow);
  p.end(GOBLIN.skinOut, GOBLIN_BLEND);

  // Head — big, hunched forward, with nose, ears, eyes, tusked grin.
  p.begin();
  p.shadeEllipse(fx + 2 + lean, fy - 22 + rise, 7, 6, GOBLIN.skin);
  p.rect(fx + 8 + lean, fy - 22 + rise, 3, 2, GOBLIN.skin.base); // nose
  p.px(fx + 10 + lean, fy - 21 + rise, GOBLIN.skin.light);
  // ears sweeping back, roughly level with the head top
  p.tri(fx - 4 + lean, fy - 24 + rise, fx - 16 + lean, fy - 27 + rise, fx - 2 + lean, fy - 19 + rise, GOBLIN_SKIN_FAR.base);
  p.tri(fx - 2 + lean, fy - 26 + rise, fx - 15 + lean, fy - 29 + rise, fx + 1 + lean, fy - 20 + rise, GOBLIN.skin.base);
  p.tri(fx - 3 + lean, fy - 25 + rise, fx - 12 + lean, fy - 27 + rise, fx + 0 + lean, fy - 21 + rise, GOBLIN.earIn);
  // yellow eye with black pupil
  p.px(fx + 4 + lean, fy - 23 + rise, GOBLIN.eye);
  p.px(fx + 5 + lean, fy - 23 + rise, GOBLIN.pupil);
  // wide grin + two up-pointing tusks
  p.rect(fx + 3 + lean, fy - 17 + rise, 6, 1, GOBLIN.skinOut);
  p.px(fx + 4 + lean, fy - 18 + rise, GOBLIN.teeth);
  p.px(fx + 7 + lean, fy - 18 + rise, GOBLIN.teeth);
  p.px(fx + 8 + lean, fy - 16 + rise, GOBLIN.skin.shadow); // chin
  p.end(GOBLIN.skinOut, GOBLIN_BLEND);

  // Front arm + curved dagger. Attack: wind up back, thrust forward, recover.
  let handX = fx + 6 + lean;
  let handY = fy - 12 + rise;
  let tipX = fx + 10;
  let tipY = fy - 7 + rise;
  let curve = -1;
  if (anim === "attack") {
    if (t < 0.34) {
      handX = fx + 3;
      handY = fy - 17 + rise;
      tipX = fx - 3;
      tipY = fy - 23 + rise;
      curve = -1;
    } else if (t < 0.7) {
      handX = fx + 9;
      handY = fy - 13 + rise;
      tipX = fx + 16;
      tipY = fy - 13 + rise;
      curve = -1;
    } else {
      handX = fx + 7;
      handY = fy - 11 + rise;
      tipX = fx + 12;
      tipY = fy - 6 + rise;
      curve = 1;
    }
  }
  p.begin();
  p.line(fx + 3 + lean, fy - 14 + rise, handX, handY, GOBLIN.skin.base); // arm
  p.px(handX, handY, GOBLIN.skin.light);
  p.end(GOBLIN.skinOut, GOBLIN_BLEND);
  p.begin();
  p.rect(handX - 1, handY - 1, 3, 1, GOBLIN.hilt); // guard
  p.line(handX, handY - 2, tipX, tipY, GOBLIN.steel.base); // blade
  p.px(tipX, tipY + curve, GOBLIN.steel.light); // curved tip
  p.px(Math.round((handX + tipX) / 2), Math.round((handY - 2 + tipY) / 2) - 1, GOBLIN.steel.hi); // edge glint
  p.end(GOBLIN.steelOut);
}

// ---------------------------------------------------------------- dire wolf
const WOLF = {
  furOut: "#14100a",
  fur: { shadow: "#33291e", base: "#5f4f3d", light: "#857052", hi: "#ab9573" },
  furFar: { shadow: "#1f1810", base: "#3a2f22", light: "#4e4030", hi: "#5f4f3d" },
  mane: { shadow: "#241c12", base: "#3e3226", light: "#574734", hi: "#6b583f" },
  eye: "#ffb020",
  eyeCore: "#ffe08a",
  nose: "#14100c",
  teeth: "#f4f0dd",
  claw: "#241c14",
};
// Fur/mane parts blend into each other; outline only against background.
const WOLF_BLEND = new Set([
  WOLF.furOut,
  WOLF.fur.shadow, WOLF.fur.base, WOLF.fur.light, WOLF.fur.hi,
  WOLF.furFar.shadow, WOLF.furFar.base, WOLF.furFar.light, WOLF.furFar.hi,
  WOLF.mane.shadow, WOLF.mane.base, WOLF.mane.light, WOLF.mane.hi,
]);

function drawWolf(p, frame) {
  const { anim, t, i } = phase(frame);
  const gallop = anim === "run" ? Math.sin(t * Math.PI * 2) : 0;
  const bob = anim === "idle" ? Math.round(Math.sin(t * Math.PI * 2) * 0.7) : anim === "run" ? Math.round(-Math.abs(Math.cos(t * Math.PI * 2)) * 1.5) : 0;
  const breath = anim === "idle" && i >= 2 && i <= 3 ? -1 : 0;
  const crouch = anim === "attack" ? (t < 0.34 ? 1 : t < 0.7 ? -1 : 0) : 0;
  const lunge = anim === "attack" ? (t < 0.34 ? -2 : t < 0.7 ? 5 : 2) : 0;
  const jawOpen = anim === "attack" && t >= 0.34 && t < 0.8 ? 2 : 0;
  const fx = FOOT_X + lunge;
  const fy = FOOT_Y + crouch;
  const rise = bob + breath;

  // Tail (behind body) — plume with spiky tip tuft.
  p.begin();
  const wag = anim === "idle" ? Math.round(Math.sin(t * Math.PI * 2) * 1) : 0;
  p.line(fx - 12, fy - 15 + rise, fx - 17, fy - 20 + rise + wag, WOLF.mane.base);
  p.line(fx - 12, fy - 14 + rise, fx - 17, fy - 19 + rise + wag, WOLF.mane.base);
  p.line(fx - 12, fy - 16 + rise, fx - 16, fy - 20 + rise + wag, WOLF.mane.shadow);
  p.tri(fx - 16, fy - 19 + rise + wag, fx - 20, fy - 23 + rise + wag, fx - 18, fy - 18 + rise + wag, WOLF.mane.light);
  p.px(fx - 19, fy - 24 + rise + wag, WOLF.mane.light);
  p.end(WOLF.furOut, WOLF_BLEND);

  // Hind legs (far pair darker) — longer than before.
  const hSwing = anim === "run" ? Math.round(gallop * 4) : 0;
  const hLift = anim === "run" ? Math.max(0, Math.round(gallop * 2)) : 0;
  p.begin();
  p.limb(fx - 12 - hSwing, fy - 10 - hLift, 3, 10, WOLF.furFar);
  p.rect(fx - 12 - hSwing, fy - 1 - hLift, 4, 1, WOLF.claw);
  p.tri(fx - 9 - hSwing, fy - 9 - hLift, fx - 7 - hSwing, fy - 7 - hLift, fx - 9 - hSwing, fy - 6 - hLift, WOLF.furFar.light); // elbow tuft
  p.end(WOLF.furOut, WOLF_BLEND);
  p.begin();
  p.limb(fx - 8 + hSwing, fy - 10 - hLift, 3, 10, WOLF.fur);
  p.rect(fx - 8 + hSwing, fy - 1 - hLift, 4, 1, WOLF.claw);
  p.tri(fx - 5 + hSwing, fy - 9 - hLift, fx - 3 + hSwing, fy - 7 - hLift, fx - 5 + hSwing, fy - 6 - hLift, WOLF.fur.light); // elbow tuft
  p.end(WOLF.furOut, WOLF_BLEND);

  // Body — lean torso with shaggy mane spikes along neck/shoulder.
  p.begin();
  p.shadeEllipse(fx - 2, fy - 13 + rise, 11, 5, WOLF.fur);
  // mane: 5 spiky triangles along the top of the neck/shoulder
  p.tri(fx + 3, fy - 17 + rise, fx + 5, fy - 22 + rise, fx + 6, fy - 16 + rise, WOLF.mane.base);
  p.tri(fx + 5, fy - 17 + rise, fx + 8, fy - 23 + rise, fx + 8, fy - 16 + rise, WOLF.mane.base);
  p.tri(fx + 7, fy - 17 + rise, fx + 10, fy - 22 + rise, fx + 10, fy - 15 + rise, WOLF.mane.light);
  p.tri(fx + 1, fy - 17 + rise, fx + 3, fy - 21 + rise, fx + 4, fy - 16 + rise, WOLF.mane.base);
  p.tri(fx + 9, fy - 16 + rise, fx + 12, fy - 20 + rise, fx + 12, fy - 14 + rise, WOLF.mane.base);
  p.end(WOLF.furOut, WOLF_BLEND);

  // Front legs.
  const fSwing = anim === "run" ? Math.round(-gallop * 4) : anim === "attack" ? 3 : 0;
  const fLift = anim === "run" ? Math.max(0, Math.round(-gallop * 2)) : anim === "attack" ? 1 : 0;
  p.begin();
  p.limb(fx + 4 - fSwing, fy - 10 - fLift, 3, 10, WOLF.furFar);
  p.rect(fx + 4 - fSwing, fy - 1 - fLift, 4, 1, WOLF.claw);
  p.end(WOLF.furOut, WOLF_BLEND);
  p.begin();
  p.limb(fx + 8 + fSwing, fy - 10 - fLift, 3, 10, WOLF.fur);
  p.rect(fx + 8 + fSwing, fy - 1 - fLift, 4, 1, WOLF.claw);
  p.tri(fx + 11 + fSwing, fy - 9 - fLift, fx + 13 + fSwing, fy - 7 - fLift, fx + 11 + fSwing, fy - 6 - fLift, WOLF.fur.light); // elbow tuft
  p.end(WOLF.furOut, WOLF_BLEND);

  // Head: skull, ears, snout, jaw, glowing amber eye, fangs.
  p.begin();
  p.shadeEllipse(fx + 11, fy - 16 + rise, 4, 4, WOLF.fur); // skull
  p.tri(fx + 8, fy - 19 + rise, fx + 9, fy - 23 + rise, fx + 11, fy - 19 + rise, WOLF.furFar.base); // far ear
  p.tri(fx + 10, fy - 19 + rise, fx + 13, fy - 23 + rise, fx + 13, fy - 18 + rise, WOLF.fur.base); // near ear
  p.rect(fx + 13, fy - 17 + rise, 6, 3, WOLF.fur.base); // snout top
  p.px(fx + 13, fy - 17 + rise, WOLF.fur.light);
  p.rect(fx + 18, fy - 17 + rise, 2, 2, WOLF.nose); // nose
  p.rect(fx + 13, fy - 14 + rise + jawOpen, 5, 2, WOLF.fur.shadow); // jaw
  p.px(fx + 16, fy - 14 + rise, WOLF.teeth); // fang, always visible
  if (jawOpen) {
    p.px(fx + 14, fy - 14 + rise, WOLF.teeth);
    p.px(fx + 18, fy - 15 + rise, WOLF.teeth);
  }
  p.px(fx + 11, fy - 17 + rise, WOLF.eye); // glowing amber eye
  p.px(fx + 11, fy - 18 + rise, WOLF.eyeCore);
  p.rect(fx + 7, fy - 13 + rise, 4, 3, WOLF.fur.shadow); // cheek ruff
  p.end(WOLF.furOut, WOLF_BLEND);
}

// ---------------------------------------------------------------- stone imp
const IMP = {
  rockOut: "#0f1220",
  rock: { shadow: "#454a60", base: "#7f84a1", light: "#a8adc9", hi: "#d4d9f0" },
  rockFar: { shadow: "#2f3346", base: "#52566c", light: "#6a6f8c", hi: "#7f84a1" },
  wingOut: "#191324",
  wing: { shadow: "#39304f", base: "#5a4e78", light: "#7d6d9e", hi: "#9a8cbf" },
  horn: { shadow: "#6b7089", base: "#9aa0ba", light: "#c3c8dd", hi: "#e6eaff" },
  crack: "#3b3e50",
  eye: "#8ff2ff",
  eyeCore: "#e8fdff",
  teeth: "#f4f0dd",
};
const IMP_BLEND = new Set([
  IMP.rockOut,
  IMP.rock.shadow, IMP.rock.base, IMP.rock.light, IMP.rock.hi,
  IMP.rockFar.shadow, IMP.rockFar.base, IMP.rockFar.light, IMP.rockFar.hi,
  IMP.crack,
]);

function drawImp(p, frame) {
  const { anim, t, i } = phase(frame);
  const bob = anim === "idle" ? Math.round(Math.sin(t * Math.PI * 2) * 1.2) : anim === "run" ? Math.round(-Math.abs(Math.sin(t * Math.PI * 2)) * 2) : 0;
  const breath = anim === "idle" && i >= 2 && i <= 3 ? -1 : 0;
  const fx = FOOT_X;
  const fy = FOOT_Y;
  const rise = bob + breath;
  const hop = anim === "run" ? Math.max(0, Math.round(Math.sin(t * Math.PI * 2) * 1)) : 0;

  // Bat wings behind the shoulders — flap on idle, spread on attack.
  const wingUp = anim === "attack" ? (t < 0.4 ? -1 : t < 0.7 ? 1 : 0) : anim === "idle" ? (i < 3 ? 0 : 1) : 0;
  const spread = anim === "attack" && t >= 0.34 && t < 0.8 ? 3 : 0;
  p.begin();
  // far wing (darker, slightly behind)
  p.tri(fx - 1, fy - 21 + rise, fx - 15 - spread, fy - 27 - wingUp * 2 + rise, fx - 8, fy - 12 + rise, IMP.wing.shadow);
  p.end(IMP.wingOut);
  p.begin();
  // near wing: membrane + two wing-finger lines
  p.tri(fx + 0, fy - 22 + rise, fx - 13 - spread, fy - 30 - wingUp * 2 + rise, fx - 5, fy - 11 + rise, IMP.wing.base);
  p.line(fx - 1, fy - 20 + rise, fx - 12 - spread, fy - 29 - wingUp * 2 + rise, IMP.wing.light); // finger 1
  p.line(fx - 1, fy - 19 + rise, fx - 8 - spread, fy - 24 - wingUp + rise, IMP.wing.light); // finger 2
  p.px(fx - 13 - spread, fy - 30 - wingUp * 2 + rise, IMP.wing.hi); // tip
  p.end(IMP.wingOut);

  // Curled tail with spade tip.
  p.begin();
  p.line(fx - 7, fy - 8 + rise, fx - 11, fy - 5 + rise, IMP.rock.shadow);
  p.line(fx - 11, fy - 5 + rise, fx - 12, fy - 8 + rise, IMP.rock.shadow);
  p.tri(fx - 13, fy - 10 + rise, fx - 11, fy - 8 + rise, fx - 14, fy - 7 + rise, IMP.rock.light); // spade
  p.px(fx - 13, fy - 9 + rise, IMP.rock.light);
  p.end(IMP.rockOut, IMP_BLEND);

  // Feet — short legs.
  p.begin();
  p.limb(fx - 5, fy - 4 - hop, 3, 4, IMP.rockFar);
  p.rect(fx - 5, fy - 1 - hop, 4, 1 + hop, IMP.rockFar.shadow);
  p.limb(fx + 2, fy - 4 - hop, 3, 4, IMP.rock);
  p.rect(fx + 2, fy - 1 - hop, 4, 1 + hop, IMP.rock.shadow);
  p.end(IMP.rockOut, IMP_BLEND);

  // Back arm (far side). Attack: raises then slams.
  const armRaise = anim === "attack" ? (t < 0.4 ? -6 : t < 0.7 ? 4 : 0) : anim === "idle" ? Math.round(Math.sin(t * Math.PI * 2) * 1) : 0;
  p.begin();
  p.limb(fx - 9, fy - 14 + rise + (armRaise < 0 ? armRaise : 0), 3, 5 + Math.max(0, armRaise), IMP.rockFar);
  if (armRaise > 0) p.rect(fx - 9, fy - 6 + rise, 4, 3, IMP.rockFar.shadow); // far fist down
  p.end(IMP.rockOut, IMP_BLEND);

  // Body — big head/body fused boulder with cracks.
  p.begin();
  p.shadeEllipse(fx, fy - 14 + rise, 9, 10, IMP.rock);
  p.line(fx - 3, fy - 18 + rise, fx - 1, fy - 13 + rise, IMP.crack); // cracks
  p.line(fx + 4, fy - 16 + rise, fx + 6, fy - 12 + rise, IMP.crack);
  p.end(IMP.rockOut, IMP_BLEND);

  // Short curved horns.
  p.begin();
  p.tri(fx - 5, fy - 22 + rise, fx - 8, fy - 27 + rise, fx - 3, fy - 23 + rise, IMP.horn.base);
  p.px(fx - 8, fy - 26 + rise, IMP.horn.light);
  p.tri(fx + 4, fy - 22 + rise, fx + 7, fy - 27 + rise, fx + 6, fy - 22 + rise, IMP.horn.base);
  p.px(fx + 7, fy - 26 + rise, IMP.horn.light);
  p.end(IMP.rockOut);

  // Face — two glowing cyan eyes + wide toothy grin.
  p.begin();
  p.rect(fx + 1, fy - 18 + rise, 2, 2, IMP.eye);
  p.rect(fx + 5, fy - 18 + rise, 2, 2, IMP.eye);
  p.px(fx + 1, fy - 18 + rise, IMP.eyeCore);
  p.px(fx + 5, fy - 18 + rise, IMP.eyeCore);
  p.rect(fx + 0, fy - 11 + rise, 7, 2, IMP.crack); // grin
  for (const tx of [1, 3, 5]) p.px(fx + tx, fy - 11 + rise, IMP.teeth); // upper teeth
  for (const tx of [2, 4]) p.px(fx + tx, fy - 10 + rise, IMP.teeth); // lower teeth
  p.end(IMP.rockOut, IMP_BLEND);

  // Front arm — both fists slam down on attack.
  p.begin();
  p.limb(fx + 7, fy - 14 + rise + (armRaise < 0 ? armRaise : 0), 3, 5 + Math.max(0, armRaise), IMP.rock);
  if (armRaise > 0) p.rect(fx + 7, fy - 6 + rise, 4, 3, IMP.rock.shadow); // near fist down
  p.end(IMP.rockOut, IMP_BLEND);
}

const PAINTERS = { goblin: drawGoblin, dire_wolf: drawWolf, stone_imp: drawImp };

// ---------------------------------------------------------------- emit
function renderFrame(kind, frame) {
  const p = new Pix(SHEET.frameWidth, SHEET.frameHeight);
  PAINTERS[kind](p, frame);
  return p;
}

function buildSheet(kind) {
  const rgba = Buffer.alloc(SHEET.width * SHEET.height * 4);
  for (const frame of USED_FRAMES) {
    const col = frame % SHEET.columns;
    const row = Math.floor(frame / SHEET.columns);
    renderFrame(kind, frame).blit(rgba, SHEET.width, col * SHEET.frameWidth, row * SHEET.frameHeight);
  }
  return encodePng(SHEET.width, SHEET.height, rgba);
}

function buildPreview(kind) {
  const p = renderFrame(kind, 0);
  // tight crop around non-empty pixels
  let minX = p.w, minY = p.h, maxX = 0, maxY = 0;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (p.buf[y * p.w + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  const w = maxX - minX + 3;
  const h = maxY - minY + 3;
  const rgba = Buffer.alloc(w * h * 4);
  const crop = new Pix(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = p.buf[(minY + y - 1) * p.w + (minX + x - 1)];
      if (c) crop.buf[y * w + x] = c;
    }
  crop.blit(rgba, w, 0, 0);
  return encodePng(w, h, rgba);
}

function cropPix(p) {
  let minX = p.w, minY = p.h, maxX = -1, maxY = -1;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (p.buf[y * p.w + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  if (maxX < 0) return { minX: 0, minY: 0, w: 0, h: 0 };
  return { minX: minX - 1, minY: minY - 1, w: maxX - minX + 3, h: maxY - minY + 3 };
}

// --preview: 3x3 grid of frames (idle 0, run 18, attack 38) upscaled 4x on grey.
function buildContactSheet() {
  const kinds = Object.keys(PAINTERS);
  const frames = [0, 18, 38];
  const SCALE = 4;
  const crops = kinds.map((k) => frames.map((f) => ({ p: renderFrame(k, f), ...cropPix(renderFrame(k, f)) })));
  const cw = Math.max(...crops.flat().map((c) => c.w));
  const ch = Math.max(...crops.flat().map((c) => c.h));
  const pad = 4;
  const W = (cw * SCALE + pad) * frames.length + pad;
  const H = (ch * SCALE + pad) * kinds.length + pad;
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = 0x6a;
    rgba[i * 4 + 1] = 0x6a;
    rgba[i * 4 + 2] = 0x6a;
    rgba[i * 4 + 3] = 255;
  }
  crops.forEach((row, r) =>
    row.forEach((c, col) => {
      for (let y = 0; y < c.h; y++)
        for (let x = 0; x < c.w; x++) {
          const s = c.p.buf[(c.minY + y) * c.p.w + (c.minX + x)];
          if (!s) continue;
          const [rr, gg, bb, aa] = hex(s);
          for (let sy = 0; sy < SCALE; sy++)
            for (let sx = 0; sx < SCALE; sx++) {
              const dx = pad + col * (cw * SCALE + pad) + x * SCALE + sx;
              const dy = pad + r * (ch * SCALE + pad) + y * SCALE + sy;
              const di = (dy * W + dx) * 4;
              rgba[di] = rr;
              rgba[di + 1] = gg;
              rgba[di + 2] = bb;
              rgba[di + 3] = aa;
            }
        }
    }),
  );
  return encodePng(W, H, rgba);
}

// --ascii <kind> <frame>: dump a frame as text for quick inspection.
function dumpAscii(kind, frame) {
  const p = renderFrame(kind, frame);
  const c = cropPix(p);
  const chars = " .,:;ox%#@ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789";
  const map = new Map();
  let next = 1;
  const lines = [];
  for (let y = 0; y < c.h; y++) {
    let line = "";
    for (let x = 0; x < c.w; x++) {
      const s = p.buf[(c.minY + y) * p.w + (c.minX + x)];
      if (!s) {
        line += " ";
        continue;
      }
      if (!map.has(s)) map.set(s, chars[next++ % chars.length]);
      line += map.get(s);
    }
    lines.push(line);
  }
  console.log(`--- ${kind} frame ${frame} (crop ${c.w}x${c.h} @ ${c.minX},${c.minY})`);
  console.log(lines.join("\n"));
  for (const [color, ch] of map) console.log(`${ch} = ${color}`);
}

const args = process.argv.slice(2);
if (args[0] === "--preview") {
  const dir = join(ROOT, "tmp");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "enemy_preview.png"), buildContactSheet());
  console.log("wrote tmp/enemy_preview.png");
} else if (args[0] === "--ascii") {
  for (const f of args.slice(2).map(Number)) dumpAscii(args[1], f);
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const kind of Object.keys(PAINTERS)) {
    writeFileSync(join(OUT_DIR, `${kind}.png`), buildSheet(kind));
    writeFileSync(join(OUT_DIR, `${kind}_icon.png`), buildPreview(kind));
    console.log(`wrote ${kind}.png + ${kind}_icon.png`);
  }
}
