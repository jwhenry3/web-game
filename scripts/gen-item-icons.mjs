// Generates 32x32 pixel-art item icons into
// wails/frontend/public/assets/items/<key>.png plus a manifest
// (src/ui/itemIcons.gen.ts). Keys:
//   weapon-<type>            sword axe hammer spear katana staff wand dagger knuckles
//   armor-<slot>-<class>     head/chest/hands/legs/feet/back x heavy/medium/light
//   consumable-<id>          from data/content/items.json + legacy aliases
//   decor_<type>/craft_<type> per-item furniture & crafting art
//   kind-decoration, kind-material (generic fallbacks)
// Usage: node scripts/gen-item-icons.mjs
import zlib from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "wails/frontend/public/assets/items");
const MANIFEST = join(ROOT, "wails/frontend/src/ui/itemIcons.gen.ts");
const SIZE = 32;

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
  wood: { out: "#1c1208", shadow: "#5a4020", base: "#8a6838", light: "#b89058", hi: "#e0c088" },
  leather: { out: "#1c1008", shadow: "#6e4a24", base: "#a07440", light: "#c89860", hi: "#ecd0a0" },
  cloth: { out: "#1a2030", shadow: "#5a6480", base: "#9aa4c0", light: "#c8d0e4", hi: "#f0f4fc" },
  dark: { out: "#0c0c14", shadow: "#242430", base: "#3c3c4c", light: "#60607a", hi: "#9898b0" },
  blood: { out: "#200a0a", shadow: "#6e1a1a", base: "#a83232", light: "#d05848", hi: "#f09078" },
  indigo: { out: "#101224", shadow: "#3a4080", base: "#5c68c0", light: "#8894e0", hi: "#c0c8ff" },
  teal: { out: "#0a1e1e", shadow: "#1e5a5a", base: "#2e8a80", light: "#58b8a8", hi: "#a0e8d8" },
  portal: { out: "#160a28", shadow: "#3c2068", base: "#6840b8", light: "#9870e0", hi: "#d0b8ff" },
  hpRed: { out: "#28060a", shadow: "#7a1a22", base: "#c03434", light: "#e86050", hi: "#ffb0a0" },
  mpBlue: { out: "#081a28", shadow: "#1a4a70", base: "#2e86c8", light: "#5ab8f0", hi: "#c0ecff" },
  glass: { out: "#101820", shadow: "#3c4a54", base: "#6e8090", light: "#a8bcc8", hi: "#e8f4fa" },
};

// ---------------------------------------------------------------- weapons
function sword(p) {
  const pal = PAL.steel;
  p.begin();
  p.thickLine(9, 23, 23, 9, pal.base);
  p.line(10, 23, 24, 9, pal.light);
  p.px(24, 8, pal.hi);
  p.rect(5, 24, 7, 2, PAL.gold.base); // guard
  p.line(7, 27, 5, 29, PAL.wood.base); // grip
  p.px(4, 29, PAL.gold.base); // pommel
  p.end(pal.out);
}

function dagger(p) {
  const pal = PAL.steel;
  p.begin();
  p.thickLine(11, 22, 23, 9, pal.base);
  p.line(11, 21, 23, 8, pal.light);
  p.px(24, 8, pal.hi);
  p.rect(9, 22, 5, 1, PAL.gold.shadow); // guard
  p.line(10, 24, 8, 26, PAL.wood.shadow); // grip
  p.end(pal.out);
}

function axe(p) {
  const pal = PAL.steel;
  p.begin();
  p.line(11, 8, 22, 25, PAL.wood.base); // haft
  p.px(22, 26, PAL.wood.shadow);
  p.tri(10, 7, 6, 13, 14, 12, pal.base); // blade
  p.tri(7, 12, 10, 8, 12, 11, pal.light); // edge
  p.px(6, 12, pal.hi);
  p.end(pal.out);
}

function hammer(p) {
  const pal = PAL.steel;
  p.begin();
  p.line(11, 25, 20, 13, PAL.wood.base); // handle
  p.rect(16, 5, 10, 8, pal.base); // head
  p.rect(16, 5, 10, 2, pal.light);
  p.rect(24, 6, 2, 6, pal.shadow);
  p.px(10, 26, PAL.gold.base); // pommel
  p.end(pal.out);
}

