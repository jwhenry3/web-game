import type { TreePos, TreeNavDir } from "./skillTreeNav";
import { treeNeighbor } from "./skillTreeNav";

export type { TreeNavDir };

export function jobGridNeighbor(
  layout: TreePos[],
  currentId: string,
  dir: TreeNavDir,
): string | null {
  return treeNeighbor(layout, currentId, dir);
}

export function layoutJobGrid(ids: string[], columns = 4): TreePos[] {
  return ids.map((id, i) => ({
    id,
    x: i % columns,
    y: Math.floor(i / columns),
  }));
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
