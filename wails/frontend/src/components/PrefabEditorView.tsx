import { useCallback, useEffect, useRef, useState } from "react";
import { cloneObjects } from "../editor/editorObjects";
import {
  clampZoom,
  hitObject,
  isCollisionTool,
  isEditableKeyboardTarget,
  isTerrainTool,
  objectWorldCenter,
  panToCenterWorldPoint,
  ZOOM_STEP,
} from "../editor/editorCanvasUtils";
import { drawEditorObject, ensureEditorSpritesLoaded, sortObjectsForDraw } from "../editor/editorEntitySprites";
import {
  applyObjectDrag,
  canResizeObject,
  hitResizeHandle,
  hitVertexHandle,
  isDraggableObject,
  isPolygonRegion,
  replaceObjectInList,
  type ObjectDragState,
} from "../editor/editorObjectManip";
import { createRegionObject, findOverlappingRegion } from "../editor/regionPolygon";
import { getTerrainCache, type TerrainCache } from "../editor/editorTerrainCache";
import type { EditorObject, EditorTool } from "../editor/editorTypes";
import { newObjectId, TILE_PX } from "../editor/editorTypes";
import { drawTerrainPaintGhost, type PlacementHover } from "../editor/placementGhost";
import { gidForRole, toolToRole } from "../editor/tilePalette";
import { entityFromPlacementTool } from "../editor/entities";
import type { NpcRole } from "../editor/sceneCatalog";
import type { MapPrefab } from "../editor/prefabs";
import type { ImportedTileset } from "../editor/tilesetConfig";

interface DrawRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Props {
  prefab: MapPrefab;
  tool: EditorTool;
  tileset: ImportedTileset | null;
  selectedTileIndex: number | null;
  selectedObj: EditorObject | null;
  onSelectObject: (o: EditorObject | null) => void;
  focusSeq?: number;
  regionId?: string;
  interactableRoles?: NpcRole[];
  onChange: (prefab: MapPrefab) => void;
}

