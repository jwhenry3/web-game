import { useEffect, useRef, useState } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  DS,
  DEFAULT_PIVOTS,
  OUTLINE,
  PART_LABEL,
  RAMP,
  WIN_X0,
  WIN_Y0,
  type HairDoc,
  type HairPart,
} from "../model/hair";

type Tool = "pencil" | "eraser" | "picker";

const ZOOM = 8;

function hexToRgba(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1]!, 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Pixel painter for one hair part — edits the part's window canvas
 * directly, ghosted over the doll's head so art aligns to the face. */
export function HairPartPanel({
  doc,
  part,
  canvas,
  ghost,
  onChange,
  onArt,
}: {
  doc: HairDoc;
  part: HairPart;
  canvas: HTMLCanvasElement | null;
  ghost: HTMLCanvasElement | null;
  /** Structural edit (pivot, enable) — doc object changed. */
  onChange: (doc: HairDoc) => void;
  /** Pixel edit on the part canvas — preview must rebuild. */
  onArt: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState(RAMP.main);
  const painting = useRef(false);
  const pd = doc.parts[part];
  const enabled = pd?.enabled === true;

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = CANVAS_W * ZOOM;
    c.height = CANVAS_H * ZOOM;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    if (ghost) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(ghost, 0, 0, c.width, c.height);
      ctx.globalAlpha = 1;
    }
    if (canvas) ctx.drawImage(canvas, 0, 0, c.width, c.height);
    // Grid at cell-unit boundaries (every 2 art px).
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    for (let i = 0; i <= CANVAS_W; i += DS) {
      ctx.beginPath();
      ctx.moveTo(i * ZOOM + 0.5, 0);
      ctx.lineTo(i * ZOOM + 0.5, c.height);
      ctx.stroke();
    }
    for (let i = 0; i <= CANVAS_H; i += DS) {
      ctx.beginPath();
      ctx.moveTo(0, i * ZOOM + 0.5);
      ctx.lineTo(c.width, i * ZOOM + 0.5);
      ctx.stroke();
    }
    // Pivot marker — the part's bone origin.
    if (pd) {
      const px = (pd.pivot[0] - WIN_X0) * DS * ZOOM;
      const py = (pd.pivot[1] - WIN_Y0) * DS * ZOOM;
      ctx.strokeStyle = "#4df";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 8, py);
      ctx.lineTo(px + 8, py);
      ctx.moveTo(px, py - 8);
      ctx.lineTo(px, py + 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  useEffect(redraw);

  const paintAt = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    if (!c || !canvas || !enabled) return;
    const r = c.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) / ZOOM);
    const py = Math.floor((e.clientY - r.top) / ZOOM);
    if (px < 0 || py < 0 || px >= CANVAS_W || py >= CANVAS_H) return;
    const ctx = canvas.getContext("2d")!;
    if (tool === "picker") {
      const d = ctx.getImageData(px, py, 1, 1).data;
      if (d[3]) {
        setColor(`#${((d[0]! << 16) | (d[1]! << 8) | d[2]!).toString(16).padStart(6, "0")}`);
        setTool("pencil");
      }
      return;
    }
    if (tool === "eraser") {
      ctx.clearRect(px, py, 1, 1);
    } else {
      const [cr, cg, cb] = hexToRgba(color);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(px, py, 1, 1);
    }
    onArt();
    redraw();
  };

  const setPivot = (axis: 0 | 1, v: number) => {
    if (!pd) return;
    const pivot: [number, number] = [...pd.pivot];
    pivot[axis] = v;
    onChange({ ...doc, parts: { ...doc.parts, [part]: { ...pd, pivot } } });
  };

  return (
    <>
      <h3>{PART_LABEL[part]}</h3>
      <div className="ed-row">
        <label>enabled</label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange({
              ...doc,
              parts: {
                ...doc.parts,
                [part]: {
                  enabled: e.target.checked,
                  pivot: [...(pd?.pivot ?? DEFAULT_PIVOTS[part])],
                  png: pd?.png ?? "",
                },
              },
            })
          }
        />
        {enabled && (
          <>
            <label>pivot</label>
            <input
              type="number"
              step={0.5}
              value={pd!.pivot[0]}
              onChange={(e) => setPivot(0, +e.target.value)}
              title="Pivot X (cell units) — drag the bone in the scene too"
            />
            <input
              type="number"
              step={0.5}
              value={pd!.pivot[1]}
              onChange={(e) => setPivot(1, +e.target.value)}
              title="Pivot Y (cell units)"
            />
          </>
        )}
      </div>
      {enabled && canvas && (
        <>
          <div className="ed-row">
            {(["pencil", "eraser", "picker"] as Tool[]).map((t) => (
              <button key={t} className={tool === t ? "primary" : ""} onClick={() => setTool(t)}>
                {t}
              </button>
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="ed-row">
            <label>ramp</label>
            {[RAMP.dark, RAMP.main, RAMP.light, OUTLINE].map((c) => (
              <button
                key={c}
                aria-label={`paint ${c}`}
                style={{
                  background: c,
                  width: 18,
                  height: 18,
                  padding: 0,
                  borderColor: color === c ? "#8bc3ef" : undefined,
                }}
                onClick={() => {
                  setColor(c);
                  setTool("pencil");
                }}
              />
            ))}
          </div>
          <canvas
            ref={canvasRef}
            className="ed-pixel-canvas"
            onPointerDown={(e) => {
              painting.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              paintAt(e);
            }}
            onPointerMove={(e) => painting.current && paintAt(e)}
            onPointerUp={() => (painting.current = false)}
          />
          <div className="ed-hint">
            Paint in the ramp colors so all 10 hair colors work — the blue
            crosshair is the part's bone pivot. Art above the head swings
            with it; drag the bone in the scene to move the pivot.
          </div>
        </>
      )}
    </>
  );
}
