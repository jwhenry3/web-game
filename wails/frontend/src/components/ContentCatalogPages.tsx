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
  type JobCategory,
  type WeaponType,
} from "../editor/gameContentTypes";
import {
  CatalogEditorShell,
  TextField,
  type CatalogTableColumn,
  type CatalogTableFilter,
} from "./CatalogEditorShell";
import { SkillsEditorForm } from "./SkillsEditorForm";

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