function spear(p) {
  const pal = PAL.steel;
  p.begin();
  p.line(8, 26, 23, 8, PAL.wood.base);
  p.line(8, 27, 23, 9, PAL.wood.light);
  p.tri(25, 4, 22, 9, 26, 9, pal.base); // head
  p.px(25, 4, pal.hi);
  p.rect(20, 9, 4, 1, PAL.gold.shadow); // socket
  p.end(pal.out);
}

function katana(p) {
  const pal = PAL.steel;
  p.begin();
  p.curve(9, 24, 16, 16, 23, 9, pal.base);
  p.curve(10, 24, 17, 17, 24, 9, pal.light);
  p.px(23, 8, pal.hi);
  p.rect(6, 24, 5, 1, PAL.gold.base); // tsuba
  p.line(8, 26, 5, 29, PAL.wood.shadow); // wrapped grip
  p.end(pal.out);
}

function wand(p) {
  p.begin();
  p.line(9, 25, 21, 11, PAL.wood.base);
  p.ellipse(22, 10, 3, 3, PAL.portal.base); // focus orb
  p.px(21, 9, PAL.portal.hi);
  p.end(PAL.wood.out);
}

function staff(p) {
  p.begin();
  p.line(9, 27, 21, 7, PAL.wood.base);
  p.line(9, 28, 21, 8, PAL.wood.light);
  p.arc(22, 8, 4, -0.4, 2.8, PAL.gold.base); // head crook
  p.ellipse(22, 7, 2, 2, PAL.portal.light); // orb in crook
  p.px(21, 6, PAL.portal.hi);
  p.end(PAL.wood.out);
}

function knuckles(p) {
  const pal = PAL.steel;
  p.begin();
  p.rect(9, 15, 15, 5, pal.base); // bar
  p.rect(9, 15, 15, 1, pal.light);
  for (let i = 0; i < 4; i++) {
    p.ring(11 + i * 4, 12, 2, pal.base); // finger holes
    p.px(10 + i * 4, 11, pal.light);
  }
  p.rect(11, 20, 11, 3, PAL.leather.base); // grip wrap
  p.end(pal.out);
}

const WEAPONS = { sword, dagger, axe, hammer, spear, katana, wand, staff, knuckles };

// ---------------------------------------------------------------- armor
function helm(p) {
  const pal = PAL.steel;
  p.begin();
  p.ellipse(16, 14, 9, 8, pal.base); // dome
  p.rect(8, 15, 16, 6, pal.base); // skirt
  p.rect(11, 16, 10, 2, "#0c0c14"); // visor slit
  p.rect(9, 21, 14, 2, pal.shadow); // neck guard
  p.tri(16, 3, 13, 8, 19, 8, PAL.gold.base); // crest
  p.line(9, 12, 9, 19, pal.light);
  p.px(12, 9, pal.hi);
  p.end(pal.out);
}

function hood(p) {
  const pal = PAL.leather;
  p.begin();
  p.tri(16, 4, 7, 21, 25, 21, pal.base); // pointed hood
  p.ellipse(16, 18, 5, 4, "#0c0c14"); // face shadow
  p.px(15, 17, pal.hi); // nose hint
  p.rect(8, 21, 16, 4, pal.shadow); // shoulder drape
  p.line(11, 12, 9, 20, pal.light);
  p.end(pal.out);
}

function circlet(p) {
  const pal = PAL.gold;
  p.begin();
  p.arc(16, 20, 9, Math.PI + 0.15, Math.PI * 2 - 0.15, pal.base); // band
  p.arc(16, 20, 8, Math.PI + 0.2, Math.PI * 2 - 0.2, pal.light);
  p.tri(16, 11, 12, 16, 20, 16, pal.base); // brow point
  p.ellipse(16, 12, 3, 3, PAL.portal.base); // gem
  p.px(15, 11, PAL.portal.hi);
  p.end(pal.out);
}

function cuirass(p) {
  const pal = PAL.steel;
  p.begin();
  p.rect(9, 10, 14, 15, pal.base); // torso
  p.tri(9, 10, 16, 7, 23, 10, pal.light); // collar
  p.ellipse(8, 11, 3, 4, pal.base); // pauldrons
  p.ellipse(24, 11, 3, 4, pal.base);
  p.rect(10, 17, 12, 1, pal.shadow); // belly band
  p.line(16, 11, 16, 24, pal.shadow); // ridge
  p.px(12, 12, pal.hi);
  p.end(pal.out);
}

