import { useCallback, useState } from "react";
import {
  CATEGORY_VFX_PROFILES,
  VFX_TEXTURES,
} from "../../../../wails/frontend/src/vfx/battleVfxProfiles";
import {
  hexToNum,
  numToHex,
  type EffectsDoc,
  type VfxBurstProfile,
  type VfxCategory,
  type VfxCircleProfile,
  type VfxParticleTexture,
  type VfxProfile,
  type VfxStreamProfile,
} from "../model/effects";
import type { VfxPart } from "../../../../wails/frontend/src/vfx/battleVfxProfiles";
import { TEMPLATE_SECTIONS, type TemplateSection } from "../model/vfxTemplates";

/** Form sections owned by each effect part — a part-scoped form renders and
 * edits only these, so an effect asset is a single stage of the sequence. */
const PART_SECTIONS: Record<VfxPart, TemplateSection[]> = {
  cast: ["cast"],
  projectile: ["projectile"],
  impact: ["burst", "ring", "flash"],
  area: ["circle", "stream"],
};

function newBurst(): VfxBurstProfile {
  return { texture: "spark", count: 12, color: 0xffffff, spread: 30, size: 4, alpha: 0.9, duration: 500 };
}

export function colorRow(label: string, value: number, onChange: (n: number) => void) {
  return (
    <label className="efx-field">
      <span>{label}</span>
      <input type="color" value={numToHex(value)} onChange={e => onChange(hexToNum(e.target.value, value))} />
      <code>{numToHex(value)}</code>
    </label>
  );
}

