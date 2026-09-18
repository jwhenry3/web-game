// Generates one 32x32 pixel-art icon per skill into
// wails/frontend/public/assets/skills/<id>.png plus a manifest
// (src/ui/skillIcons.gen.ts) listing the ids that have art.
// Usage: node scripts/gen-skill-icons.mjs
import zlib from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "wails/frontend/public/assets/skills");
const MANIFEST = join(ROOT, "wails/frontend/src/ui/skillIcons.gen.ts");
const SIZE = 32;
const CX = 16;

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
  ihdr[8] = 8;
  ihdr[9] = 6;
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

/** Same painter as gen-enemy-sprites: parts stamp back-to-front, 1px outline. */
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
  end(outline) {
    for (const k of this.part.keys()) {
      const x = k % this.w;
      const y = (k / this.w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const qx = x + dx;
          const qy = y + dy;
          if (this.part.has(qy * this.w + qx)) continue;
          if (this.inside(qx, qy) && !this.buf[qy * this.w + qx]) {
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
  circle(cx, cy, r, c) {
    for (let y = -r - 1; y <= r + 1; y++) {
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d >= r - 0.6 && d <= r + 0.6) this.put(cx + x, cy + y, c);
      }
    }
  }
  ring(cx, cy, r, c) {
    for (let y = -r - 1; y <= r + 1; y++) {
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d >= r - 0.9 && d <= r - 0.1) this.put(cx + x, cy + y, c);
      }
    }
  }
  arc(cx, cy, r, a0, a1, c) {
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      this.put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
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
  /** 2px-thick line (stamps a 2x2 block per step). */
  thickLine(x0, y0, x1, y1, c) {
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
      this.put(x0 + 1, y0, c);
      this.put(x0, y0 + 1, c);
      this.put(x0 + 1, y0 + 1, c);
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
  /** Quadratic bezier curve, sampled. */
  curve(x0, y0, xm, ym, x1, y1, c) {
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      this.put(u * u * x0 + 2 * u * t * xm + t * t * x1, u * u * y0 + 2 * u * t * ym + t * t * y1, c);
    }
  }
  blit(dst) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.buf[y * this.w + x];
        if (!c) continue;
        const i = (y * this.w + x) * 4;
        const [r, g, b, a] = hex(c);
        dst[i] = r;
        dst[i + 1] = g;
        dst[i + 2] = b;
        dst[i + 3] = a;
      }
    }
  }
}

// ---------------------------------------------------------------- palettes
const PAL = {
  steel: { out: "#10141c", shadow: "#4a5468", base: "#8a98ac", light: "#bcc8da", hi: "#eef4fc" },
  gold: { out: "#241a08", shadow: "#8a6420", base: "#d4a83c", light: "#f0cc70", hi: "#fff0b0" },
  fire: { out: "#2a0e06", shadow: "#8a2c10", base: "#e05a1e", light: "#ff9040", hi: "#ffd060" },
  frost: { out: "#0e2030", shadow: "#2a5a8a", base: "#5aa8e0", light: "#9ad4f8", hi: "#e8f8ff" },
  thunder: { out: "#241a04", shadow: "#a87808", base: "#e8b830", light: "#f8dc70", hi: "#fff8c0" },
  holy: { out: "#2a2410", shadow: "#a89040", base: "#e8d880", light: "#fff4b8", hi: "#ffffff" },
  heal: { out: "#0e2414", shadow: "#2c6e3a", base: "#50a860", light: "#84d894", hi: "#d0f8d8" },
  shadow: { out: "#180e24", shadow: "#4a2c6e", base: "#7c50a8", light: "#a880d8", hi: "#d8c0f8" },
  brawl: { out: "#26100a", shadow: "#8a3a20", base: "#c05a30", light: "#e88850", hi: "#ffc090" },
  song: { out: "#22102a", shadow: "#7a3a8a", base: "#b060c8", light: "#d890e8", hi: "#f8d0ff" },
  blood: { out: "#200a0a", shadow: "#6e1a1a", base: "#a83232", light: "#d05848", hi: "#f09078" },
  sky: { out: "#0e1e30", shadow: "#2c5a8e", base: "#4890d8", light: "#80bcf0", hi: "#d0ecff" },
  indigo: { out: "#101224", shadow: "#3a4080", base: "#5c68c0", light: "#8894e0", hi: "#c0c8ff" },
  teal: { out: "#0a1e1e", shadow: "#1e5a5a", base: "#2e8a80", light: "#58b8a8", hi: "#a0e8d8" },
  wood: { out: "#1c1208", shadow: "#5a4020", base: "#8a6838", light: "#b89058", hi: "#e0c088" },
  portal: { out: "#160a28", shadow: "#3c2068", base: "#6840b8", light: "#9870e0", hi: "#d0b8ff" },
};
const PASSIVE_RING = "#d8b060";
const PASSIVE_RING_OUT = "#241a08";

// ---------------------------------------------------------------- primitives
function sword(p, pal, { x0 = 8, y0 = 24, x1 = 23, y1 = 9 } = {}) {
  p.begin();
  p.thickLine(x0, y0, x1, y1, pal.base); // blade
  p.line(x0 + 1, y0, x1 + 1, y1, pal.light); // edge
  p.px(x1 + 1, y1 - 1, pal.hi); // tip glint
  p.rect(x0 - 4, y0 + 2, 6, 2, PAL.gold.base); // guard
  p.line(x0 - 2, y0 + 4, x0 - 4, y0 + 6, PAL.wood.base); // grip
  p.px(x0 - 5, y0 + 7, PAL.gold.base); // pommel
  p.end(pal.out);
}

