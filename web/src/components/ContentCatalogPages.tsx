import { useMemo } from "react";
import { useCatalogEditor } from "../editor/catalogEditorHooks";
import {
  persistQuests,
  persistSkills,
  type QuestDef,
  type SkillDef,
} from "../editor/contentStore";
import {
  JOB_CATEGORIES,
  WEAPON_TYPES,
  type JobCategory,
  type WeaponType,
} from "../editor/gameContentTypes";
import {
  CatalogEditorShell,
  CheckboxField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  type CatalogTableColumn,
  type CatalogTableFilter,
} from "./CatalogEditorShell";

interface CatalogPageProps<T extends { id: string; name: string }> {
  items: T[];
  onItemsChange: (items: T[]) => void;
  status: string | null;
  error: string | null;
  onStatus: (status: string | null) => void;
}

const QUEST_COLUMNS: CatalogTableColumn<QuestDef>[] = [
  { id: "name", label: "Name", render: (q) => q.name },
  { id: "id", label: "ID", width: "40%", render: (q) => <span className="dim">{q.id}</span> },
];

function QuestsEditorForm({ draft, onChange }: { draft: QuestDef; onChange: (draft: QuestDef) => void }) {
  return (
    <>
      <div className="map-editor-group-label">Quest</div>
      <TextField label="ID" value={draft.id} readOnly />
      <TextField label="Name" value={draft.name} onChange={(name) => onChange({ ...draft, name })} />
    </>
  );
}

export function QuestsEditorPage({ items, onItemsChange, status, error, onStatus }: CatalogPageProps<QuestDef>) {
  const editor = useCatalogEditor(items, onItemsChange, persistQuests, onStatus, () => ({
    id: `quest_${Date.now()}`,
    name: "New Quest",
  }));

  return (
    <CatalogEditorShell
      listTitle="Quests"
      items={items}
      columns={QUEST_COLUMNS}
      searchPlaceholder="Search quests…"
      selectedId={editor.selectedId}
      onSelect={editor.setSelectedId}
      draft={editor.draft}
      dirty={editor.dirty}
      status={status}
      error={error}
      emptyHint="No quests yet. Create one to get started."
      onNew={editor.createNew}
      onSave={editor.saveDraft}
      onDelete={editor.deleteSelected}
      onDraftChange={editor.setDraft}
      renderDetail={(draft, onChange) => <QuestsEditorForm draft={draft} onChange={onChange} />}
    />
  );
}

const SKILL_TYPE_FILTER_OPTIONS = [
  { id: "combat", label: "Combat" },
  { id: "world", label: "World" },
];

function skillTypeLabel(skill: SkillDef): string {
  if (skill.world_only) return "World";
  if (skill.id === "attack") return "Basic";
  return "Combat";
}

function skillFlags(skill: SkillDef): string {
  const flags: string[] = [];
  if (skill.magic) flags.push("magic");
  if (skill.heals) flags.push("heal");
  if (skill.buffs) flags.push("buff");
  if (skill.loot) flags.push("loot");
  if (skill.ranged) flags.push("ranged");
  return flags.join(", ") || "—";
}

function SkillsEditorForm({ draft, onChange }: { draft: SkillDef; onChange: (draft: SkillDef) => void }) {
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

export function SkillsEditorPage({ items, onItemsChange, status, error, onStatus }: CatalogPageProps<SkillDef>) {
  const editor = useCatalogEditor(items, onItemsChange, persistSkills, onStatus, () => ({
    id: `skill_${Date.now()}`,
    name: "New Skill",
    category: "swordplay" as JobCategory,
    weapon_req: "sword" as WeaponType,
    mp_cost: 0,
    power: 1,
    magic: false,
    heals: false,
    buffs: false,
    loot: false,
    ranged: false,
    world_only: false,
    cast_time_ms: 0,
    description: "",
  }));

  const columns: CatalogTableColumn<SkillDef>[] = useMemo(
    () => [
      { id: "name", label: "Name", render: (s) => s.name },
      { id: "id", label: "ID", render: (s) => <span className="dim">{s.id}</span> },
      {
        id: "category",
        label: "Category",
        render: (s) => (s.world_only ? "—" : JOB_CATEGORIES.find((c) => c.id === s.category)?.label ?? s.category ?? "—"),
      },
      { id: "type", label: "Type", render: (s) => skillTypeLabel(s) },
      { id: "mp", label: "MP", width: "48px", render: (s) => s.mp_cost },
      { id: "power", label: "Pow", width: "48px", render: (s) => s.power },
      { id: "flags", label: "Flags", render: (s) => <span className="dim">{skillFlags(s)}</span> },
    ],
    [],
  );

  const filters: CatalogTableFilter<SkillDef>[] = useMemo(
    () => [
      {
        id: "category",
        label: "Category",
        options: JOB_CATEGORIES,
        match: (s, v) => !s.world_only && s.category === v,
      },
      {
        id: "type",
        label: "Type",
        options: SKILL_TYPE_FILTER_OPTIONS,
        match: (s, v) => {
          if (v === "world") return s.world_only;
          if (v === "combat") return !s.world_only;
          return true;
        },
      },
    ],
    [],
  );

  return (
    <CatalogEditorShell
      listTitle="Skills"
      items={items}
      columns={columns}
      filters={filters}
      searchPlaceholder="Search skills…"
      getSearchText={(s) => `${s.name} ${s.id} ${s.description}`}
      selectedId={editor.selectedId}
      onSelect={editor.setSelectedId}
      draft={editor.draft}
      dirty={editor.dirty}
      status={status}
      error={error}
      emptyHint="No skills in catalog."
      canCreate={false}
      canDelete={false}
      onNew={editor.createNew}
      onSave={editor.saveDraft}
      onDelete={editor.deleteSelected}
      onDraftChange={editor.setDraft}
      renderDetail={(draft, onChange) => <SkillsEditorForm draft={draft} onChange={onChange} />}
    />
  );
}