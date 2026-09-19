// Debug gizmo: draws each entity's collision footprint on the ground plane,
// plus a tint over unwalkable terrain cells.
//
// Player bounds are the feet-centered circle slideMovePlayer checks against
// terrain (H99_COLLISION_RADIUS) — drawn in the iso layer it renders as a
// ground-plane ellipse. NPCs collide as points against terrain but keep a
// body radius for separation and melee — the server's enemyRadiusW.

import type Phaser from "phaser";
import { H99_COLLISION_RADIUS } from "../../characters/heroes99";
import { isoParent } from "../../world/iso";

/** NPC body radius — mirrors server `enemyRadiusW` (internal/server/combat.go). */
export const NPC_COLLISION_RADIUS = 20;

const SELF_COLOR = 0x6cf06c;
const PLAYER_COLOR = 0x5ac8f0;
const NPC_COLOR = 0xf07050;
const PET_COLOR = 0xf0d060;
const BLOCKED_COLOR = 0xe04040;

export type CollisionGizmoRole = "player" | "npc" | "pet";

export interface CollisionGizmoEntry {
  /** Entity world position (feet). */
  x: number;
  y: number;
  role: CollisionGizmoRole;
  isSelf?: boolean;
}

/** Per-cell walkability grid — nonzero entries are unwalkable. */
export interface CollisionGridView {
  blocked: ArrayLike<number>;
  cols: number;
  rows: number;
  tileSize: number;
  originX: number;
  originY: number;
}

/**
 * Scene-level debug graphics redrawn each frame: blocked cells inside the
 * camera window (cached per cell-snapped window) and entity bounds on top.
 */
export class CollisionGizmo {
  private gfx?: Phaser.GameObjects.Graphics;
  private tilesGfx?: Phaser.GameObjects.Graphics;
  private grid: CollisionGridView | null = null;
  private tilesKey = "";

  constructor(private readonly scene: Phaser.Scene) {}

  /** Set the unwalkable-cell grid (identity-checked — safe to call per frame). */
  setGrid(grid: CollisionGridView | null) {
    if (grid === this.grid) return;
    this.grid = grid;
    this.tilesKey = "";
  }

  /**
   * Tint blocked cells inside a world-space window. The window snaps to whole
   * cells and the result is cached, so this is cheap to call every frame.
   * With no window the whole grid is drawn (small interiors).
   */
  updateTiles(minX = -Infinity, minY = -Infinity, maxX = Infinity, maxY = Infinity) {
    const grid = this.grid;
    if (!grid) {
      this.tilesGfx?.clear();
      this.tilesKey = "";
      return;
    }
    const t = grid.tileSize;
    const c0 = Math.max(0, Math.floor((minX - grid.originX) / t) - 1);
    const r0 = Math.max(0, Math.floor((minY - grid.originY) / t) - 1);
    const c1 = Math.min(grid.cols - 1, Math.ceil((maxX - grid.originX) / t));
    const r1 = Math.min(grid.rows - 1, Math.ceil((maxY - grid.originY) / t));
    if (c1 < c0 || r1 < r0) {
      this.tilesGfx?.clear();
      this.tilesKey = "off";
      return;
    }
    const key = `${c0},${r0},${c1},${r1}`;
    if (key === this.tilesKey) return;
    this.tilesKey = key;

    const g = this.ensureTiles();
    g.clear();
    g.fillStyle(BLOCKED_COLOR, 0.22);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!grid.blocked[r * grid.cols + c]) continue;
        g.fillRect(grid.originX + c * t, grid.originY + r * t, t, t);
      }
    }
  }

  draw(entries: Iterable<CollisionGizmoEntry>) {
    const g = this.ensure();
    g.clear();
    for (const e of entries) {
      const color =
        e.role === "player"
          ? e.isSelf
            ? SELF_COLOR
            : PLAYER_COLOR
          : e.role === "pet"
            ? PET_COLOR
            : NPC_COLOR;
      g.lineStyle(1.5, color, 0.9);
      if (e.role === "player") {
        g.strokeCircle(e.x, e.y, H99_COLLISION_RADIUS);
      } else {
        g.strokeCircle(e.x, e.y, NPC_COLLISION_RADIUS);
      }
      // Origin marker — the world point the bounds anchor to.
      g.fillStyle(color, 0.85);
      g.fillCircle(e.x, e.y, 1.8);
    }
  }

  clear() {
    this.gfx?.clear();
    this.tilesGfx?.clear();
    this.tilesKey = "";
  }

  destroy() {
    this.gfx?.destroy();
    this.gfx = undefined;
    this.tilesGfx?.destroy();
    this.tilesGfx = undefined;
    this.grid = null;
    this.tilesKey = "";
  }

  private ensureTiles(): Phaser.GameObjects.Graphics {
    if (!this.tilesGfx) {
      const g = this.scene.add.graphics().setDepth(1e6 - 1);
      isoParent(this.scene, g);
      this.tilesGfx = g;
    }
    return this.tilesGfx;
  }

  private ensure(): Phaser.GameObjects.Graphics {
    if (!this.gfx) {
      // High depth keeps the gizmo above depth-sorted actors and props.
      const g = this.scene.add.graphics().setDepth(1e6);
      isoParent(this.scene, g);
      this.gfx = g;
    }
    return this.gfx;
  }
}
