import * as THREE from "three";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterAppearance } from "../../../../wails/frontend/src/characters/heroes99";
import {
  CLOTH_HEX,
  COLOR_ROLES,
  GEOMETRY_TYPES,
  HAIR_HEX,
  SKIN_HEX,
  defaultGeometryParams,
  emptyClip,
  emptyRig,
  newPartId,
  upsertKeyframe,
  type Rig3DDoc,
  type RigAnimClip,
  type RigAnimName,
  type RigBone,
  type RigColor,
  type RigColorRole,
  type RigLimb,
  type RigPart,
  type RigTrack,
  type RigTrackChannel,
  type Vec3,
} from "../../../../wails/frontend/src/three/rig3d";
import { DEFAULT_RIGS } from "../../../../wails/frontend/src/three/rig3dDefaults";
import { buildRig, setRig, type RigInstance } from "../../../../wails/frontend/src/three/rigBuilder";
import { disposeObject } from "../../../../wails/frontend/src/three/terrain";
import type { SceneView } from "../scene3d/SceneView";
import type { SceneTransform } from "../../../../wails/frontend/src/three/scene3d";
import {
  deleteRigFile,
  listModels,
  listRigFiles,
  loadRigFile,
  saveRigFile,
  type ModelInfo,
  type RigInfo,
} from "../scene3d/rigsApi";

const APPEARANCE_WHEN_KEYS = ["ears", "horns", "wings", "tail"];

/** Scene-view tabs for the Characters mode. */
export const CHAR_TABS = [
  { id: "model", label: "Model" },
  { id: "skeleton", label: "Skeleton" },
  { id: "animation", label: "Animation" },
] as const;
export type CharTab = (typeof CHAR_TABS)[number]["id"];

export interface RigEntry extends RigInfo { builtin: boolean }

export function rigEntries(files: RigInfo[]): RigEntry[] {
  const out: RigEntry[] = files.map(f => ({ ...f, builtin: false }));
  for (const [id, doc] of Object.entries(DEFAULT_RIGS))
    if (!files.some(f => f.id === id)) out.push({ id, label: `${doc.label} (builtin)`, builtin: true });
  return out;
}

/** Shared state for the Scene workspace's Characters mode. `active` gates the
 * stage preview so the viewport belongs to the scene doc in Prefabs mode. */
