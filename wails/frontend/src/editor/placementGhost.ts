import { colorForGid, gidForRole, TERRAIN_COLORS, toolToRole } from "./tilePalette";
import { drawEditorObject } from "./editorEntitySprites";
import { isPointLikeObject } from "./editorCanvasUtils";
import type { EditorObject, EditorTool } from "./editorTypes";
import type { EntityDefinition } from "./entities";
import type { MapPrefab } from "./prefabs";
import type { ImportedTileset } from "./tilesetConfig";

export interface PlacementHover {
  wx: number;
  wy: number;
  col: number;
  row: number;
}

/** Semi-transparent preview of the terrain/collision brush under the cursor. */
export function drawTerrainPaintGhost(
  ctx: CanvasRenderingContext2D,
  hover: PlacementHover,
  tool: EditorTool,
  zoom: number,
  tileSize: number,
  tileset: ImportedTileset | null,
  selectedTileIndex: number | null,
) {
  const x = hover.col * tileSize * zoom;
  const y = hover.row * tileSize * zoom;
  const s = tileSize * zoom;

  ctx.save();
  ctx.globalAlpha = 0.5;

  if (tool === "collision_block") {
    ctx.fillStyle = TERRAIN_COLORS.collision;
    ctx.fillRect(x, y, s, s);
  } else if (tool === "collision_walk") {
    ctx.fillStyle = "rgba(52, 211, 153, 0.55)";
    ctx.fillRect(x, y, s, s);
  } else {
    const role = toolToRole(tool);
    let fill = TERRAIN_COLORS.empty;
    if (role === "unset") {
      fill = "rgba(20, 20, 26, 0.75)";
    } else if (selectedTileIndex != null && tileset) {
      fill = colorForGid(tileset.firstGid + selectedTileIndex, tileset);
    } else if (role) {
      fill = colorForGid(gidForRole(role, tileset), tileset);
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, s, s);
  }

  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, s - 1.5, s - 1.5);
  ctx.restore();
}

/** Draw a ghost of an entity template at the snapped tile under the cursor. */
export function drawEntityPlacementGhost(
  ctx: CanvasRenderingContext2D,
  def: EntityDefinition,
  hover: PlacementHover,
  zoom: number,
  tileSize: number,
) {
  const tpl = def.template;
  let preview: EditorObject;

  if (isPointLikeObject(tpl)) {
    preview = {
      ...tpl,
      x: hover.col * tileSize + tileSize / 2,
      y: hover.row * tileSize + tileSize / 2,
      point: true,
      properties: tpl.properties.map((p) => ({ ...p })),
    };
  } else {
    preview = {
      ...tpl,
      x: hover.col * tileSize,
      y: hover.row * tileSize + tileSize,
      properties: tpl.properties.map((p) => ({ ...p })),
    };
  }

  ctx.save();
  ctx.globalAlpha = 0.45;
  drawEditorObject(ctx, preview, zoom, true);
  ctx.restore();
}

/** Draw a ghost stamp of a prefab (terrain tint + objects) at the hover tile. */
export function drawPrefabPlacementGhost(
  ctx: CanvasRenderingContext2D,
  prefab: MapPrefab,
  hover: PlacementHover,
  zoom: number,
  tileSize: number,
  tileset: ImportedTileset | null,
) {
  const ox = hover.col * tileSize;
  const oy = hover.row * tileSize;
  const w = prefab.widthTiles * tileSize;
  const h = prefab.heightTiles * tileSize;

  ctx.save();
  ctx.globalAlpha = 0.35;
  for (let r = 0; r < prefab.heightTiles; r++) {
    for (let c = 0; c < prefab.widthTiles; c++) {
      const gid = prefab.ground[r * prefab.widthTiles + c] ?? 0;
      const blocked = (prefab.collision[r * prefab.widthTiles + c] ?? 0) > 0;
      ctx.fillStyle = colorForGid(gid, tileset);
      ctx.fillRect((ox + c * tileSize) * zoom, (oy + r * tileSize) * zoom, tileSize * zoom, tileSize * zoom);
      if (blocked) {
        ctx.fillStyle = "rgba(220, 60, 60, 0.35)";
        ctx.fillRect((ox + c * tileSize) * zoom, (oy + r * tileSize) * zoom, tileSize * zoom, tileSize * zoom);
      }
    }
  }

  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = "rgba(232, 201, 106, 0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox * zoom + 1, oy * zoom + 1, w * zoom - 2, h * zoom - 2);

  ctx.globalAlpha = 0.5;
  for (const o of prefab.objects) {
    const preview: EditorObject = {
      ...o,
      x: o.x + ox,
      y: o.y + oy,
      properties: o.properties.map((p) => ({ ...p })),
    };
    drawEditorObject(ctx, preview, zoom, false);
  }
  ctx.restore();
}
