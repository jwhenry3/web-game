import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
import { FILL } from "../world/overworld";
import { loadMapImage } from "../world/mapImage";
import { getWorldLocalPos } from "../world/worldLocalPos";
import type { OverworldMap } from "../types";

const DEFAULT_SIZE = 168;
/** World pixels shown at zoom = 1 (larger → more area). */
const BASE_VIEW_WORLD = 1680;
const TERRAIN_SCALE = 2;

const SIZE_MIN = 120;
const SIZE_MAX = 280;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;

const LS_SIZE = "cm.minimap.size";
const LS_ZOOM = "cm.minimap.zoom";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function readStored(key: string, fallback: number, lo: number, hi: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, lo, hi);
  } catch {
    return fallback;
  }
}

function terrainFingerprint(map: OverworldMap): string {
  return `${map.cols}x${map.rows}:${map.tile}:${map.cells.length}:${map.cells[0] ?? ""}${map.cells[map.cells.length - 1] ?? ""}`;
}

function paintTerrain(cache: HTMLCanvasElement, map: OverworldMap) {
  const ctx = cache.getContext("2d");
  if (!ctx) return;
  const w = map.cols * TERRAIN_SCALE;
  const h = map.rows * TERRAIN_SCALE;
  if (cache.width !== w || cache.height !== h) {
    cache.width = w;
    cache.height = h;
  }
  // Bulk paint via ImageData — per-tile fillRect costs millions of canvas
  // calls on world-scale maps.
  const img = ctx.createImageData(w, h);
  const px = img.data;
  const S = TERRAIN_SCALE;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const rgb = FILL[map.cells[r * map.cols + c] ?? "#"] ?? 0x1a3a22;
      const rr = (rgb >> 16) & 0xff;
      const gg = (rgb >> 8) & 0xff;
      const bb = rgb & 0xff;
      const x0 = c * S;
      const y0 = r * S;
      for (let dy = 0; dy < S; dy++) {
        let i = ((y0 + dy) * w + x0) * 4;
        for (let dx = 0; dx < S; dx++) {
          px[i] = rr;
          px[i + 1] = gg;
          px[i + 2] = bb;
          px[i + 3] = 255;
          i += 4;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius: number,
  ring?: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** Compact overworld radar in the top-right of the stage. */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const terrainKeyRef = useRef("");
  const terrainImgRef = useRef<ImageBitmap | null>(null);
  const terrainImgIdRef = useRef("");
  const terrainImgFailedRef = useRef(false);
  const sizeRef = useRef(DEFAULT_SIZE);
  const zoomRef = useRef(1);
  const chromeRef = useRef<HTMLDivElement>(null);

  const [size, setSize] = useState(() => readStored(LS_SIZE, DEFAULT_SIZE, SIZE_MIN, SIZE_MAX));
  const [zoom, setZoom] = useState(() => readStored(LS_ZOOM, 1, ZOOM_MIN, ZOOM_MAX));
  const [menuOpen, setMenuOpen] = useState(false);

  sizeRef.current = size;
  zoomRef.current = zoom;

  useEffect(() => {
    try {
      localStorage.setItem(LS_SIZE, String(size));
      localStorage.setItem(LS_ZOOM, String(zoom));
    } catch {
      /* ignore quota / private mode */
    }
  }, [size, zoom]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (chromeRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const sizePx = sizeRef.current;
      const zoomLv = zoomRef.current;
      if (canvas.width !== sizePx || canvas.height !== sizePx) {
        canvas.width = sizePx;
        canvas.height = sizePx;
      }

      const state = useGame.getState();
      if (state.screen !== "world") return;
      const map = state.overworld;
      const selfId = state.selfId;
      const self = selfId ? state.entities[selfId] : undefined;
      if (!map || !self || self.in_house) {
        ctx.clearRect(0, 0, sizePx, sizePx);
        return;
      }

      const local = getWorldLocalPos();
      const selfX = local?.x ?? self.x;
      const selfY = local?.y ?? self.y;

      // Baked terrain image — the same /api/mapimg PNG the map window uses,
      // loaded once per map. Falls back to painting the cell array into a
      // cache canvas when the endpoint is unavailable.
      const mapId = state.mapInfo?.id ?? "";
      if (mapId && mapId !== terrainImgIdRef.current) {
        terrainImgIdRef.current = mapId;
        terrainImgRef.current = null;
        terrainImgFailedRef.current = false;
        loadMapImage(mapId).then((img) => {
          if (terrainImgIdRef.current !== mapId) return;
          if (img) terrainImgRef.current = img;
          else terrainImgFailedRef.current = true;
        });
      }
      let terrain: HTMLCanvasElement | ImageBitmap | null = terrainImgRef.current;
      if (!terrain && (terrainImgFailedRef.current || !mapId)) {
        if (!terrainRef.current) terrainRef.current = document.createElement("canvas");
        const key = terrainFingerprint(map);
        if (key !== terrainKeyRef.current) {
          terrainKeyRef.current = key;
          paintTerrain(terrainRef.current, map);
        }
        terrain = terrainRef.current;
      }

      // Top-down radar — a square world-space window centered on the player,
      // same orientation as the baked /api/mapimg PNG (x right, y down).
      const t = Math.max(1, map.tile || 1);
      const colsT = map.cols * t;
      const rowsT = map.rows * t;
      const side = Math.max(320, BASE_VIEW_WORLD / zoomLv);

      const viewX =
        colsT <= side
          ? (colsT - side) / 2
          : Math.max(0, Math.min(colsT - side, selfX - side / 2));
      const viewY =
        rowsT <= side
          ? (rowsT - side) / 2
          : Math.max(0, Math.min(rowsT - side, selfY - side / 2));
      const s = sizePx / side;

      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = "#0a0c10";
      ctx.fillRect(0, 0, sizePx, sizePx);
      if (terrain) {
        // canvas = s·(world − view)
        ctx.setTransform(s, 0, 0, s, -s * viewX, -s * viewY);
        ctx.drawImage(terrain, 0, 0, terrain.width, terrain.height, 0, 0, colsT, rowsT);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      const toMini = (wx: number, wy: number) => ({
        x: (wx - viewX) * s,
        y: (wy - viewY) * s,
      });

      const inView = (wx: number, wy: number) =>
        wx >= viewX - 64 &&
        wx <= viewX + side + 64 &&
        wy >= viewY - 64 &&
        wy <= viewY + side + 64;

      const scale = sizePx / DEFAULT_SIZE;
      for (const sp of Object.values(state.savePoints)) {
        if (!inView(sp.x, sp.y)) continue;
        const p = toMini(sp.x, sp.y);
        dot(ctx, p.x, p.y, "#7ec8ff", 3 * scale, "#dff0ff");
      }
      for (const jc of Object.values(state.jobChangers)) {
        if (!inView(jc.x, jc.y)) continue;
        const p = toMini(jc.x, jc.y);
        dot(ctx, p.x, p.y, "#c9a0ff", 2.5 * scale);
      }
      for (const camp of Object.values(state.camps)) {
        if (!inView(camp.x, camp.y)) continue;
        const p = toMini(camp.x, camp.y);
        dot(ctx, p.x, p.y, "#7ecf6a", 3.5 * scale, "#d8f5c8");
      }
      const focusId = self.target_id;
      for (const npc of Object.values(state.entities)) {
        if (npc.kind !== "npc" || npc.engaged || !inView(npc.x, npc.y)) continue;
        if (npc.id === focusId) continue; // drawn highlighted below
        const p = toMini(npc.x, npc.y);
        dot(ctx, p.x, p.y, "#e06060", 2 * scale);
      }
      for (const wp of Object.values(state.entities)) {
        if (wp.kind !== "player") continue;
        if (wp.id === selfId || wp.in_house || !inView(wp.x, wp.y)) continue;
        if (wp.id === focusId) continue;
        const p = toMini(wp.x, wp.y);
        dot(ctx, p.x, p.y, wp.engaged ? "#ffe9a8" : "#f0f4f8", 2.5 * scale);
      }
      // Focus target: pulsing gold marker, drawn even when engaged.
      const focus = focusId ? state.entities[focusId] : undefined;
      if (focus && focus.alive && inView(focus.x, focus.y)) {
        const p = toMini(focus.x, focus.y);
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (5 + 2 * pulse) * scale, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 215, 94, ${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        dot(ctx, p.x, p.y, "#ffd75e", 2.5 * scale, "#1a1406");
      }

      const me = toMini(selfX, selfY);
      ctx.save();
      ctx.translate(me.x, me.y);
      // Point the arrow the way the player faces: the renderer's smoothed yaw
      // (model convention atan2(dx, dz)) when available, else the wire facing.
      let arrow = 0;
      if (local && typeof local.facing === "number" && Number.isFinite(local.facing)) {
        arrow = Math.PI - local.facing;
      } else if (typeof self.facing === "number" && Number.isFinite(self.facing)) {
        arrow = -self.facing;
      } else if (self.facing === "left") {
        arrow = -Math.PI / 2;
      } else if (self.facing === "right") {
        arrow = Math.PI / 2;
      }
      ctx.rotate(arrow);
      ctx.scale(scale, scale);
      ctx.fillStyle = "#f0d878";
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#1a1406";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = "rgba(196, 163, 90, 0.75)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, sizePx - 2, sizePx - 2);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`cm-minimap${menuOpen ? " is-menu-open" : ""}`}
      aria-label="Minimap"
      style={{ ["--minimap-size" as string]: `${size}px` }}
    >
      <div className="cm-minimap-frame" ref={chromeRef}>
        <canvas ref={canvasRef} width={size} height={size} />
        <button
          type="button"
          className="cm-minimap-gear"
          aria-label="Minimap settings"
          aria-expanded={menuOpen}
          title="Minimap settings"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
            <path
              fill="currentColor"
              d="M6.5 1.5h3l.4 1.6a4.5 4.5 0 0 1 1.2.7l1.6-.5 1.5 2.6-1.2 1.1c.1.4.1.8 0 1.2l1.2 1.1-1.5 2.6-1.6-.5a4.5 4.5 0 0 1-1.2.7L9.5 14.5h-3l-.4-1.6a4.5 4.5 0 0 1-1.2-.7l-1.6.5L1.8 9.9l1.2-1.1a4.6 4.6 0 0 1 0-1.2L1.8 6.5l1.5-2.6 1.6.5c.4-.3.8-.5 1.2-.7L6.5 1.5zm1.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"
            />
          </svg>
        </button>
        {menuOpen ? (
          <div className="cm-minimap-menu" role="dialog" aria-label="Minimap options">
            <label className="cm-minimap-menu-row">
              <span>Size</span>
              <input
                type="range"
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={8}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              />
              <em>{size}px</em>
            </label>
            <label className="cm-minimap-menu-row">
              <span>Zoom</span>
              <input
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
              <em>{zoom.toFixed(1)}×</em>
            </label>
            <button
              type="button"
              className="cm-minimap-menu-reset"
              onClick={() => {
                setSize(DEFAULT_SIZE);
                setZoom(1);
              }}
            >
              Reset
            </button>
          </div>
        ) : null}
      </div>
      <div className="cm-minimap-legend" aria-hidden>
        <span className="you" /> You
        <span className="foe" /> Foe
        <span className="camp" /> Camp
      </div>
    </div>
  );
}
