import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../state/store";
import { cloneObjects, objectsEqual } from "../editor/editorObjects";
import { baseLayersFromConfig, objectsFromConfig } from "../editor/mapConfigLayers";
import type { EditorObject, EditorTool } from "../editor/editorTypes";
import { newObjectId, TILE_PX } from "../editor/editorTypes";
import {
  gidForRole,
  toolToRole,
} from "../editor/tilePalette";
import {
  clampZoom,
  hitObject,
  isCollisionTool,
  isEditableKeyboardTarget,
  isMapPlaceTool,
  isTerrainTool,
  objectWorldCenter,
  panToCenterWorldPoint,
  ZOOM_STEP,
} from "../editor/editorCanvasUtils";
import { capturePrefabFromMap, resizePrefab, stampPrefab, type MapPrefab } from "../editor/prefabs";
import { persistDrops, persistEntities, persistItems, persistJobs, persistPrefabs, persistQuests, persistSkills, persistTileset, syncAllContentCatalogs, type DropPoolDef, type ItemDef, type JobDef, type QuestDef, type SkillDef } from "../editor/contentStore";
import type { ImportedTileset } from "../editor/tilesetConfig";
import { objectsMatch } from "../editor/objectProps";
import { entityFromPlacementTool, instantiateEntity, type EntityDefinition } from "../editor/entities";
import { drawEntityPlacementGhost, drawPrefabPlacementGhost, drawTerrainPaintGhost, type PlacementHover } from "../editor/placementGhost";
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
import {
  createRegionObject,
  findOverlappingRegion,
  snapPolyPoint,
  type PolyPoint,
} from "../editor/regionPolygon";
import { getTerrainCache, type TerrainCache } from "../editor/editorTerrainCache";
import {
  DEFAULT_INTERACTABLE_ROLES,
  interactModeForObject,
  objectMatchesInteractMode,
  type EditorInteractMode,
  type EditorWorkspacePage,
  type NpcRole,
  type ToolboxTab,
} from "../editor/sceneCatalog";
import {
  clearAdminSession,
  createAdminMap,
  diffLayers,
  disableAdminMap,
  enableAdminMap,
  fetchAdminMaps,
  getAdminToken,
  removeAdminMap,
  saveMapOverrides,
  type AdminMapInfo,
} from "../net/adminMaps";
import { MapEditorChrome } from "./MapEditorChrome";
import { MapEditorHierarchy } from "./MapEditorHierarchy";
import { MapEditorInspector } from "./MapEditorInspector";
import { MapEditorToolbox } from "./MapEditorToolbox";
import { PrefabEditorView } from "./PrefabEditorView";
import { EntityEditorPage } from "./EntityEditorPage";
import { ItemsEditorPage } from "./ItemsEditorPage";
import { DropsEditorPage } from "./DropsEditorPage";
import { QuestsEditorPage, SkillsEditorPage } from "./ContentCatalogPages";
import { JobsEditorPage } from "./JobsEditorPage";
import { CreateMapDialog } from "./CreateMapDialog";

