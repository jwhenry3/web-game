import type { OverworldMap } from "../types";
import { circleWalkableAt } from "./overworld";

export interface PathPoint {
  x: number;
  y: number;
}

interface TileKey {
  c: number;
  r: number;
}

const key = (c: number, r: number) => r * 1_000_000 + c;

/**
 * A* over the overworld tile grid. 8-directional with no corner cutting
 * (matches the server's game.pathfindWith). Walkability uses the player's
 * feet-centered collision circle at each tile center so paths never hug a
 * wall the slide would reject.
 */
export function findPath(
  map: OverworldMap | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): PathPoint[] | null {
  if (!map) return null;
  const from = { c: Math.floor(fromX / map.tile), r: Math.floor(fromY / map.tile) };
  const to = { c: Math.floor(toX / map.tile), r: Math.floor(toY / map.tile) };

  // A tile counts as standable when the feet-centered collision circle fits
  // at the tile center — same anchor the emitted waypoints use.
  const walkable = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
    return circleWalkableAt(map, (c + 0.5) * map.tile, (r + 0.5) * map.tile);
  };

  // Snap endpoints to the nearest walkable tile (small ring search) so
  // clicking a wall still moves the player as close as possible.
  const snap = (t: TileKey): TileKey | null => {
    if (walkable(t.c, t.r)) return t;
    for (let rad = 1; rad <= 3; rad++) {
      let best: TileKey | null = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
          const c = t.c + dc;
          const r = t.r + dr;
          if (!walkable(c, r)) continue;
          const d = Math.hypot(c - t.c, r - t.r);
          if (d < bestD) {
            bestD = d;
            best = { c, r };
          }
        }
      }
      if (best) return best;
    }
    return null;
  };

  const start = snap(from);
  const goal = snap(to);
  if (!start || !goal) return null;
  if (start.c === goal.c && start.r === goal.r) {
    return [
      circleWalkableAt(map, toX, toY)
        ? { x: toX, y: toY }
        : { x: (goal.c + 0.5) * map.tile, y: (goal.r + 0.5) * map.tile },
    ];
  }

  const SQRT2 = Math.SQRT2;
  const heuristic = (a: TileKey) => {
    const dx = Math.abs(a.c - goal.c);
    const dy = Math.abs(a.r - goal.r);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };

  // Binary min-heap of [fScore, index] into nodes.
  interface Node {
    t: TileKey;
    g: number;
    f: number;
  }
  const heap: Node[] = [];
  const push = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): Node => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const came = new Map<number, number>();
  const bestG = new Map<number, number>([[key(start.c, start.r), 0]]);
  push({ t: start, g: 0, f: heuristic(start) });
  const DIRS: [number, number, number][] = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [1, 1, SQRT2],
  ];

  let goalKey = -1;
  while (heap.length) {
    const cur = pop();
    if (cur.t.c === goal.c && cur.t.r === goal.r) {
      goalKey = key(goal.c, goal.r);
      break;
    }
    const curKey = key(cur.t.c, cur.t.r);
    if (cur.g > (bestG.get(curKey) ?? Infinity)) continue;
    for (const [dc, dr, cost] of DIRS) {
      const nc = cur.t.c + dc;
      const nr = cur.t.r + dr;
      if (!walkable(nc, nr)) continue;
      // No diagonal corner cutting.
      if (dc !== 0 && dr !== 0 && (!walkable(cur.t.c + dc, cur.t.r) || !walkable(cur.t.c, cur.t.r + dr))) {
        continue;
      }
      const g = cur.g + cost;
      const nk = key(nc, nr);
      if (g >= (bestG.get(nk) ?? Infinity)) continue;
      bestG.set(nk, g);
      came.set(nk, curKey);
      push({ t: { c: nc, r: nr }, g, f: g + heuristic({ c: nc, r: nr }) });
    }
  }

  if (goalKey < 0) return null;

  // Reconstruct tile path, then emit tile centers. The final point is the
  // exact click position when the goal tile contains it.
  const tiles: TileKey[] = [];
  let cur = goalKey;
  while (cur !== key(start.c, start.r)) {
    tiles.unshift({ c: cur % 1_000_000, r: Math.floor(cur / 1_000_000) });
    cur = came.get(cur)!;
  }
  const pts: PathPoint[] = tiles.map((t) => ({
    x: (t.c + 0.5) * map.tile,
    y: (t.r + 0.5) * map.tile,
  }));
  const last = tiles[tiles.length - 1];
  if (last && last.c === goal.c && last.r === goal.r && circleWalkableAt(map, toX, toY)) {
    pts[pts.length - 1] = { x: toX, y: toY };
  }
  return pts;
}
