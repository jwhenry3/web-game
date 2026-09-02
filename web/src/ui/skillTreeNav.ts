export type TreePos = { id: string; x: number; y: number };
export type TreeNavDir = "up" | "down" | "left" | "right";

function directionScore(cur: TreePos, node: TreePos, dir: TreeNavDir): number | null {
  const dx = node.x - cur.x;
  const dy = node.y - cur.y;
  switch (dir) {
    case "down":
      if (dy <= 0) return null;
      return dy * 1000 + Math.abs(dx);
    case "up":
      if (dy >= 0) return null;
      return -dy * 1000 + Math.abs(dx);
    case "right":
      if (dx <= 0) return null;
      return Math.abs(dy) * 1000 + dx;
    case "left":
      if (dx >= 0) return null;
      return Math.abs(dy) * 1000 + -dx;
  }
}

export function treeNeighbor(layout: TreePos[], currentId: string, dir: TreeNavDir): string | null {
  const cur = layout.find((n) => n.id === currentId);
  if (!cur) return layout[0]?.id ?? null;

  let best: TreePos | null = null;
  let bestScore = Infinity;
  for (const node of layout) {
    if (node.id === currentId) continue;
    const score = directionScore(cur, node, dir);
    if (score == null || score >= bestScore) continue;
    bestScore = score;
    best = node;
  }
  return best?.id ?? null;
}

export function treeNavDirection(key: string): TreeNavDir | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}