function vest(p) {
  const pal = PAL.leather;
  p.begin();
  p.rect(10, 9, 12, 15, pal.base);
  p.line(16, 10, 16, 24, "#0c0c14"); // open front
  p.rect(11, 12, 4, 2, pal.light); // straps
  p.rect(17, 12, 4, 2, pal.light);
  p.rect(11, 21, 10, 3, PAL.wood.shadow); // belt
  p.px(16, 22, PAL.gold.base); // buckle
  p.px(12, 10, pal.hi);
  p.end(pal.out);
}

function robe(p) {
  const pal = PAL.cloth;
  p.begin();
  p.tri(16, 6, 7, 26, 25, 26, pal.base); // gown
  p.rect(9, 9, 14, 3, pal.light); // shoulders
  p.line(16, 12, 16, 25, pal.shadow); // fold
  p.rect(11, 16, 10, 2, PAL.gold.base); // sash
  p.px(12, 14, pal.hi);
  p.end(pal.out);
}

function gauntlet(p) {
  const pal = PAL.steel;
  p.begin();
  p.rect(10, 11, 12, 9, pal.base); // hand
  for (let i = 0; i < 4; i++) p.rect(10 + i * 3, 8, 2, 3, pal.light); // knuckle plates
  p.rect(8, 13, 3, 5, pal.shadow); // thumb
  p.rect(10, 20, 11, 4, pal.shadow); // cuff
  p.rect(10, 20, 11, 1, pal.light);
  p.end(pal.out);
}

function bracer(p) {
  const pal = PAL.leather;
  p.begin();
  p.rect(11, 7, 10, 17, pal.base); // tall band
  p.rect(11, 7, 10, 3, pal.light); // rim
  p.rect(11, 12, 10, 1, PAL.wood.shadow); // straps
  p.rect(11, 18, 10, 1, PAL.wood.shadow);
  p.px(19, 12, PAL.gold.base); // buckles
  p.px(19, 18, PAL.gold.base);
  p.px(13, 9, pal.hi);
  p.end(pal.out);
}

function glove(p) {
  const pal = PAL.cloth;
  p.begin();
  p.ellipse(15, 15, 6, 5, pal.base); // palm
  for (let i = 0; i < 4; i++) p.rect(10 + i * 3, 8, 2, 5, pal.base); // fingers
  p.rect(9, 12, 2, 5, pal.shadow); // thumb
  p.rect(11, 20, 9, 4, pal.shadow); // cuff
  p.px(13, 13, pal.hi);
  p.end(pal.out);
}

function greaves(p) {
  const pal = PAL.steel;
  p.begin();
  for (const lx of [10, 18]) {
    p.rect(lx, 7, 4, 14, pal.base); // leg plate
    p.ellipse(lx + 2, 13, 2, 2, pal.light); // knee
    p.rect(lx, 21, 5, 3, pal.shadow); // foot
    p.px(lx, 8, pal.hi);
  }
  p.end(pal.out);
}

function chausses(p) {
  const pal = PAL.leather;
  p.begin();
  p.rect(10, 7, 12, 5, pal.base); // hips
  p.rect(10, 7, 12, 1, PAL.gold.base); // belt
  p.rect(11, 12, 4, 12, pal.base); // legs
  p.rect(17, 12, 4, 12, pal.base);
  p.line(15, 12, 15, 24, pal.shadow);
  p.rect(11, 24, 4, 2, pal.shadow); // cuffs
  p.rect(17, 24, 4, 2, pal.shadow);
  p.px(12, 8, pal.hi);
  p.end(pal.out);
}

function leggings(p) {
  const pal = PAL.cloth;
  p.begin();
  p.rect(11, 7, 10, 4, pal.base); // waist
  p.rect(11, 7, 10, 2, PAL.gold.base); // sash
  p.rect(11, 11, 4, 14, pal.base); // slim legs
  p.rect(17, 11, 4, 14, pal.base);
  p.line(16, 12, 16, 24, pal.shadow);
  p.rect(11, 25, 4, 2, pal.light); // hems
  p.rect(17, 25, 4, 2, pal.light);
  p.end(pal.out);
}