function katana(p, pal, { x0 = 9, y0 = 24, x1 = 23, y1 = 8 } = {}) {
  p.begin();
  p.curve(x0, y0, (x0 + x1) / 2 + 1, (y0 + y1) / 2 - 1, x1, y1, pal.base);
  p.curve(x0 + 1, y0, (x0 + x1) / 2 + 2, (y0 + y1) / 2, x1 + 1, y1, pal.light);
  p.px(x1, y1 - 1, pal.hi);
  p.rect(x0 - 3, y0 + 2, 5, 1, PAL.gold.base); // tsuba
  p.line(x0 - 1, y0 + 3, x0 - 4, y0 + 6, PAL.wood.shadow); // wrapped grip
  p.end(pal.out);
}

function slashArc(p, pal, { cx = 16, cy = 16, r = 11, a0 = -2.6, a1 = -0.4 } = {}) {
  p.begin();
  p.arc(cx, cy, r, a0, a1, pal.base);
  p.arc(cx, cy, r - 2, a0 + 0.3, a1 - 0.3, pal.light);
  p.px(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, pal.hi);
  p.end(pal.out);
}

function shield(p, pal, { cx = 16, cy = 16, w = 12, h = 15, boss = true } = {}) {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const t = cy - h / 2;
  const b = cy + h / 2;
  p.begin();
  // kite shield: straight top, curved sides to a point
  p.rect(l + 2, t, w - 4, 1, pal.light);
  p.tri(l, t + 1, r, t + 1, cx, b, pal.base);
  p.rect(l + 1, t + 1, w - 2, 2, pal.light);
  p.line(l, t + 1, l + 2, cy + 2, pal.shadow);
  p.line(r, t + 1, r - 2, cy + 2, pal.shadow);
  if (boss) p.ellipse(cx, cy - 1, 2, 2, pal.hi);
  p.end(pal.out);
}

function chevrons(p, pal, { x = 12, y = 10, n = 2, gap = 5, dir = 1 } = {}) {
  p.begin();
  for (let i = 0; i < n; i++) {
    const yy = y + i * gap;
    if (dir > 0) {
      p.tri(x, yy + 5, x + 4, yy, x + 8, yy + 5, pal.base);
      p.line(x + 1, yy + 4, x + 4, yy + 1, pal.light);
    } else {
      p.tri(x, yy, x + 4, yy + 5, x + 8, yy, pal.base);
      p.line(x + 1, yy + 1, x + 4, yy + 4, pal.light);
    }
  }
  p.end(pal.out);
}

function arrow(p, pal, { x0 = 8, y0 = 16, x1 = 24, y1 = 16 } = {}) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  p.begin();
  p.thickLine(x0, y0, x1, y1, pal.base);
  p.tri(
    x1,
    y1,
    x1 - Math.cos(a - 0.5) * 7,
    y1 - Math.sin(a - 0.5) * 7,
    x1 - Math.cos(a + 0.5) * 7,
    y1 - Math.sin(a + 0.5) * 7,
    pal.light,
  );
  p.end(pal.out);
}

function cross(p, pal, { cx = 16, cy = 16, w = 5, r = 10 } = {}) {
  p.begin();
  p.rect(cx - w / 2, cy - r, w, r * 2, pal.base);
  p.rect(cx - r, cy - w / 2, r * 2, w, pal.base);
  p.rect(cx - w / 2, cy - r, 1, r * 2, pal.light);
  p.rect(cx - r, cy - w / 2, r * 2, 1, pal.light);
  p.end(pal.out);
}

function star4(p, pal, { cx = 16, cy = 16, r = 7 } = {}) {
  p.begin();
  p.tri(cx, cy - r, cx + 2, cy - 2, cx, cy, pal.light);
  p.tri(cx, cy - r, cx - 2, cy - 2, cx, cy, pal.base);
  p.tri(cx + r, cy, cx + 2, cy + 2, cx, cy, pal.light);
  p.tri(cx + r, cy, cx + 2, cy - 2, cx, cy, pal.base);
  p.tri(cx, cy + r, cx - 2, cy + 2, cx, cy, pal.light);
  p.tri(cx, cy + r, cx + 2, cy + 2, cx, cy, pal.base);
  p.tri(cx - r, cy, cx - 2, cy - 2, cx, cy, pal.light);
  p.tri(cx - r, cy, cx - 2, cy + 2, cx, cy, pal.base);
  p.end(pal.out);
}

function flame(p, pal, { cx = 16, cy = 18, h = 18, embers = false } = {}) {
  const t = cy - h / 2;
  const b = cy + h / 2;
  p.begin();
  // teardrop: round base, wavy tip leaning right
  p.ellipse(cx, b - 5, 6, 5, pal.base);
  p.tri(cx - 6, b - 5, cx + 6, b - 5, cx + 4, t + 2, pal.base);
  p.tri(cx - 4, b - 4, cx + 1, b - 4, cx - 2, t + 5, pal.shadow); // left lick
  p.tri(cx - 2, b - 6, cx + 4, b - 6, cx + 3, t, pal.light); // main lick
  p.ellipse(cx, b - 4, 3, 3, pal.hi); // core
  if (embers) {
    p.px(cx - 8, t + 3, pal.light);
    p.px(cx + 8, t + 6, pal.base);
    p.px(cx - 7, t + 9, pal.hi);
  }
  p.end(pal.out);
}

