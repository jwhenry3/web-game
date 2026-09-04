import {
  JOB_CATEGORIES,
  WEAPON_TYPES,
  type SkillDef,
} from "../editor/gameContentTypes";
import { CheckboxField, NumberField, SelectField, TextAreaField, TextField } from "./CatalogEditorShell";

/** Shared skill detail form — catalog page and nested inspectors. */
export function SkillsEditorForm({ draft, onChange }: { draft: SkillDef; onChange: (draft: SkillDef) => void }) {
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
          <SelectField
            label="Weapon requirement"
            value={draft.weapon_req ?? "sword"}
            onChange={(weapon_req) => onChange({ ...draft, weapon_req })}
            options={WEAPON_TYPES}
          />
        </>
      )}
      <NumberField label="MP cost" value={draft.mp_cost} min={0} onChange={(mp_cost) => onChange({ ...draft, mp_cost })} />
      <NumberField label="Power" value={draft.power} min={0} step={0.1} onChange={(power) => onChange({ ...draft, power })} />
      <NumberField label="Cast time (ms)" value={draft.cast_time_ms} min={0} onChange={(cast_time_ms) => onChange({ ...draft, cast_time_ms })} />
      <div className="map-editor-group-label">Flags</div>
      <CheckboxField label="Magic" checked={draft.magic} onChange={(magic) => onChange({ ...draft, magic })} />
      <CheckboxField label="Heals" checked={draft.heals} onChange={(heals) => onChange({ ...draft, heals })} />
      <CheckboxField label="Buffs allies" checked={draft.buffs} onChange={(buffs) => onChange({ ...draft, buffs })} />
      <CheckboxField label="Loot bonus" checked={draft.loot} onChange={(loot) => onChange({ ...draft, loot })} />
      <CheckboxField label="Ranged" checked={draft.ranged} onChange={(ranged) => onChange({ ...draft, ranged })} />
      <CheckboxField label="World only" checked={draft.world_only} onChange={(world_only) => onChange({ ...draft, world_only })} />
    </>
  );
}
