import { useMemo } from "react";
import { useCatalogEditor } from "../editor/catalogEditorHooks";
import { createDefaultJob, normalizeJobDef } from "../editor/jobCatalogHelpers";
import { persistJobs, type JobDef, type SkillDef } from "../editor/contentStore";
import { JOB_CATEGORIES, WEAPON_TYPES } from "../editor/gameContentTypes";
import {
  CatalogEditorShell,
  type CatalogTableColumn,
  type CatalogTableFilter,
} from "./CatalogEditorShell";
import { JobCoreForm, JobSkillTreeInspector } from "./JobsEditorForm";

interface Props {
  items: JobDef[];
  skills: SkillDef[];
  onItemsChange: (items: JobDef[]) => void;
  onSkillsChange: (skills: SkillDef[]) => void;
  status: string | null;
  error: string | null;
  onStatus: (status: string | null) => void;
}

const STARTING_FILTER_OPTIONS = [
  { id: "yes", label: "Starting" },
  { id: "no", label: "Advanced" },
];

export function JobsEditorPage({ items, skills, onItemsChange, onSkillsChange, status, error, onStatus }: Props) {
  const editor = useCatalogEditor(items, onItemsChange, persistJobs, onStatus, () => createDefaultJob());

  const columns: CatalogTableColumn<JobDef>[] = useMemo(
    () => [
      { id: "name", label: "Name", render: (j) => j.name },
      { id: "abbr", label: "Abbr", width: "56px", render: (j) => j.abbr },
      {
        id: "category",
        label: "Category",
        render: (j) => JOB_CATEGORIES.find((c) => c.id === j.category)?.label ?? j.category,
      },
      {
        id: "weapon",
        label: "Weapon",
        render: (j) => WEAPON_TYPES.find((w) => w.id === j.weapon)?.label ?? j.weapon,
      },
      {
        id: "skills",
        label: "Skills",
        width: "56px",
        render: (j) => j.skill_tree?.length ?? 0,
      },
      {
        id: "starting",
        label: "Start",
        width: "48px",
        render: (j) => (j.starting ? "✓" : "—"),
      },
    ],
    [],
  );

  const filters: CatalogTableFilter<JobDef>[] = useMemo(
    () => [
      {
        id: "category",
        label: "Category",
        options: JOB_CATEGORIES,
        match: (j, v) => j.category === v,
      },
      {
        id: "starting",
        label: "Availability",
        options: STARTING_FILTER_OPTIONS,
        match: (j, v) => (v === "yes" ? j.starting : !j.starting),
      },
    ],
    [],
  );

  const draft = editor.draft ? normalizeJobDef(editor.draft) : null;
  const setDraft = (next: JobDef) => editor.setDraft(normalizeJobDef(next));

  return (
    <CatalogEditorShell
      listTitle="Jobs"
      items={items}
      columns={columns}
      filters={filters}
      searchPlaceholder="Search jobs…"
      getSearchText={(j) => `${j.name} ${j.id} ${j.abbr}`}
      selectedId={editor.selectedId}
      onSelect={editor.setSelectedId}
      draft={draft}
      dirty={editor.dirty}
      status={status}
      error={error}
      emptyHint="No jobs in catalog."
      canCreate={false}
      canDelete={false}
      onNew={editor.createNew}
      onSave={editor.saveDraft}
      onDelete={editor.deleteSelected}
      onDraftChange={setDraft}
      detailLayout="columns"
      detailSections={(job, onChange) => [
        {
          id: "core",
          label: "Job",
          minWidth: 280,
          grow: 0.9,
          content: <JobCoreForm draft={job} onChange={onChange} />,
        },
        {
          id: "tree",
          label: "Skill tree",
          minWidth: 360,
          grow: 1.6,
          content: (
            <JobSkillTreeInspector
              draft={job}
              skills={skills}
              onChange={onChange}
              onSkillChange={(skill) => {
                onSkillsChange(skills.map((s) => (s.id === skill.id ? skill : s)));
              }}
            />
          ),
        },
      ]}
    />
  );
}
