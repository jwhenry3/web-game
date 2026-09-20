import Phaser from "phaser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORY_COLORS,
  CATEGORY_VFX_PROFILES,
  VFX_CATEGORIES,
  VFX_TEXTURES,
} from "../../../../wails/frontend/src/phaser/battleVfxProfiles";
import {
  playCategoryVfx,
  startCastVfx,
} from "../../../../wails/frontend/src/phaser/battleVfx";
import {
  fetchEffects,
  hexToNum,
  liveDoc,
  numToHex,
  saveEffects,
  type EffectsDoc,
  type VfxBurstProfile,
  type VfxCategory,
  type VfxCircleProfile,
  type VfxParticleTexture,
  type VfxProfile,
  type VfxStreamProfile,
} from "../model/effects";
import { TEMPLATE_SECTIONS, type TemplateSection } from "../model/vfxTemplates";
import "./effects.css";

const ACTOR_POS = { x: 96, y: 150 };
const TARGET_POS = { x: 224, y: 112 };
const PREVIEW_W = 320;
const PREVIEW_H = 240;
const REPLAY_MS = 1200;
const SPEEDS = [0.5, 1, 1.5, 2, 3];

// Game character outline (CharacterSprite.ts) — applied to the stand-ins in
// Filtered mode so bursts composite against what a real target looks like.
const OUTLINE_COLOR = 0x2c1e36;
const OUTLINE_STRENGTH = 8;
const OUTLINE_DISTANCE = 2;

/** Read by PreviewScene.create on (re)mount; toggles call setFiltered live. */
const previewFlags = { filtered: false };

/** Minimal scene: dark ground + stand-ins for the actor and target. */
class PreviewScene extends Phaser.Scene {
  private filtered = false;
  private stands: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("efx-preview");
  }

  create() {
    this.add.ellipse(PREVIEW_W / 2, 172, 250, 44, 0x000000, 0.4);
    this.setFiltered(previewFlags.filtered);
  }

  setFiltered(filtered: boolean) {
    if (this.filtered === filtered && this.stands.length) return;
    this.filtered = filtered;
    for (const s of this.stands) s.destroy();
    this.stands = [];
    const spots: [{ x: number; y: number }, number][] = [
      [ACTOR_POS, 0x39506e],
      [TARGET_POS, 0x6e3939],
    ];
    for (const [pos, color] of spots) {
      if (!filtered) {
        this.stands.push(
          this.add.circle(pos.x, pos.y, 9, color, 0.95).setDepth(10),
        );
        continue;
      }
      const c = this.add.container(pos.x, pos.y).setDepth(10);
      c.add(this.add.circle(0, 0, 9, color, 0.95));
      c.setSize(18, 18);
      c.enableFilters();
      c.filters?.internal.addGlow(
        OUTLINE_COLOR,
        OUTLINE_STRENGTH,
        0,
        1,
        false,
        8,
        OUTLINE_DISTANCE,
      );
      this.stands.push(c);
    }
  }

  /** Kill in-flight VFX: tweens first (no more updates), then the shapes/
   * graphics they drove — everything above the stand-in depth is transient. */
  clearVfx() {
    this.tweens.killAll();
    this.time.removeAllEvents();
    for (const child of [...this.children.list]) {
      const depth = (child as unknown as { depth?: number }).depth ?? 0;
      if (depth >= 150) child.destroy();
    }
  }
}

/** Clone the compiled defaults so the workspace is usable without the API. */
const defaultsDoc = liveDoc;

function newBurst(): VfxBurstProfile {
  return { texture: "spark", count: 12, color: 0xffffff, spread: 30, size: 4, alpha: 0.9, duration: 500 };
}

