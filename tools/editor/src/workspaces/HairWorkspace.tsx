import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteHair,
  listHairs,
  loadHair,
  loadImage,
  loadSpec,
  loadText,
  regenerate,
  saveHair,
  type HairInfo,
} from "../api";
import { parseAtlas } from "../model/atlas";
import {
  HAIR_PARTS,
  PART_LABEL,
  blankHairDoc,
  blankPartCanvas,
  buildHairPreview,
  buildHeadGhost,
  decodePart,
  hairBoneName,
  normalizeHairDoc,
  worldToCell,
  type HairDoc,
  type HairPart,
} from "../model/hair";
import { animDuration, poseAt } from "../model/rig";
import {
  DEFAULT_SEL,
  slotLayer,
  variantKeyForLayer,
  type Doc,
  type Skeleton,
} from "../model/types";
import { drawRig, pickBone, toWorld, type View } from "../render/renderer";
import { HairPartPanel } from "../ui/HairPartPanel";

/** The doll the hair rigs onto — flat hair hidden so only the working
 * doc's rigged parts show. */
const DOLL_ID = "paperdoll";
const PREVIEW_SEL = { ...DEFAULT_SEL, hair: "" };

export function HairWorkspace() {
  const [hairs, setHairs] = useState<HairInfo[]>([]);
  const [hairId, setHairId] = useState(
    () => new URLSearchParams(location.search).get("hair") || "short_spikey",
  );
  const [doc, setDoc] = useState<HairDoc | null>(null);
  const [doll, setDoll] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [selPart, setSelPart] = useState<HairPart>("top");
  const [colorIx, setColorIx] = useState(1);
  const [selAnim, setSelAnim] = useState("idle");
  const [playing, setPlaying] = useState(true);
  const [artVersion, setArtVersion] = useState(0);

  const dollCanvas = useRef<HTMLCanvasElement | null>(null);
  const partCanvases = useRef(new Map<HairPart, HTMLCanvasElement>());
  const ghostCanvas = useRef<HTMLCanvasElement | null>(null);

  const refreshHairs = useCallback(async () => {
    try {
      setHairs(await listHairs());
    } catch {
      /* dev server without middleware — list stays empty */
    }
  }, []);

  // Load the paperdoll once — backdrop + rig the hair preview mounts on.
  useEffect(() => {
    void (async () => {
      try {
        const spec = await loadSpec(DOLL_ID);
        const assetId = spec?.output?.name ?? DOLL_ID;
        const [skelText, atlasText, img] = await Promise.all([
          loadText(`/assets/spine/${assetId}.json?t=${Date.now()}`),
          loadText(`/assets/spine/${assetId}.atlas?t=${Date.now()}`),
          loadImage(`/assets/spine/${assetId}.png?t=${Date.now()}`),
        ]);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        dollCanvas.current = canvas;
        const d: Doc = {
          spec: spec!,
          skeleton: JSON.parse(skelText) as Skeleton,
          atlas: parseAtlas(atlasText),
        };
        setDoll(d);
        ghostCanvas.current = buildHeadGhost(d, canvas);
      } catch (e) {
        setErr(`paperdoll: ${String(e)}`);
      }
    })();
  }, []);

  const load = useCallback(async (id: string) => {
    setErr(null);
    try {
      const raw = await loadHair(id);
      const d = normalizeHairDoc(raw, id);
      const canvases = new Map<HairPart, HTMLCanvasElement>();
      for (const part of HAIR_PARTS) {
        const p = d.parts[part];
        canvases.set(part, p ? await decodePart(p.png) : blankPartCanvas());
      }
      partCanvases.current = canvases;
      setDoc(d);
      setDirty(false);
      setArtVersion((v) => v + 1);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void load(hairId);
    void refreshHairs();
  }, [hairId, load, refreshHairs]);

  const switchHair = useCallback(
    (id: string) => {
      if (id === hairId) return;
      if (dirty && !window.confirm(`Discard unsaved changes to '${hairId}'?`)) return;
      setHairId(id);
      const q = new URLSearchParams(location.search);
      q.set("hair", id);
      history.replaceState(null, "", `?${q}`);
    },
    [hairId, dirty],
  );

  const update = useCallback((d: HairDoc) => {
    setDoc(d);
    setDirty(true);
  }, []);

  /** Serialize the working canvases into the doc and write it. */
  const doSave = useCallback(async () => {
    if (!doc) return;
    setStatus("Saving…");
    try {
      const out: HairDoc = { ...doc, parts: { ...doc.parts } };
      for (const part of HAIR_PARTS) {
        const p = out.parts[part];
        const c = partCanvases.current.get(part);
        if (p && c) out.parts[part] = { ...p, png: c.toDataURL("image/png") };
      }
      await saveHair(out);
      setDoc(out);
      setDirty(false);
      await refreshHairs();
      setStatus(`Saved tools/hairs/${out.id}.hair.json — Regenerate bakes it`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [doc, refreshHairs]);

  const doNew = useCallback(() => {
    const id = window.prompt("New hair id (file name):", "");
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
    if (dirty && !window.confirm(`Discard unsaved changes to '${hairId}'?`)) return;
    partCanvases.current = new Map(HAIR_PARTS.map((p) => [p, blankPartCanvas()]));
    setDoc(blankHairDoc(id));
    setDirty(true);
    setHairId(id);
    setArtVersion((v) => v + 1);
    setStatus(`New hair '${id}' — paint parts, then Save`);
  }, [hairId, dirty]);

  const doDuplicate = useCallback(async () => {
    if (!doc) return;
    const id = window.prompt(`Clone '${doc.id}' as:`, `${doc.id}_copy`);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id === doc.id) return;
    setStatus("Cloning…");
    try {
      const out: HairDoc = { ...doc, id, label: id, preset: false, parts: { ...doc.parts } };
      for (const part of HAIR_PARTS) {
        const p = out.parts[part];
        const c = partCanvases.current.get(part);
        if (p && c) out.parts[part] = { ...p, png: c.toDataURL("image/png") };
      }
      await saveHair(out);
      await refreshHairs();
      switchHair(id);
      setStatus(`Cloned '${doc.id}' → '${id}'`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [doc, refreshHairs, switchHair]);

  const doDelete = useCallback(async () => {
    if (!doc || !window.confirm(`Delete hair '${doc.id}'? Regenerate paperdoll to unbake it.`)) return;
    setStatus("Deleting…");
    try {
      await deleteHair(doc.id);
      await refreshHairs();
      const rest = hairs.filter((h) => h.id !== doc.id);
      switchHair(rest[0]?.id ?? "short_spikey");
      setStatus(`Deleted '${doc.id}'`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [doc, hairs, refreshHairs, switchHair]);

  const doBake = useCallback(async () => {
    setStatus("Baking into paperdoll…");
    try {
      const out = await regenerate(DOLL_ID);
      setStatus(`Baked — ${out.trim()}`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, []);

  // Merged preview doc: doll + this hair's bones/slots/art + sway tracks.
  const preview = useMemo(() => {
    if (!doll || !doc || !dollCanvas.current) return null;
    return buildHairPreview(doll, dollCanvas.current, doc, partCanvases.current, colorIx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doll, doc, colorIx, artVersion]);

  const attForSlot = useCallback(
    (slot: string): string | undefined => {
      if (!preview || !doc) return undefined;
      const layer = slotLayer(preview.doc.spec, slot);
      if (layer?.startsWith("hair_")) return `hair_${doc.id}_c${colorIx}`;
      return layer ? variantKeyForLayer(layer, PREVIEW_SEL) : undefined;
    },
    [preview, doc, colorIx],
  );

  // --- viewport --------------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ cx: 0, cy: 0, scale: 10 });
  const dragRef = useRef<
    { kind: "pan"; x: number; y: number } | { kind: "bone"; part: HairPart } | null
  >(null);
  const timeRef = useRef(0);
  const stateRef = useRef({ selAnim, playing });
  stateRef.current = { selAnim, playing };
  const selPartRef = useRef(selPart);
  selPartRef.current = selPart;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const docRef = useRef(doc);
  docRef.current = doc;
  const attRef = useRef(attForSlot);
  attRef.current = attForSlot;

  // The viewport canvas only mounts once doc + doll are loaded (early
  // "Loading…" return above), so init the view when they arrive.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    viewRef.current = {
      cx: c.clientWidth / 2,
      cy: c.clientHeight * 0.62,
      scale: Math.min(11, c.clientWidth / 60, c.clientHeight / 50),
    };
  }, [doc, doll]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const c = canvasRef.current;
      const p = previewRef.current;
      if (c && p) {
        const anim = p.doc.spec.animations[stateRef.current.selAnim];
        const dur = anim ? Math.max(animDuration(anim.bones), 0.001) : 1;
        if (stateRef.current.playing) timeRef.current = (timeRef.current + dt) % dur;
        const pose = poseAt(p.doc.spec, anim?.bones ?? null, timeRef.current);

        const dpr = window.devicePixelRatio || 1;
        const cw = c.clientWidth * dpr;
        const ch = c.clientHeight * dpr;
        if (c.width !== cw || c.height !== ch) {
          c.width = cw;
          c.height = ch;
        }
        const v = viewRef.current;
        const ctx = c.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
        // ground line
        ctx.strokeStyle = "#52604e";
        ctx.beginPath();
        ctx.moveTo(0, v.cy);
        ctx.lineTo(c.clientWidth, v.cy);
        ctx.stroke();
        drawRig(ctx, v, p.atlasCanvas, p.doc.atlas, p.doc.spec, p.doc.skeleton, pose, {
          showBones: true,
          selBone: docRef.current ? hairBoneName(docRef.current.id, selPartRef.current) : null,
          selAttachment: null,
          attForSlot: attRef.current,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const [sx, sy] = pos(e);
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      dragRef.current = { kind: "pan", x: sx, y: sy };
      canvasRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    const p = previewRef.current;
    const d = docRef.current;
    if (!p || !d) return;
    const [wx, wy] = toWorld(viewRef.current, sx, sy);
    const anim = p.doc.spec.animations[stateRef.current.selAnim];
    const pose = poseAt(p.doc.spec, anim?.bones ?? null, timeRef.current);
    const bone = pickBone(p.doc.spec, pose, wx, wy, 8 / viewRef.current.scale);
    // Only this hair's own bones are draggable — they are the part pivots.
    const part = HAIR_PARTS.find((pt) => bone === hairBoneName(d.id, pt));
    if (part && d.parts[part]?.enabled) {
      setSelPart(part);
      dragRef.current = { kind: "bone", part };
      canvasRef.current!.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const [sx, sy] = pos(e);
    if (drag.kind === "pan") {
      viewRef.current.cx += sx - drag.x;
      viewRef.current.cy += sy - drag.y;
      dragRef.current = { kind: "pan", x: sx, y: sy };
      return;
    }
    const d = docRef.current;
    const pd = d?.parts[drag.part];
    if (!d || !pd) return;
    const [wx, wy] = toWorld(viewRef.current, sx, sy);
    const [cx, cy] = worldToCell(wx, wy);
    const pivot: [number, number] = [
      Math.round(Math.max(20, Math.min(60, cx)) * 2) / 2,
      Math.round(Math.max(-4, Math.min(34, cy)) * 2) / 2,
    ];
    update({ ...d, parts: { ...d.parts, [drag.part]: { ...pd, pivot } } });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    const [sx, sy] = pos(e as unknown as React.PointerEvent);
    const v = viewRef.current;
    const [wx, wy] = toWorld(v, sx, sy);
    v.scale = Math.min(40, Math.max(3, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    v.cx = sx - wx * v.scale;
    v.cy = sy + wy * v.scale;
  };

  // ---------------------------------------------------------------------------

  if (err && !doc) return <div className="ed-err">Hair editor failed to load: {err}</div>;
  if (!doc || !doll) return <div className="ed-err">Loading…</div>;

  const anims = Object.keys(doll.spec.animations);

  return (
    <>
      <div className="ed-toolbar">
        <span className="ed-toolbar-label">Hair</span>
        <select value={hairId} onChange={(e) => switchHair(e.target.value)}>
          {[...new Set([hairId, ...hairs.map((h) => h.id)])].map((id) => (
            <option key={id} value={id}>
              {id}
              {hairs.find((h) => h.id === id)?.preset ? " (preset)" : ""}
            </option>
          ))}
        </select>
        <button onClick={doNew}>New</button>
        <button onClick={() => void doDuplicate()} disabled={!doc}>
          Clone
        </button>
        <button onClick={() => void doDelete()} disabled={!doc}>
          Delete
        </button>

        <span className="spacer" />

        <button onClick={() => void doBake()} title="Re-run gen_paperdoll.py — bakes every saved hair doc into the paperdoll rig">
          Bake into paperdoll
        </button>
        <button className="primary" onClick={() => void doSave()} disabled={!dirty}>
          Save
        </button>
      </div>
      <div className="ed-main">
        <aside className="ed-hierarchy">
          <div className="ed-dock-title">Hairs <span>{hairs.length}</span></div>
          <div className="ed-tree">
            {[...new Set([hairId, ...hairs.map((h) => h.id)])].map((id) => (
              <button
                key={id}
                className={`ed-tree-item ${id === hairId ? "selected" : ""}`}
                onClick={() => switchHair(id)}
              >
                <span className="ed-asset-icon">▧</span>
                {hairs.find((h) => h.id === id)?.label ?? id}
                {hairs.find((h) => h.id === id)?.preset && (
                  <span className="dim" style={{ marginLeft: "auto" }}>preset</span>
                )}
              </button>
            ))}
          </div>
          <div className="ed-project">
            <div className="ed-dock-title">Parts <span>drag bones in scene</span></div>
            <div className="ed-project-list">
              {HAIR_PARTS.map((p) => (
                <button
                  key={p}
                  className={`ed-tree-item ${p === selPart ? "selected" : ""}`}
                  onClick={() => setSelPart(p)}
                >
                  <span className="ed-bone-icon">◇</span>
                  {PART_LABEL[p]}
                  <span style={{ marginLeft: "auto", color: "#999", fontSize: 10 }}>
                    {doc.parts[p]?.enabled ? "" : "off"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
        <section className="ed-scene">
          <div className="ed-scene-toolbar">
            <span>Preview on paperdoll</span>
            <span className="spacer" />
            <select value={selAnim} onChange={(e) => setSelAnim(e.target.value)}>
              {anims.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button
              aria-label={playing ? "Pause animation" : "Play animation"}
              aria-pressed={playing}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <button aria-label="Stop animation" onClick={() => { setPlaying(false); timeRef.current = 0; }}>
              ■
            </button>
          </div>
          <div className="ed-viewport">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onWheel={onWheel}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
          <div className="ed-scene-footer">
            <span>Scroll to zoom · Shift + drag to pan · drag hair bones to move pivots</span>
            <span>{doc ? `${doc.id} — ${PART_LABEL[selPart]}` : ""}</span>
          </div>
        </section>
        <div className="ed-side">
          <div className="ed-dock-title">Inspector <span>{doc.label}</span></div>
          <div className="ed-panel">
            <h3>Style</h3>
            <div className="ed-row">
              <label>label</label>
              <input
                value={doc.label}
                onChange={(e) => update({ ...doc, label: e.target.value })}
              />
            </div>
            <div className="ed-row">
              <label>sway <span className="ed-hint">{doc.sway.toFixed(2)}</span></label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={doc.sway}
                onChange={(e) => update({ ...doc, sway: +e.target.value })}
              />
            </div>
            <div className="ed-row">
              <label>preview color</label>
              <select value={colorIx} onChange={(e) => setColorIx(+e.target.value)}>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>c{i + 1}</option>
                ))}
              </select>
            </div>
            <HairPartPanel
              doc={doc}
              part={selPart}
              canvas={partCanvases.current.get(selPart) ?? null}
              ghost={ghostCanvas.current}
              onChange={update}
              onArt={() => setArtVersion((v) => v + 1)}
            />
          </div>
        </div>
      </div>
      <footer className="ed-statusbar">
        <span className={dirty ? "dirty" : "ed-ready"}>●</span>
        <span role="status">{status || err || (dirty ? "Unsaved changes" : "Ready")}</span>
        <span className="spacer" />
        <span>{doc.id}{dirty ? " *" : ""}</span>
      </footer>
    </>
  );
}
