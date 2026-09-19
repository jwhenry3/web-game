import Phaser from "phaser";

/**
 * Line-of-sight visibility for tile maps: per-tile LOS raycast + a camera
 * PostFX (custom render node) that dims pixels whose world position is
 * outside the visible mask. Applies to everything the camera draws — terrain,
 * entities, markers — but not DOM overlays.
 */

export interface VisibilityGrid {
  /** Per-cell flags; nonzero occludes sight. */
  blocked: ArrayLike<number>;
  cols: number;
  rows: number;
  tileSize: number;
  /** World-space origin of cell (0,0). */
  originX: number;
  originY: number;
}

/** True when the ray between cell centres hits no occluder before the target. */
function lineVisible(grid: VisibilityGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let first = true;
  // The target cell is checked before its occluder flag, so the first wall
  // along a ray stays visible — you can see the wall face, not past it.
  while (true) {
    if (x === x1 && y === y1) return true;
    if (!first && grid.blocked[y * grid.cols + x]) return false;
    first = false;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Per-tile visibility mask (0..1) around the viewer at (wx, wy) world coords.
 * radiusTiles <= 0 means no range falloff — only occlusion dims tiles.
 */
export function computeVisibility(
  grid: VisibilityGrid,
  wx: number,
  wy: number,
  radiusTiles: number,
): Float32Array {
  return computeVisibilityWindow(grid, wx, wy, radiusTiles, 0, 0, grid.cols, grid.rows);
}

/**
 * Windowed variant: returns a w×h mask covering tiles [c0,c0+w)×[r0,r0+h).
 * Cells outside the grid stay 0 (occluded). World-scale maps rasterize the
 * mask per window — a full-map mask would cost megabytes per tile step.
 */
function computeVisibilityWindow(
  grid: VisibilityGrid,
  wx: number,
  wy: number,
  radiusTiles: number,
  c0: number,
  r0: number,
  w: number,
  h: number,
): Float32Array {
  const { cols, rows, tileSize, originX, originY } = grid;
  const out = new Float32Array(w * h);
  const pc = Math.floor((wx - originX) / tileSize);
  const pr = Math.floor((wy - originY) / tileSize);
  const unlimited = radiusTiles <= 0;
  const r = unlimited ? Math.max(w, h) : Math.ceil(radiusTiles);
  const tr0 = Math.max(0, pr - r, r0);
  const tr1 = Math.min(rows - 1, pr + r, r0 + h - 1);
  const tc0 = Math.max(0, pc - r, c0);
  const tc1 = Math.min(cols - 1, pc + r, c0 + w - 1);
  for (let tr = tr0; tr <= tr1; tr++) {
    for (let tc = tc0; tc <= tc1; tc++) {
      const dx = tc - pc;
      const dy = tr - pr;
      const d = Math.hypot(dx, dy);
      if (!unlimited && d > radiusTiles) continue;
      if (!lineVisible(grid, pc, pr, tc, tr)) continue;
      out[(tr - r0) * w + (tc - c0)] = unlimited
        ? 1
        : Math.min(1, Math.max(0, (radiusTiles - d) / 1.5));
    }
  }
  if (pc >= c0 && pr >= r0 && pc < c0 + w && pr < r0 + h && pc < cols && pr < rows) {
    out[(pr - r0) * w + (pc - c0)] = 1;
  }
  return out;
}

const NODE_NAME = "FilterVisibilityLOS";

const FRAG = [
  "#pragma phaserTemplate(shaderName)",
  "precision mediump float;",
  "uniform sampler2D uMainSampler;",
  "uniform sampler2D uMask;",
  "uniform vec4 uWorldView;",   // camera worldView: x, y, w, h in world px
  "uniform vec2 uMaskOrigin;", // world px origin of the mask
  "uniform vec2 uMaskSize;",   // world px size covered by the mask
  "uniform float uDim;",       // darken strength 0..1
  "uniform float uEnabled;",
  "uniform float uIso;",       // 1 = camera space is isometric projection
  "varying vec2 outTexCoord;",
  "void main ()",
  "{",
  "    vec4 col = texture2D(uMainSampler, outTexCoord);",
  "    float vis = 1.0;",
  "    if (uEnabled > 0.5)",
  "    {",
  "        vec2 worldPos = uWorldView.xy + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uWorldView.zw;",
  // Iso scenes render the world through Iso = (x−y, (x+y)/2); unproject the
  // screen position back to tile space before sampling the LOS mask.
  "        if (uIso > 0.5)",
  "        {",
  "            worldPos = vec2(worldPos.x * 0.5 + worldPos.y, worldPos.y - worldPos.x * 0.5);",
  "        }",
  // Mask canvas uploads with UNPACK_FLIP_Y (row 0 -> v=1), so flip Y here.
  "        vec2 muv = vec2((worldPos.x - uMaskOrigin.x) / uMaskSize.x, 1.0 - (worldPos.y - uMaskOrigin.y) / uMaskSize.y);",
  "        if (muv.x < 0.0 || muv.x > 1.0 || muv.y < 0.0 || muv.y > 1.0) vis = 0.0;",
  "        else vis = texture2D(uMask, muv).r;",
  "    }",
  "    float occ = 1.0 - vis;",
  "    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));",
  "    col.rgb = mix(col.rgb, vec3(gray) * 0.3, occ * uDim);",
  "    gl_FragColor = col;",
  "}",
].join("\n");

const registered = new WeakSet<object>();

/** Register the custom render node once per renderer. */
function ensureVisibilityNode(renderer: any): boolean {
  if (registered.has(renderer)) return true;
  const BaseFilterShader = (Phaser as any).Renderer?.WebGL?.RenderNodes?.BaseFilterShader;
  const Class = (Phaser as any).Class;
  if (!BaseFilterShader || !Class || !renderer?.renderNodes) return false;
  const node = Class({
    Extends: BaseFilterShader,
    initialize: function VisibilityLOSNode(this: any, manager: any) {
      BaseFilterShader.call(this, NODE_NAME, manager, null, FRAG);
    },
    setupTextures: function (this: any, controller: any, textures: any[]) {
      textures[1] = controller.losMask ?? controller.losWhite;
    },
    setupUniforms: function (this: any, controller: any, _drawingContext: any) {
      const pm = this.programManager;
      const wv = controller.camera.worldView;
      pm.setUniform("uMask", 1);
      pm.setUniform("uWorldView", [wv.x, wv.y, wv.width, wv.height]);
      pm.setUniform("uMaskOrigin", controller.losOrigin);
      pm.setUniform("uMaskSize", controller.losSize);
      pm.setUniform("uDim", controller.losDim);
      pm.setUniform("uEnabled", controller.losMask ? 1 : 0);
      pm.setUniform("uIso", controller.losIso ?? 0);
    },
  });
  renderer.renderNodes.addNode(NODE_NAME, new node(renderer.renderNodes));
  registered.add(renderer);
  return true;
}

export interface VisibilityFXOptions {
  /** Sight radius in tiles; <= 0 for unlimited (occlusion only). */
  radiusTiles?: number;
  /** Darken strength 0..1 for fully occluded areas. */
  dim?: number;
  /** True when the scene renders isometrically — the shader unprojects. */
  iso?: boolean;
}

/**
 * Camera-level visibility filter + mask texture for one scene.
 * Call setGrid when the map layout is known and update(playerX, playerY)
 * each frame; the mask only re-renders when the player crosses a tile.
 */
/** Extra tiles of mask margin beyond the sight radius on each side. */
const MASK_PAD_TILES = 3;

export class VisibilityFX {
  private scene: Phaser.Scene;
  private ctrl: any = null;
  private grid: VisibilityGrid | null = null;
  private radiusTiles: number;
  private texKey: string;
  private maskTex?: Phaser.Textures.CanvasTexture;
  /** Side length of the mask texture in tiles — a window, not the whole map. */
  private maskTiles = 0;
  private lastCX = Number.NaN;
  private lastCY = Number.NaN;

  constructor(scene: Phaser.Scene, opts: VisibilityFXOptions = {}) {
    this.scene = scene;
    this.radiusTiles = opts.radiusTiles ?? 20;
    this.texKey = `los-mask-${scene.scene.key}`;
    if (!ensureVisibilityNode(scene.renderer)) return;
    const ctrl = new Phaser.Filters.Controller(scene.cameras.main, NODE_NAME) as any;
    ctrl.losMask = null;
    ctrl.losWhite = scene.textures.getFrame("__WHITE")?.glTexture ?? null;
    ctrl.losOrigin = [0, 0];
    ctrl.losSize = [1, 1];
    ctrl.losDim = opts.dim ?? 0.85;
    ctrl.losIso = opts.iso ? 1 : 0;
    this.ctrl = ctrl;
    scene.cameras.main.filters.external.add(ctrl);
  }

  /** Swap the occluder grid; null disables the effect (shader passthrough). */
  setGrid(grid: VisibilityGrid | null) {
    this.grid = grid;
    this.lastCX = Number.NaN;
    this.lastCY = Number.NaN;
    if (!this.ctrl) return;
    if (this.maskTex) {
      if (this.scene.textures.exists(this.texKey)) this.scene.textures.remove(this.texKey);
      this.maskTex = undefined;
    }
    if (!grid) {
      this.ctrl.losMask = null;
      this.maskTiles = 0;
      return;
    }
    // Ranged sight only needs a window around the viewer; unlimited sight
    // (interiors) covers the whole map — those grids are small.
    this.maskTiles =
      this.radiusTiles > 0
        ? Math.min(
            Math.max(grid.cols, grid.rows),
            (Math.ceil(this.radiusTiles) + MASK_PAD_TILES) * 2,
          )
        : Math.max(grid.cols, grid.rows);
    this.maskTex =
      this.scene.textures.createCanvas(this.texKey, this.maskTiles, this.maskTiles) ?? undefined;
    this.maskTex?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.ctrl.losOrigin = [grid.originX, grid.originY];
    this.ctrl.losSize = [this.maskTiles * grid.tileSize, this.maskTiles * grid.tileSize];
    this.ctrl.losMask = this.maskTex
      ? this.scene.textures.getFrame(this.texKey).glTexture
      : null;
    // Static grids (no range falloff) never change with position — paint now.
    if (this.radiusTiles <= 0) {
      this.update(
        grid.originX + (grid.cols * grid.tileSize) / 2,
        grid.originY + (grid.rows * grid.tileSize) / 2,
      );
    }
  }

  /** Re-render the mask when the viewer crosses a tile boundary. */
  update(wx: number, wy: number) {
    const grid = this.grid;
    const tex = this.maskTex;
    if (!grid || !tex) return;
    const cx = Math.floor((wx - grid.originX) / grid.tileSize);
    const cy = Math.floor((wy - grid.originY) / grid.tileSize);
    if (cx === this.lastCX && cy === this.lastCY) return;
    this.lastCX = cx;
    this.lastCY = cy;

    const side = this.maskTiles;
    const w0c = Math.min(Math.max(0, cx - (side >> 1)), Math.max(0, grid.cols - side));
    const w0r = Math.min(Math.max(0, cy - (side >> 1)), Math.max(0, grid.rows - side));
    const mask = computeVisibilityWindow(grid, wx, wy, this.radiusTiles, w0c, w0r, side, side);
    const ctx = tex.context;
    const img = ctx.createImageData(side, side);
    const px = img.data;
    for (let i = 0; i < mask.length; i++) {
      const v = Math.round(mask[i] * 255);
      px[i * 4] = v;
      px[i * 4 + 1] = v;
      px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    this.ctrl.losOrigin = [grid.originX + w0c * grid.tileSize, grid.originY + w0r * grid.tileSize];
    this.ctrl.losSize = [side * grid.tileSize, side * grid.tileSize];
  }

  /** Force the mask to recompute on the next update() call. */
  invalidate() {
    this.lastCX = Number.NaN;
    this.lastCY = Number.NaN;
  }

  destroy() {
    if (this.ctrl) {
      // During scene.stop() the camera may already be torn down.
      this.scene.cameras?.main?.filters?.external?.remove(this.ctrl);
      this.ctrl = null;
    }
    if (this.scene.textures?.exists(this.texKey)) this.scene.textures.remove(this.texKey);
    this.maskTex = undefined;
    this.grid = null;
  }
}
