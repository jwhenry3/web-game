import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  loadImage,
  loadSpec,
  loadText,
  regenerate,
  save,
  type CharacterInfo,
} from "../api";
import { parseAtlas, packRegions, emitAtlas } from "../model/atlas";
import { buildSkeleton, specFromSkeleton } from "../model/rig";
import {
  DEFAULT_SEL,
  slotLayer,
  variantKeyForLayer,
  type Atlas,
  type Doc,
  type Skeleton,
  type Spec,
  type Tool,
  type VariantSel,
} from "../model/types";
import { AnimPanel } from "../ui/AnimPanel";
import { BonesPanel } from "../ui/BonesPanel";
import { PartsDock, type PartPreview } from "../ui/PartsDock";
import { PixelPanel } from "../ui/PixelPanel";
import { SpecPanel } from "../ui/SpecPanel";
import { VariantsPanel } from "../ui/VariantsPanel";
import { Viewport } from "../ui/Viewport";

/** Home character — the editor's default selection and the fallback it
 * returns to after a delete. Kept undeletable so the fallback always exists. */
const DEFAULT_CHAR = "paperdoll";

export function CharacterWorkspace() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<Tool>("bones");
  const [sel, setSel] = useState<VariantSel>(DEFAULT_SEL);
  const [selBone, setSelBone] = useState<string | null>(null);
  const [selAnim, setSelAnim] = useState<string>("idle");
  const [selAtt, setSelAtt] = useState<{ slot: string; att: string } | null>(null);
  const [previewPart, setPreviewPart] = useState<PartPreview | null>(null);
  const [animTime, setAnimTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewTab, setViewTab] = useState<"scene" | "filtered">("scene");
  const [additiveBase, setAdditiveBase] = useState("");
  const [boneSearch, setBoneSearch] = useState("");
  const [chars, setChars] = useState<CharacterInfo[]>([]);
  const [char, setChar] = useState(
    () => new URLSearchParams(location.search).get("char") || DEFAULT_CHAR,
  );

  // The atlas image lives in an offscreen canvas — pixel edits mutate it and
  // the viewport re-renders from it every frame.
  const atlasCanvas = useRef<HTMLCanvasElement | null>(null);
  const atlasDirty = useRef(false);

  const refreshChars = useCallback(async () => {
    try {
      setChars(await listCharacters());
    } catch {
      /* dev server without middleware — list stays empty */
    }
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      // Specs may name a shared rig (preset characters like paperdoll_imp
      // bind to paperdoll's assets) — resolve the asset stem before fetching.
      const spec = await loadSpec(char);
      const assetId = spec?.output?.name ?? char;
      const [skelText, atlasText, img] = await Promise.all([
        loadText(`/assets/spine/${assetId}.json?t=${Date.now()}`),
        loadText(`/assets/spine/${assetId}.atlas?t=${Date.now()}`),
        loadImage(`/assets/spine/${assetId}.png?t=${Date.now()}`),
      ]);
      const skeleton = JSON.parse(skelText) as Skeleton;
      // No editable spec on disk (e.g. imported rig) — synthesize one from
      // the skeleton so bones/animations are still editable.
      const resolvedSpec = spec ?? specFromSkeleton(skeleton, char);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      atlasCanvas.current = canvas;
      setDoc({ spec: resolvedSpec, skeleton, atlas: parseAtlas(atlasText) });
      setSel({ ...DEFAULT_SEL, ...(resolvedSpec.preset ?? {}) });
      setDirty(false);
      atlasDirty.current = false;
    } catch (e) {
      setErr(String(e));
    }
  }, [char]);

  useEffect(() => {
    void load();
    void refreshChars();
  }, [load, refreshChars]);

  /** Resolve the attachment key shown for a slot under the current variant
   * selection. An armed part preview wins: it mounts the catalog key on every
   * slot of its layer that carries it, without touching the variant sel. */
  const attForSlot = useCallback(
    (slot: string): string | undefined => {
      if (!doc) return undefined;
      const layer = slotLayer(doc.spec, slot);
      if (previewPart && layer === previewPart.layer) {
        const atts = doc.skeleton.skins[0]?.attachments[slot];
        if (atts && previewPart.key in atts) return previewPart.key;
      }
      return layer ? variantKeyForLayer(layer, sel) : undefined;
    },
    [doc, sel, previewPart],
  );

  // A mount preview is only visible while the parts dock is open — clear it
  // on tab switch so no hidden override lingers on the doll.
  useEffect(() => {
    if (tool !== "catalog") setPreviewPart(null);
  }, [tool]);

  const update = useCallback((fn: (d: Doc) => Doc) => {
    setDoc((d) => (d ? fn(d) : d));
    setDirty(true);
  }, []);

  /** Repack the atlas — rebuilds the png canvas. `extra` carries pixel data
   * for regions not yet in the atlas (e.g. cloned variants). */
  const repack = useCallback((extra?: Map<string, HTMLCanvasElement>) => {
    setDoc((d) => {
      if (!d || !atlasCanvas.current) return d;
      const src = atlasCanvas.current;
      const dims = new Map([...d.atlas.regions].map(([n, r]) => [n, { w: r.w, h: r.h }]));
      for (const [n, c] of extra ?? []) dims.set(n, { w: c.width, h: c.height });
      const { placements, height } = packRegions(dims, d.spec.source.atlasWidth, d.spec.source.pad);
      const out = document.createElement("canvas");
      out.width = d.spec.source.atlasWidth;
      out.height = height;
      const ctx = out.getContext("2d")!;
      for (const [name, r] of d.atlas.regions) {
        const p = placements.get(name)!;
        ctx.drawImage(src, r.x, r.y, r.w, r.h, p.x, p.y, r.w, r.h);
      }
      for (const [name, c] of extra ?? []) {
        const p = placements.get(name)!;
        ctx.drawImage(c, p.x, p.y);
      }
      atlasCanvas.current = out;
      return { ...d, atlas: { ...d.atlas, width: out.width, height, regions: placements } };
    });
    atlasDirty.current = true;
    setDirty(true);
  }, []);

  const doSave = useCallback(async () => {
    if (!doc || !atlasCanvas.current) return;
    setStatus("Saving…");
    try {
      const skeleton = buildSkeleton(doc.spec, doc.skeleton);
      const atlasText = emitAtlas(
        doc.atlas.image,
        atlasCanvas.current.width,
        atlasCanvas.current.height,
        doc.atlas.regions,
      );
      const pngBase64 = atlasCanvas.current.toDataURL("image/png").split(",")[1]!;
      const assetId = doc.spec.output?.name ?? char;
      await save(char, { spec: doc.spec, skeleton, atlas: atlasText, pngBase64, assets: assetId });
      setDoc({ ...doc, skeleton });
      setDirty(false);
      atlasDirty.current = false;
      setStatus(`Saved spec + ${assetId}.{json,atlas,png}`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [doc]);

  const doRegen = useCallback(async () => {
    setStatus("Regenerating…");
    try {
      const out = await regenerate(char);
      await load();
      setStatus(`Regenerated — ${out.trim()}`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [char, load]);

  const regenerable =
    chars.find((c) => c.id === char)?.regenerable ??
    !!(doc?.spec.generator && doc.spec.source.dir);

  const switchChar = useCallback(
    (id: string) => {
      if (id === char) return;
      if (dirty && !window.confirm(`Discard unsaved changes to '${char}'?`)) return;
      setChar(id);
      setSelBone(null);
      setSelAtt(null);
      setPreviewPart(null);
      setSel(DEFAULT_SEL);
      setPlaying(false);
      setAnimTime(0);
      setAdditiveBase("");
      const q = new URLSearchParams(location.search);
      q.set("char", id);
      history.replaceState(null, "", `?${q}`);
    },
    [char, dirty],
  );

  const doNew = useCallback(async () => {
    const id = window.prompt("New character id (file name):", "");
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return;
    setStatus("Creating…");
    try {
      await createCharacter(id);
      await refreshChars();
      switchChar(id);
      setStatus(`Created '${id}' — blank rig`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [refreshChars, switchChar]);

  const doDuplicate = useCallback(async () => {
    if (!doc || !atlasCanvas.current) return;
    const id = window.prompt(`Duplicate '${char}' as:`, `${char}_copy`);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id === char) return;
    setStatus("Duplicating…");
    try {
      const spec = {
        ...doc.spec,
        output: { ...doc.spec.output, name: id },
      };
      const skeleton = buildSkeleton(spec, doc.skeleton);
      skeleton.skeleton = { ...skeleton.skeleton, hash: id };
      await createCharacter(id, spec, {
        skeleton,
        atlas: emitAtlas(
          doc.atlas.image.replace(/^[^.]*/, id),
          atlasCanvas.current.width,
          atlasCanvas.current.height,
          doc.atlas.regions,
        ),
        pngBase64: atlasCanvas.current.toDataURL("image/png").split(",")[1]!,
      });
      await refreshChars();
      switchChar(id);
      setStatus(`Duplicated '${char}' as '${id}'`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [doc, char, refreshChars, switchChar]);

  const doDelete = useCallback(async () => {
    if (!window.confirm(`Delete character '${char}' (spec + generated assets)?`)) return;
    setStatus("Deleting…");
    try {
      await deleteCharacter(char);
      await refreshChars();
      setChar(DEFAULT_CHAR);
      const q = new URLSearchParams(location.search);
      q.set("char", DEFAULT_CHAR);
      history.replaceState(null, "", `?${q}`);
      setStatus(`Deleted '${char}'`);
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [char, refreshChars]);

  const docRef = useRef<Doc | null>(null);
  docRef.current = doc;
  const selRef = useRef(sel);
  selRef.current = sel;
  const stateRef = useRef({ selBone, selAnim, animTime, playing, selAtt, tool, additiveBase });
  stateRef.current = { selBone, selAnim, animTime, playing, selAtt, tool, additiveBase };

  const actions = useMemo(
    () => ({
      setSpec: (fn: (s: Spec) => Spec) => update((d) => ({ ...d, spec: fn(d.spec) })),
      setSkeleton: (fn: (s: Skeleton) => Skeleton) =>
        update((d) => ({ ...d, skeleton: fn(d.skeleton) })),
      setAtlas: (fn: (a: Atlas) => Atlas) => update((d) => ({ ...d, atlas: fn(d.atlas) })),
      setSelBone,
      setSelAnim,
      setSelAtt,
      setAnimTime,
      setPlaying,
      setAdditiveBase,
      repack: (extra?: Map<string, HTMLCanvasElement>) => repack(extra),
      atlasCanvas,
      markAtlasDirty: () => {
        atlasDirty.current = true;
        setDirty(true);
      },
    }),
    [update, repack],
  );

  if (err) return <div className="ed-err">Editor failed to load: {err}</div>;
  if (!doc) return <div className="ed-err">Loading…</div>;

  return (
    <>
      <div className="ed-toolbar">
        <span className="ed-toolbar-label">Character</span>
        <select value={char} onChange={(e) => switchChar(e.target.value)}>
          {[...new Set([char, ...chars.map((c) => c.id)])].map((id) => (
            <option key={id} value={id}>
              {id}
              {chars.find((c) => c.id === id)?.hasSpec ? "" : " (no spec)"}
            </option>
          ))}
        </select>
        <button onClick={() => void doNew()}>New</button>
        <button onClick={() => void doDuplicate()} disabled={!doc}>
          Duplicate
        </button>
        <button onClick={() => void doDelete()} disabled={char === DEFAULT_CHAR}>
          Delete
        </button>

        <span className="spacer" />

        <button onClick={() => void load()}>Reload</button>
        <button onClick={() => void doRegen()} disabled={!regenerable}>
          Regenerate
        </button>
        <button className="primary" onClick={() => void doSave()} disabled={!dirty}>
          Save
        </button>
      </div>
      <div className="ed-main">
        <aside className="ed-hierarchy">
          <div className="ed-dock-title">Hierarchy <span>{doc.spec.bones.length}</span></div>
          <div className="ed-search"><input aria-label="Search bones" placeholder="Search bones…" value={boneSearch} onChange={(e) => setBoneSearch(e.target.value)} /></div>
          <div className="ed-tree">
            <div className="ed-tree-root">▾ <strong>{char}</strong></div>
            {doc.spec.bones.filter((b) => b.name.toLowerCase().includes(boneSearch.toLowerCase())).map((b) => {
              let depth = 0;
              let parent = b.parent;
              const visited = new Set([b.name]);
              while (parent && !visited.has(parent)) {
                visited.add(parent);
                depth++;
                parent = doc.spec.bones.find((p) => p.name === parent)?.parent ?? null;
              }
              return <button key={b.name} className={`ed-tree-item ${selBone === b.name ? "selected" : ""}`} style={{ paddingLeft: 14 + Math.min(depth, 6) * 12 }} aria-pressed={selBone === b.name} onClick={() => setSelBone(b.name)}><span className="ed-bone-icon">◇</span>{b.name}</button>;
            })}
            {!doc.spec.bones.some((b) => b.name.toLowerCase().includes(boneSearch.toLowerCase())) && <p className="ed-empty">No bones found</p>}
          </div>
          <div className="ed-project">
            <div className="ed-dock-title">Project <span>Characters</span></div>
            <div className="ed-project-path">Assets / Spine</div>
            <div className="ed-project-list">{[...new Set([char, ...chars.map((c) => c.id)])].map((id) => <button key={id} className={`ed-tree-item ${id === char ? "selected" : ""}`} onClick={() => switchChar(id)}><span className="ed-asset-icon">▧</span>{id}</button>)}</div>
          </div>
        </aside>
        <section className="ed-scene">
          <div className="ed-dock-title"><div className="ed-view-tabs" role="tablist" aria-label="Character view">
            {(["scene", "filtered"] as const).map((tab) => <button key={tab} role="tab" aria-selected={viewTab === tab} className={viewTab === tab ? "active" : ""} onClick={() => setViewTab(tab)}>{tab === "scene" ? "Scene" : "Filtered"}</button>)}
          </div><span>{viewTab === "filtered" ? "Phaser" : "2D"}</span></div>
          <div className="ed-scene-toolbar">
            <span>{tool === "bones" ? "Setup pose" : "Animation preview"}</span>
            <span className="spacer" />
            <button aria-label={playing ? "Pause animation" : "Play animation"} aria-pressed={playing} disabled={!doc.spec.animations[selAnim]} onClick={() => { if (tool === "bones") setTool("anim"); setPlaying(!playing); }}>{playing ? "Ⅱ" : "▶"}</button>
            <button aria-label="Stop animation" onClick={() => { setPlaying(false); setAnimTime(0); }}>■</button>
          </div>
        <Viewport
          filtered={viewTab === "filtered"}
          doc={doc}
          sel={sel}
          attForSlot={attForSlot}
          atlasCanvas={atlasCanvas}
          stateRef={stateRef}
          actions={actions}
        />
          {tool === "anim" && (
            <AnimPanel
              doc={doc}
              selAnim={selAnim}
              animTime={animTime}
              playing={playing}
              selBone={selBone}
              additiveBase={additiveBase}
              actions={actions}
            />
          )}
          {tool === "catalog" && (
            <PartsDock
              doc={doc}
              selAtt={selAtt}
              preview={previewPart}
              setPreview={setPreviewPart}
              editPixels={() => setTool("pixels")}
              atlasCanvas={atlasCanvas}
              actions={actions}
            />
          )}
          <div className="ed-scene-footer"><span>Scroll to zoom · Shift + drag to pan</span><span>{selBone ?? "No bone selected"}</span></div>
        </section>
        <div className="ed-side">
          <div className="ed-dock-title">Inspector <span>{selBone ?? char}</span></div>
          <div className="ed-tabs">
            {(["variants", "bones", "anim", "pixels", "spec", "catalog"] as Tool[]).map((t) => (
              <button
                key={t}
                className={tool === t ? "active" : ""}
                aria-pressed={tool === t}
                onClick={() => { setTool(t); if (t === "bones") setPlaying(false); }}
              >
                {t === "anim" ? "Animations" : t === "spec" ? "Template" : t === "variants" ? "Variants" : t === "catalog" ? "Parts" : t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="ed-panel">
            {tool === "variants" && (
              <VariantsPanel doc={doc} sel={sel} setSel={setSel} selAtt={selAtt} />
            )}
            {tool === "bones" && (
              <BonesPanel doc={doc} selBone={selBone} actions={actions} />
            )}
            {tool === "anim" && (
              <div className="ed-hint">
                Animation tracks are edited in the timeline dock below the scene.
              </div>
            )}
            {tool === "pixels" && (
              <PixelPanel
                doc={doc}
                sel={sel}
                selAtt={selAtt}
                attForSlot={attForSlot}
                atlasCanvas={atlasCanvas}
                actions={actions}
              />
            )}
            {tool === "spec" && <SpecPanel doc={doc} actions={actions} />}
            {tool === "catalog" && (
              <div className="ed-hint">
                Body parts are managed in the dock below the scene.
              </div>
            )}
          </div>
        </div>
      </div>
      <footer className="ed-statusbar"><span className={dirty ? "dirty" : "ed-ready"}>●</span><span role="status">{status || (dirty ? "Unsaved changes" : "Ready")}</span><span className="spacer" /><span>{doc.spec.bones.length} bones</span><span>{doc.skeleton.slots.length} slots</span><span>{char}{dirty ? " *" : ""}</span></footer>
    </>
  );
}