export function PrefabEditorView({
  prefab,
  tool,
  tileset,
  selectedTileIndex,
  selectedObj,
  onSelectObject,
  focusSeq = 0,
  regionId = "prefab",
  interactableRoles = ["job_master"],
  onChange,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [drawRect, setDrawRect] = useState<DrawRect | null>(null);
  const [spritesRevision, setSpritesRevision] = useState(0);

  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const objectDragRef = useRef<ObjectDragState | null>(null);
  const [objectDragging, setObjectDragging] = useState(false);
  const paintingRef = useRef(false);
  const placementHoverRef = useRef<PlacementHover | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const tilesetRef = useRef(tileset);
  const toolRef = useRef(tool);
  const selectedTileIndexRef = useRef(selectedTileIndex);
  panRef.current = pan;
  zoomRef.current = zoom;
  tilesetRef.current = tileset;
  toolRef.current = tool;
  selectedTileIndexRef.current = selectedTileIndex;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const groundRef = useRef<number[]>([...prefab.ground]);
  const collisionRef = useRef<number[]>([...prefab.collision]);
  const objectsRef = useRef<EditorObject[]>(cloneObjects(prefab.objects));
  const metaRef = useRef({ cols: prefab.widthTiles, rows: prefab.heightTiles, tileSize: TILE_PX });
  const terrainCacheRef = useRef<TerrainCache | null>(null);
  const sortedObjectsRef = useRef<EditorObject[]>([]);
  const drawRafRef = useRef<number | null>(null);
  const terrainRevisionRef = useRef(0);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  useEffect(() => {
    ensureEditorSpritesLoaded()
      .then(() => setSpritesRevision((n) => n + 1))
      .catch(() => {});
  }, []);

  useEffect(() => {
    groundRef.current = [...prefab.ground];
    collisionRef.current = [...prefab.collision];
    objectsRef.current = cloneObjects(prefab.objects);
    metaRef.current = { cols: prefab.widthTiles, rows: prefab.heightTiles, tileSize: TILE_PX };
    sortedObjectsRef.current = sortObjectsForDraw(objectsRef.current);
    terrainRevisionRef.current += 1;
    onSelectObject(null);
    rerender();
  }, [prefab.id, prefab.widthTiles, prefab.heightTiles, onSelectObject]);

  const commit = () => {
    onChange({
      ...prefab,
      ground: [...groundRef.current],
      collision: [...collisionRef.current],
      objects: cloneObjects(objectsRef.current),
    });
  };

  const applyObjectLive = (next: EditorObject, prev: EditorObject) => {
    objectsRef.current = replaceObjectInList(objectsRef.current, next, prev);
    sortedObjectsRef.current = sortObjectsForDraw(objectsRef.current);
    onSelectObject(next);
    rerender();
    requestDraw();
  };

  const endObjectDrag = (commitChanges: boolean) => {
    const wasDragging = objectDragRef.current != null;
    objectDragRef.current = null;
    setObjectDragging(false);
    if (wasDragging && commitChanges) commit();
  };

  const handleObjectDragMove = (clientX: number, clientY: number) => {
    const drag = objectDragRef.current;
    const w = worldFromClient(clientX, clientY);
    if (!drag || !w) return;
    const next = applyObjectDrag(drag, w.x, w.y, w.meta.tileSize, w.meta.cols, w.meta.rows);
    applyObjectLive(next, drag.orig);
  };

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const meta = metaRef.current;
    const ts = tilesetRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { cols, rows, tileSize } = meta;
    const pan = panRef.current;
    const z = zoomRef.current;

    terrainCacheRef.current = getTerrainCache(
      {
        ground: groundRef.current,
        collision: collisionRef.current,
        cols,
        rows,
        tileSize,
      },
      z,
      ts,
      terrainRevisionRef.current,
      terrainCacheRef.current,
    );
    const terrain = terrainCacheRef.current.canvas;
    const mapW = terrain.width;
    const mapH = terrain.height;

    const displayW = Math.max(320, mapW + 80);
    const displayH = Math.max(240, mapH + 80);
    if (canvas.width !== displayW) canvas.width = displayW;
    if (canvas.height !== displayH) canvas.height = displayH;

    ctx.fillStyle = "#14141a";
    ctx.fillRect(0, 0, displayW, displayH);
    ctx.drawImage(terrain, pan.x, pan.y);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    for (const o of sortedObjectsRef.current) {
      const sel = !!(selectedObj && (selectedObj.id === o.id || selectedObj.name === o.name) && selectedObj.type === o.type);
      drawEditorObject(ctx, o, z, sel);
    }

    if (drawRect) {
      const x = Math.min(drawRect.x0, drawRect.x1) * z;
      const y = Math.min(drawRect.y0, drawRect.y1) * z;
      const w = Math.abs(drawRect.x1 - drawRect.x0) * z;
      const h = Math.abs(drawRect.y1 - drawRect.y0) * z;
      ctx.strokeStyle = "#7dd3fc";
      ctx.strokeRect(x, y, w, h);
    }

    const hover = placementHoverRef.current;
    if (hover && (isTerrainTool(toolRef.current) || isCollisionTool(toolRef.current))) {
      drawTerrainPaintGhost(ctx, hover, toolRef.current, z, tileSize, ts, selectedTileIndexRef.current);
    }

    ctx.strokeStyle = "#c9a227";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, mapW, mapH);

    ctx.restore();
  }, [zoom, selectedObj, drawRect, spritesRevision, tool, selectedTileIndex]);

  const drawSceneRef = useRef(drawScene);
  drawSceneRef.current = drawScene;

  const requestDraw = useCallback(() => {
    if (drawRafRef.current != null) return;
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;
      drawSceneRef.current();
    });
  }, []);

  const bumpTerrain = () => {
    terrainRevisionRef.current += 1;
  };

  useEffect(() => {
    sortedObjectsRef.current = sortObjectsForDraw(objectsRef.current);
  }, [prefab.id, prefab.widthTiles, prefab.heightTiles]);

  useEffect(() => {
    if (!isTerrainTool(tool) && !isCollisionTool(tool)) {
      placementHoverRef.current = null;
    }
    requestDraw();
  }, [drawScene, requestDraw, tool, selectedTileIndex]);

  useEffect(() => {
    // Only pan when focusSeq bumps (hierarchy select) — not when selectedObj
    // updates mid-drag, which would snap the camera every frame.
    if (!selectedObj || focusSeq === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { x, y } = objectWorldCenter(selectedObj);
    const p = panToCenterWorldPoint(viewport, x, y, zoomRef.current);
    panRef.current = p;
    setPan(p);
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally focusSeq-only
  }, [focusSeq]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === "v" || e.key === "V") {
        /* parent owns tool */
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceHeld(false);
        setPanning(false);
        paintingRef.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const z0 = zoomRef.current;
    const p0 = panRef.current;
    const wx = (sx - p0.x) / z0;
    const wy = (sy - p0.y) / z0;
    const z1 = clampZoom(z0 * factor);
    const nextPan = { x: sx - wx * z1, y: sy - wy * z1 };
    panRef.current = nextPan;
    setZoom(z1);
    setPan(nextPan);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAt(e.clientX, e.clientY, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const isPanButton = (button: number) => button === 1 || button === 2;

  const worldFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const meta = metaRef.current;
    if (!canvas || !meta) return null;
    const rect = canvas.getBoundingClientRect();
    const p = panRef.current;
    const z = zoomRef.current;
    const x = (clientX - rect.left - p.x) / z;
    const y = (clientY - rect.top - p.y) / z;
    return { x, y, meta };
  };

  const tileAtClient = (clientX: number, clientY: number) => {
    const w = worldFromClient(clientX, clientY);
    if (!w) return null;
    const c = Math.floor(w.x / w.meta.tileSize);
    const r = Math.floor(w.y / w.meta.tileSize);
    if (c < 0 || r < 0 || c >= w.meta.cols || r >= w.meta.rows) return null;
    return { c, r, ...w.meta };
  };

  const paintTile = (clientX: number, clientY: number) => {
    const t = tileAtClient(clientX, clientY);
    if (!t) return;
    const i = t.r * t.cols + t.c;
    const ts = tilesetRef.current;
    if (isTerrainTool(tool)) {
      const role = toolToRole(tool);
      if (role === "unset") groundRef.current[i] = 0;
      else if (selectedTileIndex != null && ts) {
        groundRef.current[i] = ts.firstGid + selectedTileIndex;
      } else if (role) {
        groundRef.current[i] = gidForRole(role, ts);
      }
    } else if (isCollisionTool(tool)) {
      collisionRef.current[i] = tool === "collision_block" ? 1 : 0;
    }
    bumpTerrain();
    rerender();
    requestDraw();
    commit();
  };

  const placePointObject = (clientX: number, clientY: number) => {
    const w = worldFromClient(clientX, clientY);
    if (!w) return;
    const ts = w.meta.tileSize;
    const cx = Math.floor(w.x / ts) * ts + ts / 2;
    const cy = Math.floor(w.y / ts) * ts + ts / 2;
    const obj = entityFromPlacementTool(tool, cx, cy, regionId, interactableRoles);
    if (obj) objectsRef.current.push(obj);
    sortedObjectsRef.current = sortObjectsForDraw(objectsRef.current);
    rerender();
    requestDraw();
    commit();
  };

  const finishRect = (x0: number, y0: number, x1: number, y1: number) => {
    const meta = metaRef.current;
    const ts = meta.tileSize;
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const width = Math.max(ts, Math.round((maxX - minX) / ts) * ts);
    const height = Math.max(ts, Math.round((maxY - minY) / ts) * ts);
    const x = Math.round(minX / ts) * ts;
    const y = Math.round(maxY / ts) * ts;
    const id = newObjectId();
    if (tool === "portal") {
      objectsRef.current.push({
        id,
        name: `exit_${id}`,
        type: "exit",
        x,
        y,
        width,
        height,
        properties: [
          { name: "destMap", type: "string", value: "timberroad" },
          { name: "destX", type: "float", value: 100 },
          { name: "destY", type: "float", value: 100 },
        ],
      });
    } else if (tool === "sanctuary" || tool === "region") {
      const candidate = createRegionObject({
        id,
        type: tool,
        polygon: [
          { x, y: y - height },
          { x: x + width, y: y - height },
          { x: x + width, y },
          { x, y },
        ],
      });
      if (!findOverlappingRegion(candidate, objectsRef.current)) {
        objectsRef.current.push(candidate);
      }
    }
    sortedObjectsRef.current = sortObjectsForDraw(objectsRef.current);
    rerender();
    requestDraw();
    commit();
  };

  const handleCanvasDown = (e: React.MouseEvent) => {
    if (isPanButton(e.button) || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      setPanning(true);
      paintingRef.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
      return;
    }
    if (e.button !== 0) return;

    const w = worldFromClient(e.clientX, e.clientY);
    if (!w) return;
    const ts = w.meta.tileSize;

    const placing =
      tool === "portal" ||
      tool === "region" ||
      tool === "sanctuary" ||
      tool === "npc" ||
      tool === "save_point" ||
      tool === "interactable_npc" ||
      tool === "quest_trigger" ||
      tool === "item" ||
      isTerrainTool(tool) ||
      isCollisionTool(tool);

    if (!placing) {
      if (selectedObj && isPolygonRegion(selectedObj)) {
        const vi = hitVertexHandle(selectedObj, w.x, w.y, ts);
        if (vi != null) {
          objectDragRef.current = {
            mode: "vertex",
            vertexIndex: vi,
            orig: {
              ...selectedObj,
              polygon: selectedObj.polygon?.map((p) => ({ ...p })),
              properties: selectedObj.properties.map((p) => ({ ...p })),
            },
            startWx: w.x,
            startWy: w.y,
          };
          setObjectDragging(true);
          return;
        }
      }
      if (selectedObj && canResizeObject(selectedObj)) {
        const handle = hitResizeHandle(selectedObj, w.x, w.y, ts);
        if (handle) {
          objectDragRef.current = { mode: "resize", handle, orig: { ...selectedObj }, startWx: w.x, startWy: w.y };
          setObjectDragging(true);
          return;
        }
      }
      const hit = hitObject(objectsRef.current, w.x, w.y, ts);
      if (hit && isDraggableObject(hit)) {
        onSelectObject(hit);
        objectDragRef.current = {
          mode: "move",
          orig: {
            ...hit,
            polygon: hit.polygon?.map((p) => ({ ...p })),
            properties: hit.properties.map((p) => ({ ...p })),
          },
          startWx: w.x,
          startWy: w.y,
        };
        setObjectDragging(true);
        return;
      }
      if (tool === "select") {
        onSelectObject(hit);
        return;
      }
    }

    if (tool === "portal" || tool === "sanctuary" || tool === "region") {
      setDrawRect({ x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      return;
    }
    if (tool === "npc" || tool === "save_point" || tool === "interactable_npc" || tool === "quest_trigger" || tool === "item") {
      placePointObject(e.clientX, e.clientY);
      return;
    }
    if (isTerrainTool(tool) || isCollisionTool(tool)) {
      paintingRef.current = true;
      paintTile(e.clientX, e.clientY);
    }
  };

  return (
    <div
      ref={viewportRef}
      className={`map-editor-viewport map-editor-viewport--prefab ${panning || spaceHeld ? "map-editor-viewport--pan" : ""} ${tool === "select" ? "map-editor-viewport--select" : ""} ${objectDragging ? "map-editor-viewport--drag-object" : ""} ${isTerrainTool(tool) || isCollisionTool(tool) ? "map-editor-viewport--placing" : ""}`}
    >
      <div className="map-editor-prefab-banner">
        <span className="map-editor-prefab-banner-label">Prefab</span>
        <span className="map-editor-prefab-banner-name">{prefab.name}</span>
        <span className="dim">
          {prefab.widthTiles}×{prefab.heightTiles} tiles
        </span>
      </div>
      <p className="map-editor-viewport-hint dim">
        V = select · Drag objects to move · Scroll zoom · Middle/right-drag pan · Space+drag pan
      </p>
      <canvas
        ref={canvasRef}
        className="map-editor-canvas map-editor-canvas--main"
        onMouseDown={handleCanvasDown}
        onMouseMove={(e) => {
          if (objectDragRef.current) {
            handleObjectDragMove(e.clientX, e.clientY);
            return;
          }
          if (panning) {
            panRef.current = {
              x: dragStart.current.panX + (e.clientX - dragStart.current.x),
              y: dragStart.current.panY + (e.clientY - dragStart.current.y),
            };
            requestDraw();
            return;
          }
          if (drawRect) {
            const w = worldFromClient(e.clientX, e.clientY);
            if (w) setDrawRect((r) => (r ? { ...r, x1: w.x, y1: w.y } : r));
            return;
          }
          if (paintingRef.current && (isTerrainTool(tool) || isCollisionTool(tool))) {
            paintTile(e.clientX, e.clientY);
          }
          if (isTerrainTool(tool) || isCollisionTool(tool)) {
            const w = worldFromClient(e.clientX, e.clientY);
            if (w) {
              const ts = w.meta.tileSize;
              const col = Math.floor(w.x / ts);
              const row = Math.floor(w.y / ts);
              if (col >= 0 && row >= 0 && col < w.meta.cols && row < w.meta.rows) {
                placementHoverRef.current = { wx: w.x, wy: w.y, col, row };
              } else {
                placementHoverRef.current = null;
              }
              requestDraw();
            }
          }
        }}
        onMouseUp={(e) => {
          if (objectDragRef.current) {
            endObjectDrag(true);
          }
          if (drawRect && e.button === 0 && !spaceHeld) {
            finishRect(drawRect.x0, drawRect.y0, drawRect.x1, drawRect.y1);
            setDrawRect(null);
          }
          if (isPanButton(e.button) || e.button === 0) {
            if (panning) setPan({ ...panRef.current });
            setPanning(false);
          }
          paintingRef.current = false;
        }}
        onMouseLeave={() => {
          endObjectDrag(false);
          setDrawRect(null);
          if (panning) setPan({ ...panRef.current });
          setPanning(false);
          paintingRef.current = false;
          if (placementHoverRef.current) {
            placementHoverRef.current = null;
            requestDraw();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        onAuxClick={(e) => e.preventDefault()}
      />
    </div>
  );
}
