// Iso chunk rasterizer — draws ground fills (square, orthogonal layout) into
// a canvas that the scene's iso layer transform projects into diamonds, and
// extracts billboard prop placements for depth-sorted sprites.
//
// Prop/tree cells paint the dominant neighboring *fill* underneath so a tree
// never leaves a hole; the prop itself renders as a separate upright sprite.
import { isoDepth } from "./iso";
import {
  ISO_BLOCKS,
  ISO_ROCK_LEVEL,
  isoCellForGid,
  isoDecalSource,
  type IsoBlockDef,
  type IsoCell,
  type IsoTiles,
} from "./isoTiles";
import type { TerrainLayerData } from "./terrainRaster";
import type { LoadedPipoyaSheet } from "./pipoyaTilesets";

export interface IsoPropPlacement {
  frame: string;
  /** World-space anchor — billboard bottom-center. */
  wx: number;
  wy: number;
  depth: number;
  /** True for the 2-tile tree billboards (drawn wider). */
  big?: boolean;
}

export interface IsoBlockPlacement {
  /** Block type + elevation level (1..ISO_BLOCK_LEVELS). */
  def: IsoBlockDef;
  level: number;
  /** World-space tile top-left. */
  wx: number;
  wy: number;
  /** Exposed face levels on the +x and +y edges (level − neighbor level). */
  faceE: number;
  faceS: number;
  depth: number;
}

export interface IsoChunkArt {
  canvas: HTMLCanvasElement;
  props: IsoPropPlacement[];
  blocks: IsoBlockPlacement[];
}

const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

