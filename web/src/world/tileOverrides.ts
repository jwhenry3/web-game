import type { MapTileOverrides } from "../types";
import Phaser from "phaser";

/** Patch existing Phaser tilemap layers in place (used after createLayer). */
export function patchTilemapLayers(
  tm: Phaser.Tilemaps.Tilemap,
  overrides?: MapTileOverrides | null,
) {
  if (!overrides?.layers) return;
  for (const [layerName, patches] of Object.entries(overrides.layers)) {
    const layer = tm.getLayer(layerName)?.tilemapLayer;
    if (!layer) continue;
    for (const [idxStr, gid] of Object.entries(patches)) {
      const idx = parseInt(idxStr, 10);
      if (Number.isNaN(idx)) continue;
      const x = idx % tm.width;
      const y = Math.floor(idx / tm.width);
      if (gid === 0) layer.removeTileAt(x, y);
      else layer.putTileAt(gid, x, y);
    }
  }
}
