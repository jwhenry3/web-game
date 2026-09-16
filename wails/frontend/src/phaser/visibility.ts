import Phaser from "phaser";

/**
 * Line-of-sight visibility for tile maps: per-tile LOS raycast + a camera
 * PostFX (custom render node) that blurs/dims pixels whose world position is
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
  const { cols, rows, tileSize, originX, originY } = grid;
  const out = new Float32Array(cols * rows);
  const pc = Math.floor((wx - originX) / tileSize);
  const pr = Math.floor((wy - originY) / tileSize);
  const unlimited = radiusTiles <= 0;
  const r = unlimited ? Math.max(cols, rows) : Math.ceil(radiusTiles);
  for (let tr = Math.max(0, pr - r); tr <= Math.min(rows - 1, pr + r); tr++) {
    for (let tc = Math.max(0, pc - r); tc <= Math.min(cols - 1, pc + r); tc++) {
      const dx = tc - pc;
      const dy = tr - pr;
      const d = Math.hypot(dx, dy);
      if (!unlimited && d > radiusTiles) continue;
      if (!lineVisible(grid, pc, pr, tc, tr)) continue;
      out[tr * cols + tc] = unlimited ? 1 : Math.min(1, Math.max(0, (radiusTiles - d) / 1.5));
    }
  }
  if (pc >= 0 && pr >= 0 && pc < cols && pr < rows) out[pr * cols + pc] = 1;
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
  "uniform vec2 uBlur;",       // max blur radius in texture-UV units
  "uniform float uDim;",       // darken strength 0..1
  "uniform float uEnabled;",
  "varying vec2 outTexCoord;",
  "void main ()",
  "{",
  "    vec4 sharp = texture2D(uMainSampler, outTexCoord);",
  "    float vis = 1.0;",
  "    if (uEnabled > 0.5)",
  "    {",
  "        vec2 worldPos = uWorldView.xy + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uWorldView.zw;",
  // Mask canvas uploads with UNPACK_FLIP_Y (row 0 -> v=1), so flip Y here.
  "        vec2 muv = vec2((worldPos.x - uMaskOrigin.x) / uMaskSize.x, 1.0 - (worldPos.y - uMaskOrigin.y) / uMaskSize.y);",
  "        if (muv.x < 0.0 || muv.x > 1.0 || muv.y < 0.0 || muv.y > 1.0) vis = 0.0;",
  "        else vis = texture2D(uMask, muv).r;",
  "    }",
  "    float occ = 1.0 - vis;",
  "    if (occ <= 0.001)",
  "    {",
  "        gl_FragColor = sharp;",
  "        return;",
  "    }",
  "    vec2 rad = uBlur * occ;",
  "    vec4 sum = sharp;",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2( rad.x, 0.0));",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2(-rad.x, 0.0));",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2(0.0,  rad.y));",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2(0.0, -rad.y));",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2( rad.x,  rad.y) * 0.7);",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2(-rad.x,  rad.y) * 0.7);",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2( rad.x, -rad.y) * 0.7);",
  "    sum += texture2D(uMainSampler, outTexCoord + vec2(-rad.x, -rad.y) * 0.7);",
  "    vec4 col = mix(sharp, sum / 9.0, min(1.0, occ * 1.5));",
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
    setupUniforms: function (this: any, controller: any, drawingContext: any) {
      const pm = this.programManager;
      const wv = controller.camera.worldView;
      pm.setUniform("uMask", 1);
      pm.setUniform("uWorldView", [wv.x, wv.y, wv.width, wv.height]);
      pm.setUniform("uMaskOrigin", controller.losOrigin);
      pm.setUniform("uMaskSize", controller.losSize);
      pm.setUniform("uBlur", [
        controller.losBlurPx / drawingContext.width,
        controller.losBlurPx / drawingContext.height,
      ]);
      pm.setUniform("uDim", controller.losDim);
      pm.setUniform("uEnabled", controller.losMask ? 1 : 0);
    },
  });
  renderer.renderNodes.addNode(NODE_NAME, new node(renderer.renderNodes));
  registered.add(renderer);
  return true;
}

export interface VisibilityFXOptions {
  /** Sight radius in tiles; <= 0 for unlimited (occlusion only). */
  radiusTiles?: number;
  /** Max blur radius in screen px for fully occluded areas. */
  blurPx?: number;
  /** Darken strength 0..1 for fully occluded areas. */
  dim?: number;
}

/**
 * Camera-level visibility filter + mask texture for one scene.
 * Call setGrid when the map layout is known and update(playerX, playerY)
 * each frame; the mask only re-renders when the player crosses a tile.
 */
export class VisibilityFX {
  private scene: Phaser.Scene;
  private ctrl: any = null;
  private grid: VisibilityGrid | null = null;
  private radiusTiles: number;
  private texKey: string;
  private maskTex?: Phaser.Textures.CanvasTexture;
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
    ctrl.losBlurPx = opts.blurPx ?? 7;
    ctrl.losDim = opts.dim ?? 0.85;
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
      return;
    }
    this.maskTex = this.scene.textures.createCanvas(this.texKey, grid.cols, grid.rows) ?? undefined;
    this.maskTex?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.ctrl.losOrigin = [grid.originX, grid.originY];
    this.ctrl.losSize = [grid.cols * grid.tileSize, grid.rows * grid.tileSize];
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
    const mask = computeVisibility(grid, wx, wy, this.radiusTiles);
    const ctx = tex.context;
    const img = ctx.createImageData(grid.cols, grid.rows);
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
