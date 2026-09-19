import { useCallback, useEffect, useRef, useState } from "react";
import type { AtlasMap, VisitedSavePoint } from "../types";
import { FILL } from "../world/overworld";
import { loadMapImage } from "../world/mapImage";
import { markersForMap, type MapMarker } from "../world/mapMarkers";
import { HoverTooltip } from "../ui/HoverTooltip";
import { useGame } from "../state/store";
import { fetchAtlas } from "../net/atlas";

/** Stable fallback so Zustand selectors never return a fresh [] each snapshot. */
const EMPTY_VISITED: VisitedSavePoint[] = [];

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DEFAULT_ZOOM = 2.2;
const DRAG_THRESHOLD = 5;

/**
 * Cell-array fallback for when the baked map image fails to load — paints at
 * 1px/tile via a single ImageData write (the plane CSS stretches + pixelates
 * it), so even a 1280×960 map costs one buffer instead of millions of
 * fillRect calls.
 */
function paintTerrain(canvas: HTMLCanvasElement, map: AtlasMap["overworld"]) {
  const ctx = canvas.getContext("2d");
  if (!ctx || map.cols <= 0 || map.rows <= 0) return;
  canvas.width = map.cols;
  canvas.height = map.rows;
  const img = ctx.createImageData(map.cols, map.rows);
  const px = img.data;
  for (let i = 0; i < map.cols * map.rows; i++) {
    const rgb = FILL[map.cells[i] ?? "#"] ?? 0x1a3a22;
    const o = i * 4;
    px[o] = (rgb >> 16) & 0xff;
    px[o + 1] = (rgb >> 8) & 0xff;
    px[o + 2] = rgb & 0xff;
    px[o + 3] = 0xff;
  }
  ctx.putImageData(img, 0, 0);
}

type TerrainSource = (ImageBitmap | HTMLCanvasElement) & { width: number; height: number };

/**
 * Bake the square world-rect terrain into the isometric projection the world
 * scene uses: world (x,y) → iso (x−y, (x+y)/2). Output is always 2:1 — the
 * iso bounds of any tile map are (cols+rows)·t wide by half that tall.
 */