function bolt(p, pal, { x = 14, y = 5, h = 22 } = {}) {
  p.begin();
  p.tri(x + 2, y, x - 4, y + h * 0.55, x + 2, y + h * 0.5, pal.base);
  p.tri(x + 2, y + h * 0.5, x + 8, y + h * 0.45, x - 2, y + h, pal.base);
  p.line(x + 1, y + 2, x - 2, y + h * 0.5, pal.light);
  p.line(x + 4, y + h * 0.55, x, y + h - 2, pal.light);
  p.end(pal.out);
}

function snowflake(p, pal, { cx = 16, cy = 16, r = 10 } = {}) {
  p.begin();
  for (const [dx, dy] of [
    [1, 0],
    [0.5, 0.87],
    [0.5, -0.87],
  ]) {
    p.line(cx - dx * r, cy - dy * r, cx + dx * r, cy + dy * r, pal.base);
    for (const s of [-1, 1]) {
      const ex = cx + dx * r * 0.65 * s;
      const ey = cy + dy * r * 0.65 * s;
      p.line(ex, ey, ex - dy * 3 * s, ey + dx * 3 * s, pal.light);
      p.line(ex, ey, ex + dy * 3 * s, ey - dx * 3 * s, pal.light);
    }
  }
  p.ellipse(cx, cy, 2, 2, pal.hi);
  p.end(pal.out);
}

function fist(p, pal, { cx = 16, cy = 17 } = {}) {
  p.begin();
  p.rect(cx - 7, cy - 3, 14, 8, pal.base); // palm block
  for (let i = 0; i < 4; i++) p.rect(cx - 7 + i * 4, cy - 7, 3, 4, pal.light); // knuckles
  p.rect(cx - 7, cy - 3, 2, 5, pal.shadow); // thumb shadow
  p.rect(cx - 4, cy + 5, 9, 3, pal.shadow); // wrist
  p.end(pal.out);
}

function dagger(p, pal, { x0 = 10, y0 = 23, x1 = 23, y1 = 8, flip = 1 } = {}) {
  p.begin();
  p.thickLine(x0, y0, x1, y1, pal.base);
  p.line(x0, y0 - 1, x1, y1 - 1, pal.light);
  p.px(x1 + flip, y1 - 1, pal.hi);
  p.rect(x0 - 2, y0 + 1, 5, 1, PAL.gold.shadow); // guard
  p.line(x0 - 1, y0 + 2, x0 - 3, y0 + 4, PAL.wood.shadow); // grip
  p.end(pal.out);
}

function axe(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.line(cx - 5, cy - 8, cx + 6, cy + 9, PAL.wood.base); // haft
  p.px(cx + 6, cy + 10, PAL.wood.shadow);
  p.tri(cx - 6, cy - 9, cx - 10, cy - 3, cx - 2, cy - 4, pal.base); // blade
  p.tri(cx - 9, cy - 4, cx - 6, cy - 8, cx - 4, cy - 5, pal.light); // edge
  p.px(cx - 9, cy - 4, pal.hi);
  p.end(pal.out);
}

function hammer(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.line(cx - 5, cy + 8, cx + 5, cy - 3, PAL.wood.base); // handle
  p.rect(cx + 1, cy - 11, 9, 8, pal.base); // head
  p.rect(cx + 1, cy - 11, 9, 2, pal.light);
  p.rect(cx + 8, cy - 10, 2, 6, pal.shadow);
  p.px(cx - 6, cy + 9, PAL.gold.base); // pommel
  p.end(pal.out);
}

function spear(p, pal, { x0 = 8, y0 = 26, x1 = 24, y1 = 6, vertical = false } = {}) {
  p.begin();
  if (vertical) {
    p.line(16, 26, 16, 9, PAL.wood.base);
    p.tri(16, 3, 12, 10, 20, 10, pal.base);
    p.line(15, 4, 15, 9, pal.light);
    p.px(16, 3, pal.hi);
  } else {
    p.line(x0, y0, x1, y1, PAL.wood.base);
    p.line(x0, y0 + 1, x1, y1 + 1, PAL.wood.light);
    p.tri(x1 + 2, y1 - 3, x1 - 1, y1 + 2, x1 + 4, y1 + 1, pal.base);
    p.px(x1 + 2, y1 - 3, pal.hi);
  }
  p.end(pal.out);
}

function wand(p, pal, { x0 = 9, y0 = 24, x1 = 21, y1 = 10 } = {}) {
  p.begin();
  p.line(x0, y0, x1, y1, PAL.wood.base);
  p.ellipse(x1 + 1, y1 - 1, 3, 3, pal.base);
  p.px(x1, y1 - 2, pal.hi);
  p.end(pal.out);
}

function note(p, pal, { cx = 15, cy = 20, big = false } = {}) {
  p.begin();
  p.ellipse(cx - 3, cy + 3, 4, 3, pal.base); // head
  p.rect(cx, cy - 10, 2, 13, pal.base); // stem
  p.tri(cx + 2, cy - 10, cx + 8, cy - 7, cx + 2, cy - 4, pal.light); // flag
  p.px(cx - 4, cy + 2, pal.light);
  if (big) {
    p.px(cx + 6, cy - 2, pal.hi);
  }
  p.end(pal.out);
}