export function numRow(label: string, value: number | undefined, onChange: (n: number | undefined) => void, step = 1) {
  return (
    <label className="efx-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={e => {
          if (e.target.value === "") return onChange(undefined);
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

export function texSelect(value: VfxParticleTexture, onChange: (t: VfxParticleTexture) => void) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as VfxParticleTexture)}>
      {VFX_TEXTURES.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

/** Field rows shared by the impact stream and the cast motes. */
function streamRows(s: VfxStreamProfile, set: (patch: Partial<VfxStreamProfile>) => void) {
  return (
    <>
      <div className="ed-row">
        {texSelect(s.texture, t => set({ texture: t }))}
        {colorRow("color", s.color, n => set({ color: n }))}
        {colorRow("end", s.colorEnd ?? s.color, n => set({ colorEnd: n }))}
      </div>
      <div className="ed-row">
        {numRow("count", s.count, n => set(n === undefined ? {} : { count: n }))}
        {numRow("width", s.width, n => set(n === undefined ? {} : { width: n }))}
        {numRow("height", s.height, n => set(n === undefined ? {} : { height: n }))}
      </div>
      <div className="ed-row">
        {numRow("size", s.size, n => set(n === undefined ? {} : { size: n }), 0.5)}
        {numRow("alpha", s.alpha, n => set({ alpha: n }), 0.05)}
        {numRow("sway", s.sway, n => set({ sway: n }))}
      </div>
      <div className="ed-row">
        {numRow("emit ms", s.duration, n => set({ duration: n }), 10)}
        {numRow("life ms", s.life, n => set({ life: n }), 10)}
        <label className="efx-check">
          <input type="checkbox" checked={!!s.fall} onChange={e => set({ fall: e.target.checked })} />
          fall
        </label>
      </div>
    </>
  );
}

/** Field rows shared by the impact circle and the cast orbit. */
function circleRows(c: VfxCircleProfile, set: (patch: Partial<VfxCircleProfile>) => void) {
  return (
    <>
      <div className="ed-row">
        {texSelect(c.texture, t => set({ texture: t }))}
        {colorRow("color", c.color, n => set({ color: n }))}
        {numRow("count", c.count, n => set(n === undefined ? {} : { count: n }))}
      </div>
      <div className="ed-row">
        {numRow("radius", c.radius, n => set(n === undefined ? {} : { radius: n }))}
        {numRow("size", c.size, n => set(n === undefined ? {} : { size: n }), 0.5)}
        {numRow("alpha", c.alpha, n => set({ alpha: n }), 0.05)}
      </div>
      <div className="ed-row">
        {numRow("spin°/s", c.spinRate, n => set({ spinRate: n }), 10)}
        {numRow("dur ms", c.duration, n => set({ duration: n }), 10)}
        {numRow("rise", c.rise, n => set({ rise: n }))}
        {numRow("expand", c.expand, n => set({ expand: n }))}
      </div>
      <div className="ed-row">
        <label className="efx-check" title="Emit particles off the ring edge that rise/fall over their life">
          <input
            type="checkbox"
            checked={!!c.emit}
            onChange={e =>
              set(
                e.target.checked
                  ? { emit: { texture: "spark", count: 2, color: c.color, width: 6, height: 28, size: 2, alpha: 0.85, life: 650, sway: 5 } }
                  : { emit: undefined },
              )
            }
          />
          ring emitter
        </label>
      </div>
      {c.emit && <div className="efx-emit">{streamRows(c.emit, patch => set({ emit: { ...c.emit!, ...patch } }))}</div>}
    </>
  );
}

/**
 * The full VfxProfile editor (palette, bursts, ring, flash, circle, stream,
 * projectile, cast channel) — shared by the Effects workspace's 2D preview
 * and the Scene workspace's 3D Effects mode.
 */
export function EffectProfileForm({
  doc,
  cat,
  part,
  onChange,
}: {
  doc: EffectsDoc;
  cat: VfxCategory;
  /** Scope the form to one effect part — the asset edits only its own
   * segment of the category profile. Omit to edit all sections. */
  part?: VfxPart;
  onChange: (d: EffectsDoc) => void;
}) {
  const [templateKey, setTemplateKey] = useState("");
  const profile: VfxProfile | undefined = doc.profiles[cat];
  const sections = part ? PART_SECTIONS[part] : null;
  const show = (s: TemplateSection | "palette") => !sections || (s === "palette" ? part === "impact" : sections.includes(s));
  const templates = sections
    ? Object.fromEntries(Object.entries(TEMPLATE_SECTIONS).filter(([sec]) => sections.includes(sec as TemplateSection)))
    : TEMPLATE_SECTIONS;

  const setProfile = useCallback(
    (fn: (p: VfxProfile) => VfxProfile) => {
      onChange({
        ...doc,
        profiles: {
          ...doc.profiles,
          [cat]: fn(doc.profiles[cat] ?? structuredClone(CATEGORY_VFX_PROFILES[cat])),
        },
      });
    },
    [doc, cat, onChange],
  );

  const setBurst = useCallback(
    (i: number, patch: Partial<VfxBurstProfile>) =>
      setProfile(p => ({ ...p, bursts: p.bursts.map((b, j) => (j === i ? { ...b, ...patch } : b)) })),
    [setProfile],
  );

  /** Stamp a named template into the current profile — bursts append, the
   * single-value sections replace (with a confirm when one is set). */
  const applyTemplate = useCallback(() => {
    const [sec, idx] = templateKey.split(":");
    const list = TEMPLATE_SECTIONS[sec as TemplateSection];
    const t = list?.[Number(idx)];
    if (!t) return;
    setProfile(p => {
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

  /** Toggle one cast sub-part on/off, dropping `cast` when both are gone. */
  const setCast = (fn: (c: NonNullable<VfxProfile["cast"]>) => NonNullable<VfxProfile["cast"]>) =>
    setProfile(p => {
      const cast = fn({ ...(p.cast ?? {}) });
      const n = { ...p };
      if (cast.circle || cast.stream) n.cast = cast;
      else delete n.cast;
      return n;
    });

  if (!profile) return <div className="ed-hint">No profile for {cat}.</div>;

  return (
    <>
      <h4>Templates</h4>
      <div className="ed-row">
        <select value={templateKey} onChange={e => setTemplateKey(e.target.value)}>
          <option value="">— pick a preset —</option>
          {Object.entries(templates).map(([sec, list]) => (
            <optgroup key={sec} label={sec}>
              {list.map((t, i) => (
                <option key={t.name} value={`${sec}:${i}`}>{t.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button disabled={!templateKey} onClick={applyTemplate}>Apply</button>
      </div>
      <div className="ed-hint">Burst presets append; other sections replace.</div>

      {colorRow("Category color", doc.colors[cat] ?? 0xffffff, n => onChange({ ...doc, colors: { ...doc.colors, [cat]: n } }))}

      {show("palette") && <h4>Palette</h4>}
      {show("palette") && <div className="efx-palette">
        {profile.palette.map((c, i) => (
          <span key={i} className="efx-swatch">
            <input
              type="color"
              value={numToHex(c)}
              onChange={e => setProfile(p => ({ ...p, palette: p.palette.map((x, j) => (j === i ? hexToNum(e.target.value, x) : x)) }))}
            />
            <button aria-label="Remove palette color" onClick={() => setProfile(p => ({ ...p, palette: p.palette.filter((_, j) => j !== i) }))}>×</button>
          </span>
        ))}
        <button onClick={() => setProfile(p => ({ ...p, palette: [...p.palette, 0xffffff] }))}>+ color</button>
      </div>}

      {show("burst") && <h4>Bursts <span className="dim">({profile.bursts.length})</span></h4>}
      {show("burst") && profile.bursts.map((b, i) => (
        <div key={i} className="efx-burst">
          <div className="ed-row">
            <select value={b.texture} onChange={e => setBurst(i, { texture: e.target.value as VfxBurstProfile["texture"] })}>
              {VFX_TEXTURES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {colorRow("color", b.color, n => setBurst(i, { color: n }))}
            <button className="efx-del" aria-label="Remove burst" onClick={() => setProfile(p => ({ ...p, bursts: p.bursts.filter((_, j) => j !== i) }))}>×</button>
          </div>
          <div className="ed-row">
            {numRow("count", b.count, n => setBurst(i, n === undefined ? {} : { count: n }))}
            {numRow("spread", b.spread, n => setBurst(i, n === undefined ? {} : { spread: n }))}
            {numRow("size", b.size, n => setBurst(i, n === undefined ? {} : { size: n }))}
          </div>
          <div className="ed-row">
            {numRow("alpha", b.alpha, n => setBurst(i, { alpha: n }), 0.05)}
            {numRow("dur ms", b.duration, n => setBurst(i, { duration: n }), 10)}
            {numRow("gravity", b.gravity, n => setBurst(i, { gravity: n }))}
          </div>
          <div className="ed-row">
            <label className="efx-check"><input type="checkbox" checked={!!b.rise} onChange={e => setBurst(i, { rise: e.target.checked })} />rise</label>
            <label className="efx-check"><input type="checkbox" checked={!!b.directional} onChange={e => setBurst(i, { directional: e.target.checked })} />directional</label>
          </div>
        </div>
      ))}
      {show("burst") && <button onClick={() => setProfile(p => ({ ...p, bursts: [...p.bursts, newBurst()] }))}>+ Add burst</button>}

      {show("ring") && <h4>Ring</h4>}
      {show("ring") && <label className="efx-check">
        <input
          type="checkbox"
          checked={!!profile.ring}
          onChange={e =>
            setProfile(p => {
              const n = { ...p };
              if (e.target.checked) n.ring = { color: 0xffffff, alpha: 0.4, scale: 7, duration: 500 };
              else delete n.ring;
              return n;
            })
          }
        />
        enabled
      </label>}
      {show("ring") && profile.ring && (
        <div className="ed-row">
          {colorRow("color", profile.ring.color, n => setProfile(p => ({ ...p, ring: { ...p.ring!, color: n } })))}
          {numRow("alpha", profile.ring.alpha, n => setProfile(p => ({ ...p, ring: { ...p.ring!, alpha: n ?? 0.4 } })), 0.05)}
          {numRow("scale", profile.ring.scale, n => setProfile(p => ({ ...p, ring: { ...p.ring!, scale: n ?? 7 } })), 0.1)}
          {numRow("dur", profile.ring.duration, n => setProfile(p => ({ ...p, ring: { ...p.ring!, duration: n ?? 500 } })), 10)}
        </div>
      )}

      {show("flash") && <h4>Flash</h4>}
      {show("flash") && <label className="efx-check">
        <input
          type="checkbox"
          checked={!!profile.flash}
          onChange={e =>
            setProfile(p => {
              const n = { ...p };
              if (e.target.checked) n.flash = { color: 0xffffff, alpha: 0.2, scale: 3 };
              else delete n.flash;
              return n;
            })
          }
        />
        enabled
      </label>}
      {show("flash") && profile.flash && (
        <div className="ed-row">
          {colorRow("color", profile.flash.color, n => setProfile(p => ({ ...p, flash: { ...p.flash!, color: n } })))}
          {numRow("alpha", profile.flash.alpha, n => setProfile(p => ({ ...p, flash: { ...p.flash!, alpha: n ?? 0.2 } })), 0.05)}
          {numRow("scale", profile.flash.scale, n => setProfile(p => ({ ...p, flash: { ...p.flash!, scale: n ?? 3 } })), 0.1)}
        </div>
      )}

      {show("circle") && <h4>Spell circle</h4>}
      {show("circle") && <label className="efx-check">
        <input
          type="checkbox"
          checked={!!profile.circle}
          onChange={e =>
            setProfile(p => {
              const n = { ...p };
              if (e.target.checked)
                n.circle = { texture: "rune", count: 8, color: 0xffdf7a, radius: 26, size: 5, alpha: 0.75, spinRate: 160, duration: 900, rise: 14 };
              else delete n.circle;
              return n;
            })
          }
        />
        enabled
      </label>}
      {show("circle") && profile.circle && circleRows(profile.circle, patch => setProfile(p => ({ ...p, circle: { ...p.circle!, ...patch } })))}

      {show("stream") && <h4>Stream</h4>}
      {show("stream") && <label className="efx-check">
        <input
          type="checkbox"
          checked={!!profile.stream}
          onChange={e =>
            setProfile(p => {
              const n = { ...p };
              if (e.target.checked)
                n.stream = { texture: "ember", count: 14, color: 0xff9a2f, colorEnd: 0x5f1820, width: 14, height: 40, size: 5, alpha: 0.9, duration: 900, life: 750, sway: 7 };
              else delete n.stream;
              return n;
            })
          }
        />
        enabled
      </label>}
      {show("stream") && profile.stream && streamRows(profile.stream, patch => setProfile(p => ({ ...p, stream: { ...p.stream!, ...patch } })))}

      {show("projectile") && <h4>Projectile</h4>}
      {show("projectile") && <label className="efx-check">
        <input
          type="checkbox"
          checked={!!profile.projectile}
          onChange={e =>
            setProfile(p => {
              const n = { ...p };
              if (e.target.checked) n.projectile = { texture: "streak", color: 0xffffff, size: 6, duration: 220, arc: 0, trail: 6 };
              else delete n.projectile;
              return n;
            })
          }
        />
        enabled — delays impact to arrival
      </label>}
      {show("projectile") && profile.projectile && (
        <>
          <div className="ed-row">
            {texSelect(profile.projectile.texture, t => setProfile(p => ({ ...p, projectile: { ...p.projectile!, texture: t } })))}
            {colorRow("color", profile.projectile.color, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, color: n } })))}
            {numRow("size", profile.projectile.size, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, ...(n === undefined ? {} : { size: n }) } })), 0.5)}
          </div>
          <div className="ed-row">
            {numRow("dur ms", profile.projectile.duration, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, duration: n } })), 10)}
            {numRow("arc", profile.projectile.arc, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, arc: n } })))}
            {numRow("spin°", profile.projectile.spin, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, spin: n } })), 30)}
          </div>
          <div className="ed-row">
            {numRow("trail", profile.projectile.trail, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, trail: n } })))}
            {colorRow("trail", profile.projectile.trailColor ?? profile.projectile.color, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, trailColor: n } })))}
            {numRow("count", profile.projectile.count, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, count: n } })))}
            {numRow("curve", profile.projectile.curve, n => setProfile(p => ({ ...p, projectile: { ...p.projectile!, curve: n } })))}
          </div>
        </>
      )}

      <h4>Cast channel</h4>
      <div className="ed-hint">Shown at the caster while casting — runs until the cast resolves.</div>
      <label className="efx-check">
        <input
          type="checkbox"
          checked={!!profile.cast?.circle}
          onChange={e =>
            setCast(c => {
              if (e.target.checked) c.circle = { texture: "rune", count: 6, color: 0xffdf7a, radius: 20, size: 4, alpha: 0.7, spinRate: 140 };
              else delete c.circle;
              return c;
            })
          }
        />
        orbit ring
      </label>
      {profile.cast?.circle && circleRows(profile.cast.circle, patch => setCast(c => ({ ...c, circle: { ...c.circle!, ...patch } })))}
      <label className="efx-check">
        <input
          type="checkbox"
          checked={!!profile.cast?.stream}
          onChange={e =>
            setCast(c => {
              if (e.target.checked) c.stream = { texture: "spark", count: 2, color: 0xffffff, width: 10, height: 30, size: 2.5, alpha: 0.8, life: 700, sway: 5 };
              else delete c.stream;
              return c;
            })
          }
        />
        rising motes
      </label>
      {profile.cast?.stream && streamRows(profile.cast.stream, patch => setCast(c => ({ ...c, stream: { ...c.stream!, ...patch } })))}
    </>
  );
}