function sabatons(p) {
  const pal = PAL.steel;
  p.begin();
  for (const bx of [7, 18]) {
    p.rect(bx, 11, 6, 9, pal.base); // shaft
    p.tri(bx, 20, bx + 6, 20, bx + 8, 25, pal.base); // pointed toe
    p.rect(bx, 11, 6, 2, pal.light); // rim
    p.px(bx + 6, 24, pal.hi);
  }
  p.end(pal.out);
}

function boots(p) {
  const pal = PAL.leather;
  p.begin();
  for (const bx of [8, 18]) {
    p.rect(bx, 10, 5, 9, pal.base); // shaft
    p.rect(bx, 18, 8, 4, pal.base); // foot
    p.rect(bx, 21, 9, 2, pal.shadow); // sole
    p.rect(bx, 10, 5, 2, pal.light); // cuff
  }
  p.end(pal.out);
}

function shoes(p) {
  const pal = PAL.cloth;
  p.begin();
  for (const bx of [7, 18]) {
    p.ellipse(bx + 4, 20, 6, 4, pal.base); // low shoe
    p.rect(bx + 1, 15, 5, 3, pal.shadow); // ankle strap
    p.px(bx + 6, 18, pal.hi);
  }
  p.end(pal.out);
}

function greatcloak(p) {
  const pal = PAL.dark;
  p.begin();
  p.tri(16, 6, 5, 27, 27, 27, pal.base); // full cloak
  p.rect(10, 5, 12, 4, PAL.cloth.light); // fur collar
  p.line(16, 9, 16, 26, pal.shadow); // fold
  p.line(10, 14, 8, 26, pal.shadow);
  p.px(13, 6, PAL.cloth.hi);
  p.end(pal.out);
}

function mantle(p) {
  const pal = PAL.leather;
  p.begin();
  p.arc(16, 12, 9, Math.PI, Math.PI * 2, pal.base); // shoulder cape
  p.rect(7, 12, 18, 7, pal.base); // short drape
  p.rect(7, 19, 18, 2, pal.shadow); // hem
  p.rect(10, 9, 12, 3, pal.light); // collar
  p.end(pal.out);
}

function cape(p) {
  const pal = PAL.cloth;
  p.begin();
  p.curve(11, 8, 8, 18, 10, 27, pal.base); // flowing left edge
  p.curve(21, 8, 24, 18, 22, 27, pal.base); // right edge
  p.rect(11, 8, 10, 3, pal.base); // neck band
  p.curve(13, 12, 12, 19, 13, 26, pal.shadow); // folds
  p.curve(19, 12, 20, 19, 19, 26, pal.shadow);
  p.px(16, 9, PAL.gold.base); // clasp
  p.end(pal.out);
}

const ARMOR = {
  head: { heavy: helm, medium: hood, light: circlet },
  chest: { heavy: cuirass, medium: vest, light: robe },
  hands: { heavy: gauntlet, medium: bracer, light: glove },
  legs: { heavy: greaves, medium: chausses, light: leggings },
  feet: { heavy: sabatons, medium: boots, light: shoes },
  back: { heavy: greatcloak, medium: mantle, light: cape },
};

// ---------------------------------------------------------------- consumables
function flask(p, liquid, { cx = 16, cy = 18, big = false } = {}) {
  const g = PAL.glass;
  p.begin();
  // body
  p.ellipse(cx, cy + 3, big ? 8 : 7, big ? 7 : 6, g.base);
  // liquid fill (lower 2/3)
  p.ellipse(cx, cy + 5, big ? 6 : 5, big ? 5 : 4, liquid.base);
  p.rect(cx - (big ? 6 : 5), cy + 4, big ? 12 : 10, big ? 4 : 3, liquid.base);
  p.px(cx - 2, cy + 4, liquid.light);
  // neck + cork
  p.rect(cx - 2, cy - (big ? 7 : 6), 4, 7, g.light);
  p.rect(cx - 3, cy - (big ? 10 : 9), 6, 3, PAL.wood.base);
  // glass highlight
  p.arc(cx, cy + 3, big ? 7 : 6, Math.PI * 0.7, Math.PI * 1.15, g.hi);
  // bubbles
  p.px(cx + 2, cy + 5, liquid.hi);
  p.px(cx - 1, cy + 7, liquid.hi);
  p.end(liquid.out);
}