function rings(p, pal, { cx = 16, cy = 16, n = 2 } = {}) {
  p.begin();
  for (let i = 0; i < n; i++) p.ring(cx, cy, 5 + i * 4, i === 0 ? pal.base : pal.light);
  p.end(pal.out);
}

function soundArcs(p, pal, { cx = 12, cy = 16, n = 3 } = {}) {
  p.begin();
  for (let i = 0; i < n; i++) {
    const r = 6 + i * 5;
    p.arc(cx, cy, r, -0.8, 0.8, i === n - 1 ? pal.light : pal.base);
  }
  p.end(pal.out);
}

function horn(p, pal, { cx = 12, cy = 17 } = {}) {
  p.begin();
  p.rect(cx - 6, cy - 3, 6, 6, PAL.wood.base); // mouthpiece end
  p.tri(cx, cy - 3, cx + 9, cy - 7, cx + 9, cy + 7, pal.base); // bell
  p.tri(cx + 2, cy - 3, cx + 8, cy - 6, cx + 8, cy + 6, pal.light);
  p.rect(cx + 9, cy - 8, 2, 16, pal.hi); // rim
  p.end(pal.out);
}

function tent(p, pal, { cx = 16, cy = 19 } = {}) {
  p.begin();
  p.tri(cx - 10, cy + 6, cx + 10, cy + 6, cx, cy - 10, pal.base);
  p.tri(cx - 2, cy + 6, cx + 4, cy + 6, cx, cy - 2, pal.shadow); // flap
  p.line(cx - 7, cy + 3, cx - 1, cy - 6, pal.light);
  p.line(cx, cy - 10, cx, cy - 13, PAL.wood.base); // pole
  p.tri(cx, cy - 13, cx + 6, cy - 12, cx, cy - 10, PAL.fire.base); // pennant
  p.end(pal.out);
}

function crystal(p, pal, { cx = 16, cy = 17 } = {}) {
  p.begin();
  p.tri(cx, cy - 12, cx - 5, cy - 2, cx, cy + 2, pal.light); // tall shard
  p.tri(cx, cy - 12, cx + 5, cy - 2, cx, cy + 2, pal.base);
  p.tri(cx - 8, cy - 2, cx - 11, cy + 6, cx - 4, cy + 6, pal.base); // left shard
  p.tri(cx + 8, cy - 4, cx + 5, cy + 6, cx + 11, cy + 6, pal.light); // right shard
  p.rect(cx - 11, cy + 6, 22, 3, pal.shadow); // base
  p.px(cx - 2, cy - 8, pal.hi);
  p.end(pal.out);
}

function portalRing(p, pal, { cx = 16, cy = 16, r = 11 } = {}) {
  p.begin();
  p.ring(cx, cy, r, pal.base);
  p.arc(cx, cy, r - 3, -0.5, 2.6, pal.light); // swirl
  p.arc(cx, cy, r - 6, 1.8, 4.6, pal.base);
  p.px(cx + r - 1, cy - 3, pal.hi);
  p.px(cx - 2, cy + 2, pal.hi);
  p.end(pal.out);
}

function net(p, pal, { cx = 16, cy = 16, w = 20 } = {}) {
  const l = cx - w / 2;
  const t = cy - w / 2;
  p.begin();
  for (let i = 0; i <= 4; i++) {
    const k = l + (w * i) / 4;
    p.line(k, t, k + 2, t + w, i % 2 ? pal.base : pal.light);
    p.line(k, t + w, k + 2, t, i % 2 ? pal.base : pal.shadow);
  }
  p.end(pal.out);
}

function boot(p, pal, { cx = 15, cy = 18 } = {}) {
  p.begin();
  p.rect(cx - 4, cy - 8, 6, 9, pal.base); // leg
  p.rect(cx - 4, cy, 12, 5, pal.base); // foot
  p.rect(cx - 4, cy + 4, 13, 2, pal.shadow); // sole
  p.rect(cx - 4, cy - 8, 6, 2, pal.light); // cuff
  p.px(cx + 8, cy + 1, pal.light);
  p.end(pal.out);
}

function wing(p, pal, { cx = 16, cy = 15 } = {}) {
  p.begin();
  p.tri(cx - 9, cy - 3, cx + 8, cy - 8, cx + 9, cy + 1, pal.base);
  p.tri(cx - 9, cy - 3, cx + 6, cy - 6, cx + 7, cy, pal.light);
  for (let i = 0; i < 3; i++) {
    p.line(cx - 6 + i * 4, cy - 3 + i, cx + 7 - i, cy - 6 + i * 2, pal.shadow); // feather cuts
  }
  p.end(pal.out);
}

function eye(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.ellipse(cx, cy, 10, 6, pal.light); // sclera
  p.ellipse(cx, cy, 4, 4, pal.base); // iris
  p.px(cx + 1, cy, pal.out === "#10141c" ? "#000" : "#101018"); // pupil
  p.px(cx - 1, cy - 2, pal.hi); // glint
  p.end(pal.out);
}

function bone(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.thickLine(cx - 7, cy + 6, cx + 6, cy - 7, pal.base);
  for (const [bx, by] of [
    [cx - 8, cy + 5],
    [cx - 6, cy + 8],
    [cx + 7, cy - 8],
    [cx + 9, cy - 5],
  ]) {
    p.ellipse(bx, by, 2, 2, pal.light);
  }
  p.end(pal.out);
}