export default function EffectsWorkspace() {
  const [doc, setDoc] = useState<EffectsDoc | null>(null);
  const [cat, setCat] = useState<VfxCategory>("fire");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<"scene" | "filtered">("scene");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [castMs, setCastMs] = useState(1200);
  const [templateKey, setTemplateKey] = useState("");

  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const docRef = useRef<EffectsDoc | null>(null);
  const catRef = useRef<VfxCategory>(cat);
  const speedRef = useRef(speed);
  const castMsRef = useRef(castMs);
  docRef.current = doc;
  catRef.current = cat;
  speedRef.current = speed;
  castMsRef.current = castMs;

  /** Live cast-channel handle + the timer that ends it and fires the
   * projectile/impact — one pending sequence at a time. */
  const castHandle = useRef<{ stop(): void } | null>(null);
  const castTimer = useRef(0);

  const scene = useCallback(
    () =>
      gameRef.current?.scene.getScenes(true)[0] as PreviewScene | undefined,
    [],
  );

  const load = useCallback(async () => {
    try {
      const d = await fetchEffects();
      setDoc(d);
      setDirty(false);
      setErr(null);
      setStatus("Loaded assets/vfx/profiles.json");
    } catch (e) {
      // Dev server without the middleware/file — edit the compiled defaults.
      setDoc(defaultsDoc());
      setDirty(false);
      setErr(`${e} — showing compiled defaults (Save will create profiles.json)`);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mount the Phaser preview once the canvas host exists — it only renders
  // after `doc` loads, so a callback ref + state drives the mount. Destroy
  // cleans the canvas on unmount/StrictMode remount.
  useEffect(() => {
    if (!hostEl) return;
    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: hostEl,
      width: PREVIEW_W,
      height: PREVIEW_H,
      backgroundColor: "#0a0f1e",
      banner: false,
      audio: { noAudio: true },
      scene: PreviewScene,
    });
    gameRef.current = game;
    return () => {
      gameRef.current = null;
      game.destroy(true);
    };
  }, [hostEl]);

  /** Push the working copy into the live profile record, then run the real
   * game VFX — playCategoryVfx reads CATEGORY_VFX_PROFILES at call time. */
  const applyDoc = useCallback((d: EffectsDoc, c: VfxCategory) => {
    const profile = d.profiles[c];
    if (profile) CATEGORY_VFX_PROFILES[c] = profile;
    const color = d.colors[c];
    if (typeof color === "number") CATEGORY_COLORS[c] = color;
  }, []);

  /** Full cast sequence — channel at the actor for `castMs`, then the
   * projectile and target effect fire, matching the game's
   * cast_started → resolve ordering. Cast 0 skips the channel. */
  const replay = useCallback(() => {
    const s = scene();
    const d = docRef.current;
    const c = catRef.current;
    if (!s || !d) return;
    applyDoc(d, c);
    const fire = () =>
      playCategoryVfx(s, c, ACTOR_POS, TARGET_POS, true, speedRef.current);
    castHandle.current?.stop();
    castHandle.current = null;
    window.clearTimeout(castTimer.current);
    const ms = castMsRef.current / speedRef.current;
    if (ms <= 0) {
      fire();
      return;
    }
    const h = startCastVfx(s, () => ACTOR_POS, c, speedRef.current);
    castHandle.current = h;
    castTimer.current = window.setTimeout(() => {
      if (castHandle.current === h) {
        h.stop();
        castHandle.current = null;
      }
      fire();
    }, ms);
  }, [scene, applyDoc]);

  // The player owns playback: while "playing", run the full sequence then
  // loop — each cycle is cast channel + gap before the next cast.
  useEffect(() => {
    if (!playing) return;
    let live = true;
    let timer = 0;
    const run = () => {
      if (!live) return;
      replay();
      timer = window.setTimeout(
        run,
        castMsRef.current / speedRef.current + REPLAY_MS,
      );
    };
    run();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [playing, replay]);

  /** Stop the loop, the cast channel, and clear in-flight particles/tweens. */
  const stop = useCallback(() => {
    setPlaying(false);
    window.clearTimeout(castTimer.current);
    castHandle.current?.stop();
    castHandle.current = null;
    scene()?.clearVfx();
  }, [scene]);

  /** Channel-only preview — the cast effect alone for `castMs`, without the
   * projectile/impact that follows it in the full sequence. */
  const previewCast = useCallback(() => {
    const s = scene();
    const d = docRef.current;
    const c = catRef.current;
    if (!s || !d) return;
    applyDoc(d, c);
    castHandle.current?.stop();
    castHandle.current = null;
    window.clearTimeout(castTimer.current);
    const h = startCastVfx(s, () => ACTOR_POS, c, speedRef.current);
    castHandle.current = h;
    castTimer.current = window.setTimeout(() => {
      if (castHandle.current === h) {
        h.stop();
        castHandle.current = null;
      }
    }, castMsRef.current / speedRef.current);
  }, [scene, applyDoc]);

  // Mirror the character editor's Filtered tab: stand-ins wear the game's
  // character glow so bursts composite the way they do over real targets.
  useEffect(() => {
    const filtered = viewTab === "filtered";
    previewFlags.filtered = filtered;
    scene()?.setFiltered(filtered);
  }, [viewTab, scene]);

  const profile: VfxProfile | undefined = doc?.profiles[cat];

  const setProfile = useCallback(
    (fn: (p: VfxProfile) => VfxProfile) => {
      setDoc((d) =>
        d
          ? {
              ...d,
              profiles: {
                ...d.profiles,
                [cat]: fn(d.profiles[cat] ?? structuredClone(CATEGORY_VFX_PROFILES[cat])),
              },
            }
          : d,
      );
      setDirty(true);
    },
    [cat],
  );

  const setBurst = useCallback(
    (i: number, patch: Partial<VfxBurstProfile>) =>
      setProfile((p) => ({
        ...p,
        bursts: p.bursts.map((b, j) => (j === i ? { ...b, ...patch } : b)),
      })),
    [setProfile],
  );

  const doSave = useCallback(async () => {
    if (!doc) return;
    setStatus("Saving…");
    try {
      await saveEffects(doc);
      setDirty(false);
      setErr(null);
      setStatus("Saved assets/vfx/profiles.json");
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }, [doc]);

  const doReset = useCallback(async () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    await load();
  }, [dirty, load]);

  /** Stamp a named template into the current profile — bursts append, the
   * single-value sections replace (with a confirm when one is set). */
  const applyTemplate = useCallback(() => {
    const [sec, idx] = templateKey.split(":");
    const list = TEMPLATE_SECTIONS[sec as TemplateSection];
    const t = list?.[Number(idx)];
    if (!t) return;
    setProfile((p) => {
      const n = { ...p };
      if (sec === "burst") {
        n.bursts = [...p.bursts, structuredClone(t.data) as VfxBurstProfile];
      } else {
        const has = (p as unknown as Record<string, unknown>)[sec] !== undefined;
        if (has && !window.confirm(`Replace the ${sec} section with "${t.name}"?`)) return p;
        (n as unknown as Record<string, unknown>)[sec] = structuredClone(t.data);
      }
      return n;
    });
  }, [templateKey, setProfile]);

  if (!doc || !profile) {
    return <div className="ed-err">Loading effects…</div>;
  }

  const colorRow = (
    label: string,
    value: number,
    onChange: (n: number) => void,
  ) => (
    <label className="efx-field">
      <span>{label}</span>
      <input
        type="color"
        value={numToHex(value)}
        onChange={(e) => onChange(hexToNum(e.target.value, value))}
      />
      <code>{numToHex(value)}</code>
    </label>
  );

  const numRow = (
    label: string,
    value: number | undefined,
    onChange: (n: number | undefined) => void,
    step = 1,
  ) => (
    <label className="efx-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value === "") return onChange(undefined);
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );

  const texSelect = (
    value: VfxParticleTexture,
    onChange: (t: VfxParticleTexture) => void,
  ) => (
    <select value={value} onChange={(e) => onChange(e.target.value as VfxParticleTexture)}>
      {VFX_TEXTURES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );

  /** Field rows shared by the impact circle and the cast orbit. */
  const circleRows = (
    c: VfxCircleProfile,
    set: (patch: Partial<VfxCircleProfile>) => void,
  ) => (
    <>
      <div className="ed-row">
        {texSelect(c.texture, (t) => set({ texture: t }))}
        {colorRow("color", c.color, (n) => set({ color: n }))}
        {numRow("count", c.count, (n) => set(n === undefined ? {} : { count: n }))}
      </div>
      <div className="ed-row">
        {numRow("radius", c.radius, (n) => set(n === undefined ? {} : { radius: n }))}
        {numRow("size", c.size, (n) => set(n === undefined ? {} : { size: n }), 0.5)}
        {numRow("alpha", c.alpha, (n) => set({ alpha: n }), 0.05)}
      </div>
      <div className="ed-row">
        {numRow("spin°/s", c.spinRate, (n) => set({ spinRate: n }), 10)}
        {numRow("dur ms", c.duration, (n) => set({ duration: n }), 10)}
        {numRow("rise", c.rise, (n) => set({ rise: n }))}
        {numRow("expand", c.expand, (n) => set({ expand: n }))}
      </div>
      <div className="ed-row">
        <label
          className="efx-check"
          title="Emit particles off the ring edge that rise/fall over their life"
        >
          <input
            type="checkbox"
            checked={!!c.emit}
            onChange={(e) =>
              set(
                e.target.checked
                  ? {
                      emit: {
                        texture: "spark",
                        count: 2,
                        color: c.color,
                        width: 6,
                        height: 28,
                        size: 2,
                        alpha: 0.85,
                        life: 650,
                        sway: 5,
                      },
                    }
                  : { emit: undefined },
              )
            }
          />
          ring emitter
        </label>
      </div>
      {c.emit && (
        <div className="efx-emit">
          {streamRows(c.emit, (patch) => set({ emit: { ...c.emit!, ...patch } }))}
        </div>
      )}
    </>
  );

  /** Field rows shared by the impact stream and the cast motes. */
  const streamRows = (
    s: VfxStreamProfile,
    set: (patch: Partial<VfxStreamProfile>) => void,
  ) => (
    <>
      <div className="ed-row">
        {texSelect(s.texture, (t) => set({ texture: t }))}
        {colorRow("color", s.color, (n) => set({ color: n }))}
        {colorRow("end", s.colorEnd ?? s.color, (n) => set({ colorEnd: n }))}
      </div>
      <div className="ed-row">
        {numRow("count", s.count, (n) => set(n === undefined ? {} : { count: n }))}
        {numRow("width", s.width, (n) => set(n === undefined ? {} : { width: n }))}
        {numRow("height", s.height, (n) => set(n === undefined ? {} : { height: n }))}
      </div>
      <div className="ed-row">
        {numRow("size", s.size, (n) => set(n === undefined ? {} : { size: n }), 0.5)}
        {numRow("alpha", s.alpha, (n) => set({ alpha: n }), 0.05)}
        {numRow("sway", s.sway, (n) => set({ sway: n }))}
      </div>
      <div className="ed-row">
        {numRow("emit ms", s.duration, (n) => set({ duration: n }), 10)}
        {numRow("life ms", s.life, (n) => set({ life: n }), 10)}
        <label className="efx-check">
          <input
            type="checkbox"
            checked={!!s.fall}
            onChange={(e) => set({ fall: e.target.checked })}
          />
          fall
        </label>
      </div>
    </>
  );

  /** Toggle one cast sub-part on/off, dropping `cast` when both are gone. */
  const setCast = (fn: (c: NonNullable<VfxProfile["cast"]>) => NonNullable<VfxProfile["cast"]>) =>
    setProfile((p) => {
      const cast = fn({ ...(p.cast ?? {}) });
      const n = { ...p };
      if (cast.circle || cast.stream) n.cast = cast;
      else delete n.cast;
      return n;
    });

  return (
    <div className="efx-root">
      <div className="ed-toolbar">
        <span className="ed-toolbar-label">Effects</span>
        <span className="efx-cat">{cat}{dirty ? " *" : ""}</span>
        <span className="spacer" />
        <button onClick={replay}>▶ Replay</button>
        <button onClick={() => void doReset()}>Reset</button>
        <button className="primary" disabled={!dirty} onClick={() => void doSave()}>
          Save
        </button>
      </div>
      {err && <div className="efx-banner">{err}</div>}
      <div className="efx-body">
        <aside className="efx-cats">
          <div className="ed-dock-title">Categories <span>{VFX_CATEGORIES.length}</span></div>
          <div className="ed-list">
            {VFX_CATEGORIES.map((c) => (
              <button
                key={c}
                className={`item ${c === cat ? "sel" : ""}`}
                onClick={() => setCat(c)}
              >
                <span
                  className="efx-dot"
                  style={{ background: numToHex(doc.colors[c] ?? 0) }}
                />
                {c}
              </button>
            ))}
          </div>
        </aside>
        <section className="efx-stage">
          <div className="ed-dock-title">
            <div className="ed-view-tabs" role="tablist" aria-label="Effects view">
              {(["scene", "filtered"] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={viewTab === tab}
                  className={viewTab === tab ? "active" : ""}
                  onClick={() => setViewTab(tab)}
                >
                  {tab === "scene" ? "Scene" : "Filtered"}
                </button>
              ))}
            </div>
            <span>{viewTab === "filtered" ? "game glow" : "plain"}</span>
          </div>
          <div className="ed-scene-toolbar">
            <span>VFX preview · actor→target</span>
            <span className="spacer" />
            <label className="efx-field">
              <span>speed</span>
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
            <label className="efx-field" title="Cast time (ms) — the channel plays this long before the projectile and target effect; 0 skips it">
              <span>cast</span>
              <input
                type="number"
                min={0}
                step={100}
                value={castMs}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value !== "" && Number.isFinite(n)) {
                    setCastMs(Math.max(0, n));
                  } else if (e.target.value === "") {
                    setCastMs(0);
                  }
                }}
              />
            </label>
            <button
              aria-label="Preview cast channel"
              title="Channel only — the cast effect at the actor for the cast duration"
              onClick={previewCast}
            >
              ✦
            </button>
            <button
              aria-label={playing ? "Pause" : "Play"}
              aria-pressed={playing}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <button aria-label="Stop" onClick={stop}>
              ■
            </button>
          </div>
          <div className="efx-stage-center">
            <div className="efx-canvas" ref={setHostEl} />
            <div className="efx-stage-hint">
              Real battleVfx code ·{" "}
              {castMs > 0
                ? `cast ${castMs}ms → projectile → impact`
                : "projectile → impact"}
              {playing ? " · looping" : ""}
            </div>
          </div>
        </section>
        <aside className="efx-inspector ed-panel">
          <h3>{cat}</h3>

          <h4>Templates</h4>
          <div className="ed-row">
            <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
              <option value="">— pick a preset —</option>
              {Object.entries(TEMPLATE_SECTIONS).map(([sec, list]) => (
                <optgroup key={sec} label={sec}>
                  {list.map((t, i) => (
                    <option key={t.name} value={`${sec}:${i}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button disabled={!templateKey} onClick={applyTemplate}>
              Apply
            </button>
          </div>
          <div className="ed-hint">Burst presets append; other sections replace.</div>

          {colorRow("Category color", doc.colors[cat] ?? 0xffffff, (n) => {
            setDoc((d) => (d ? { ...d, colors: { ...d.colors, [cat]: n } } : d));
            setDirty(true);
          })}

          <h4>Palette</h4>
          <div className="efx-palette">
            {profile.palette.map((c, i) => (
              <span key={i} className="efx-swatch">
                <input
                  type="color"
                  value={numToHex(c)}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      palette: p.palette.map((x, j) => (j === i ? hexToNum(e.target.value, x) : x)),
                    }))
                  }
                />
                <button
                  aria-label="Remove palette color"
                  onClick={() =>
                    setProfile((p) => ({ ...p, palette: p.palette.filter((_, j) => j !== i) }))
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <button onClick={() => setProfile((p) => ({ ...p, palette: [...p.palette, 0xffffff] }))}>
              + color
            </button>
          </div>

          <h4>Bursts <span className="dim">({profile.bursts.length})</span></h4>
          {profile.bursts.map((b, i) => (
            <div key={i} className="efx-burst">
              <div className="ed-row">
                <select
                  value={b.texture}
                  onChange={(e) =>
                    setBurst(i, { texture: e.target.value as VfxBurstProfile["texture"] })
                  }
                >
                  {VFX_TEXTURES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {colorRow("color", b.color, (n) => setBurst(i, { color: n }))}
                <button
                  className="efx-del"
                  aria-label="Remove burst"
                  onClick={() =>
                    setProfile((p) => ({ ...p, bursts: p.bursts.filter((_, j) => j !== i) }))
                  }
                >
                  ×
                </button>
              </div>
              <div className="ed-row">
                {numRow("count", b.count, (n) => setBurst(i, n === undefined ? {} : { count: n }))}
                {numRow("spread", b.spread, (n) => setBurst(i, n === undefined ? {} : { spread: n }))}
                {numRow("size", b.size, (n) => setBurst(i, n === undefined ? {} : { size: n }))}
              </div>
              <div className="ed-row">
                {numRow("alpha", b.alpha, (n) => setBurst(i, { alpha: n }), 0.05)}
                {numRow("dur ms", b.duration, (n) => setBurst(i, { duration: n }), 10)}
                {numRow("gravity", b.gravity, (n) => setBurst(i, { gravity: n }))}
              </div>
              <div className="ed-row">
                <label className="efx-check">
                  <input
                    type="checkbox"
                    checked={!!b.rise}
                    onChange={(e) => setBurst(i, { rise: e.target.checked })}
                  />
                  rise
                </label>
                <label className="efx-check">
                  <input
                    type="checkbox"
                    checked={!!b.directional}
                    onChange={(e) => setBurst(i, { directional: e.target.checked })}
                  />
                  directional
                </label>
              </div>
            </div>
          ))}
          <button onClick={() => setProfile((p) => ({ ...p, bursts: [...p.bursts, newBurst()] }))}>
            + Add burst
          </button>

          <h4>Ring</h4>
          <label className="efx-check">
            <input
              type="checkbox"
              checked={!!profile.ring}
              onChange={(e) =>
                setProfile((p) => {
                  const n = { ...p };
                  if (e.target.checked)
                    n.ring = { color: 0xffffff, alpha: 0.4, scale: 7, duration: 500 };
                  else delete n.ring;
                  return n;
                })
              }
            />
            enabled
          </label>
          {profile.ring && (
            <div className="ed-row">
              {colorRow("color", profile.ring.color, (n) =>
                setProfile((p) => ({ ...p, ring: { ...p.ring!, color: n } })),
              )}
              {numRow("alpha", profile.ring.alpha, (n) =>
                setProfile((p) => ({ ...p, ring: { ...p.ring!, alpha: n ?? 0.4 } })),
                0.05,
              )}
              {numRow("scale", profile.ring.scale, (n) =>
                setProfile((p) => ({ ...p, ring: { ...p.ring!, scale: n ?? 7 } })),
                0.1,
              )}
              {numRow("dur", profile.ring.duration, (n) =>
                setProfile((p) => ({ ...p, ring: { ...p.ring!, duration: n ?? 500 } })),
                10,
              )}
            </div>
          )}

          <h4>Flash</h4>
          <label className="efx-check">
            <input
              type="checkbox"
              checked={!!profile.flash}
              onChange={(e) =>
                setProfile((p) => {
                  const n = { ...p };
                  if (e.target.checked) n.flash = { color: 0xffffff, alpha: 0.2, scale: 3 };
                  else delete n.flash;
                  return n;
                })
              }
            />
            enabled
          </label>
          {profile.flash && (
            <div className="ed-row">
              {colorRow("color", profile.flash.color, (n) =>
                setProfile((p) => ({ ...p, flash: { ...p.flash!, color: n } })),
              )}
              {numRow("alpha", profile.flash.alpha, (n) =>
                setProfile((p) => ({ ...p, flash: { ...p.flash!, alpha: n ?? 0.2 } })),
                0.05,
              )}
              {numRow("scale", profile.flash.scale, (n) =>
                setProfile((p) => ({ ...p, flash: { ...p.flash!, scale: n ?? 3 } })),
                0.1,
              )}
            </div>
          )}

          <h4>Spell circle</h4>
          <label className="efx-check">
            <input
              type="checkbox"
              checked={!!profile.circle}
              onChange={(e) =>
                setProfile((p) => {
                  const n = { ...p };
                  if (e.target.checked)
                    n.circle = {
                      texture: "rune",
                      count: 8,
                      color: 0xffdf7a,
                      radius: 26,
                      size: 5,
                      alpha: 0.75,
                      spinRate: 160,
                      duration: 900,
                      rise: 14,
                    };
                  else delete n.circle;
                  return n;
                })
              }
            />
            enabled
          </label>
          {profile.circle &&
            circleRows(profile.circle, (patch) =>
              setProfile((p) => ({ ...p, circle: { ...p.circle!, ...patch } })),
            )}

          <h4>Stream</h4>
          <label className="efx-check">
            <input
              type="checkbox"
              checked={!!profile.stream}
              onChange={(e) =>
                setProfile((p) => {
                  const n = { ...p };
                  if (e.target.checked)
                    n.stream = {
                      texture: "ember",
                      count: 14,
                      color: 0xff9a2f,
                      colorEnd: 0x5f1820,
                      width: 14,
                      height: 40,
                      size: 5,
                      alpha: 0.9,
                      duration: 900,
                      life: 750,
                      sway: 7,
                    };
                  else delete n.stream;
                  return n;
                })
              }
            />
            enabled
          </label>
          {profile.stream &&
            streamRows(profile.stream, (patch) =>
              setProfile((p) => ({ ...p, stream: { ...p.stream!, ...patch } })),
            )}

          <h4>Projectile</h4>
          <label className="efx-check">
            <input
              type="checkbox"
              checked={!!profile.projectile}
              onChange={(e) =>
                setProfile((p) => {
                  const n = { ...p };
                  if (e.target.checked)
                    n.projectile = {
                      texture: "streak",
                      color: 0xffffff,
                      size: 6,
                      duration: 220,
                      arc: 0,
                      trail: 6,
                    };
                  else delete n.projectile;
                  return n;
                })
              }
            />
            enabled — delays impact to arrival
          </label>
          {profile.projectile && (
            <>
              <div className="ed-row">
                {texSelect(profile.projectile.texture, (t) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, texture: t } })),
                )}
                {colorRow("color", profile.projectile.color, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, color: n } })),
                )}
                {numRow("size", profile.projectile.size, (n) =>
                  setProfile((p) => ({
                    ...p,
                    projectile: { ...p.projectile!, ...(n === undefined ? {} : { size: n }) },
                  })),
                  0.5,
                )}
              </div>
              <div className="ed-row">
                {numRow("dur ms", profile.projectile.duration, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, duration: n } })),
                  10,
                )}
                {numRow("arc", profile.projectile.arc, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, arc: n } })),
                )}
                {numRow("spin°", profile.projectile.spin, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, spin: n } })),
                  30,
                )}
              </div>
              <div className="ed-row">
                {numRow("trail", profile.projectile.trail, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, trail: n } })),
                )}
                {colorRow("trail", profile.projectile.trailColor ?? profile.projectile.color, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, trailColor: n } })),
                )}
                {numRow("count", profile.projectile.count, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, count: n } })),
                )}
                {numRow("curve", profile.projectile.curve, (n) =>
                  setProfile((p) => ({ ...p, projectile: { ...p.projectile!, curve: n } })),
                )}
              </div>
            </>
          )}

          <h4>Cast channel</h4>
          <div className="ed-hint">
            Shown at the caster while casting — runs until the cast resolves.
          </div>
          <label className="efx-check">
            <input
              type="checkbox"
              checked={!!profile.cast?.circle}
              onChange={(e) =>
                setCast((c) => {
                  if (e.target.checked)
                    c.circle = {
                      texture: "rune",
                      count: 6,
                      color: 0xffdf7a,
                      radius: 20,
                      size: 4,
                      alpha: 0.7,
                      spinRate: 140,
                    };
                  else delete c.circle;
                  return c;
                })
              }
            />
            orbit ring
          </label>
          {profile.cast?.circle &&
            circleRows(profile.cast.circle, (patch) =>
              setCast((c) => ({ ...c, circle: { ...c.circle!, ...patch } })),
            )}
          <label className="efx-check">
            <input
              type="checkbox"
              checked={!!profile.cast?.stream}
              onChange={(e) =>
                setCast((c) => {
                  if (e.target.checked)
                    c.stream = {
                      texture: "spark",
                      count: 2,
                      color: 0xffffff,
                      width: 10,
                      height: 30,
                      size: 2.5,
                      alpha: 0.8,
                      life: 700,
                      sway: 5,
                    };
                  else delete c.stream;
                  return c;
                })
              }
            />
            rising motes
          </label>
          {profile.cast?.stream &&
            streamRows(profile.cast.stream, (patch) =>
              setCast((c) => ({ ...c, stream: { ...c.stream!, ...patch } })),
            )}
        </aside>
      </div>
      <footer className="ed-statusbar">
        <span className={dirty ? "dirty" : "ed-ready"}>●</span>
        <span role="status">{status || (dirty ? "Unsaved changes" : "Ready")}</span>
        <span className="spacer" />
        <span>assets/vfx/profiles.json</span>
      </footer>
    </div>
  );
}
