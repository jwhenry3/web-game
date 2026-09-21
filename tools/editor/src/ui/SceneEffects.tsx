import * as THREE from "three";
import { useCallback, useEffect, useRef, useState } from "react";
import { VFX_CATEGORIES } from "../../../../wails/frontend/src/phaser/battleVfxProfiles";
import { DEFAULT_RIGS } from "../../../../wails/frontend/src/three/rig3dDefaults";
import { buildRig, type RigInstance } from "../../../../wails/frontend/src/three/rigBuilder";
import { WorldVfx } from "../../../../wails/frontend/src/three/vfx3d";
import { fetchEffects, numToHex, saveEffects, type EffectsDoc, type VfxCategory } from "../model/effects";
import { disposeObject } from "../../../../wails/frontend/src/three/terrain";
import type { SceneView } from "../scene3d/SceneView";
import { EffectProfileForm } from "./EffectProfileForm";

const ACTOR_X = -1.7;
const TARGET_X = 1.7;
const SPEEDS = [0.5, 1, 1.5, 2, 3];
const REPLAY_MS = 1200;

/** Shared state for the Scene workspace's Effects mode: the same EffectsDoc
 * the 2D workspace edits, previewed through the Three.js WorldVfx player. */
export function useEffectsMode(view: SceneView | null, active: boolean) {
  const [doc, setDoc] = useState<EffectsDoc | null>(null);
  const [cat, setCat] = useState<VfxCategory>("fire");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [castMs, setCastMs] = useState(1200);

  const vfxRef = useRef<WorldVfx | null>(null);
  const rigsRef = useRef<RigInstance[]>([]);
  const casterRef = useRef<THREE.Object3D | null>(null);
  const castStop = useRef<(() => void) | null>(null);
  const castTimer = useRef(0);
  const docRef = useRef<EffectsDoc | null>(null);
  const catRef = useRef<VfxCategory>(cat);
  const speedRef = useRef(speed);
  const castMsRef = useRef(castMs);
  docRef.current = doc;
  catRef.current = cat;
  speedRef.current = speed;
  castMsRef.current = castMs;

  const load = useCallback(async () => {
    try {
      setDoc(await fetchEffects());
      setDirty(false);
      setStatus("Loaded assets/vfx/profiles.json");
    } catch (e) {
      setDoc(null);
      setStatus(`Effects unavailable: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Stage: a ground disc and two rig stand-ins; the WorldVfx group plays the
  // profile in the same coordinate space (Three.js world units, y-up).
  useEffect(() => {
    if (!view || !active) return;
    const stage = view.stage;
    while (stage.children.length) { const c = stage.children[0]; stage.remove(c); disposeObject(c); }

    // Anchor the preview where the camera is already looking, and re-anchor
    // whenever a (re)loaded map reframes the camera.
    const anchor = () => {
      const p = view.getPivot();
      stage.position.set(p.x, view.groundHeight(p.x, p.z), p.z);
    };
    anchor();
    const root = new THREE.Group();
    stage.add(root);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x22303e, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.02;
    root.add(ground);

    const humanoid = DEFAULT_RIGS.humanoid;
    const rigs: RigInstance[] = [];
    if (humanoid) {
      const actor = buildRig(humanoid, { appearance: { clothColor: "c4" } });
      actor.root.position.set(ACTOR_X, 0, 0);
      actor.root.rotation.y = Math.PI / 2; // face +x toward the target
      const target = buildRig(humanoid, { appearance: { clothColor: "c8" } });
      target.root.position.set(TARGET_X, 0, 0);
      target.root.rotation.y = -Math.PI / 2;
      root.add(actor.root, target.root);
      rigs.push(actor, target);
    }
    rigsRef.current = rigs;
    casterRef.current = rigs[0]?.root ?? root;

    const vfx = new WorldVfx();
    root.add(vfx.group);
    vfxRef.current = vfx;

    let time = 0;
    view.onFrame = dt => {
      time += dt;
      vfx.update(dt * speedRef.current);
      for (const r of rigs) r.update(dt, time, false, true);
    };
    const frame = () => view.frameObject(root, 5.5);
    frame();
    view.onMapLoaded = () => { anchor(); frame(); };

    return () => {
      view.onFrame = () => {};
      view.onMapLoaded = () => {};
      view.setGizmoOverride(null);
      castStop.current?.();
      castStop.current = null;
      window.clearTimeout(castTimer.current);
      vfxRef.current = null;
      rigsRef.current = [];
      casterRef.current = null;
      vfx.dispose();
      for (const r of rigs) r.dispose();
      stage.remove(root);
      stage.position.set(0, 0, 0);
      disposeObject(root);
    };
  }, [view, active]);

  /** Fire the full sequence: cast channel for castMs → projectile → impact. */
  const replay = useCallback(() => {
    const vfx = vfxRef.current;
    const d = docRef.current;
    const c = catRef.current;
    const caster = casterRef.current;
    if (!vfx || !d || !caster) return;
    const profile = d.profiles[c];
    if (!profile) return;
    const target = new THREE.Vector3(TARGET_X, 0, 0);
    const from = new THREE.Vector3(ACTOR_X, 0.9, 0);
    const fire = () => vfx.playProfile(profile, target, from);
    castStop.current?.();
    castStop.current = null;
    window.clearTimeout(castTimer.current);
    const ms = castMsRef.current / speedRef.current;
    if (ms <= 0 || !profile.cast) { fire(); return; }
    const stop = vfx.startCast(profile.cast, caster);
    castStop.current = stop;
    castTimer.current = window.setTimeout(() => {
      if (castStop.current === stop) { stop(); castStop.current = null; }
      fire();
    }, ms);
  }, []);

  useEffect(() => {
    if (!playing || !active) return;
    let live = true;
    let timer = 0;
    const run = () => {
      if (!live) return;
      replay();
      timer = window.setTimeout(run, castMsRef.current / speedRef.current + REPLAY_MS);
    };
    run();
    return () => { live = false; window.clearTimeout(timer); };
  }, [playing, active, replay]);

  const stop = useCallback(() => {
    setPlaying(false);
    window.clearTimeout(castTimer.current);
    castStop.current?.();
    castStop.current = null;
  }, []);

  const previewCast = useCallback(() => {
    const vfx = vfxRef.current;
    const d = docRef.current;
    const caster = casterRef.current;
    const profile = d?.profiles[catRef.current];
    if (!vfx || !caster || !profile?.cast) return;
    castStop.current?.();
    castStop.current = null;
    window.clearTimeout(castTimer.current);
    const s = vfx.startCast(profile.cast, caster);
    castStop.current = s;
    castTimer.current = window.setTimeout(() => {
      if (castStop.current === s) { s(); castStop.current = null; }
    }, castMsRef.current / speedRef.current);
  }, []);

  const onDocChange = useCallback((d: EffectsDoc) => { setDoc(d); setDirty(true); }, []);

  const save = useCallback(async () => {
    if (!doc) return;
    setStatus("Saving…");
    try {
      await saveEffects(doc);
      setDirty(false);
      setStatus("Saved assets/vfx/profiles.json");
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [doc]);

  return {
    doc, cat, dirty, status, playing, speed, castMs,
    setCat, setPlaying, setSpeed, setCastMs,
    replay, stop, previewCast, onDocChange, save, load,
  };
}

export type EffectsMode = ReturnType<typeof useEffectsMode>;

// --- left column ---------------------------------------------------------------

export function EffectsLibrary({ st }: { st: EffectsMode }) {
  return (
    <>
      <div className="ed-dock-title">Categories <span>{VFX_CATEGORIES.length}</span></div>
      <div className="ed-list">
        {VFX_CATEGORIES.map(c => (
          <button key={c} className={`item ${c === st.cat ? "sel" : ""}`} onClick={() => st.setCat(c)}>
            <span className="efx-dot" style={{ background: numToHex(st.doc?.colors[c] ?? 0) }} />
            {c}
          </button>
        ))}
      </div>
      <div className="ed-dock-title">Playback</div>
      <div className="sc-preview-controls">
        <label className="efx-field"><span>speed</span>
          <select value={st.speed} onChange={e => st.setSpeed(Number(e.target.value))}>
            {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <label className="efx-field" title="Cast time (ms) — channel plays this long before projectile + impact; 0 skips it">
          <span>cast</span>
          <input type="number" min={0} step={100} value={st.castMs}
            onChange={e => { const n = Number(e.target.value); st.setCastMs(Number.isFinite(n) ? Math.max(0, n) : 0); }} />
        </label>
        <div className="ed-row">
          <button title="Channel only" onClick={st.previewCast}>✦</button>
          <button aria-pressed={st.playing} onClick={() => st.setPlaying(!st.playing)}>{st.playing ? "Ⅱ" : "▶"}</button>
          <button onClick={st.stop}>■</button>
          <button onClick={st.replay}>Replay</button>
        </div>
      </div>
    </>
  );
}

// --- right column ---------------------------------------------------------------

export function EffectsInspectorPanel({ st }: { st: EffectsMode }) {
  if (!st.doc) return <div className="ed-hint">Loading effects…</div>;
  return (
    <>
      <div className="sc-inspector-head">
        <h3>{st.cat} <span className="dim">(3D)</span></h3>
        <button className="primary" disabled={!st.dirty} onClick={() => void st.save()}>Save</button>
      </div>
      <div className="ed-panel sc-rig-panel">
        <EffectProfileForm doc={st.doc} cat={st.cat} onChange={st.onDocChange} />
      </div>
      <div className="ed-statusbar sc-rig-status"><span className={st.dirty ? "dirty" : "ed-ready"}>●</span><span role="status">{st.status || (st.dirty ? "Unsaved changes" : "Ready")}</span></div>
    </>
  );
}
