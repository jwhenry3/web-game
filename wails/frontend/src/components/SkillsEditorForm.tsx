import {
  JOB_CATEGORIES,
  WEAPON_TYPES,
  type SkillDef,
  type SkillEffectDef,
  type SkillTarget,
} from "../editor/gameContentTypes";
import { CheckboxField, FieldLabel, NumberField, SelectField, TextAreaField, TextField } from "./CatalogEditorShell";

const TARGET_OPTIONS: { id: SkillTarget; label: string }[] = [
  { id: "enemy", label: "Enemy" },
  { id: "ally", label: "Ally" },
  { id: "self", label: "Self" },
  { id: "none", label: "None (field)" },
];

const EFFECT_KINDS = (["damage", "heal", "status", "world"] as const).map((k) => ({ id: k, label: k }));

const STATUS_KINDS = [
  "defense_up",
  "defense_down",
  "attack_up",
  "attack_down",
  "shield",
  "regen",
  "poison",
  "haste",
  "stun",
].map((k) => ({ id: k, label: k }));

const STAT_OPTIONS: { id: "" | "str" | "dex" | "vit" | "int" | "md"; label: string }[] = [
  { id: "", label: "(skill default)" },
  { id: "str", label: "str" },
  { id: "dex", label: "dex" },
  { id: "vit", label: "vit" },
  { id: "int", label: "int" },
  { id: "md", label: "md" },
];

const WORLD_ACTIONS = ["return", "port", "camp"].map((k) => ({ id: k, label: k }));

/** Shared skill detail form — catalog page and nested inspectors. */
export function SkillsEditorForm({ draft, onChange }: { draft: SkillDef; onChange: (draft: SkillDef) => void }) {
  const effects = draft.effects ?? [];
  const setEffect = (i: number, patch: Partial<SkillEffectDef>) =>
    onChange({ ...draft, effects: effects.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const setEffectKind = (i: number, kind: SkillEffectDef["kind"]) => {
    // Reset kind-specific payloads so a repurposed component can't carry
    // foreign fields into validation.
    const next: SkillEffectDef = { kind, power: effects[i].power, stat: effects[i].stat };
    if (kind === "status") next.status = effects[i].status ?? { kind: "defense_up", duration: 20, potency: 0.2 };
    if (kind === "world") next.world = effects[i].world ?? "return";
    setEffect(i, next);
  };
  return (
    <>
      <div className="map-editor-group-label">Skill</div>
      <TextField label="ID" value={draft.id} readOnly />
      <TextField label="Name" value={draft.name} onChange={(name) => onChange({ ...draft, name })} />
      <TextAreaField label="Description" value={draft.description} onChange={(description) => onChange({ ...draft, description })} rows={3} />
      {draft.world_only ? (
        <p className="dim map-editor-role-hint">World-only field skill (not part of any job tree).</p>
      ) : (
        <>
          <SelectField
            label="Category"
            value={draft.category ?? "swordplay"}
            onChange={(category) => onChange({ ...draft, category })}
            options={JOB_CATEGORIES}
          />
          <FieldLabel>Weapon requirements</FieldLabel>
          <div className="map-editor-check-list">
            {WEAPON_TYPES.map((w) => (
              <CheckboxField
                key={w.id}
                label={w.label}
                checked={draft.weapon_reqs?.includes(w.id) ?? false}
                onChange={(on) => {
                  const cur = draft.weapon_reqs ?? [];
                  const next = on ? [...cur, w.id] : cur.filter((t) => t !== w.id);
                  onChange({ ...draft, weapon_reqs: next.length ? next : undefined });
                }}
              />
            ))}
          </div>
        </>
      )}
      <NumberField label="MP cost" value={draft.mp_cost} min={0} onChange={(mp_cost) => onChange({ ...draft, mp_cost })} />
      <NumberField label="Power" value={draft.power} min={0} step={0.1} onChange={(power) => onChange({ ...draft, power })} />
      <NumberField label="Cast time (ms)" value={draft.cast_time_ms} min={0} onChange={(cast_time_ms) => onChange({ ...draft, cast_time_ms })} />
      <NumberField label="Cooldown after GCD (ms)" value={draft.cooldown_ms ?? 0} min={0} onChange={(cooldown_ms) => onChange({ ...draft, cooldown_ms: cooldown_ms || undefined })} />
      <SelectField
        label="Target"
        value={draft.target ?? "enemy"}
        onChange={(target) => onChange({ ...draft, target })}
        options={TARGET_OPTIONS}
      />
      <div className="map-editor-group-label">Effects</div>
      {effects.map((eff, i) => (
        <div key={i} className="map-editor-nested">
          <SelectField
            label={`Effect ${i + 1}`}
            value={eff.kind}
            onChange={(kind) => setEffectKind(i, kind)}
            options={EFFECT_KINDS}
          />
          {eff.kind === "damage" || eff.kind === "heal" ? (
            <>
              <NumberField label="Power override" value={eff.power ?? 0} min={0} step={0.1} onChange={(power) => setEffect(i, { power: power || undefined })} />
              <SelectField
                label="Stat"
                value={eff.stat ?? ""}
                onChange={(stat) => setEffect(i, { stat: stat || undefined })}
                options={STAT_OPTIONS}
              />
            </>
          ) : null}
          {eff.kind === "status" && eff.status ? (
            <>
              <SelectField
                label="Status"
                value={eff.status.kind}
                onChange={(kind) => setEffect(i, { status: { ...eff.status!, kind } })}
                options={STATUS_KINDS}
              />
              <NumberField label="Duration (ticks)" value={eff.status.duration} min={0} onChange={(duration) => setEffect(i, { status: { ...eff.status!, duration } })} />
              <NumberField label="Potency" value={eff.status.potency} step={0.05} onChange={(potency) => setEffect(i, { status: { ...eff.status!, potency } })} />
              <CheckboxField label="On caster" checked={eff.status.on_caster ?? false} onChange={(on_caster) => setEffect(i, { status: { ...eff.status!, on_caster } })} />
            </>
          ) : null}
          {eff.kind === "world" ? (
            <SelectField
              label="Field action"
              value={eff.world ?? "return"}
              onChange={(world) => setEffect(i, { world })}
              options={WORLD_ACTIONS}
            />
          ) : null}
          <button type="button" className="cm-btn" onClick={() => onChange({ ...draft, effects: effects.filter((_, j) => j !== i) })}>
            Remove effect
          </button>
        </div>
      ))}
      <button
        type="button"
        className="cm-btn"
        onClick={() => onChange({ ...draft, effects: [...effects, { kind: "damage" }] })}
      >
        Add effect
      </button>
      <div className="map-editor-group-label">Flags</div>
      <CheckboxField label="Passive" checked={draft.passive ?? false} onChange={(passive) => onChange({ ...draft, passive: passive || undefined })} />
      <CheckboxField label="Magic" checked={draft.magic} onChange={(magic) => onChange({ ...draft, magic })} />
      <CheckboxField label="Heals" checked={draft.heals} onChange={(heals) => onChange({ ...draft, heals })} />
      <CheckboxField label="Buffs allies" checked={draft.buffs} onChange={(buffs) => onChange({ ...draft, buffs })} />
      <CheckboxField label="Loot bonus" checked={draft.loot} onChange={(loot) => onChange({ ...draft, loot })} />
      <CheckboxField label="Ranged" checked={draft.ranged} onChange={(ranged) => onChange({ ...draft, ranged })} />
      <CheckboxField label="World only" checked={draft.world_only} onChange={(world_only) => onChange({ ...draft, world_only })} />
    </>
  );
}