function crack(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.line(cx - 1, cy - 10, cx + 2, cy - 4, pal.base);
  p.line(cx + 2, cy - 4, cx - 3, cy + 1, pal.base);
  p.line(cx - 3, cy + 1, cx + 1, cy + 5, pal.base);
  p.line(cx + 1, cy + 5, cx - 2, cy + 10, pal.base);
  p.line(cx - 3, cy + 1, cx - 8, cy + 4, pal.shadow); // branch
  p.line(cx + 2, cy - 4, cx + 7, cy - 6, pal.shadow);
  p.end(pal.out);
}

function swirl(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.arc(cx, cy, 9, 0.4, 4.4, pal.base);
  p.arc(cx, cy, 6, 2.2, 6.0, pal.light);
  p.arc(cx, cy, 3, 4.0, 1.6, pal.hi);
  p.end(pal.out);
}

function wave(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.curve(cx - 10, cy - 4, cx - 5, cy - 8, cx, cy - 4, pal.base);
  p.curve(cx, cy - 4, cx + 5, cy, cx + 10, cy - 4, pal.base);
  p.curve(cx - 10, cy + 4, cx - 5, cy, cx, cy + 4, pal.light);
  p.curve(cx, cy + 4, cx + 5, cy + 8, cx + 10, cy + 4, pal.light);
  p.end(pal.out);
}

function reticle(p, pal, { cx = 16, cy = 16, r = 9 } = {}) {
  p.begin();
  p.circle(cx, cy, r, pal.base);
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    p.line(cx + dx * (r - 2), cy + dy * (r - 2), cx + dx * (r + 3), cy + dy * (r + 3), pal.light);
  }
  p.px(cx, cy, pal.hi);
  p.end(pal.out);
}

function chain(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  for (const [ox, oy] of [
    [-5, -5],
    [0, 0],
    [5, 5],
  ]) {
    p.ring(cx + ox, cy + oy, 3, pal.base);
    p.px(cx + ox - 2, cy + oy - 2, pal.light);
  }
  p.end(pal.out);
}

function burst(p, pal, { cx = 16, cy = 16, r = 8, n = 8 } = {}) {
  p.begin();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.line(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 2 ? pal.base : pal.light);
  }
  p.ellipse(cx, cy, 3, 3, pal.hi);
  p.end(pal.out);
}

function figure(p, pal, { cx = 16, cy = 18 } = {}) {
  p.begin();
  p.ellipse(cx, cy - 8, 3, 3, pal.light); // head
  p.tri(cx - 4, cy + 8, cx + 4, cy + 8, cx, cy - 4, pal.base); // body
  p.end(pal.out);
}

function beam(p, pal, { cx = 16 } = {}) {
  p.begin();
  p.tri(cx - 7, 4, cx + 7, 4, cx + 3, 27, pal.base); // shaft
  p.tri(cx - 7, 4, cx - 1, 4, cx - 1, 27, pal.light);
  p.ellipse(cx, 27, 5, 2, pal.hi); // pool of light
  p.end(pal.out);
}

function coinPurse(p, pal, { cx = 16, cy = 18 } = {}) {
  p.begin();
  p.ellipse(cx, cy + 1, 8, 7, PAL.wood.base); // bag
  p.ellipse(cx - 2, cy - 1, 3, 3, PAL.wood.light);
  p.rect(cx - 3, cy - 8, 6, 3, pal.base); // tied top
  p.px(cx - 3, cy - 9, pal.light);
  p.px(cx + 3, cy - 9, pal.light);
  p.end(pal.out);
  p.begin();
  p.circle(cx + 8, cy - 6, 3, pal.base); // spilling coin
  p.px(cx + 8, cy - 6, pal.hi);
  p.circle(cx - 9, cy - 2, 2, pal.base);
  p.end(PAL.gold.out);
}

function aura(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.arc(cx, cy, 12, 0, Math.PI * 2, pal.shadow);
  p.arc(cx, cy, 12, -0.6, 2.4, pal.base);
  p.ellipse(cx, cy, 6, 6, pal.base);
  p.px(cx - 2, cy - 3, pal.light);
  p.px(cx + 5, cy - 8, pal.hi);
  p.end(pal.out);
}

function crescent(p, pal, { cx = 16, cy = 16 } = {}) {
  p.begin();
  p.arc(cx - 1, cy, 10, -1.2, 1.2, pal.base); // outer right edge
  p.arc(cx + 3, cy, 8, -1.1, 1.1, pal.base); // inner right edge
  p.line(cx - 1 + Math.cos(-1.2) * 10, cy + Math.sin(-1.2) * 10, cx + 3 + Math.cos(-1.1) * 8, cy + Math.sin(-1.1) * 8, pal.light);
  p.line(cx - 1 + Math.cos(1.2) * 10, cy + Math.sin(1.2) * 10, cx + 3 + Math.cos(1.1) * 8, cy + Math.sin(1.1) * 8, pal.light);
  p.end(pal.out);
}

/** Small corner badge: buff/status indicators. */
function badge(p, pal, draw) {
  p.begin();
  draw();
  p.end(pal.out);
}

