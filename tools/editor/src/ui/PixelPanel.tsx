import { useEffect, useRef, useState } from "react";
import { slotLayer, type Doc } from "../App";
import type { CatalogEntry, Skeleton, Spec, VariantSel } from "../model/types";

interface Actions {
  setSkeleton: (fn: (s: Skeleton) => Skeleton) => void;
  setSpec: (fn: (s: Spec) => Spec) => void;
  setSelAtt: (a: { slot: string; att: string } | null) => void;
  repack: (extra?: Map<string, HTMLCanvasElement>) => void;
  markAtlasDirty: () => void;
}

type Tool = "pencil" | "eraser" | "picker";

const ZOOM = 14;

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const v = m ? parseInt(m[1]!, 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, alpha];
}

export function PixelPanel({
  doc,
  selAtt,
  atlasCanvas,
  actions,
}: {
  doc: Doc;
  sel: VariantSel;
  selAtt: { slot: string; att: string } | null;
  attForSlot: (slot: string) => string | undefined;
  atlasCanvas: React.RefObject<HTMLCanvasElement | null>;
  actions: Actions;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#e8b090");
  const [alpha, setAlpha] = useState(255);
  const [newVariant, setNewVariant] = useState("");
  const painting = useRef(false);

  const skins = doc.skeleton.skins[0]?.attachments ?? {};
  const slot = selAtt?.slot ?? null;
  const atts = slot ? (skins[slot] ?? {}) : {};
  const att = selAtt ? atts[selAtt.att] : undefined;
  const region = att?.path ? doc.atlas.regions.get(att.path) : undefined;

  // Redraw the zoomed region view whenever selection/art changes.
  const redraw = () => {
    const c = canvasRef.current;
    const src = atlasCanvas.current;
    if (!c || !src || !region) return;
    c.width = region.w * ZOOM;
    c.height = region.h * ZOOM;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, region.x, region.y, region.w, region.h, 0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i <= region.w; i++) {
      ctx.beginPath();
      ctx.moveTo(i * ZOOM + 0.5, 0);
      ctx.lineTo(i * ZOOM + 0.5, c.height);
      ctx.stroke();
    }
    for (let i = 0; i <= region.h; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * ZOOM + 0.5);
      ctx.lineTo(c.width, i * ZOOM + 0.5);
      ctx.stroke();
    }
  };
  useEffect(redraw);

  const paintAt = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    const src = atlasCanvas.current;
    if (!c || !src || !region) return;
    const r = c.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) / ZOOM);
    const py = Math.floor((e.clientY - r.top) / ZOOM);
    if (px < 0 || py < 0 || px >= region.w || py >= region.h) return;
    const actx = src.getContext("2d")!;
    const ax = region.x + px;
    const ay = region.y + py;
    if (tool === "picker") {
      const d = actx.getImageData(ax, ay, 1, 1).data;
      setColor(`#${((d[0]! << 16) | (d[1]! << 8) | d[2]!).toString(16).padStart(6, "0")}`);
      setAlpha(d[3]!);
      setTool("pencil");
      return;
    }
    if (tool === "eraser") {
      actx.clearRect(ax, ay, 1, 1);
    } else {
      const [cr, cg, cb, ca] = hexToRgba(color, alpha);
      actx.fillStyle = `rgba(${cr},${cg},${cb},${ca / 255})`;
      actx.fillRect(ax, ay, 1, 1);
    }
    actions.markAtlasDirty();
    redraw();
  };

  const duplicateVariant = () => {
    const name = newVariant.trim();
    if (!name || !selAtt || !att || !region || !atlasCanvas.current) return;
    if (atts[name]) return;
    const src = atlasCanvas.current;
    const copy = document.createElement("canvas");
    copy.width = region.w;
    copy.height = region.h;
    copy
      .getContext("2d")!
      .drawImage(src, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    const regionName = `${name}/${selAtt.slot}`;
    actions.setSkeleton((s) => {
      const skins = [{ ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } }, ...s.skins.slice(1)];
      const slotAtts = { ...skins[0]!.attachments[selAtt.slot] };
      slotAtts[name] = { ...att, path: regionName };
      skins[0]!.attachments[selAtt.slot] = slotAtts;
      return { ...s, skins };
    });
    // Register the clone in the catalog so it shows in the Catalog tab.
    if (layer) {
      const lname = layer;
      actions.setSpec((s) => {
        const cat = { ...(s.catalog ?? {}) };
        const list = [...(cat[lname] ?? [])];
        if (!list.some((e) => e.key === name && e.slot === selAtt.slot)) {
          const e: CatalogEntry = { key: name, slot: selAtt.slot };
          if (att.rotation) e.rotation = att.rotation;
          list.push(e);
        }
        cat[lname] = list;
        return { ...s, catalog: cat };
      });
    }
    actions.repack(new Map([[regionName, copy]]));
    actions.setSelAtt({ slot: selAtt.slot, att: name });
    setNewVariant("");
  };

  const layer = slot ? slotLayer(doc.spec, slot) : null;

  return (
    <>
      <h3>Pixel edit</h3>
      {!selAtt && (
        <div className="ed-hint">
          Click a body part on the rig to select its attachment region, then paint.
        </div>
      )}
      {selAtt && (
        <>
          <div className="ed-row">
            <label>slot</label>
            <strong>{selAtt.slot}</strong>
            <span className="ed-hint">layer {layer ?? "?"}</span>
          </div>
          <div className="ed-row">
            <label>variant</label>
            <select
              value={selAtt.att}
              onChange={(e) => actions.setSelAtt({ slot: selAtt.slot, att: e.target.value })}
            >
              {Object.keys(atts).sort().map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          {!region && <div className="ed-err">no atlas region — regenerate?</div>}
          {region && (
            <>
              <div className="ed-row">
                {(["pencil", "eraser", "picker"] as Tool[]).map((t) => (
                  <button
                    key={t}
                    className={tool === t ? "primary" : ""}
                    onClick={() => setTool(t)}
                  >
                    {t}
                  </button>
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={alpha}
                  title="alpha"
                  onChange={(e) => setAlpha(Number(e.target.value))}
                />
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
                {region.w}×{region.h} region in atlas — edits write straight into the
                atlas pixels (clamped to the region). Paint is visible on the rig
                immediately.
              </div>
              <h3>Add variant</h3>
              <div className="ed-row">
                <input
                  placeholder={`new variant key (e.g. skin_c7)`}
                  value={newVariant}
                  onChange={(e) => setNewVariant(e.target.value)}
                />
                <button
                  onClick={duplicateVariant}
                  disabled={!newVariant.trim() || !!atts[newVariant.trim()]}
                >
                  Clone {selAtt.att} → new
                </button>
              </div>
              <div className="ed-hint">
                Clones this attachment's art into a new region named{" "}
                <code>variant/{selAtt.slot}</code> and repacks the atlas on save.
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