function etherFlask(p, liquid) {
  flask(p, liquid, { cx: 15, cy: 18 });
  p.begin();
  p.tri(23, 5, 24, 8, 21, 8, PAL.mpBlue.hi); // sparkle
  p.tri(23, 11, 24, 8, 21, 8, PAL.mpBlue.light);
  p.end(PAL.mpBlue.out);
}

const CONSUMABLE_PAINTERS = {
  // catalog ids
  potio: (p) => flask(p, PAL.hpRed),
  potio_maior: (p) => {
    flask(p, PAL.hpRed, { cx: 16, cy: 18, big: true });
    p.begin();
    p.rect(12, 15, 8, 1, PAL.gold.base); // gold band
    p.end(PAL.gold.out);
  },
  aether: (p) => etherFlask(p, PAL.mpBlue),
  // legacy aliases
  potion: (p) => flask(p, PAL.hpRed),
  hi_potion: (p) => {
    flask(p, PAL.hpRed, { cx: 16, cy: 18, big: true });
    p.begin();
    p.rect(12, 15, 8, 1, PAL.gold.base);
    p.end(PAL.gold.out);
  },
  ether: (p) => etherFlask(p, PAL.mpBlue),
};

// ---------------------------------------------------------------- decor/craft
function wovenRug(p) {
  const pal = PAL.blood;
  p.begin();
  p.rect(8, 11, 16, 11, pal.base); // body
  p.rect(8, 11, 16, 2, PAL.gold.shadow); // border stripes
  p.rect(8, 20, 16, 2, PAL.gold.shadow);
  p.tri(16, 13, 11, 16, 16, 19, PAL.gold.base); // center diamond
  p.tri(16, 13, 21, 16, 16, 19, PAL.gold.base);
  p.rect(14, 15, 4, 3, pal.light);
  for (let x = 9; x <= 23; x += 2) { // fringe
    p.px(x, 9, pal.light);
    p.px(x, 10, pal.shadow);
    p.px(x, 23, pal.shadow);
    p.px(x, 24, pal.light);
  }
  p.end(pal.out);
}

function oilLamp(p) {
  const pal = PAL.gold;
  p.begin();
  p.ellipse(15, 20, 8, 6, pal.base); // body
  p.ellipse(15, 20, 5, 3, pal.shadow); // belly shading
  p.tri(21, 17, 28, 14, 23, 21, pal.base); // spout
  p.arc(9, 18, 4, Math.PI * 0.4, Math.PI * 1.6, pal.base); // handle
  p.ellipse(15, 14, 3, 2, pal.light); // lid
  p.px(15, 12, pal.hi); // knob
  p.px(27, 11, "#f0a030"); // flame
  p.px(27, 10, "#ffd870");
  p.px(12, 17, pal.hi);
  p.end(pal.out);
}

function storageCrate(p) {
  const pal = PAL.wood;
  p.begin();
  p.rect(7, 9, 18, 17, pal.base); // box
  p.rect(7, 9, 18, 2, pal.light); // lid edge
  p.line(8, 12, 24, 25, pal.shadow); // X braces
  p.line(24, 12, 8, 25, pal.shadow);
  p.rect(7, 15, 18, 1, pal.shadow); // plank seam
  p.rect(7, 21, 18, 1, pal.shadow);
  for (const [nx, ny] of [[8, 10], [23, 10], [8, 24], [23, 24]]) p.px(nx, ny, pal.out); // nails
  p.end(pal.out);
}

function lumber(p) {
  const pal = PAL.wood;
  p.begin();
  // stacked logs with end-grain rings
  p.rect(9, 19, 16, 4, pal.base);
  p.ellipse(9, 21, 2, 2, pal.light);
  p.ring(9, 21, 1, pal.shadow);
  p.rect(7, 14, 16, 4, pal.light);
  p.ellipse(7, 16, 2, 2, pal.base);
  p.ring(7, 16, 1, pal.shadow);
  p.rect(10, 9, 14, 4, pal.base);
  p.ellipse(10, 11, 2, 2, pal.light);
  p.ring(10, 11, 1, pal.shadow);
  p.end(pal.out);
}