/** Gold ring marking a passive skill. */
function passiveRing(p) {
  p.begin();
  p.circle(16, 16, 13, PASSIVE_RING);
  p.circle(16, 16, 12, PASSIVE_RING);
  p.px(11, 7, "#ffe8a8");
  p.end(PASSIVE_RING_OUT);
}

// ---------------------------------------------------------------- spec table
// Each painter composes primitives into one 32x32 icon.
const SPECS = {
  // ---- utility ----
  attack: (p) => {
    sword(p, PAL.steel);
    slashArc(p, PAL.steel, { cx: 10, cy: 22, r: 15, a0: -1.9, a1: -0.8 });
  },
  dodge: (p) => {
    wing(p, PAL.sky, { cx: 14, cy: 15 });
    badge(p, PAL.sky, () => {
      p.line(21, 19, 26, 19, PAL.sky.light);
      p.line(20, 22, 27, 22, PAL.sky.base);
      p.line(22, 25, 26, 25, PAL.sky.base);
    });
  },
  capture: (p) => {
    net(p, PAL.teal);
    star4(p, PAL.gold, { cx: 23, cy: 9, r: 5 });
  },
  return: (p) => {
    crystal(p, PAL.sky);
  },
  port: (p) => {
    portalRing(p, PAL.portal);
  },
  camp: (p) => {
    tent(p, PAL.fire, { cx: 15, cy: 18 });
    flame(p, PAL.fire, { cx: 25, cy: 24, h: 8 });
  },

  // ---- vanguard (sword) ----
  van_cuneus: (p) => {
    shield(p, PAL.steel, { cx: 14, cy: 16, w: 13, h: 16 });
    badge(p, PAL.gold, () => {
      p.tri(15, 8, 15, 22, 22, 15, PAL.gold.base); // wedge inset
      p.line(15, 8, 22, 15, PAL.gold.light);
    });
  },
  van_clamor_castra: (p) => {
    horn(p, PAL.gold, { cx: 11, cy: 17 });
    soundArcs(p, PAL.gold, { cx: 12, cy: 16, n: 2 });
  },
  van_furor_linea: (p) => {
    shield(p, PAL.steel, { cx: 12, cy: 16, w: 11, h: 14 });
    arrow(p, PAL.steel, { x0: 18, y0: 16, x1: 27, y1: 16 });
  },
  van_impetus_acies: (p) => {
    shield(p, PAL.steel, { cx: 16, cy: 14, w: 12, h: 14 });
    badge(p, PAL.steel, () => {
      p.thickLine(6, 25, 26, 25, PAL.steel.base); // hold-the-line bar
      p.line(6, 24, 26, 24, PAL.steel.light);
    });
  },
  van_ripostis: (p) => {
    sword(p, PAL.steel, { x0: 9, y0: 22, x1: 21, y1: 10 });
    dagger(p, PAL.steel, { x0: 23, y0: 22, x1: 11, y1: 10 });
    passiveRing(p);
  },

  // ---- sanctus (wand, holy/heal) ----
  san_sanare: (p) => {
    cross(p, PAL.heal, { cx: 15, cy: 16, w: 5, r: 9 });
    star4(p, PAL.heal, { cx: 24, cy: 9, r: 4 });
  },
  san_lux_mitis: (p) => {
    beam(p, PAL.holy, { cx: 16 });
    star4(p, PAL.holy, { cx: 24, cy: 8, r: 4 });
  },
  san_sanare_maius: (p) => {
    cross(p, PAL.heal, { cx: 16, cy: 16, w: 6, r: 11 });
    star4(p, PAL.holy, { cx: 7, cy: 7, r: 4 });
    star4(p, PAL.holy, { cx: 25, cy: 7, r: 4 });
    star4(p, PAL.holy, { cx: 25, cy: 25, r: 4 });
  },
  san_expello_impurum: (p) => {
    burst(p, PAL.holy, { cx: 16, cy: 15, r: 9, n: 8 });
    badge(p, PAL.shadow, () => {
      p.ellipse(16, 15, 3, 3, PAL.shadow.base); // expelled darkness
      p.px(15, 14, PAL.shadow.light);
    });
  },
  san_meditatio: (p) => {
    aura(p, PAL.holy, { cx: 16, cy: 16 });
    passiveRing(p);
  },

  // ---- brawler (knuckles) ----
  brw_pugnum: (p) => {
    fist(p, PAL.brawl, { cx: 14, cy: 17 });
    chain(p, PAL.steel, { cx: 22, cy: 9 });
  },
  brw_robur_manus: (p) => {
    fist(p, PAL.brawl, { cx: 14, cy: 18 });
    badge(p, PAL.brawl, () => {
      p.tri(21, 12, 26, 4, 26, 12, PAL.brawl.light); // power up-triangle
      p.tri(24, 12, 29, 6, 29, 12, PAL.brawl.base);
    });
  },
  brw_humerus: (p) => {
    fist(p, PAL.brawl, { cx: 17, cy: 17 });
    badge(p, PAL.brawl, () => {
      p.line(4, 12, 9, 12, PAL.brawl.light); // charge streaks
      p.line(3, 17, 10, 17, PAL.brawl.base);
      p.line(4, 22, 9, 22, PAL.brawl.base);
    });
  },
  brw_intentio_pugna: (p) => {
    reticle(p, PAL.brawl, { cx: 16, cy: 16, r: 9 });
    fist(p, PAL.brawl, { cx: 16, cy: 17 });
  },
  brw_fluctus: (p) => {
    wave(p, PAL.brawl, { cx: 16, cy: 16 });
    passiveRing(p);
  },

  // ---- hexer (staff, elements) ----
  hex_ignis_hex: (p) => {
    flame(p, PAL.fire, { cx: 16, cy: 17, h: 18 });
  },
  hex_fulmen_hex: (p) => {
    bolt(p, PAL.thunder, { x: 15, y: 4, h: 24 });
  },
  hex_gelu_hex: (p) => {
    snowflake(p, PAL.frost, { cx: 16, cy: 16, r: 10 });
  },
  hex_ignis_maius: (p) => {
    flame(p, PAL.fire, { cx: 16, cy: 18, h: 22, embers: true });
    flame(p, PAL.thunder, { cx: 16, cy: 22, h: 9 });
  },
  hex_attunement: (p) => {
    swirl(p, PAL.portal, { cx: 16, cy: 16 });
    passiveRing(p);
  },

  // ---- cutpurse (dagger) ----
  cut_surripere: (p) => {
    dagger(p, PAL.teal, { x0: 9, y0: 24, x1: 21, y1: 9 });
    badge(p, PAL.gold, () => {
      p.circle(23, 22, 4, PAL.gold.base); // grabbed coin
      p.px(23, 22, PAL.gold.hi);
    });
  },
  cut_praeda_manus: (p) => {
    coinPurse(p, PAL.gold, { cx: 15, cy: 18 });
  },
  cut_insidiae_nox: (p) => {
    dagger(p, PAL.shadow, { x0: 16, y0: 6, x1: 16, y1: 22 }); // downward stab
    badge(p, PAL.shadow, () => {
      p.arc(16, 24, 7, Math.PI, Math.PI * 2, PAL.shadow.shadow); // ground shadow
    });
  },
  cut_dolus_finis: (p) => {
    dagger(p, PAL.teal, { x0: 11, y0: 22, x1: 22, y1: 10 });
    badge(p, PAL.teal, () => {
      p.arc(16, 16, 10, 2.4, 4.2, PAL.teal.light); // feint trail
      p.px(8, 20, PAL.teal.hi);
    });
  },
  cut_opportunus: (p) => {
    eye(p, PAL.teal, { cx: 16, cy: 16 });
    passiveRing(p);
  },

  // ---- cantor (wand, song) ----
  can_carmen_tutus: (p) => {
    note(p, PAL.song, { cx: 13, cy: 19 });
    shield(p, PAL.song, { cx: 22, cy: 17, w: 9, h: 11, boss: false });
  },
  can_carmen_ferox: (p) => {
    note(p, PAL.song, { cx: 13, cy: 19 });
    flame(p, PAL.fire, { cx: 24, cy: 12, h: 9 });
  },
  can_carmen_acutus: (p) => {
    note(p, PAL.song, { cx: 12, cy: 20 });
    slashArc(p, PAL.song, { cx: 14, cy: 18, r: 12, a0: -1.4, a1: 0.1 });
  },
  can_studium_finale: (p) => {
    note(p, PAL.song, { cx: 12, cy: 20, big: true });
    note(p, PAL.song, { cx: 21, cy: 15 });
    star4(p, PAL.song, { cx: 25, cy: 8, r: 4 });
  },
  can_resonantia: (p) => {
    rings(p, PAL.song, { cx: 16, cy: 16, n: 2 });
    passiveRing(p);
  },

  // ---- aegis (hammer) ----
  aeg_umbo: (p) => {
    shield(p, PAL.steel, { cx: 13, cy: 16, w: 12, h: 15 });
    burst(p, PAL.gold, { cx: 23, cy: 15, r: 6, n: 6 });
  },
  aeg_custodia_ferrea: (p) => {
    shield(p, PAL.steel, { cx: 16, cy: 16, w: 15, h: 18 });
  },
  aeg_tegimen: (p) => {
    figure(p, PAL.gold, { cx: 17, cy: 20 });
    badge(p, PAL.steel, () => {
      p.arc(17, 20, 11, Math.PI + 0.4, Math.PI * 2 - 0.4, PAL.steel.base); // cover arc
      p.arc(17, 20, 11, Math.PI + 0.6, Math.PI * 2 - 0.6, PAL.steel.light);
    });
  },
  aeg_lumen_ferrum: (p) => {
    hammer(p, PAL.steel, { cx: 14, cy: 17 });
    star4(p, PAL.holy, { cx: 24, cy: 9, r: 5 });
  },
  aeg_echo_umbonis: (p) => {
    shield(p, PAL.steel, { cx: 16, cy: 16, w: 10, h: 12, boss: false });
    soundArcs(p, PAL.steel, { cx: 16, cy: 16, n: 2 });
    passiveRing(p);
  },

  // ---- ravager (axe) ----
  rvr_secare: (p) => {
    axe(p, PAL.blood, { cx: 15, cy: 16 });
    slashArc(p, PAL.blood, { cx: 17, cy: 15, r: 12, a0: -2.2, a1: -1.0 });
  },
  rvr_ruina: (p) => {
    axe(p, PAL.blood, { cx: 16, cy: 15 });
    badge(p, PAL.blood, () => {
      p.arc(16, 16, 13, 0.3, 1.9, PAL.blood.base); // ruin sweep
      p.arc(16, 16, 13, 0.5, 1.7, PAL.blood.light);
    });
  },
  rvr_fractura: (p) => {
    bone(p, PAL.steel, { cx: 15, cy: 17 });
    crack(p, PAL.blood, { cx: 17, cy: 15 });
  },
  rvr_tempestas_ferri: (p) => {
    swirl(p, PAL.steel, { cx: 16, cy: 16 });
    badge(p, PAL.blood, () => {
      p.tri(24, 8, 21, 12, 26, 13, PAL.blood.base); // flying blade
      p.tri(8, 24, 6, 19, 11, 20, PAL.blood.base);
    });
  },
  rvr_impetus: (p) => {
    chevrons(p, PAL.blood, { x: 12, y: 9, n: 3, gap: 6, dir: -1 });
    passiveRing(p);
  },

  // ---- lancer (spear) ----
  lnc_saltus_hasta: (p) => {
    spear(p, PAL.sky, { x0: 9, y0: 25, x1: 23, y1: 8 });
    badge(p, PAL.sky, () => {
      p.arc(16, 20, 11, Math.PI + 0.3, Math.PI * 2 - 0.3, PAL.sky.base); // leap arc
      p.tri(23, 8, 20, 9, 22, 12, PAL.sky.light); // landing tip
    });
  },
  lnc_saltus_caelum: (p) => {
    spear(p, PAL.sky, { x0: 10, y0: 7, x1: 22, y1: 24 });
    badge(p, PAL.sky, () => {
      p.arc(16, 12, 11, 0.3, Math.PI - 0.3, PAL.sky.base); // dive arc
    });
    star4(p, PAL.sky, { cx: 23, cy: 25, r: 3 });
  },
  lnc_quinque_ictus: (p) => {
    spear(p, PAL.sky, { x0: 9, y0: 26, x1: 24, y1: 7 });
    badge(p, PAL.sky, () => {
      for (const [tx, ty] of [
        [7, 8],
        [11, 5],
        [25, 14],
        [27, 20],
        [6, 15],
      ]) {
        p.px(tx, ty, PAL.sky.light);
        p.px(tx + 1, ty, PAL.sky.base);
      }
    });
  },
  lnc_saltus_maximus: (p) => {
    spear(p, PAL.sky, { x0: 11, y0: 5, x1: 21, y1: 23 });
    burst(p, PAL.sky, { cx: 21, cy: 25, r: 5, n: 6 });
  },
  lnc_peritia_hastae: (p) => {
    spear(p, PAL.sky, { vertical: true });
    passiveRing(p);
  },

  // ---- ronin (katana) ----
  ron_oculus_ferrum: (p) => {
    eye(p, PAL.indigo, { cx: 16, cy: 15 });
    slashArc(p, PAL.indigo, { cx: 16, cy: 16, r: 12, a0: 0.5, a1: 1.7 });
  },
  ron_altum_custos: (p) => {
    spear(p, PAL.indigo, { vertical: true }); // raised blade
    badge(p, PAL.indigo, () => {
      p.thickLine(7, 22, 25, 22, PAL.indigo.shadow); // guard bar
    });
  },
  ron_quies_icta: (p) => {
    badge(p, PAL.indigo, () => {
      p.thickLine(6, 16, 26, 16, PAL.indigo.base); // single still cut
      p.line(6, 15, 26, 15, PAL.indigo.light);
      p.ellipse(16, 16, 2, 2, PAL.indigo.hi);
    });
    katana(p, PAL.indigo, { x0: 21, y0: 26, x1: 27, y1: 19 });
  },
  ron_arcus_gladii: (p) => {
    katana(p, PAL.indigo, { x0: 9, y0: 24, x1: 23, y1: 8 });
    slashArc(p, PAL.indigo, { cx: 13, cy: 20, r: 13, a0: -1.2, a1: 0.4 });
  },
  ron_finis: (p) => {
    katana(p, PAL.indigo, { x0: 12, y0: 24, x1: 22, y1: 10 });
    passiveRing(p);
  },
};