export function rasterizeIsoChunk(
  data: TerrainLayerData,
  sheets: LoadedPipoyaSheet[],
  iso: IsoTiles,
  c0: number,
  r0: number,
  size: number,
): IsoChunkArt {
  const t = data.tileSize;
  const canvas = document.createElement("canvas");
  canvas.width = size * t;
  canvas.height = size * t;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const gidAt = (c: number, r: number): number =>
    c >= 0 && r >= 0 && c < data.cols && r < data.rows
      ? (data.ground[r * data.cols + c] & 0x1fffffff)
      : 0;

  const fillFrame = (gid: number): string | null => {
    const cell = isoCellForGid(gid);
    return cell.kind === "fill" ? cell.frame : null;
  };

  // Per-cell underlay: dominant fill among the 8 neighbors, else the chunk's
  // dominant fill, else grass.
  const chunkFillCounts = new Map<string, number>();
  for (let r = r0; r < r0 + size; r++) {
    for (let c = c0; c < c0 + size; c++) {
      const f = fillFrame(gidAt(c, r));
      if (f) chunkFillCounts.set(f, (chunkFillCounts.get(f) ?? 0) + 1);
    }
  }
  let chunkDominant = "grass";
  let best = 0;
  for (const [f, n] of chunkFillCounts) {
    if (n > best) {
      best = n;
      chunkDominant = f;
    }
  }
  const underlayFrame = (c: number, r: number): string => {
    const votes = new Map<string, number>();
    for (const [dc, dr] of NEIGHBORS) {
      const f = fillFrame(gidAt(c + dc, r + dr));
      if (f) votes.set(f, (votes.get(f) ?? 0) + 1);
    }
    let frame = chunkDominant;
    let top = 0;
    for (const [f, n] of votes) {
      if (n > top) {
        top = n;
        frame = f;
      }
    }
    return frame;
  };

  const drawFill = (frame: string, dx: number, dy: number): void => {
    const rect = iso.atlas.fills[frame];
    if (rect) {
      ctx.drawImage(iso.img, rect.x, rect.y, t, t, dx, dy, t, t);
    }
  };

  const props: IsoPropPlacement[] = [];
  const blocks: IsoBlockPlacement[] = [];
  const seen = new Set<number>(); // consumed tree-stamp mates
  const key = (c: number, r: number) => r * data.cols + c;
  /** Resolved unwalkability at (c,r) — from the snapshot's cell chars. */
  const blockedAt = (c: number, r: number): boolean =>
    c >= 0 && r >= 0 && c < data.cols && r < data.rows &&
    !!data.blocked?.[r * data.cols + c];

  // Only rock material elevates: painted blocks and stone fills arrive as
  // "block" cells; the remaining elevated case is the empty '#' void (map
  // borders) — a gid-0 cell that is unwalkable. Fills, decals, and
  // tree-stamp mates stay flat even when collision marks them unwalkable.
  const rockCell = (cell: IsoCell, gid: number): boolean =>
    cell.kind === "skip" && gid === 0;

  /** Block elevation level at (c,r) — 0 for walkable ground. */
  const blockLevelAt = (c: number, r: number): number => {
    const gid = gidAt(c, r);
    const cell = isoCellForGid(gid);
    if (cell.kind === "block") return cell.level;
    return rockCell(cell, gid) && blockedAt(c, r) ? ISO_ROCK_LEVEL : 0;
  };

  const pushBlock = (def: IsoBlockDef, level: number, c: number, r: number) => {
    const wx = c * t;
    const wy = r * t;
    blocks.push({
      def,
      level,
      wx,
      wy,
      faceE: Math.max(0, level - blockLevelAt(c + 1, r)),
      faceS: Math.max(0, level - blockLevelAt(c, r + 1)),
      depth: isoDepth(wx + t, wy + t),
    });
  };

  for (let r = r0; r < r0 + size && r < data.rows; r++) {
    for (let c = c0; c < c0 + size && c < data.cols; c++) {
      const dx = (c - c0) * t;
      const dy = (r - r0) * t;
      const gid = gidAt(c, r);
      const cell = isoCellForGid(gid);

      // Empty '#' void (map border) → a rock column on an underlay fill.
      // gid-0 cells draw nothing of their own; only rock reads elevated.
      if (cell.kind !== "block" && rockCell(cell, gid) && blockedAt(c, r)) {
        drawFill(underlayFrame(c, r), dx, dy);
        pushBlock(ISO_BLOCKS[0], ISO_ROCK_LEVEL, c, r);
        continue;
      }

      switch (cell.kind) {
        case "fill":
          drawFill(cell.frame, dx, dy);
          break;
        case "decal": {
          drawFill(underlayFrame(c, r), dx, dy);
          const src = isoDecalSource(gid, sheets);
          if (src) {
            ctx.drawImage(
              src.sheet.img,
              src.sx, src.sy, src.sheet.tileWidth, src.sheet.tileHeight,
              dx, dy, t, t,
            );
          }
          break;
        }
        case "tree": {
          // One billboard per 2x2 stamp; anchor at the trunk-bottom vertex.
          drawFill(underlayFrame(c, r), dx, dy);
          if (!seen.has(key(c, r))) {
            seen.add(key(c + 1, r));
            seen.add(key(c, r + 1));
            seen.add(key(c + 1, r + 1));
            const wx = (c + 1) * t;
            const wy = (r + 2) * t;
            props.push({ frame: cell.prop, wx, wy, depth: isoDepth(wx, wy), big: cell.big });
          }
          break;
        }
        case "prop": {
          drawFill(underlayFrame(c, r), dx, dy);
          if (!seen.has(key(c, r))) {
            const wx = (c + 0.5) * t;
            const wy = (r + 1) * t;
            props.push({ frame: cell.prop, wx, wy, depth: isoDepth(wx, wy) });
          }
          break;
        }
        case "block":
          // Raised column: ground shows through under it; only the part of a
          // side face above the neighbor's level is exposed and drawn.
          drawFill(underlayFrame(c, r), dx, dy);
          pushBlock(cell.def, cell.level, c, r);
          break;
        case "skip":
          // Tree-stamp mate or empty — paint ground under it.
          if (gid > 0) drawFill(underlayFrame(c, r), dx, dy);
          break;
      }
    }
  }

  // Shore highlight — water cells next to land get a pale strip on the shared
  // edge; after the iso transform it reads as a coastline.
  ctx.fillStyle = "rgba(214, 234, 240, 0.5)";
  for (let r = r0; r < r0 + size && r < data.rows; r++) {
    for (let c = c0; c < c0 + size && c < data.cols; c++) {
      const cell = isoCellForGid(gidAt(c, r));
      if (cell.kind !== "fill" || cell.frame !== "water") continue;
      const dx = (c - c0) * t;
      const dy = (r - r0) * t;
      const land = (dc: number, dr: number) => {
        const f = fillFrame(gidAt(c + dc, r + dr));
        return f !== null && f !== "water";
      };
      if (land(0, -1)) ctx.fillRect(dx, dy, t, 3);
      if (land(0, 1)) ctx.fillRect(dx, dy + t - 3, t, 3);
      if (land(-1, 0)) ctx.fillRect(dx, dy, 3, t);
      if (land(1, 0)) ctx.fillRect(dx + t - 3, dy, 3, t);
    }
  }

  return { canvas, props, blocks };
}