function drawIsoTerrain(
  canvas: HTMLCanvasElement,
  src: TerrainSource,
  ow: AtlasMap["overworld"],
) {
  const t = Math.max(1, ow.tile);
  const colsT = ow.cols * t;
  const rowsT = ow.rows * t;
  const isoW = colsT + rowsT;
  if (isoW <= 0) return;
  const outW = Math.min(4096, Math.max(2, (ow.cols + ow.rows) * 2));
  const outH = Math.max(1, Math.round(outW / 2));
  if (canvas.width !== outW || canvas.height !== outH) {
    canvas.width = outW;
    canvas.height = outH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = outW / isoW;
  // canvas = s·iso + offset: a=s, b=s/2, c=−s, d=s/2, e=s·rowsT (iso x min).
  ctx.imageSmoothingEnabled = true;
  ctx.setTransform(s, s / 2, -s, s / 2, s * rowsT, 0);
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, colsT, rowsT);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** World point → position within the iso-projected plane, in percent. */
function isoPct(map: AtlasMap["overworld"], x: number, y: number) {
  const t = Math.max(1, map.tile);
  const isoW = Math.max(1, (map.cols + map.rows) * t);
  return {
    left: ((x - y + map.rows * t) / isoW) * 100,
    top: ((x + y) / isoW) * 100,
  };
}

/** World point → fractional position inside the iso plane (0..1). */
function isoFrac(map: AtlasMap["overworld"], x: number, y: number) {
  const t = Math.max(1, map.tile);
  const isoW = Math.max(1, (map.cols + map.rows) * t);
  return {
    fx: (x - y + map.rows * t) / isoW,
    fy: (x + y) / isoW,
  };
}

function clampPan(x: number, y: number, viewW: number, viewH: number, planeW: number, planeH: number) {
  const nx =
    planeW <= viewW ? (viewW - planeW) / 2 : Math.min(0, Math.max(viewW - planeW, x));
  const ny =
    planeH <= viewH ? (viewH - planeH) / 2 : Math.min(0, Math.max(viewH - planeH, y));
  return { x: nx, y: ny };
}

function fitSize(viewW: number, viewH: number, cols: number, rows: number) {
  const mapAspect = cols / Math.max(1, rows);
  const viewAspect = viewW / Math.max(1, viewH);
  if (viewAspect > mapAspect) {
    const h = viewH;
    return { w: h * mapAspect, h };
  }
  const w = viewW;
  return { w, h: w / mapAspect };
}

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function WorldMap({
  maps,
  selectedMapId,
  onSelectMap,
  markers,
  selectedMarkerId,
  onSelectMarker,
  onResetSelection,
  caption,
}: {
  maps: AtlasMap[];
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  markers: MapMarker[];
  selectedMarkerId?: string | null;
  onSelectMarker?: (id: string) => void;
  onResetSelection?: () => void;
  caption?: string;
}) {
  const atlas = maps.find((m) => m.id === selectedMapId) ?? maps[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [grabbing, setGrabbing] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const didDrag = useRef(false);
  const needsCenter = useRef(true);
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Bake the iso terrain once per map — the server PNG when it decodes,
  // otherwise the cell-array fallback.
  useEffect(() => {
    if (!atlas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let live = true;
    loadMapImage(atlas.id).then((img) => {
      if (!live) return;
      let src: TerrainSource | null = img;
      if (!src) {
        const cells = document.createElement("canvas");
        paintTerrain(cells, atlas.overworld);
        src = cells;
      }
      drawIsoTerrain(canvas, src, atlas.overworld);
    });
    return () => {
      live = false;
    };
  }, [atlas]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setView({ w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [atlas?.id]);

  const ow = atlas?.overworld;
  // The plane is the iso-projected map — always a 2:1 diamond bounding box.
  const fit =
    ow && view.w > 0
      ? fitSize(view.w, view.h, ow.cols + ow.rows, (ow.cols + ow.rows) / 2)
      : { w: 0, h: 0 };
  const planeW = fit.w * zoom;
  const planeH = fit.h * zoom;

  const clamp = useCallback(
    (x: number, y: number, pw = planeW, ph = planeH) => clampPan(x, y, view.w, view.h, pw, ph),
    [view.w, view.h, planeW, planeH],
  );

  useEffect(() => {
    needsCenter.current = true;
    setZoom(DEFAULT_ZOOM);
  }, [atlas?.id]);

  useEffect(() => {
    if (!atlas || !ow || view.w <= 0) return;
    const z = needsCenter.current ? DEFAULT_ZOOM : zoom;
    const f = fitSize(view.w, view.h, ow.cols + ow.rows, (ow.cols + ow.rows) / 2);
    const pw = f.w * z;
    const ph = f.h * z;
    if (pw <= 0 || ph <= 0) return;
    if (!needsCenter.current) {
      setPan((p) => clampPan(p.x, p.y, view.w, view.h, planeW, planeH));
      return;
    }
    needsCenter.current = false;
    const focus =
      markers.find((m) => m.id === selectedMarkerId) ??
      markers.find((m) => m.kind === "player") ??
      markers.find((m) => m.home);
    const { fx, fy } = focus
      ? isoFrac(ow, focus.x, focus.y)
      : { fx: 0.5, fy: 0.5 };
    setPan(clampPan(view.w / 2 - fx * pw, view.h / 2 - fy * ph, view.w, view.h, pw, ph));
    // Center once per map using default zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas?.id, view.w, view.h, zoom, planeW, planeH]);

  const selected = markers.find((m) => m.id === selectedMarkerId);
  const focusMarker = selected?.kind === "save_point" ? selected : undefined;

  useEffect(() => {
    if (!focusMarker || !ow || view.w <= 0 || planeW <= 0 || planeH <= 0) return;
    const { fx, fy } = isoFrac(ow, focusMarker.x, focusMarker.y);
    setPan(
      clampPan(
        view.w / 2 - fx * planeW,
        view.h / 2 - fy * planeH,
        view.w,
        view.h,
        planeW,
        planeH,
      ),
    );
  }, [focusMarker?.id, focusMarker?.x, focusMarker?.y, atlas?.id, view.w, view.h, planeW, planeH, ow]);

  const applyZoom = useCallback(
    (next: number, anchorClientX: number, anchorClientY: number) => {
      if (!viewportRef.current || fit.w <= 0) {
        setZoom(clampZoom(next));
        return;
      }
      const z = clampZoom(next);
      const rect = viewportRef.current.getBoundingClientRect();
      const vx = anchorClientX - rect.left;
      const vy = anchorClientY - rect.top;
      const cur = panRef.current;
      const pw = fit.w * zoomRef.current;
      const ph = fit.h * zoomRef.current;
      const wx = pw > 0 ? (vx - cur.x) / pw : 0.5;
      const wy = ph > 0 ? (vy - cur.y) / ph : 0.5;
      const npw = fit.w * z;
      const nph = fit.h * z;
      setZoom(z);
      setPan(clampPan(vx - wx * npw, vy - wy * nph, view.w, view.h, npw, nph));
    },
    [fit.w, fit.h, view.w, view.h],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyZoom(zoomRef.current * factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom, atlas?.id]);

  if (!atlas || !ow) {
    return <p className="hint">Map data is not available yet.</p>;
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".world-map-poi")) return;
    didDrag.current = false;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      didDrag.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setGrabbing(true);
    setPan(clamp(d.panX + dx, d.panY + dy));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onResetSelection?.();
    drag.current = null;
    didDrag.current = false;
    setGrabbing(false);
  };

  return (
    <div className="world-map">
      <div className={`world-map-body ${maps.length > 1 ? "world-map-body--tabs" : ""}`}>
        {maps.length > 1 && (
          <div className="cm-tabs world-map-tabs">
            {maps.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`cm-tab ${m.id === atlas.id ? "on" : ""}`}
                onClick={() => {
                  didDrag.current = false;
                  onResetSelection?.();
                  onSelectMap(m.id);
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        <div
          ref={viewportRef}
          className={`world-map-viewport ${grabbing ? "grabbing" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="world-map-plane"
            style={{
              width: planeW || "100%",
              height: planeH || "100%",
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            <canvas ref={canvasRef} className="world-map-canvas" />
            {markers.map((m) => {
              const pct = isoPct(ow, m.x, m.y);
              return (
                <HoverTooltip key={m.id} content={m.name}>
                  <button
                    type="button"
                    className={[
                      "world-map-poi",
                      `poi-${m.kind}`,
                      m.home ? "home" : "",
                      m.discovered ? "" : "undiscovered",
                      m.selectable ? "selectable" : "",
                      selectedMarkerId === m.id ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ left: `${pct.left}%`, top: `${pct.top}%` }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      didDrag.current = false;
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (didDrag.current) return;
                      if (m.kind !== "save_point" || !m.discovered) return;
                      onSelectMarker?.(m.id);
                    }}
                    aria-label={m.name}
                  />
                </HoverTooltip>
              );
            })}
          </div>
          <div className="world-map-zoom" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="cm-btn world-map-zoom-btn"
              onClick={() => {
                const r = viewportRef.current?.getBoundingClientRect();
                if (!r) return;
                applyZoom(zoom * 1.2, r.left + r.width / 2, r.top + r.height / 2);
              }}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="cm-btn world-map-zoom-btn"
              onClick={() => {
                const r = viewportRef.current?.getBoundingClientRect();
                if (!r) return;
                applyZoom(MIN_ZOOM, r.left + r.width / 2, r.top + r.height / 2);
              }}
              aria-label="Fit map"
            >
              Fit
            </button>
            <button
              type="button"
              className="cm-btn world-map-zoom-btn"
              onClick={() => {
                const r = viewportRef.current?.getBoundingClientRect();
                if (!r) return;
                applyZoom(zoom / 1.2, r.left + r.width / 2, r.top + r.height / 2);
              }}
              aria-label="Zoom out"
            >
              −
            </button>
          </div>
        </div>
      </div>
      <div className="world-map-caption">
        {caption ?? (selected ? selected.name : atlas.name)}
        <span className="dim"> · scroll to zoom · drag to pan</span>
      </div>
    </div>
  );
}

function ensureAtlas() {
  if (useGame.getState().atlas.length > 0) return;
  fetchAtlas()
    .then((a) => useGame.getState().setAtlas(a.maps ?? []))
    .catch(() => {});
}

export function loadAtlasIfNeeded() {
  ensureAtlas();
}

export function MapWindow() {
  const atlas = useGame((s) => s.atlas);
  const mapInfo = useGame((s) => s.mapInfo);
  const selfId = useGame((s) => s.selfId);
  const entities = useGame((s) => s.entities);
  const visited = useGame((s) => s.profile?.visited_save_points ?? EMPTY_VISITED);
  const [mapId, setMapId] = useState(mapInfo?.id ?? "");

  useEffect(() => {
    ensureAtlas();
  }, []);

  useEffect(() => {
    if (mapInfo?.id) setMapId(mapInfo.id);
  }, [mapInfo?.id]);

  const selectedId = atlas.some((m) => m.id === mapId) ? mapId : (atlas[0]?.id ?? "");
  const current = atlas.find((m) => m.id === selectedId);
  const self = selfId ? entities[selfId] : undefined;
  const focusTarget = self?.target_id ? entities[self.target_id] : undefined;
  const markers = current
    ? markersForMap({
        atlas: current,
        visited,
        player: self ? { x: self.x, y: self.y } : null,
        target:
          focusTarget && focusTarget.alive
            ? { x: focusTarget.x, y: focusTarget.y, name: focusTarget.name }
            : null,
        showPlayer: selectedId === mapInfo?.id,
        selectableVisited: true,
      })
    : [];

  if (atlas.length === 0) {
    return <p className="hint">Loading map…</p>;
  }

  return (
    <>
      <p className="hint">Save crystals are marked. Gold is home. Dim crystals are not attuned yet. Click an attuned crystal to teleport.</p>
      <WorldMap
        maps={atlas}
        selectedMapId={selectedId}
        onSelectMap={setMapId}
        markers={markers}
        onSelectMarker={(id) => {
          const marker = markers.find((m) => m.id === id);
          if (!marker?.discovered) return;
          useGame.getState().openTeleportConfirm({ id, name: marker.name });
        }}
        caption={
          selectedId === mapInfo?.id ? `${current?.name ?? "Map"} · you are here` : current?.name
        }
      />
    </>
  );
}