// ---------------------------------------------------------------- main
const catalog = JSON.parse(readFileSync(join(ROOT, "data/content/skills.json"), "utf8"));
// Accepts both the bare array export and the {data: [...]} wrapper.
const entries = Array.isArray(catalog) ? catalog : (catalog.data ?? []);
const catalogIds = entries.map((s) => s.id);
const extraIds = ["attack", "dodge", "capture"];
const ids = [...new Set([...catalogIds, ...extraIds])];
const missing = ids.filter((id) => !SPECS[id]);
const stray = Object.keys(SPECS).filter((id) => !ids.includes(id));
if (missing.length) {
  console.error("no painter for skills:", missing.join(", "));
  process.exit(1);
}
if (stray.length) console.warn("painters without a skill:", stray.join(", "));

mkdirSync(OUT_DIR, { recursive: true });
for (const id of ids) {
  const p = new Pix(SIZE, SIZE);
  SPECS[id](p);
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  p.blit(rgba);
  writeFileSync(join(OUT_DIR, `${id}.png`), encodePng(SIZE, SIZE, rgba));
}
console.log(`wrote ${ids.length} skill icons to ${OUT_DIR}`);

const manifest = `// Generated by scripts/gen-skill-icons.mjs — do not edit.
export const SKILL_ICON_IDS: ReadonlySet<string> = new Set(${JSON.stringify(ids)});
`;
writeFileSync(MANIFEST, manifest);
console.log(`wrote manifest ${MANIFEST}`);