export function MapEditorScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const clearAdminAuth = useGame((s) => s.clearAdminAuth);

  const [maps, setMaps] = useState<AdminMapInfo[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [drawRect, setDrawRect] = useState<{ x0: number; y0: number; x1: number; y1: number; mode: "place" | "capture" } | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<{
    type: "region" | "sanctuary";
    points: PolyPoint[];
    hover: PolyPoint | null;
  } | null>(null);
  const polygonDraftRef = useRef(polygonDraft);
  polygonDraftRef.current = polygonDraft;
  const commitPolygonDraftRef = useRef<(() => void) | null>(null);
  const [selectedObj, setSelectedObj] = useState<EditorObject | null>(null);
  const [tileset, setTileset] = useState<ImportedTileset | null>(null);
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [prefabs, setPrefabs] = useState<MapPrefab[]>([]);
  const [activePrefabId, setActivePrefabId] = useState<string | null>(null);
  const [editingPrefabId, setEditingPrefabId] = useState<string | null>(null);
  const [editingPrefab, setEditingPrefab] = useState<MapPrefab | null>(null);
  const [prefabEditorKey, setPrefabEditorKey] = useState(0);
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [items, setItems] = useState<ItemDef[]>([]);
  const [quests, setQuests] = useState<QuestDef[]>([]);
  const [jobs, setJobs] = useState<JobDef[]>([]);
  const [skills, setSkills] = useState<SkillDef[]>([]);
  const [drops, setDrops] = useState<DropPoolDef[]>([]);
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const [entityStampMode, setEntityStampMode] = useState(false);
  const [stampMode, setStampMode] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const placementHoverRef = useRef<PlacementHover | null>(null);
  const [workspacePage, setWorkspacePage] = useState<EditorWorkspacePage>("map");
  const [interactMode, setInteractMode] = useState<EditorInteractMode>("entity");
  const [toolboxTab, setToolboxTab] = useState<ToolboxTab>("entities");
  const interactableRoles = useMemo(() => [...DEFAULT_INTERACTABLE_ROLES] as NpcRole[], []);
  const [pendingNewEntityDialog, setPendingNewEntityDialog] = useState(false);
  const [createMapOpen, setCreateMapOpen] = useState(false);
  const [focusSeq, setFocusSeq] = useState(0);
  const [spritesRevision, setSpritesRevision] = useState(0);
  const [objectDragging, setObjectDragging] = useState(false);

  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const objectDragRef = useRef<ObjectDragState | null>(null);
  const paintingRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const tilesetRef = useRef(tileset);
  panRef.current = pan;
  zoomRef.current = zoom;
  tilesetRef.current = tileset;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseLayersRef = useRef<Record<string, number[]>>({});
  const currentLayersRef = useRef<Record<string, number[]>>({});
  const baseObjectsRef = useRef<EditorObject[]>([]);
  const currentObjectsRef = useRef<EditorObject[]>([]);
  const mapMetaRef = useRef<{ cols: number; rows: number; tileSize: number } | null>(null);
  const terrainCacheRef = useRef<TerrainCache | null>(null);
  const sortedObjectsRef = useRef<EditorObject[]>([]);
  const drawRafRef = useRef<number | null>(null);
  const [mapRevision, setMapRevision] = useState(0);
  const [sceneRevision, setSceneRevision] = useState(0);
  const rerender = () => setSceneRevision((n) => n + 1);

  const selectedMap = useMemo(() => maps.find((m) => m.id === selectedId), [maps, selectedId]);
  const activePrefab = prefabs.find((p) => p.id === activePrefabId) ?? null;
  const activeEntity = entities.find((e) => e.id === activeEntityId) ?? null;
  const inPrefabMode = editingPrefabId != null && editingPrefab != null;
  const showMapWorkspace = workspacePage === "map" || inPrefabMode;
  const placingSomething =
    (stampMode && !!activePrefab) ||
    (entityStampMode && !!activeEntity) ||
    captureMode ||
    !!polygonDraft ||
    isMapPlaceTool(tool) ||
    isTerrainTool(tool) ||
    isCollisionTool(tool);

  const stampModeRef = useRef(stampMode);
  const entityStampModeRef = useRef(entityStampMode);
  const activePrefabRef = useRef(activePrefab);
  const activeEntityRef = useRef(activeEntity);
  const toolRef = useRef(tool);
  const selectedTileIndexRef = useRef(selectedTileIndex);
  stampModeRef.current = stampMode;
  entityStampModeRef.current = entityStampMode;
  activePrefabRef.current = activePrefab;
  activeEntityRef.current = activeEntity;
  toolRef.current = tool;
  selectedTileIndexRef.current = selectedTileIndex;

  useEffect(() => {
    void syncAllContentCatalogs().then(({ entities: ent, prefabs: pf, tileset: ts, items: it, quests: qu, jobs: jb, skills: sk, drops: dp }) => {
      setEntities(ent);
      setPrefabs(pf);
      setTileset(ts);
      setItems(it);
      setQuests(qu);
      setJobs(jb);
      setSkills(sk);
      setDrops(dp);
      tilesetRef.current = ts;
    });
  }, []);

  useEffect(() => {
    ensureEditorSpritesLoaded()
      .then(() => setSpritesRevision((n) => n + 1))
      .catch(() => {});
  }, []);

  const loadMaps = useCallback(async () => {
    if (!getAdminToken()) {
      setScreen("admin_auth");
      return;
    }
    try {
      const list = await fetchAdminMaps();
      setMaps(list);
      setError(null);
      setSelectedId((prev) => {
        if (prev && list.some((m) => m.id === prev)) return prev;
        return list[0]?.id ?? "";
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load maps";
      if (message.includes("sign in again") || message.toLowerCase() === "unauthorized") {
        clearAdminSession();
        clearAdminAuth();
        setScreen("admin_auth");
        return;
      }
      setError(message);
    }
  }, [setScreen, clearAdminAuth]);

  useEffect(() => {
    void loadMaps();
  }, [loadMaps]);

  const loadedMapIdRef = useRef<string | null>(null);

  const loadMapData = useCallback((info: AdminMapInfo) => {
    if (!info.base_terrain_layers?.ground || !info.terrain_layers?.ground) {
      throw new Error(`Map "${info.id}" has no terrain data`);
    }
    const base = baseLayersFromConfig(info.base_terrain_layers, info.cols, info.rows);
    const baseObjs = objectsFromConfig(info.base_objects);
    baseLayersRef.current = base;
    baseObjectsRef.current = baseObjs;
    currentLayersRef.current = {
      ground: [...info.terrain_layers.ground],
      collision: [...(info.terrain_layers.collision ?? [])],
    };
    currentObjectsRef.current = objectsFromConfig(info.objects);
    mapMetaRef.current = { cols: info.cols, rows: info.rows, tileSize: info.tile_size || TILE_PX };
    terrainCacheRef.current = null;
    loadedMapIdRef.current = info.id;
    const origin = { x: 20, y: 20 };
    panRef.current = origin;
    setPan(origin);
    setSelectedObj(null);
    setDrawRect(null);
    setPolygonDraft(null);
    setStampMode(false);
    setEntityStampMode(false);
    setCaptureMode(false);
    setTool("select");
    setMapRevision((n) => n + 1);
    setSceneRevision((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    if (loadedMapIdRef.current === selectedId) return;
    const info = maps.find((m) => m.id === selectedId);
    if (!info) return;
    try {
      loadMapData(info);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [selectedId, maps, loadMapData]);

  const onTilesetChange = (ts: ImportedTileset | null) => {
    persistTileset(ts);
    setTileset(ts);
    tilesetRef.current = ts;
  };

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const meta = mapMetaRef.current;
    const layers = currentLayersRef.current;
    const ts = tilesetRef.current;
    if (!canvas || !meta || !layers.ground) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { cols, rows, tileSize } = meta;
    const pan = panRef.current;
    const z = zoomRef.current;

    const terrainRevision = mapRevision * 1_000_000 + sceneRevision;
    terrainCacheRef.current = getTerrainCache(
      { ground: layers.ground, collision: layers.collision, cols, rows, tileSize },
      z,
      ts,
      terrainRevision,
      terrainCacheRef.current,
    );
    const terrain = terrainCacheRef.current.canvas;
    const mapW = terrain.width;
    const mapH = terrain.height;

    const displayW = Math.max(320, mapW + 40);
    const displayH = Math.max(240, mapH + 40);
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
      ctx.strokeStyle = drawRect.mode === "capture" ? "#f472b6" : "#7dd3fc";
      ctx.strokeRect(x, y, w, h);
    }

    if (polygonDraft && polygonDraft.points.length > 0) {
      const pts = [...polygonDraft.points];
      if (polygonDraft.hover) pts.push(polygonDraft.hover);
      ctx.beginPath();
      ctx.moveTo(pts[0].x * z, pts[0].y * z);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * z, pts[i].y * z);
      ctx.strokeStyle = polygonDraft.type === "sanctuary" ? "rgba(192, 132, 252, 0.9)" : "rgba(167, 139, 250, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (pts.length >= 3) {
        ctx.lineTo(pts[0].x * z, pts[0].y * z);
        ctx.fillStyle = polygonDraft.type === "sanctuary" ? "rgba(192, 132, 252, 0.1)" : "rgba(167, 139, 250, 0.08)";
        ctx.fill();
      }
      for (const p of polygonDraft.points) {
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(p.x * z - 3, p.y * z - 3, 6, 6);
      }
    }

    const hover = placementHoverRef.current;
    if (hover) {
      if (stampModeRef.current && activePrefabRef.current) {
        drawPrefabPlacementGhost(ctx, activePrefabRef.current, hover, z, tileSize, ts);
      } else if (entityStampModeRef.current && activeEntityRef.current) {
        drawEntityPlacementGhost(ctx, activeEntityRef.current, hover, z, tileSize);
      } else if (isTerrainTool(toolRef.current) || isCollisionTool(toolRef.current)) {
        drawTerrainPaintGhost(ctx, hover, toolRef.current, z, tileSize, ts, selectedTileIndexRef.current);
      }
    }

    ctx.restore();
  }, [zoom, selectedObj, drawRect, polygonDraft, mapRevision, sceneRevision, spritesRevision, stampMode, entityStampMode, activePrefabId, activeEntityId, tool, selectedTileIndex]);

  const drawSceneRef = useRef(drawScene);
  drawSceneRef.current = drawScene;

  const requestDraw = useCallback(() => {
    if (drawRafRef.current != null) return;
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;
      drawSceneRef.current();
    });
  }, []);

  useEffect(() => {
    sortedObjectsRef.current = sortObjectsForDraw(currentObjectsRef.current);
  }, [mapRevision, sceneRevision]);

  useEffect(() => {
    if (!stampMode && !entityStampMode && !isTerrainTool(tool) && !isCollisionTool(tool)) {
      placementHoverRef.current = null;
    }
    requestDraw();
  }, [stampMode, entityStampMode, tool, selectedTileIndex, drawScene, requestDraw]);

  useEffect(() => {
    // Only pan when focusSeq bumps (hierarchy select) — not when selectedObj
    // updates mid-drag, which would snap the camera every frame.
    if (inPrefabMode || !selectedObj || focusSeq === 0) return;
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
    const cancelPlacement = () => {
      setStampMode(false);
      setEntityStampMode(false);
      setCaptureMode(false);
      setDrawRect(null);
      setPolygonDraft(null);
      placementHoverRef.current = null;
      if (isMapPlaceTool(toolRef.current)) setTool("select");
      requestDraw();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === "v" || e.key === "V") {
        setTool("select");
        cancelPlacement();
      }
      if (e.key === "Enter" && polygonDraftRef.current && polygonDraftRef.current.points.length >= 3) {
        e.preventDefault();
        commitPolygonDraftRef.current?.();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPlacement();
        setTool("select");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceHeld(false);
        setPanning(false);
        paintingRef.current = false;
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const placing =
        stampModeRef.current ||
        entityStampModeRef.current ||
        captureMode ||
        isMapPlaceTool(toolRef.current);
      if (!placing) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (viewportRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-map-editor-keep-placement]")) return;
      cancelPlacement();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [captureMode, requestDraw]);

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

  const startPan = (clientX: number, clientY: number) => {
    setPanning(true);
    paintingRef.current = false;
    dragStart.current = { x: clientX, y: clientY, panX: panRef.current.x, panY: panRef.current.y };
  };

  const worldFromClient = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const meta = mapMetaRef.current;
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
      if (role === "unset") currentLayersRef.current.ground[i] = 0;
      else if (selectedTileIndex != null && ts) {
        currentLayersRef.current.ground[i] = ts.firstGid + selectedTileIndex;
      } else if (role) {
        currentLayersRef.current.ground[i] = gidForRole(role, ts);
      }
    } else if (isCollisionTool(tool)) {
      currentLayersRef.current.collision[i] = tool === "collision_block" ? 1 : 0;
    }
    rerender();
    requestDraw();
  };

  const placePointObject = (clientX: number, clientY: number) => {
    const w = worldFromClient(clientX, clientY);
    if (!w) return;
    const ts = w.meta.tileSize;
    const cx = Math.floor(w.x / ts) * ts + ts / 2;
    const cy = Math.floor(w.y / ts) * ts + ts / 2;
    const obj = entityFromPlacementTool(tool, cx, cy, selectedId || "greenwood", interactableRoles);
    if (!obj) return;
    if (inPrefabMode && editingPrefab) {
      handlePrefabChange({ ...editingPrefab, objects: [...editingPrefab.objects, obj] });
    } else {
      currentObjectsRef.current.push(obj);
      rerender();
      requestDraw();
    }
  };

  const finishRect = (x0: number, y0: number, x1: number, y1: number, mode: "place" | "capture") => {
    const meta = mapMetaRef.current;
    if (!meta) return;
    const ts = meta.tileSize;
    if (mode === "capture") {
      const c0 = Math.floor(x0 / ts);
      const r0 = Math.floor(y0 / ts);
      const c1 = Math.floor(x1 / ts);
      const r1 = Math.floor(y1 / ts);
      const name = prompt("Prefab name?", `Prefab ${prefabs.length + 1}`);
      if (!name?.trim()) return;
      const pf = capturePrefabFromMap(
        name.trim(),
        c0,
        r0,
        c1,
        r1,
        meta.cols,
        meta.rows,
        currentLayersRef.current.ground,
        currentLayersRef.current.collision,
        currentObjectsRef.current,
      );
      const next = [...prefabs, pf];
      setPrefabs(next);
      persistPrefabs(next);
      setActivePrefabId(pf.id);
      setCaptureMode(false);
      setStatus(`Captured prefab "${pf.name}"`);
      openPrefabEditor(pf.id, pf);
      return;
    }
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
      currentObjectsRef.current.push({
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
    }
    rerender();
    requestDraw();
  };

  const commitPolygonDraft = () => {
    const draft = polygonDraftRef.current;
    if (!draft || draft.points.length < 3) return;
    const candidate = createRegionObject({
      id: newObjectId(),
      type: draft.type,
      polygon: draft.points,
    });
    const clash = findOverlappingRegion(candidate, currentObjectsRef.current);
    if (clash) {
      const id = clash.properties.find((p) => p.name === "id")?.value ?? clash.name;
      setError(`${draft.type} overlaps existing zone "${id}"`);
      return;
    }
    currentObjectsRef.current.push(candidate);
    setPolygonDraft(null);
    setSelectedObj(candidate);
    setError(null);
    setTool("select");
    rerender();
    requestDraw();
  };
  commitPolygonDraftRef.current = commitPolygonDraft;

  const stampEntityAt = (clientX: number, clientY: number) => {
    if (!activeEntity) return;
    const w = worldFromClient(clientX, clientY);
    if (!w) return;
    const obj = instantiateEntity(activeEntity, w.x, w.y, selectedId || "greenwood", w.meta.tileSize);
    if (inPrefabMode && editingPrefab) {
      const objects = [...editingPrefab.objects, obj];
      handlePrefabChange({ ...editingPrefab, objects });
    } else {
      currentObjectsRef.current.push(obj);
      rerender();
      requestDraw();
    }
  };

  const stampPrefabAt = (clientX: number, clientY: number) => {
    if (!activePrefab) return;
    const t = tileAtClient(clientX, clientY);
    const meta = mapMetaRef.current;
    if (!t || !meta) return;
    stampPrefab(
      activePrefab,
      t.c,
      t.r,
      meta.cols,
      meta.rows,
      currentLayersRef.current.ground,
      currentLayersRef.current.collision,
      currentObjectsRef.current,
    );
    rerender();
    requestDraw();
  };

  const onSave = async () => {
    if (!selectedMap) return;
    if (!selectedMap.enabled) {
      setError("Enable the map before saving overrides.");
      return;
    }
    setStatus(null);
    setError(null);
    try {
      const diff = diffLayers(selectedMap.id, baseLayersRef.current, currentLayersRef.current);
      if (!objectsEqual(baseObjectsRef.current, currentObjectsRef.current)) {
        diff.objects = cloneObjects(currentObjectsRef.current);
      }
      await saveMapOverrides(selectedMap.id, diff);
      const tileCount = Object.values(diff.layers).reduce((n, p) => n + Object.keys(p).length, 0);
      const objCount = diff.objects?.length ?? 0;
      setStatus(`Saved ${tileCount} tile + ${objCount} object overrides`);
      await loadMaps();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed";
      if (message.includes("sign in again")) {
        clearAdminSession();
        clearAdminAuth();
        setScreen("admin_auth");
        return;
      }
      setError(message);
    }
  };

  const onCreateMap = async (input: { id: string; name: string; cols: number; rows: number }) => {
    setError(null);
    setStatus(`Creating ${input.name}…`);
    const created = await createAdminMap(input);
    setMaps((prev) => {
      const without = prev.filter((m) => m.id !== created.id);
      return [...without, created];
    });
    setSelectedId(created.id);
    try {
      loadMapData(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
    setStatus(`Created ${created.name} — server running.`);
    void loadMaps();
  };

  const onEnableMap = async () => {
    if (!selectedId) return;
    setError(null);
    setStatus("Enabling…");
    try {
      await enableAdminMap(selectedId);
      await loadMaps();
      setStatus("Map enabled — server running.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    }
  };

  const onDisableMap = async () => {
    if (!selectedId || !selectedMap) return;
    if (!confirm(`Disable ${selectedMap.name}? Players will be moved off this map and the server will stop.`)) return;
    setError(null);
    setStatus("Disabling…");
    try {
      await disableAdminMap(selectedId);
      await loadMaps();
      setStatus("Map disabled.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    }
  };

  const onRemoveMap = async () => {
    if (!selectedId || !selectedMap) return;
    if (!confirm(`Remove ${selectedMap.name}? This evacuates players, stops the server, and deletes map files.`)) return;
    setError(null);
    setStatus("Removing…");
    try {
      await removeAdminMap(selectedId);
      const list = await fetchAdminMaps();
      setMaps(list);
      setSelectedId(list[0]?.id ?? "");
      setStatus("Map removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    }
  };

  const onExit = () => {
    clearAdminSession();
    clearAdminAuth();
    setScreen("title");
  };

  const updateObject = (obj: EditorObject) => {
    applyObjectLive(obj, selectedObj ?? obj);
  };

  const applyObjectLive = (next: EditorObject, prev: EditorObject) => {
    if (inPrefabMode && editingPrefab) {
      const objects = replaceObjectInList(editingPrefab.objects, next, prev);
      const updated = { ...editingPrefab, objects };
      setEditingPrefab(updated);
      setPrefabs((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      setSelectedObj(next);
      return;
    }
    currentObjectsRef.current = replaceObjectInList(currentObjectsRef.current, next, prev);
    setSelectedObj(next);
    rerender();
    requestDraw();
  };

  const endObjectDrag = () => {
    const drag = objectDragRef.current;
    if (drag && isPolygonRegion(drag.orig) && selectedObj) {
      const clash = findOverlappingRegion(selectedObj, currentObjectsRef.current, drag.orig);
      if (clash) {
        const id = clash.properties.find((p) => p.name === "id")?.value ?? clash.name;
        setError(`Edit overlaps zone "${id}" — reverted`);
        applyObjectLive(drag.orig, selectedObj);
      } else {
        setError(null);
      }
    }
    objectDragRef.current = null;
    setObjectDragging(false);
  };

  const handleObjectDragMove = (clientX: number, clientY: number) => {
    const drag = objectDragRef.current;
    const w = worldFromClient(clientX, clientY);
    if (!drag || !w) return;
    const next = applyObjectDrag(drag, w.x, w.y, w.meta.tileSize, w.meta.cols, w.meta.rows);
    applyObjectLive(next, drag.orig);
  };

  const deleteObject = () => {
    if (!selectedObj) return;
    if (inPrefabMode && editingPrefab) {
      const objects = editingPrefab.objects.filter(
        (o) => !(o.id === selectedObj.id || (o.name === selectedObj.name && o.type === selectedObj.type)),
      );
      const next = { ...editingPrefab, objects };
      setEditingPrefab(next);
      setPrefabs((list) => list.map((p) => (p.id === next.id ? next : p)));
      setSelectedObj(null);
      return;
    }
    currentObjectsRef.current = currentObjectsRef.current.filter(
      (o) => !(o.id === selectedObj.id || (o.name === selectedObj.name && o.type === selectedObj.type)),
    );
    setSelectedObj(null);
    rerender();
    requestDraw();
  };

  const openPrefabEditor = (id: string, prefabOverride?: MapPrefab) => {
    const pf = prefabOverride ?? prefabs.find((p) => p.id === id);
    if (!pf) return;
    setWorkspacePage("map");
    setEditingPrefabId(id);
    setEditingPrefab({ ...pf, ground: [...pf.ground], collision: [...pf.collision], objects: cloneObjects(pf.objects) });
    setActivePrefabId(id);
    setSelectedObj(null);
    setStampMode(false);
    setCaptureMode(false);
    setEntityStampMode(false);
    setTool("select");
    setToolboxTab("terrain");
    setStatus(null);
    setPrefabEditorKey((k) => k + 1);
  };

  const closePrefabEditor = () => {
    if (editingPrefab) {
      const next = prefabs.map((p) => (p.id === editingPrefab.id ? editingPrefab : p));
      persistPrefabs(next);
      setPrefabs(next);
    }
    setEditingPrefabId(null);
    setEditingPrefab(null);
    setSelectedObj(null);
  };

  const saveEditingPrefab = () => {
    if (!editingPrefab) return;
    const next = prefabs.map((p) => (p.id === editingPrefab.id ? editingPrefab : p));
    persistPrefabs(next);
    setPrefabs(next);
    setStatus(`Saved prefab "${editingPrefab.name}"`);
  };

  const handlePrefabChange = (pf: MapPrefab) => {
    setEditingPrefab(pf);
    setPrefabs((list) => list.map((p) => (p.id === pf.id ? pf : p)));
  };

  const handlePrefabResize = (w: number, h: number) => {
    if (!editingPrefab) return;
    const next = resizePrefab(editingPrefab, w, h, tileset);
    setEditingPrefab(next);
    setPrefabs((list) => list.map((p) => (p.id === next.id ? next : p)));
    setPrefabEditorKey((k) => k + 1);
  };

  const handlePrefabName = (name: string) => {
    if (!editingPrefab) return;
    const next = { ...editingPrefab, name };
    setEditingPrefab(next);
    setPrefabs((list) => list.map((p) => (p.id === next.id ? next : p)));
  };

  const handleCanvasDown = (e: React.MouseEvent) => {
    if (isPanButton(e.button) || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;

    const w = worldFromClient(e.clientX, e.clientY);
    if (!w) return;
    const ts = w.meta.tileSize;

    const placing =
      (entityStampMode && !!activeEntity) ||
      (stampMode && !!activePrefab) ||
      captureMode ||
      isMapPlaceTool(tool) ||
      isTerrainTool(tool) ||
      isCollisionTool(tool);

    // Object drag/select only when not actively placing — otherwise the ghost
    // sits over existing objects and steals the click.
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
      const hit = hitObject(currentObjectsRef.current, w.x, w.y, ts, (o) =>
        inPrefabMode ? true : objectMatchesInteractMode(o, interactMode),
      );
      if (hit && isDraggableObject(hit)) {
        setSelectedObj(hit);
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
        setSelectedObj(hit);
        return;
      }
    }

    if (entityStampMode && activeEntity) {
      stampEntityAt(e.clientX, e.clientY);
      return;
    }

    if (stampMode && activePrefab) {
      stampPrefabAt(e.clientX, e.clientY);
      return;
    }

    if (captureMode) {
      setDrawRect({ x0: w.x, y0: w.y, x1: w.x, y1: w.y, mode: "capture" });
      return;
    }

    if (tool === "portal") {
      setDrawRect({ x0: w.x, y0: w.y, x1: w.x, y1: w.y, mode: "place" });
      return;
    }

    if (tool === "region" || tool === "sanctuary") {
      const pt = snapPolyPoint(w.x, w.y, ts);
      setPolygonDraft((prev) => {
        if (!prev || prev.type !== tool) {
          return { type: tool, points: [pt], hover: null };
        }
        if (prev.points.length >= 3) {
          const first = prev.points[0];
          if (Math.hypot(pt.x - first.x, pt.y - first.y) <= ts * 0.6) {
            // Close on next tick so state has the draft for commit.
            queueMicrotask(() => commitPolygonDraftRef.current?.());
            return prev;
          }
        }
        return { ...prev, points: [...prev.points, pt], hover: null };
      });
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

  const deleteObjectByRef = (obj: EditorObject) => {
    if (inPrefabMode && editingPrefab) {
      const objects = editingPrefab.objects.filter((o) => !objectsMatch(o, obj));
      const next = { ...editingPrefab, objects };
      setEditingPrefab(next);
      setPrefabs((list) => list.map((p) => (p.id === next.id ? next : p)));
      if (selectedObj && objectsMatch(selectedObj, obj)) setSelectedObj(null);
      return;
    }
    currentObjectsRef.current = currentObjectsRef.current.filter((o) => !objectsMatch(o, obj));
    if (selectedObj && objectsMatch(selectedObj, obj)) setSelectedObj(null);
    rerender();
    requestDraw();
  };

  const changeInteractMode = (mode: EditorInteractMode) => {
    setInteractMode(mode);
    setTool("select");
    setStampMode(false);
    setEntityStampMode(false);
    setCaptureMode(false);
    setDrawRect(null);
    setActiveEntityId(null);
    setActivePrefabId(null);
    setSelectedObj((prev) => (prev && objectMatchesInteractMode(prev, mode) ? prev : null));
    if (mode === "terrain") setToolboxTab("terrain");
    else if (mode === "region") setToolboxTab("region");
    else setToolboxTab("entities");
  };

  const selectFromHierarchy = (obj: EditorObject | null) => {
    if (obj) {
      const mode = interactModeForObject(obj);
      if (mode) changeInteractMode(mode);
    }
    setSelectedObj(obj);
    setTool("select");
    setEntityStampMode(false);
    setStampMode(false);
    if (obj) setFocusSeq((n) => n + 1);
  };

  const sceneObjects = useMemo(() => {
    if (inPrefabMode && editingPrefab) return editingPrefab.objects;
    return currentObjectsRef.current;
  }, [inPrefabMode, editingPrefab, mapRevision, sceneRevision]);

  const switchWorkspacePage = (page: EditorWorkspacePage) => {
    if (inPrefabMode) closePrefabEditor();
    setWorkspacePage(page);
    setSelectedObj(null);
    setStampMode(false);
    setEntityStampMode(false);
    setCaptureMode(false);
    setTool("select");
    if (page === "map") setToolboxTab("entities");
    setStatus(null);
  };

  const requestNewEntity = () => {
    setPendingNewEntityDialog(true);
    switchWorkspacePage("entities");
  };

  const toolboxScope = inPrefabMode ? "prefab" : "map";

  if (workspacePage === "entities" && !inPrefabMode) {
    return (
      <div className="map-editor-shell">
        <EditorWorkspaceNav page={workspacePage} onPage={switchWorkspacePage} onExit={onExit} />
        <EntityEditorPage
          entities={entities}
          onEntitiesChange={(next) => {
            setEntities(next);
            persistEntities(next);
          }}
          items={items}
          quests={quests}
          drops={drops}
          tileset={tileset}
          maps={maps}
          currentMapId={selectedId}
          status={status}
          error={error}
          onStatus={setStatus}
          openNewDialog={pendingNewEntityDialog}
          onNewDialogHandled={() => setPendingNewEntityDialog(false)}
        />
      </div>
    );
  }

  if (workspacePage === "items" && !inPrefabMode) {
    return (
      <div className="map-editor-shell">
        <EditorWorkspaceNav page={workspacePage} onPage={switchWorkspacePage} onExit={onExit} />
        <ItemsEditorPage
          items={items}
          onItemsChange={(next) => {
            setItems(next);
            persistItems(next);
          }}
          status={status}
          error={error}
          onStatus={setStatus}
        />
      </div>
    );
  }

  if (workspacePage === "quests" && !inPrefabMode) {
    return (
      <div className="map-editor-shell">
        <EditorWorkspaceNav page={workspacePage} onPage={switchWorkspacePage} onExit={onExit} />
        <QuestsEditorPage
          items={quests}
          onItemsChange={(next) => {
            setQuests(next);
            persistQuests(next);
          }}
          status={status}
          error={error}
          onStatus={setStatus}
        />
      </div>
    );
  }

  if (workspacePage === "jobs" && !inPrefabMode) {
    return (
      <div className="map-editor-shell">
        <EditorWorkspaceNav page={workspacePage} onPage={switchWorkspacePage} onExit={onExit} />
        <JobsEditorPage
          items={jobs}
          skills={skills}
          onItemsChange={(next) => {
            setJobs(next);
            persistJobs(next);
          }}
          onSkillsChange={(next) => {
            setSkills(next);
            persistSkills(next);
          }}
          status={status}
          error={error}
          onStatus={setStatus}
        />
      </div>
    );
  }

  if (workspacePage === "skills" && !inPrefabMode) {
    return (
      <div className="map-editor-shell">
        <EditorWorkspaceNav page={workspacePage} onPage={switchWorkspacePage} onExit={onExit} />
        <SkillsEditorPage
          items={skills}
          onItemsChange={(next) => {
            setSkills(next);
            persistSkills(next);
          }}
          status={status}
          error={error}
          onStatus={setStatus}
        />
      </div>
    );
  }

  if (workspacePage === "drops" && !inPrefabMode) {
    return (
      <div className="map-editor-shell">
        <EditorWorkspaceNav page={workspacePage} onPage={switchWorkspacePage} onExit={onExit} />
        <DropsEditorPage
          drops={drops}
          items={items}
          onDropsChange={(next) => {
            setDrops(next);
            persistDrops(next);
          }}
          status={status}
          error={error}
          onStatus={setStatus}
        />
      </div>
    );
  }

  return (
    <div className="map-editor-shell">
      <EditorWorkspaceNav page={workspacePage} onPage={switchWorkspacePage} onExit={onExit} />
      <MapEditorChrome
        mode={inPrefabMode ? "prefab" : "world"}
        mapOptions={maps}
        selectedMapId={selectedId}
        onMapChange={inPrefabMode ? undefined : setSelectedId}
        onSave={inPrefabMode ? saveEditingPrefab : () => void onSave()}
        onBack={inPrefabMode ? closePrefabEditor : undefined}
        onCreateMap={inPrefabMode ? undefined : () => setCreateMapOpen(true)}
        onEnableMap={inPrefabMode ? undefined : () => void onEnableMap()}
        onDisableMap={inPrefabMode ? undefined : () => void onDisableMap()}
        onRemoveMap={inPrefabMode ? undefined : () => void onRemoveMap()}
        interactMode={inPrefabMode ? undefined : interactMode}
        onInteractMode={inPrefabMode ? undefined : changeInteractMode}
        status={status}
        error={error}
        editingPrefabName={editingPrefab?.name}
      />
      <CreateMapDialog
        open={createMapOpen && !inPrefabMode}
        onClose={() => setCreateMapOpen(false)}
        onCreate={onCreateMap}
      />
      <div className="map-editor-layout">
      <div className="map-editor-dock-left">
        {showMapWorkspace && !inPrefabMode && (
          <MapEditorHierarchy
            objects={sceneObjects}
            selected={selectedObj}
            onSelect={selectFromHierarchy}
            onDelete={deleteObjectByRef}
          />
        )}
        <MapEditorToolbox
          tool={tool}
          onTool={(t) => {
            setTool(t);
            setStampMode(false);
            setEntityStampMode(false);
            setCaptureMode(false);
          }}
          scope={toolboxScope}
          tab={toolboxTab}
          onTab={setToolboxTab}
          interactMode={inPrefabMode ? undefined : interactMode}
          tileset={tileset}
          onTilesetChange={onTilesetChange}
          selectedTileIndex={selectedTileIndex}
          onSelectTileIndex={setSelectedTileIndex}
          prefabs={prefabs}
          onPrefabsChange={setPrefabs}
          activePrefabId={activePrefabId}
          editingPrefabId={editingPrefabId}
          onActivePrefab={(id) => {
            setActivePrefabId(id);
            if (id) {
              setInteractMode("entity");
              setToolboxTab("prefabs");
              setStampMode(true);
              setEntityStampMode(false);
              setCaptureMode(false);
              setTool("select");
              setDrawRect(null);
            } else {
              setStampMode(false);
            }
          }}
          onEditPrefab={openPrefabEditor}
          stampMode={stampMode}
          onCaptureMode={() => {
            if (inPrefabMode) return;
            setInteractMode("entity");
            setToolboxTab("prefabs");
            setCaptureMode((v) => !v);
            setStampMode(false);
            setEntityStampMode(false);
            setTool("select");
          }}
          capturing={captureMode}
          entities={entities}
          activeEntityId={activeEntityId}
          onActiveEntity={(id) => {
            setActiveEntityId(id);
            if (id) {
              setInteractMode("entity");
              setToolboxTab("entities");
              setEntityStampMode(true);
              setStampMode(false);
              setCaptureMode(false);
              setTool("select");
              setDrawRect(null);
            } else {
              setEntityStampMode(false);
            }
          }}
          entityStampMode={entityStampMode}
          onRequestNewEntity={requestNewEntity}
        />
      </div>
      {inPrefabMode && editingPrefab ? (
        <PrefabEditorView
          key={`${editingPrefab.id}-${prefabEditorKey}`}
          prefab={editingPrefab}
          tool={tool}
          tileset={tileset}
          selectedTileIndex={selectedTileIndex}
          selectedObj={selectedObj}
          onSelectObject={setSelectedObj}
          focusSeq={focusSeq}
          regionId={selectedId || "prefab"}
          interactableRoles={interactableRoles}
          onChange={handlePrefabChange}
        />
      ) : (
        <div
          ref={viewportRef}
          className={`map-editor-viewport ${panning || spaceHeld ? "map-editor-viewport--pan" : ""} ${tool === "select" ? "map-editor-viewport--select" : ""} ${objectDragging ? "map-editor-viewport--drag-object" : ""} ${placingSomething ? "map-editor-viewport--placing" : ""}`}
        >
          <p className="map-editor-viewport-hint dim">
            {interactMode === "terrain" || isTerrainTool(tool) || isCollisionTool(tool)
              ? "Paint terrain & collision · Scroll zoom · Middle/right-drag pan · Space+drag pan"
              : interactMode === "region"
                ? "Select regions · Click vertices to place region/sanctuary (close on first point / Enter / double-click) · Drag portal · Scroll zoom · Middle/right-drag pan"
                : "V = select · Drag entities to move · Scroll zoom · Middle/right-drag pan · Space+drag pan"}
            {stampMode && activePrefab ? ` · Placing: ${activePrefab.name} (Esc cancel)` : ""}
            {entityStampMode && activeEntity ? ` · Placing entity: ${activeEntity.name} (Esc cancel)` : ""}
            {captureMode ? " · Drag to capture prefab (Esc cancel)" : ""}
            {polygonDraft
              ? ` · Drawing ${polygonDraft.type}: ${polygonDraft.points.length} verts (Enter/double-click/close on start · Esc cancel)`
              : ""}
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
              if (polygonDraft) {
                const w = worldFromClient(e.clientX, e.clientY);
                if (w) {
                  const pt = snapPolyPoint(w.x, w.y, w.meta.tileSize);
                  setPolygonDraft((d) => (d ? { ...d, hover: pt } : d));
                }
                return;
              }
              if (paintingRef.current && (isTerrainTool(tool) || isCollisionTool(tool))) {
                paintTile(e.clientX, e.clientY);
              }
              if (
                isTerrainTool(tool) ||
                isCollisionTool(tool) ||
                (stampMode && activePrefab) ||
                (entityStampMode && activeEntity)
              ) {
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
                endObjectDrag();
              }
              if (drawRect && e.button === 0 && !spaceHeld) {
                finishRect(drawRect.x0, drawRect.y0, drawRect.x1, drawRect.y1, drawRect.mode);
                setDrawRect(null);
              }
              if (isPanButton(e.button) || e.button === 0) {
                if (panning) setPan({ ...panRef.current });
                setPanning(false);
              }
              paintingRef.current = false;
            }}
            onMouseLeave={() => {
              endObjectDrag();
              if (drawRect?.mode !== "capture") setDrawRect(null);
              if (polygonDraft) setPolygonDraft((d) => (d ? { ...d, hover: null } : d));
              if (panning) setPan({ ...panRef.current });
              setPanning(false);
              paintingRef.current = false;
              if (placementHoverRef.current) {
                placementHoverRef.current = null;
                requestDraw();
              }
            }}
            onDoubleClick={(e) => {
              if ((tool === "region" || tool === "sanctuary") && polygonDraft && polygonDraft.points.length >= 3) {
                e.preventDefault();
                commitPolygonDraft();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            onAuxClick={(e) => e.preventDefault()}
          />
        </div>
      )}
      <MapEditorInspector
        obj={selectedObj}
        maps={maps}
        currentMapId={selectedId}
        tileset={tileset}
        items={items}
        quests={quests}
        drops={drops}
        onUpdate={updateObject}
        onDelete={deleteObject}
        onServerApplied={() => void loadMaps()}
        onServerStatus={setStatus}
        onServerError={setError}
        prefabSettings={
          inPrefabMode && editingPrefab
            ? {
                name: editingPrefab.name,
                width: editingPrefab.widthTiles,
                height: editingPrefab.heightTiles,
                onName: handlePrefabName,
                onResize: handlePrefabResize,
              }
            : undefined
        }
      />
      </div>
    </div>
  );
}

function EditorWorkspaceNav({
  page,
  onPage,
  onExit,
}: {
  page: EditorWorkspacePage;
  onPage: (p: EditorWorkspacePage) => void;
  onExit: () => void;
}) {
  const tabs: { id: EditorWorkspacePage; label: string }[] = [
    { id: "map", label: "Map" },
    { id: "entities", label: "Entities" },
    { id: "items", label: "Items" },
    { id: "quests", label: "Quests" },
    { id: "jobs", label: "Classes" },
    { id: "skills", label: "Skills" },
    { id: "drops", label: "Drops" },
  ];
  return (
    <div className="map-editor-workspace-nav">
      <div className="map-editor-workspace-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`map-editor-workspace-tab ${page === t.id ? "on" : ""}`}
            onClick={() => onPage(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button type="button" className="cm-btn map-editor-workspace-exit" onClick={onExit}>
        Exit
      </button>
    </div>
  );
}