function clothScrap(p) {
  const pal = PAL.cloth;
  p.begin();
  p.tri(8, 9, 25, 10, 23, 24, pal.base); // folded scrap
  p.tri(8, 9, 23, 24, 9, 23, pal.base);
  p.curve(8, 9, 14, 13, 25, 10, pal.light); // fold ridge
  p.curve(11, 14, 16, 17, 23, 15, pal.shadow); // wrinkles
  p.curve(10, 19, 15, 21, 22, 19, pal.shadow);
  for (let x = 10; x <= 22; x += 3) p.px(x, 23, pal.hi); // stitch dots
  p.end(pal.out);
}

function ironNail(p) {
  const pal = PAL.steel;
  p.begin();
  // three nails at slight angles
  p.rect(9, 7, 5, 2, pal.light); // heads
  p.tri(11, 9, 10, 22, 13, 22, pal.base);
  p.rect(15, 9, 5, 2, pal.light);
  p.tri(17, 11, 16, 24, 19, 24, pal.base);
  p.rect(21, 7, 5, 2, pal.light);
  p.tri(23, 9, 22, 22, 25, 22, pal.base);
  p.px(11, 12, pal.hi);
  p.px(17, 14, pal.hi);
  p.end(pal.out);
}

const DECOR_CRAFT = {
  decor_woven_rug: wovenRug,
  decor_oil_lamp: oilLamp,
  decor_storage_crate: storageCrate,
  craft_lumber: lumber,
  craft_cloth_scrap: clothScrap,
  craft_iron_nail: ironNail,
};

// ---------------------------------------------------------------- misc kinds
function decoration(p) {
  const pal = PAL.wood;
  p.begin();
  p.rect(11, 6, 8, 10, pal.base); // chair back
  p.rect(11, 6, 8, 2, pal.light);
  p.rect(9, 16, 14, 4, pal.base); // seat
  p.rect(10, 20, 2, 7, pal.shadow); // legs
  p.rect(20, 20, 2, 7, pal.shadow);
  p.end(pal.out);
}

function material(p) {
  const pal = PAL.portal;
  p.begin();
  p.tri(16, 6, 8, 14, 24, 14, pal.light); // table
  p.tri(8, 14, 16, 27, 24, 14, pal.base); // pavilion
  p.line(12, 14, 16, 26, pal.shadow); // facets
  p.line(20, 14, 16, 26, pal.shadow);
  p.line(16, 7, 16, 13, pal.hi);
  p.px(11, 12, pal.hi);
  p.end(pal.out);
}

// ---------------------------------------------------------------- main
const specs = {};
for (const [type, fn] of Object.entries(WEAPONS)) specs[`weapon-${type}`] = fn;
for (const [slot, classes] of Object.entries(ARMOR)) {
  for (const [cls, fn] of Object.entries(classes)) specs[`armor-${slot}-${cls}`] = fn;
}
for (const [id, fn] of Object.entries(CONSUMABLE_PAINTERS)) specs[`consumable-${id}`] = fn;
for (const [type, fn] of Object.entries(DECOR_CRAFT)) specs[type] = fn;
specs["kind-decoration"] = decoration;
specs["kind-material"] = material;

// Surface any catalog consumable ids that lack a painter.
const catalog = JSON.parse(readFileSync(join(ROOT, "data/content/items.json"), "utf8"));
const entries = Array.isArray(catalog) ? catalog : (catalog.data ?? []);
const catalogConsumables = entries.filter((i) => i.kind === "consumable").map((i) => i.id);
const missing = catalogConsumables.filter((id) => !specs[`consumable-${id}`]);
if (missing.length) {
  console.error("no painter for consumables:", missing.join(", "));
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const ids = Object.keys(specs);
for (const id of ids) {
  const p = new Pix(SIZE, SIZE);
  specs[id](p);
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  p.blit(rgba);
  writeFileSync(join(OUT_DIR, `${id}.png`), encodePng(SIZE, SIZE, rgba));
}
console.log(`wrote ${ids.length} item icons to ${OUT_DIR}`);

const manifest = `// Generated by scripts/gen-item-icons.mjs — do not edit.
export const ITEM_ICON_IDS: ReadonlySet<string> = new Set(${JSON.stringify(ids.sort())});
`;
writeFileSync(MANIFEST, manifest);
console.log(`wrote manifest ${MANIFEST}`);
