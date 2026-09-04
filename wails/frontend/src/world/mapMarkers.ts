import type { AtlasMap, VisitedSavePoint } from "../types";

export type MapMarkerKind = "save_point" | "player";

export interface MapMarker {
  id: string;
  kind: MapMarkerKind;
  name: string;
  x: number;
  y: number;
  discovered: boolean;
  home?: boolean;
  selectable: boolean;
}

export function markersForMap(opts: {
  atlas: AtlasMap;
  visited: VisitedSavePoint[];
  player?: { x: number; y: number } | null;
  showPlayer?: boolean;
  selectableVisited?: boolean;
}): MapMarker[] {
  const visitedById = new Map(opts.visited.map((v) => [v.id, v]));
  const out: MapMarker[] = opts.atlas.pois
    .filter((p) => p.kind === "save_point")
    .map((p) => {
      const visit = visitedById.get(p.id);
      const discovered = !!visit;
      return {
        id: p.id,
        kind: "save_point" as const,
        name: discovered ? visit!.name || p.name : "Unknown crystal",
        x: p.x,
        y: p.y,
        discovered,
        home: visit?.home,
        selectable: !!opts.selectableVisited && discovered,
      };
    });
  if (opts.showPlayer && opts.player) {
    out.push({
      id: "player",
      kind: "player",
      name: "You",
      x: opts.player.x,
      y: opts.player.y,
      discovered: true,
      selectable: false,
    });
  }
  return out;
}