export function useCharacterMode(view: SceneView | null, active: boolean) {
  const [entries, setEntries] = useState<RigEntry[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [rigId, setRigId] = useState("");
  const [doc, setDoc] = useState<Rig3DDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [bone, setBone] = useState("");
  const [anim, setAnim] = useState<"idle" | "run">("idle");
  const [tab, setTab] = useState<CharTab>("model");
  const [ridePose, setRidePose] = useState(false);
  const [appearance, setAppearance] = useState<Partial<CharacterAppearance>>({ skin: "c1", hairColor: "c1", clothColor: "c1" });
  // Animation-tab timeline: `clip` picks the authored clip under edit, the
  // playhead lives in refs so playback doesn't re-render React every frame.
  const [clip, setClipState] = useState<RigAnimName>("idle");
  const [tlPlaying, setTlPlayingState] = useState(false);
  const clipRef = useRef<RigAnimName>("idle");
  const playingRef = useRef(false);
  const tlTimeRef = useRef(0);
  const tlTickRef = useRef<((t: number) => void) | null>(null);
  const docRef = useRef<Rig3DDoc | null>(null);
  docRef.current = doc;
  /** Keeps the per-frame playing flag and React state in lockstep. */
  const setTlPlaying = useCallback((p: boolean) => { playingRef.current = p; setTlPlayingState(p); }, []);
  const instRef = useRef<RigInstance | null>(null);
  const markersRef = useRef<Map<string, THREE.Mesh> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const files = await listRigFiles();
      const list = rigEntries(files);
      setEntries(list);
      if (!list.some(r => r.id === rigId)) setRigId(list[0]?.id ?? "");
    } catch {
      setEntries(rigEntries([]));
      if (!rigId) setRigId(Object.keys(DEFAULT_RIGS)[0] ?? "");
    }
  }, [rigId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void listModels().then(setModels); }, []);

  const openRig = useCallback(async (id: string) => {
    if (!id) return;
    setRigId(id);
    setBone("");
    try {
      const saved = await loadRigFile(id);
      setDoc(saved ?? structuredClone(DEFAULT_RIGS[id]) ?? null);
      setDirty(false);
      setStatus(saved ? `Loaded rigs3d/${id}.rig3d.json` : `Using compiled-in default for '${id}'`);
    } catch (e) {
      setDoc(structuredClone(DEFAULT_RIGS[id]) ?? null);
      setDirty(false);
      setStatus(`Rig file unreadable (${e instanceof Error ? e.message : e}) — showing the default`);
    }
  }, []);

  useEffect(() => { if (rigId && !doc) void openRig(rigId); }, [rigId, doc, openRig]);

  const update = useCallback((fn: (d: Rig3DDoc) => Rig3DDoc) => {
    setDoc(d => (d ? fn(d) : d));
    setDirty(true);
  }, []);

  // Stage preview: rebuild the rig whenever the doc/appearance changes while
  // active, and hand the per-frame hook to its animator.
  useEffect(() => {
    if (!view || !active || !doc) return;
    const stage = view.stage;
    while (stage.children.length) { const c = stage.children[0]; stage.remove(c); disposeObject(c); }
    // Anchor the preview where the camera is already looking, and re-anchor
    // whenever a (re)loaded map reframes the camera.
    const anchor = () => {
      const p = view.getPivot();
      stage.position.set(p.x, view.groundHeight(p.x, p.z), p.z);
    };
    anchor();
    const inst = buildRig(doc, { appearance });
    stage.add(inst.root);
    instRef.current = inst;
    if (ridePose) inst.applyPose(doc.ridePose);

    // Skeleton tab: joint markers on every bone plus parent→child segments
    // redrawn per frame so gizmo drags and animation show live.
    let lines: THREE.LineSegments | null = null;
    if (tab === "skeleton") {
      const markers = new Map<string, THREE.Mesh>();
      const geo = new THREE.OctahedronGeometry(0.05);
      for (const [name, obj] of inst.bones) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7fd4ff, depthTest: false, transparent: true, opacity: 0.9 }));
        m.renderOrder = 20;
        obj.add(m);
        markers.set(name, m);
      }
      markersRef.current = markers;
      const segs = doc.bones.filter(b => b.parent).length;
      const pos = new THREE.BufferAttribute(new Float32Array(segs * 6), 3);
      lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", pos), new THREE.LineBasicMaterial({ color: 0x7fd4ff, depthTest: false, transparent: true, opacity: 0.7 }));
      lines.frustumCulled = false;
      lines.renderOrder = 19;
      stage.add(lines);
    } else {
      markersRef.current = null;
    }

    const frame = () => view.frameObject(inst.root, 3.2);
    frame();
    view.onMapLoaded = () => { anchor(); frame(); };
    const seg = new THREE.Vector3();
    view.onFrame = (dt, time) => {
      // Animation tab with an authored clip open: the timeline drives the
      // pose (scrubbed or playing); other tabs keep the locomotion preview.
      const clipDoc = doc.anims?.[clipRef.current];
      if (tab === "animation" && clipDoc) {
        if (playingRef.current) {
          let t = tlTimeRef.current + dt;
          if (t >= clipDoc.duration) {
            t = clipDoc.loop ? t % clipDoc.duration : clipDoc.duration;
            if (!clipDoc.loop) setTlPlaying(false);
          }
          tlTimeRef.current = t;
          tlTickRef.current?.(t);
        }
        inst.previewClip(clipDoc, tlTimeRef.current);
      } else {
        inst.update(dt, time, anim === "run", true);
      }
      if (lines) {
        const attr = lines.geometry.getAttribute("position") as THREE.BufferAttribute;
        let i = 0;
        for (const b of doc.bones) {
          if (!b.parent) continue;
          const child = inst.bones.get(b.name), parent = inst.bones.get(b.parent);
          if (!child || !parent) continue;
          child.getWorldPosition(seg); stage.worldToLocal(seg); attr.setXYZ(i++, seg.x, seg.y, seg.z);
          parent.getWorldPosition(seg); stage.worldToLocal(seg); attr.setXYZ(i++, seg.x, seg.y, seg.z);
        }
        attr.needsUpdate = true;
      }
    };
    return () => {
      view.onFrame = () => {};
      view.onMapLoaded = () => {};
      view.setGizmoOverride(null);
      if (instRef.current === inst) instRef.current = null;
      markersRef.current = null;
      if (lines) { stage.remove(lines); disposeObject(lines); }
      stage.remove(inst.root);
      stage.position.set(0, 0, 0);
      inst.dispose();
    };
  }, [view, active, doc, appearance, anim, tab, ridePose]);

  // Highlight the selected bone's joint marker (skeleton overlay).
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    for (const [name, m] of markers) (m.material as THREE.MeshBasicMaterial).color.set(name === bone ? 0xffd75e : 0x7fd4ff);
  }, [bone, doc, tab]);

  /** Auto-key: gizmo drags (and the timeline's ◆ key button) write keyframes
   * at the playhead for every channel tracked on that bone — a rotation
   * track is created on first touch, like Unity's auto-record. With
   * `onlyChannel` (a lane's ◆+ button) just that channel is keyed, creating
   * its track if missing. */
  const recordTransform = useCallback((boneName: string, xform: SceneTransform, onlyChannel?: RigTrackChannel) => {
    update(d => {
      const name = clipRef.current;
      const clip = d.anims?.[name];
      if (!clip) return d;
      let tracks = clip.tracks.map(tr => ({ ...tr, keys: [...tr.keys] }));
      if (onlyChannel) {
        if (!tracks.some(tr => tr.bone === boneName && tr.channel === onlyChannel))
          tracks.push({ bone: boneName, channel: onlyChannel, keys: [] });
      } else if (!tracks.some(tr => tr.bone === boneName)) {
        tracks.push({ bone: boneName, channel: "rotation", keys: [] });
      }
      const t = tlTimeRef.current;
      tracks = tracks.map(tr => {
        if (tr.bone !== boneName || (onlyChannel && tr.channel !== onlyChannel)) return tr;
        const v = tr.channel === "rotation" ? xform.rotation : tr.channel === "position" ? xform.position : xform.scale;
        return upsertKeyframe(tr, t, v);
      });
      return { ...d, anims: { ...d.anims, [name]: { ...clip, tracks } } };
    });
  }, [update]);

  const recordBone = useCallback((boneName: string, onlyChannel?: RigTrackChannel) => {
    const obj = instRef.current?.bones.get(boneName);
    if (!obj) return;
    const D = 180 / Math.PI;
    recordTransform(boneName, {
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x * D, obj.rotation.y * D, obj.rotation.z * D],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    }, onlyChannel);
  }, [recordTransform]);

  // Clip document helpers for the timeline dock.
  const createClip = useCallback((name: RigAnimName) => update(d => ({ ...d, anims: { ...d.anims, [name]: emptyClip() } })), [update]);
  const deleteClip = useCallback((name: RigAnimName) => update(d => {
    const a = { ...d.anims };
    delete a[name];
    return { ...d, anims: Object.keys(a).length ? a : undefined };
  }), [update]);
  const setClipProp = useCallback((name: RigAnimName, patch: Partial<RigAnimClip>) =>
    update(d => { const c = d.anims?.[name]; return c ? { ...d, anims: { ...d.anims, [name]: { ...c, ...patch } } } : d; }), [update]);
  const setClipTracks = useCallback((name: RigAnimName, fn: (tracks: RigTrack[]) => RigTrack[]) =>
    update(d => { const c = d.anims?.[name]; return c ? { ...d, anims: { ...d.anims, [name]: { ...c, tracks: fn(c.tracks) } } } : d; }), [update]);

  const setClip = useCallback((c: RigAnimName) => { clipRef.current = c; tlTimeRef.current = 0; tlTickRef.current?.(0); setClipState(c); setTlPlaying(false); }, []);

  // Bone → gizmo override (doc bones are parent-relative, matching the
  // Object3D's local transform — the gizmo writes straight back). On the
  // Animation tab with a clip open it records keyframes at the playhead
  // instead of editing the rest pose.
  useEffect(() => {
    if (!view || !active) return;
    const inst = instRef.current;
    const obj = bone && inst ? inst.bones.get(bone) : null;
    view.setGizmoOverride(obj ?? null, (t: SceneTransform) => {
      if (tab === "animation" && bone && docRef.current?.anims?.[clipRef.current]) { recordTransform(bone, t); return; }
      update(d => ({ ...d, bones: d.bones.map(b => (b.name === bone ? { ...b, position: t.position, rotation: t.rotation, scale: t.scale } : b)) }));
    });
    return () => { if (view) view.setGizmoOverride(null); };
  }, [view, active, bone, update, tab, doc, recordTransform]);

  const newRig = useCallback(() => {
    const id = window.prompt("New rig id (used for the filename)", "new_rig");
    if (!id) return;
    setRigId(id);
    setDoc(emptyRig(id, id));
    setBone("root");
    setDirty(true);
    setStatus(`New rig '${id}' — save to create rigs3d/${id}.rig3d.json`);
  }, []);

  const save = useCallback(async () => {
    if (!doc) return;
    try {
      await saveRigFile(doc);
      setRig(doc); // live library — runtime picks it up on next load
      setDirty(false);
      setStatus(`Saved rigs3d/${doc.id}.rig3d.json`);
      void refresh();
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [doc, refresh]);

  const remove = useCallback(async () => {
    if (!rigId || !window.confirm(`Delete saved file rigs3d/${rigId}.rig3d.json? The compiled-in default (if any) remains.`)) return;
    try {
      await deleteRigFile(rigId);
      setDoc(null);
      setStatus(`Deleted ${rigId}.rig3d.json`);
      void refresh();
    } catch (e) {
      setStatus(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [rigId, refresh]);

  const attack = useCallback(() => instRef.current?.attack(), []);

  return {
    entries, models, rigId, doc, dirty, status, bone, anim, appearance, tab, ridePose,
    clip, tlPlaying, setTlPlaying, recordBone,
    setBone, setAnim, setAppearance, setTab, setRidePose, openRig, update, newRig, save, remove, attack,
    setClip, createClip, deleteClip, setClipProp, setClipTracks,
    tlSetTime: (t: number) => { tlTimeRef.current = t; tlTickRef.current?.(t); },
    tlGetTime: () => tlTimeRef.current,
    tlTick: (fn: ((t: number) => void) | null) => { tlTickRef.current = fn; fn?.(tlTimeRef.current); },
    entry: entries.find(e => e.id === rigId),
  };
}

export type CharacterMode = ReturnType<typeof useCharacterMode>;

// --- left column: rig library -------------------------------------------------

export function CharactersLibrary({ st }: { st: CharacterMode }) {
  return (
    <>
      <div className="ed-dock-title">Characters <span>{st.entries.length}</span></div>
      <div className="ed-list">
        {st.entries.map(r => (
          <button key={r.id} className={`item ${r.id === st.rigId ? "sel" : ""}`} onClick={() => void st.openRig(r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="sc-lib-actions">
        <button onClick={st.newRig}>New rig</button>
        <button disabled={!st.entry || st.entry.builtin} title="Delete the saved .rig3d.json (builtin defaults cannot be deleted)" onClick={() => void st.remove()}>Delete</button>
      </div>
      <div className="ed-dock-title">Preview</div>
      <div className="sc-preview-controls">
        <label className="efx-field"><span>anim</span>
          <select value={st.anim} onChange={e => st.setAnim(e.target.value as "idle" | "run")}>
            <option value="idle">idle</option>
            <option value="run">run</option>
          </select>
        </label>
        <label className="efx-field"><span>skin</span>
          <select value={st.appearance.skin ?? ""} onChange={e => st.setAppearance({ ...st.appearance, skin: e.target.value || undefined })}>
            {Object.keys(SKIN_HEX).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="efx-field"><span>hair</span>
          <select value={st.appearance.hairColor ?? ""} onChange={e => st.setAppearance({ ...st.appearance, hairColor: e.target.value || undefined })}>
            {Object.keys(HAIR_HEX).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="efx-field"><span>cloth</span>
          <select value={st.appearance.clothColor ?? ""} onChange={e => st.setAppearance({ ...st.appearance, clothColor: e.target.value || undefined })}>
            {Object.keys(CLOTH_HEX).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        {APPEARANCE_WHEN_KEYS.map(key => (
          <label key={key} className="efx-field" title={`appearance.${key} — matches part "when" conditions`}>
            <span>{key}</span>
            <input
              value={(st.appearance as Record<string, unknown>)[key] as string ?? ""}
              placeholder="—"
              onChange={e => st.setAppearance({ ...st.appearance, [key]: e.target.value || undefined })}
            />
          </label>
        ))}
      </div>
    </>
  );
}

// --- right column: rig inspector -----------------------------------------------

function num(label: string, value: number, onChange: (n: number) => void, step = 0.05) {
  return (
    <label className="efx-field"><span>{label}</span>
      <input type="number" step={step} value={value} onChange={e => { const n = +e.target.value; if (Number.isFinite(n)) onChange(n); }} />
    </label>
  );
}

function vec(label: string, v: Vec3, onChange: (v: Vec3) => void, step = 0.05) {
  return (
    <div className="ed-row sc-vec">
      <span className="sc-vec-label">{label}</span>
      {v.map((n, i) => (
        <input key={i} type="number" aria-label={`${label} ${"xyz"[i]}`} step={step} value={n}
          onChange={e => { const nv = [...v] as Vec3; nv[i] = +e.target.value || 0; onChange(nv); }} />
      ))}
    </div>
  );
}

function colorEditor(c: RigColor, onChange: (c: RigColor) => void) {
  const fixed = "fixed" in c;
  return (
    <div className="ed-row">
      <select
        aria-label="Color source"
        value={fixed ? "fixed" : `role:${c.role}`}
        onChange={e => {
          const v = e.target.value;
          onChange(v === "fixed" ? { fixed: "#ffffff" } : { role: v.slice(5) as RigColorRole });
        }}
      >
        {COLOR_ROLES.map(r => <option key={r} value={`role:${r}`}>{r}</option>)}
        <option value="fixed">fixed</option>
      </select>
      {fixed
        ? <input type="color" aria-label="Fixed color" value={c.fixed} onChange={e => onChange({ fixed: e.target.value })} />
        : num("shade", c.shade ?? 0, n => onChange({ role: c.role, shade: n || undefined }), 0.05)}
    </div>
  );
}

function RigFields({ st }: { st: CharacterMode }) {
  const d = st.doc!;
  const set = (patch: Partial<Rig3DDoc>) => st.update(x => ({ ...x, ...patch }));
  return (
    <>
      <h4>Rig</h4>
      <div className="ed-row">
        <label className="efx-field"><span>id</span><input value={d.id} onChange={e => set({ id: e.target.value })} /></label>
        <label className="efx-field"><span>label</span><input value={d.label} onChange={e => set({ label: e.target.value })} /></label>
      </div>
      <div className="ed-row">
        {num("scale", d.scale, n => set({ scale: n }))}
        {num("seat", d.seat, n => set({ seat: n }))}
        {num("height", d.height, n => set({ height: n }))}
      </div>
      <h4>Model (glTF/GLB)</h4>
      <label className="efx-check">
        <input type="checkbox" checked={!!d.model} onChange={e => set({ model: e.target.checked ? { url: "", scale: 1, position: [0, 0, 0], rotation: [0, 0, 0], clips: {}, skinned: true } : undefined })} />
        enabled
      </label>
      {d.model && (
        <>
          <div className="ed-row">
            <select aria-label="Model asset" value={st.models.some(m => m.url === d.model!.url) ? d.model!.url : ""}
              onChange={e => set({ model: { ...d.model!, url: e.target.value || d.model!.url } })}>
              <option value="">— pick from assets/models —</option>
              {st.models.map(m => <option key={m.url} value={m.url}>{m.name}</option>)}
            </select>
            <input aria-label="Model URL" placeholder="/assets/models/x.glb" value={d.model.url}
              onChange={e => set({ model: { ...d.model!, url: e.target.value } })} />
          </div>
          <div className="ed-row">
            {num("scale", d.model.scale, n => set({ model: { ...d.model!, scale: n } }))}
            <label className="efx-check"><input type="checkbox" checked={d.model.skinned} onChange={e => set({ model: { ...d.model!, skinned: e.target.checked } })} />skinned</label>
            <label className="efx-field"><span>bone</span>
              <select value={d.model.bone ?? ""} onChange={e => set({ model: { ...d.model!, bone: e.target.value || undefined } })}>
                <option value="">root</option>
                {d.bones.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </label>
          </div>
          {vec("position", d.model.position, v => set({ model: { ...d.model!, position: v } }))}
          {vec("rotation", d.model.rotation, v => set({ model: { ...d.model!, rotation: v } }), 5)}
          <div className="ed-hint">Clip names (idle/run/attack) are set on the Animation tab.</div>
        </>
      )}
    </>
  );
}

/** Skeleton tab: bone hierarchy + transform editing (gizmo drives it too). */
function SkeletonSection({ st }: { st: CharacterMode }) {
  const d = st.doc!;
  const bone = d.bones.find(b => b.name === st.bone);
  const setBone = (patch: Partial<RigBone>) =>
    st.update(x => ({ ...x, bones: x.bones.map(b => (b.name === bone!.name ? { ...b, ...patch } : b)) }));

  const depth = (b: RigBone): number => { const p = d.bones.find(x => x.name === b.parent); return p ? depth(p) + 1 : 0; };

  const addBone = () => {
    const base = "bone";
    let name = base, i = 1;
    while (d.bones.some(b => b.name === name)) name = `${base}_${i++}`;
    st.update(x => ({ ...x, bones: [...x.bones, { name, parent: st.bone || null, position: [0, 0, 0], rotation: [0, 0, 0] }] }));
    st.setBone(name);
  };
  const removeBone = () => {
    if (!bone || !window.confirm(`Delete bone '${bone.name}' and its parts? Children are reparented to its parent.`)) return;
    st.update(x => ({
      ...x,
      bones: x.bones.filter(b => b.name !== bone.name).map(b => (b.parent === bone.name ? { ...b, parent: bone.parent } : b)),
      parts: x.parts.filter(p => p.bone !== bone.name),
      limbs: x.limbs.filter(l => l.bone !== bone.name),
    }));
    st.setBone("");
  };

  return (
    <>
      <h4>Bones <span className="dim">({d.bones.length})</span></h4>
      <div className="ed-hint">Select a bone, then drag the gizmo in the scene or edit the numbers below.</div>
      <div className="ed-list sc-bones">
        {d.bones.map(b => (
          <button key={b.name} className={`item ${b.name === st.bone ? "sel" : ""}`} style={{ paddingLeft: 8 + depth(b) * 12 }} onClick={() => st.setBone(b.name === st.bone ? "" : b.name)}>
            {b.name}
            {d.limbs.some(l => l.bone === b.name) && <span className="dim"> ⠿limb</span>}
            <span className="dim"> · {d.parts.filter(p => p.bone === b.name).length}p</span>
          </button>
        ))}
      </div>
      <div className="ed-row">
        <button onClick={addBone}>+ Add bone{st.bone ? ` under ${st.bone}` : ""}</button>
        <button disabled={!bone} onClick={removeBone}>Remove</button>
      </div>
      {bone && (
        <>
          <div className="ed-row">
            <label className="efx-field"><span>name</span><input value={bone.name} onChange={e => setBone({ name: e.target.value })} /></label>
            <label className="efx-field"><span>parent</span>
              <select value={bone.parent ?? ""} onChange={e => setBone({ parent: e.target.value || null })}>
                <option value="">— root —</option>
                {d.bones.filter(b => b.name !== bone.name).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
              </select>
            </label>
          </div>
          {vec("position", bone.position, v => setBone({ position: v }))}
          {vec("rotation", bone.rotation, v => setBone({ rotation: v }), 5)}
          {vec("scale", bone.scale ?? [1, 1, 1], v => setBone({ scale: v }))}
        </>
      )}
    </>
  );
}

/** Model tab part list — edits parts on the selected bone. */
function PartsSection({ st }: { st: CharacterMode }) {
  const d = st.doc!;
  const bone = st.bone && d.bones.some(b => b.name === st.bone) ? st.bone : d.bones[0]?.name ?? "";
  const parts = d.parts.filter(p => p.bone === bone);
  return (
    <>
      <h4>Parts <span className="dim">({d.parts.length})</span></h4>
      <div className="ed-row">
        <label className="efx-field"><span>on bone</span>
          <select value={bone} onChange={e => st.setBone(e.target.value)}>
            {d.bones.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </label>
      </div>
      {parts.map(p => <PartCard key={p.id} st={st} part={p} />)}
      <button disabled={!bone} onClick={() =>
        st.update(x => ({
          ...x,
          parts: [...x.parts, {
            id: newPartId(), name: "part", bone,
            geometry: { type: "box", params: defaultGeometryParams("box") },
            color: { role: "cloth" }, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
          }],
        }))
      }>+ Add part</button>
    </>
  );
}

/** Animation tab: procedural limbs, model clips, mount ride pose, playback. */
function AnimationSection({ st }: { st: CharacterMode }) {
  const d = st.doc!;
  const set = (patch: Partial<Rig3DDoc>) => st.update(x => ({ ...x, ...patch }));
  const setLimb = (bone: string, patch: Partial<RigLimb>) =>
    st.update(x => ({ ...x, limbs: x.limbs.map(l => (l.bone === bone ? { ...l, ...patch } : l)) }));
  const ride = d.ridePose ?? {};
  const rideBones = Object.keys(ride);

  return (
    <>
      <p className="ed-hint">Authored clips (idle/run/attack) are keyframed in the timeline below.</p>
      <h4>Playback</h4>
      <div className="ed-row">
        <label className="efx-field"><span>anim</span>
          <select value={st.anim} onChange={e => st.setAnim(e.target.value as "idle" | "run")}>
            <option value="idle">idle</option><option value="run">run</option>
          </select>
        </label>
        <button onClick={st.attack}>Attack</button>
        <label className="efx-check" title="Apply the mount ride pose to the preview">
          <input type="checkbox" checked={st.ridePose} onChange={e => st.setRidePose(e.target.checked)} />
          ride pose
        </label>
      </div>

      <h4>Locomotion limbs <span className="dim">({d.limbs.length})</span></h4>
      <div className="ed-hint">Swing during run — phase 0/1 alternate; amplitude 0 + flex makes a one-way joint (knee/elbow).</div>
      {d.limbs.map(l => (
        <div key={l.bone} className="efx-burst">
          <div className="ed-row">
            <select aria-label="Limb bone" value={l.bone}
              onChange={e => st.update(x => ({ ...x, limbs: x.limbs.map(o => (o === l ? { ...o, bone: e.target.value } : o)) }))}>
              {d.bones.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
            <label className="efx-field"><span>phase</span>
              <select value={l.phase} onChange={e => setLimb(l.bone, { phase: +e.target.value as 0 | 1 })}>
                <option value={0}>0</option><option value={1}>1</option>
              </select>
            </label>
            <button className="efx-del" aria-label="Remove limb" onClick={() => st.update(x => ({ ...x, limbs: x.limbs.filter(o => o !== l) }))}>×</button>
          </div>
          <div className="ed-row">
            {num("swing°", l.amplitude ?? 27, n => setLimb(l.bone, { amplitude: n }), 1)}
            {num("flex°", l.flex ?? 0, n => setLimb(l.bone, { flex: n || undefined }), 1)}
            <label className="efx-field" title="+1 bends backward (knee), −1 bends forward (elbow)"><span>flex dir</span>
              <select value={l.flexSign ?? 1} onChange={e => setLimb(l.bone, { flexSign: +e.target.value === -1 ? -1 : 1 })}>
                <option value={1}>knee +1</option><option value={-1}>elbow −1</option>
              </select>
            </label>
          </div>
        </div>
      ))}
      <button onClick={() => {
        const free = d.bones.find(b => !d.limbs.some(l => l.bone === b.name));
        if (free) set({ limbs: [...d.limbs, { bone: free.name, phase: 0 }] });
      }}>+ Add limb</button>

      {d.model && (
        <>
          <h4>Model clips</h4>
          <div className="ed-row">
            {(["idle", "run", "attack"] as const).map(a => (
              <label key={a} className="efx-field"><span>{a}</span>
                <input value={d.model!.clips[a] ?? ""} placeholder="—"
                  onChange={e => set({ model: { ...d.model!, clips: { ...d.model!.clips, [a]: e.target.value || undefined } } })} />
              </label>
            ))}
          </div>
        </>
      )}

      <h4>Ride pose <span className="dim">({rideBones.length})</span></h4>
      <div className="ed-hint">Bone rotations (deg) applied to a rider when this rig is a mount — toggle "ride pose" to preview.</div>
      {rideBones.map(name => (
        <div key={name} className="efx-burst">
          <div className="ed-row">
            <select value={name} onChange={e => {
              const n = { ...ride };
              n[e.target.value] = n[name];
              delete n[name];
              set({ ridePose: n });
            }}>
              {[name, ...d.bones.map(b => b.name).filter(b => b !== name && !ride[b])].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button className="efx-del" aria-label="Remove pose entry" onClick={() => {
              const n = { ...ride };
              delete n[name];
              set({ ridePose: Object.keys(n).length ? n : undefined });
            }}>×</button>
          </div>
          {vec("rotation", ride[name], v => set({ ridePose: { ...ride, [name]: v } }), 5)}
        </div>
      ))}
      <button onClick={() => {
        const free = d.bones.find(b => !ride[b.name]);
        if (free) set({ ridePose: { ...ride, [free.name]: [0, 0, 0] } });
      }}>+ Add pose bone</button>
    </>
  );
}

function PartCard({ st, part }: { st: CharacterMode; part: RigPart }) {
  const set = (patch: Partial<RigPart>) =>
    st.update(x => ({ ...x, parts: x.parts.map(p => (p.id === part.id ? { ...p, ...patch } : p)) }));
  const whenText = Object.entries(part.when ?? {}).map(([k, v]) => `${k}:${v}`).join(" ");
  return (
    <div className="efx-burst">
      <div className="ed-row">
        <input aria-label="Part name" value={part.name} onChange={e => set({ name: e.target.value })} />
        <select aria-label="Geometry" value={part.geometry.type}
          onChange={e => { const t = e.target.value as RigPart["geometry"]["type"]; set({ geometry: { type: t, params: defaultGeometryParams(t) } }); }}>
          {GEOMETRY_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button className="efx-del" aria-label="Remove part" onClick={() => st.update(x => ({ ...x, parts: x.parts.filter(p => p.id !== part.id) }))}>×</button>
      </div>
      <div className="ed-row sc-vec">
        <span className="sc-vec-label">geom</span>
        {part.geometry.params.map((n, i) => (
          <input key={i} type="number" aria-label={`param ${i}`} step={0.05} value={n}
            onChange={e => { const params = [...part.geometry.params]; params[i] = +e.target.value || 0; set({ geometry: { ...part.geometry, params } }); }} />
        ))}
      </div>
      {colorEditor(part.color, c => set({ color: c }))}
      {vec("position", part.position, v => set({ position: v }))}
      {vec("rotation", part.rotation, v => set({ rotation: v }), 5)}
      {vec("scale", part.scale, v => set({ scale: v }))}
      <div className="ed-row">
        <label className="efx-field" title="Appearance conditions, e.g. 'horns:* ears:long' — empty = always shown"><span>when</span>
          <input value={whenText} placeholder="always"
            onChange={e => {
              const when: Record<string, string> = {};
              for (const tok of e.target.value.trim().split(/\s+/).filter(Boolean)) {
                const [k, v = "*"] = tok.split(":");
                when[k] = v;
              }
              set({ when: Object.keys(when).length ? when : undefined });
            }} />
        </label>
        {num("glow", part.emissive ?? 0, n => set({ emissive: n || undefined }), 0.1)}
      </div>
    </div>
  );
}

export function CharactersInspector({ st }: { st: CharacterMode }) {
  if (!st.doc) return <div className="ed-hint">Loading rig…</div>;
  return (
    <>
      <div className="sc-inspector-head">
        <h3>{st.doc.label}</h3>
        <button className="primary" disabled={!st.dirty} onClick={() => void st.save()}>Save</button>
      </div>
      <div className="ed-panel sc-rig-panel">
        {st.tab === "model" && <><RigFields st={st} /><PartsSection st={st} /></>}
        {st.tab === "skeleton" && <SkeletonSection st={st} />}
        {st.tab === "animation" && <AnimationSection st={st} />}
      </div>
      <div className="ed-statusbar sc-rig-status"><span className={st.dirty ? "dirty" : "ed-ready"}>●</span><span role="status">{st.status || (st.dirty ? "Unsaved changes" : "Ready")}</span></div>
    </>
  );
}
