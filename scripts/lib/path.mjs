// A* over an OverworldMap {tile, cols, rows, cells} for smoke/debug scripts.
// Mirrors wails/frontend/src/world/pathfind.ts and the server's
// game.pathfindWith: 8-directional, no corner cutting, and the same
// foot-anchored player collision box the server validates moves with.

const WALKABLE = new Set(["H", ".", ",", "R", "T"]);
// internal/game/overworld.go: PlayerCollisionHalfW/H (125/8, 50/4).
const HALF_W = 15.625;
const HALF_H = 12.5;

function tileWalkable(map, c, r) {
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
  return WALKABLE.has(map.cells[r * map.cols + c] ?? "");
}

function boundsWalkableAt(map, cx, cy) {
  const c0 = Math.floor((cx - HALF_W) / map.tile);
  const c1 = Math.floor((cx + HALF_W) / map.tile);
  const r0 = Math.floor((cy - HALF_H) / map.tile);
  const r1 = Math.floor(cy / map.tile);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) if (!tileWalkable(map, c, r)) return false;
  return true;
}

/** Returns [{x,y}] world waypoints (tile centers), or null if unreachable. */
export function findPath(map, fromX, fromY, toX, toY) {
  if (!map) return null;
  const tileOf = (x, y) => ({ c: Math.floor(x / map.tile), r: Math.floor(y / map.tile) });
  const from = tileOf(fromX, fromY);
  const to = tileOf(toX, toY);
  const walkable = (c, r) =>
    c >= 0 && r >= 0 && c < map.cols && r < map.rows &&
    boundsWalkableAt(map, (c + 0.5) * map.tile, (r + 0.5) * map.tile);

  const snap = (t) => {
    if (walkable(t.c, t.r)) return t;
    for (let rad = 1; rad <= 3; rad++) {
      let best = null, bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
          if (!walkable(t.c + dc, t.r + dr)) continue;
          const d = Math.hypot(dc, dr);
          if (d < bestD) { bestD = d; best = { c: t.c + dc, r: t.r + dr }; }
        }
      if (best) return best;
    }
    return null;
  };

  const start = snap(from);
  const goal = snap(to);
  if (!start || !goal) return null;
  const center = (t) => ({ x: (t.c + 0.5) * map.tile, y: (t.r + 0.5) * map.tile });
  if (start.c === goal.c && start.r === goal.r) {
    return [boundsWalkableAt(map, toX, toY) ? { x: toX, y: toY } : center(goal)];
  }

  const key = (c, r) => r * 1_000_000 + c;
  const SQRT2 = Math.SQRT2;
  const heuristic = (a) => {
    const dx = Math.abs(a.c - goal.c), dy = Math.abs(a.r - goal.r);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = [];
  const push = (n) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
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

  const came = new Map();
  const bestG = new Map([[key(start.c, start.r), 0]]);
  push({ t: start, g: 0, f: heuristic(start) });
  const DIRS = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [1, 1, SQRT2],
  ];

  let goalKey = -1;
  while (heap.length) {
    const cur = pop();
    if (cur.t.c === goal.c && cur.t.r === goal.r) { goalKey = key(goal.c, goal.r); break; }
    const curKey = key(cur.t.c, cur.t.r);
    if (cur.g > (bestG.get(curKey) ?? Infinity)) continue;
    for (const [dc, dr, cost] of DIRS) {
      const nc = cur.t.c + dc, nr = cur.t.r + dr;
      if (!walkable(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!walkable(cur.t.c + dc, cur.t.r) || !walkable(cur.t.c, cur.t.r + dr))) continue;
      const g = cur.g + cost;
      const nk = key(nc, nr);
      if (g >= (bestG.get(nk) ?? Infinity)) continue;
      bestG.set(nk, g);
      came.set(nk, curKey);
      push({ t: { c: nc, r: nr }, g, f: g + heuristic({ c: nc, r: nr }) });
    }
  }
  if (goalKey < 0) return null;

  const tiles = [];
  for (let cur = goalKey; cur !== key(start.c, start.r); cur = came.get(cur)) {
    tiles.unshift({ c: cur % 1_000_000, r: Math.floor(cur / 1_000_000) });
  }
  const pts = tiles.map(center);
  const last = tiles[tiles.length - 1];
  if (last && last.c === goal.c && last.r === goal.r && boundsWalkableAt(map, toX, toY)) {
    pts[pts.length - 1] = { x: toX, y: toY };
  }
  return pts;
}
