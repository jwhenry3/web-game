import { useEffect, useRef, useState } from "react";
import { slotLayer, type Doc } from "../model/types";
import type { CatalogEntry, Skeleton, Spec, VariantSel } from "../model/types";

interface Actions {
  setSkeleton: (fn: (s: Skeleton) => Skeleton) => void;
  setSpec: (fn: (s: Spec) => Spec) => void;
  setSelAtt: (a: { slot: string; att: string } | null) => void;
  repack: (extra?: Map<string, HTMLCanvasElement>) => void;
  markAtlasDirty: () => void;
}

type Tool = "pencil" | "eraser" | "picker";

const DEFAULT_ZOOM = 14;

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
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");
  const painting = useRef(false);

  const skins = doc.skeleton.skins[0]?.attachments ?? {};
  const slot = selAtt?.slot ?? null;
  const atts = slot ? (skins[slot] ?? {}) : {};
  const att = selAtt ? atts[selAtt.att] : undefined;
  const region = att?.path ? doc.atlas.regions.get(att.path) : undefined;

  // Keep the size inputs tracking the selected region.
  useEffect(() => {
    setDimW(region ? String(region.w) : "");
    setDimH(region ? String(region.h) : "");
  }, [selAtt?.slot, selAtt?.att, region?.w, region?.h]);

  // Redraw the zoomed region view whenever selection/art changes.
  const redraw = () => {
    const c = canvasRef.current;
    const src = atlasCanvas.current;
    if (!c || !src || !region) return;
    c.width = region.w * zoom;
    c.height = region.h * zoom;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, region.x, region.y, region.w, region.h, 0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i <= region.w; i++) {
      ctx.beginPath();
      ctx.moveTo(i * zoom + 0.5, 0);
      ctx.lineTo(i * zoom + 0.5, c.height);
      ctx.stroke();
    }
    for (let i = 0; i <= region.h; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * zoom + 0.5);
      ctx.lineTo(c.width, i * zoom + 0.5);
      ctx.stroke();
    }
  };
  useEffect(redraw);

  /** Resize the selected region — copies existing pixels 1:1 (top-left
   * anchored, pad/crop, no stretch), repacks the atlas, and rescales the
   * attachment's skeleton-space size so the quad still fits the art. */
  const resizeRegion = (w: number, h: number) => {
    const src = atlasCanvas.current;
    if (!selAtt || !att?.path || !region || !src) return;
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === region.w && h === region.h) return;
    const copy = document.createElement("canvas");
    copy.width = w;
    copy.height = h;
    copy
      .getContext("2d")!
      .drawImage(src, region.x, region.y, Math.min(region.w, w), Math.min(region.h, h), 0, 0, Math.min(region.w, w), Math.min(region.h, h));
    // Region px ↔ skeleton units — keep the attachment quad proportional.
    // Mesh attachments carry no width/height (uvs are normalized) — skip.
    if (att.width && att.height && att.type !== "mesh") {
      const density = region.w / att.width;
      const nw = w / density;
      const nh = h / density;
      actions.setSkeleton((s) => {
        const skins = [{ ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } }, ...s.skins.slice(1)];
        const slotAtts = { ...skins[0]!.attachments[selAtt.slot] };
        slotAtts[selAtt.att] = { ...att, width: nw, height: nh };
        skins[0]!.attachments[selAtt.slot] = slotAtts;
        return { ...s, skins };
      });
    }
    actions.repack(new Map([[att.path, copy]]));
  };

  const applySize = () => resizeRegion(Number(dimW) || region!.w, Number(dimH) || region!.h);

  /** Paste a clipboard image into the region — 1:1 anchored at the region's
   * top-left, clipped to the region. If the art is larger than the region,
   * the region grows to fit it (repack). */
  const pasteImage = (img: CanvasImageSource, iw: number, ih: number) => {
    const src = atlasCanvas.current;
    if (!src || !region || !att?.path) return;
    if (iw <= region.w && ih <= region.h) {
      const actx = src.getContext("2d")!;
      actx.save();
      actx.beginPath();
      actx.rect(region.x, region.y, region.w, region.h);
      actx.clip();
      actx.drawImage(img, region.x, region.y);
      actx.restore();
      actions.markAtlasDirty();
      redraw();
      return;
    }
    // Larger than the region — grow it (existing pixels preserved top-left).
    const w = Math.max(region.w, iw);
    const h = Math.max(region.h, ih);
    const copy = document.createElement("canvas");
    copy.width = w;
    copy.height = h;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(src, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    ctx.drawImage(img, 0, 0);
    if (att.width && att.height && att.type !== "mesh") {
      const density = region.w / att.width;
      actions.setSkeleton((s) => {
        const skins = [{ ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } }, ...s.skins.slice(1)];
        const slotAtts = { ...skins[0]!.attachments[selAtt!.slot] };
        slotAtts[selAtt!.att] = { ...att, width: w / density, height: h / density };
        skins[0]!.attachments[selAtt!.slot] = slotAtts;
        return { ...s, skins };
      });
    }
    actions.repack(new Map([[att.path, copy]]));
  };

  // Clipboard image paste — active while a region is selected.
  useEffect(() => {
    if (!region) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        pasteImage(img, img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const paintAt = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    const src = atlasCanvas.current;
    if (!c || !src || !region) return;
    const r = c.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) / zoom);
    const py = Math.floor((e.clientY - r.top) / zoom);
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
          if (att.scaleX !== undefined && att.scaleX !== 1) e.scaleX = att.scaleX;
          if (att.scaleY !== undefined && att.scaleY !== 1) e.scaleY = att.scaleY;
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
                <label>size</label>
                <input
                  type="number"
                  min={1}
                  style={{ width: 52 }}
                  value={dimW}
                  onChange={(e) => setDimW(e.target.value)}
                />
                ×
                <input
                  type="number"
                  min={1}
                  style={{ width: 52 }}
                  value={dimH}
                  onChange={(e) => setDimH(e.target.value)}
                />
                <button
                  onClick={applySize}
                  disabled={
                    (Number(dimW) || region.w) === region.w &&
                    (Number(dimH) || region.h) === region.h
                  }
                >
                  Resize
                </button>
              </div>
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
                <button title="zoom out" onClick={() => setZoom((z) => Math.max(2, z - 2))}>−</button>
                <span className="ed-hint">{zoom}×</span>
                <button title="zoom in" onClick={() => setZoom((z) => Math.min(40, z + 2))}>+</button>
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
                atlas pixels (clamped to the region). Paste (Ctrl+V) drops clipboard
                art at the region's top-left; oversized art grows the region.
                Resize pads/crops without stretching and repacks the atlas.
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
