import { useCallback, useEffect, useRef, useState } from "react";
import { clampZoom, isEditableKeyboardTarget, panToCenterWorldPoint, ZOOM_STEP } from "../editor/editorCanvasUtils";
import { drawEditorObject, ensureEditorSpritesLoaded } from "../editor/editorEntitySprites";
import { entityPreviewDrawPosition, entityPreviewSize, type EntityDefinition } from "../editor/entities";
import { ENTITY_KIND_LABELS } from "../editor/entityCatalog";
import { TILE_PX } from "../editor/editorTypes";
import type { EditorObject } from "../editor/editorTypes";
import type { ImportedTileset } from "../editor/tilesetConfig";

interface Props {
  entity: EntityDefinition;
  tileset: ImportedTileset | null;
  onSelectObject: (o: EditorObject | null) => void;
}

export function EntityEditorView({ entity, tileset: _tileset, onSelectObject }: Props) {
  const [spritesRevision, setSpritesRevision] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef(entity.template);
  const kindRef = useRef(entity.kind);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const needsCenterRef = useRef(true);
  const drawRafRef = useRef<number | null>(null);
  panRef.current = pan;
  zoomRef.current = zoom;
  templateRef.current = entity.template;
  kindRef.current = entity.kind;

  useEffect(() => {
    ensureEditorSpritesLoaded()
      .then(() => setSpritesRevision((n) => n + 1))
      .catch(() => {});
  }, []);

  const requestDraw = useCallback(() => {
    if (drawRafRef.current != null) return;
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;
      drawRef.current();
    });
  }, []);

  const attemptCenter = useCallback(() => {
    if (!needsCenterRef.current) return;
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return;

    const { width, height } = entityPreviewSize(kindRef.current);
    const z = zoomRef.current;
    const nextPan = panToCenterWorldPoint(viewport, width / 2, height / 2, z);
    panRef.current = nextPan;
    setPan(nextPan);
    needsCenterRef.current = false;
    requestDraw();
  }, [requestDraw]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = viewport.clientWidth;
    const cssH = viewport.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#1a2332";
    ctx.fillRect(0, 0, cssW, cssH);

    const p = panRef.current;
    const z = zoomRef.current;
    const { width: worldW, height: worldH } = entityPreviewSize(entity.kind);
    const ts = TILE_PX;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(z, z);

    for (let r = 0; r < Math.ceil(worldH / ts); r++) {
      for (let c = 0; c < Math.ceil(worldW / ts); c++) {
        ctx.fillStyle = "#3d6b4f";
        ctx.fillRect(c * ts, r * ts, ts, ts);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1 / z;
        ctx.strokeRect(c * ts + 0.5 / z, r * ts + 0.5 / z, ts - 1 / z, ts - 1 / z);
      }
    }

    ctx.strokeStyle = "rgba(232, 201, 106, 0.45)";
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(0.5 / z, 0.5 / z, worldW - 1 / z, worldH - 1 / z);

    const pos = entityPreviewDrawPosition(entity.kind, templateRef.current);
    drawEditorObject(ctx, { ...templateRef.current, x: pos.x, y: pos.y }, 1, true);
    ctx.restore();
  }, [entity.kind, spritesRevision]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    draw();
  }, [draw, entity.template, zoom, pan]);

  useEffect(() => {
    onSelectObject(entity.template);
  }, [entity.id, onSelectObject]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const ro = new ResizeObserver(() => {
      attemptCenter();
      requestDraw();
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [attemptCenter, requestDraw]);

  useEffect(() => {
    // Re-center preview when switching entities (defer until viewport has size).
    needsCenterRef.current = true;
    const z = 2;
    zoomRef.current = z;
    setZoom(z);
    attemptCenter();
    const raf = requestAnimationFrame(() => attemptCenter());
    return () => cancelAnimationFrame(raf);
  }, [entity.id, entity.kind, attemptCenter]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPanButton(e.button) || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      setPanning(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!panning) return;
    panRef.current = {
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    };
    requestDraw();
  };

  const endPan = () => {
    if (panning) setPan({ ...panRef.current });
    setPanning(false);
  };

  return (
    <div
      ref={viewportRef}
      className={`map-editor-viewport map-editor-viewport--entity ${panning || spaceHeld ? "map-editor-viewport--pan" : ""}`}
    >
      <div className="map-editor-prefab-banner map-editor-entity-banner">
        <span className="map-editor-prefab-banner-label">Entity template</span>
        <span className="map-editor-prefab-banner-name">
          {entity.name} · {ENTITY_KIND_LABELS[entity.kind]}
        </span>
        <span className="dim">{Math.round(zoom * 100)}%</span>
      </div>
      <p className="map-editor-viewport-hint dim">
        Scroll zoom · Middle/right-drag pan · Space+drag pan · Edit fields in the Inspector
      </p>
      <canvas
        ref={canvasRef}
        className="map-editor-canvas map-editor-canvas--main"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        onContextMenu={(e) => e.preventDefault()}
        onAuxClick={(e) => e.preventDefault()}
      />
    </div>
  );
}
