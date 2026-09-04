import { createContext, useContext, useMemo } from "react";
import {
  combatSkillOptions,
  computeSkillTreeTiers,
  removeSkillTreeNode,
  treePrereqOptions,
  updateSkillTreeNode,
} from "../editor/jobCatalogHelpers";
import { InspectorStackProvider } from "../editor/inspectorStack";
import { JOB_CATEGORIES, WEAPON_TYPES, type JobDef, type JobSkillNode, type SkillDef } from "../editor/gameContentTypes";
import { ContentIdSelect } from "./ContentIdSelect";
import { CheckboxField, FieldLabel, NumberField, SelectField, TextField } from "./CatalogEditorShell";
import { InspectorStackHost } from "./InspectorStackView";
import { SkillsEditorForm } from "./SkillsEditorForm";
import { useInspectorStack } from "../editor/inspectorStack";

export function JobCoreForm({ draft, onChange }: { draft: JobDef; onChange: (draft: JobDef) => void }) {
  const patchMult = (key: keyof JobDef["stat_mults"], value: number) =>
    onChange({ ...draft, stat_mults: { ...draft.stat_mults, [key]: value || undefined } });

  return (
    <>
      <div className="map-editor-group-label">Job</div>
      <TextField label="ID" value={draft.id} readOnly />
      <TextField label="Name" value={draft.name} onChange={(name) => onChange({ ...draft, name })} />
      <TextField label="Abbreviation" value={draft.abbr} onChange={(abbr) => onChange({ ...draft, abbr })} />
      <SelectField
        label="Category"
        value={draft.category}
        onChange={(category) => onChange({ ...draft, category })}
        options={JOB_CATEGORIES}
      />
      <SelectField
        label="Default weapon"
        value={draft.weapon}
        onChange={(weapon) => onChange({ ...draft, weapon })}
        options={WEAPON_TYPES}
      />
      <CheckboxField
        label="Starting job (hero creation)"
        checked={draft.starting}
        onChange={(starting) => onChange({ ...draft, starting })}
      />
      <div className="map-editor-group-label">Stat multipliers</div>
      <NumberField label="HP mult" value={draft.stat_mults.hp ?? 1} step={0.01} onChange={(v) => patchMult("hp", v)} />
      <NumberField label="MP mult" value={draft.stat_mults.mp ?? 1} step={0.01} onChange={(v) => patchMult("mp", v)} />
      <NumberField label="STR mult" value={draft.stat_mults.str ?? 1} step={0.01} onChange={(v) => patchMult("str", v)} />
      <NumberField label="MAG mult" value={draft.stat_mults.mag ?? 1} step={0.01} onChange={(v) => patchMult("mag", v)} />
      <NumberField label="AGI mult" value={draft.stat_mults.agi ?? 1} step={0.01} onChange={(v) => patchMult("agi", v)} />
    </>
  );
}

interface JobSkillsScope {
  skills: SkillDef[];
  onSkillChange: (skill: SkillDef) => void;
}

const JobSkillsScopeContext = createContext<JobSkillsScope | null>(null);

function useJobSkillsScope(): JobSkillsScope {
  const ctx = useContext(JobSkillsScopeContext);
  if (!ctx) throw new Error("JobSkillsScope missing");
  return ctx;
}

function NestedSkillInspector({ skillId }: { skillId: string }) {
  const { skills, onSkillChange } = useJobSkillsScope();
  const skill = skills.find((s) => s.id === skillId);
  if (!skill) {
    return <p className="dim">Skill “{skillId}” is not in the catalog.</p>;
  }
  return <SkillsEditorForm draft={skill} onChange={onSkillChange} />;
}

function skillFrame(skillId: string, skills: SkillDef[]) {
  const skill = skills.find((s) => s.id === skillId);
  return {
    id: `skill:${skillId}`,
    level: "skill",
    title: skill ? `Skill · ${skill.name}` : `Skill · ${skillId}`,
    crumb: skill?.name ?? skillId,
    render: () => <NestedSkillInspector skillId={skillId} />,
  };
}

function JobSkillTreeDiagram({
  tree,
  skills,
  activeSkillId,
}: {
  tree: JobSkillNode[];
  skills: SkillDef[];
  activeSkillId: string | null;
}) {
  const { open } = useInspectorStack();
  if (tree.length === 0) return null;

  const tiers = computeSkillTreeTiers(tree);
  const maxTier = Math.max(0, ...Array.from(tiers.values()));
  const byTier = new Map<number, JobSkillNode[]>();
  for (const node of tree) {
    const tier = tiers.get(node.skill_id) ?? 0;
    const list = byTier.get(tier) ?? [];
    list.push(node);
    byTier.set(tier, list);
  }

  const skillName = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="map-editor-skill-tree-diagram">
      <div className="map-editor-group-label">Preview</div>
      <p className="dim map-editor-role-hint">Click a node to inspect that skill’s catalog details.</p>
      {Array.from({ length: maxTier + 1 }, (_, tier) => (
        <div key={tier} className="map-editor-skill-tree-tier">
          {(byTier.get(tier) ?? []).map((node) => (
            <button
              key={node.skill_id}
              type="button"
              className={`map-editor-skill-tree-node-box ${activeSkillId === node.skill_id ? "on" : ""}`}
              onClick={() => open(skillFrame(node.skill_id, skills))}
            >
              <span className="map-editor-skill-tree-node-name">{skillName(node.skill_id)}</span>
              {node.prereq_skill_id ? (
                <span className="dim map-editor-skill-tree-node-prereq">requires {skillName(node.prereq_skill_id)}</span>
              ) : (
                <span className="dim map-editor-skill-tree-node-prereq">root</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function JobSkillTreeRoot({
  draft,
  skills,
  onChange,
}: {
  draft: JobDef;
  skills: SkillDef[];
  onChange: (draft: JobDef) => void;
}) {
  const { has } = useInspectorStack();
  const tree = draft.skill_tree ?? [];
  const skillOptions = combatSkillOptions(skills);
  const unusedSkills = skillOptions.filter((opt) => !tree.some((n) => n.skill_id === opt.id));

  const addNode = () => {
    const nextId = unusedSkills[0]?.id;
    if (!nextId) return;
    onChange({ ...draft, skill_tree: [...tree, { skill_id: nextId }] });
  };

  const activeSkillId =
    [...tree].reverse().find((n) => has(`skill:${n.skill_id}`))?.skill_id ?? null;

  return (
    <>
      <div className="map-editor-group-label">Skill tree</div>
      <p className="dim map-editor-role-hint">
        Assign catalog skills to this job. Use Inspect beside a skill to edit its catalog record without leaving this job.
      </p>

      {tree.length === 0 && <p className="dim">No skills in tree yet.</p>}

      {tree.map((node, index) => (
        <div
          key={`${node.skill_id}-${index}`}
          className={`map-editor-skill-tree-node-row ${activeSkillId === node.skill_id ? "map-editor-skill-tree-node-row--open" : ""}`}
        >
          <FieldLabel>Skill</FieldLabel>
          <ContentIdSelect
            value={node.skill_id}
            onChange={(skill_id) => onChange(updateSkillTreeNode(draft, index, { skill_id }))}
            options={skillOptions}
            emptyLabel="— pick skill —"
            inspectFrame={skillFrame(node.skill_id, skills)}
            inspectLabel="Inspect"
          />
          <FieldLabel>Prerequisite (within this job)</FieldLabel>
          <ContentIdSelect
            value={node.prereq_skill_id ?? ""}
            onChange={(prereq_skill_id) =>
              onChange(updateSkillTreeNode(draft, index, { prereq_skill_id: prereq_skill_id || undefined }))
            }
            options={treePrereqOptions(tree, node.skill_id, skills)}
            emptyLabel="— none (root) —"
          />
          <div className="map-editor-skill-tree-node-actions">
            <button type="button" className="cm-btn" onClick={() => onChange(removeSkillTreeNode(draft, index))}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="cm-btn wide" onClick={addNode} disabled={unusedSkills.length === 0}>
        Add skill node
      </button>

      <JobSkillTreeDiagram tree={tree} skills={skills} activeSkillId={activeSkillId} />
    </>
  );
}

export function JobSkillTreeInspector({
  draft,
  skills,
  onChange,
  onSkillChange,
}: {
  draft: JobDef;
  skills: SkillDef[];
  onChange: (draft: JobDef) => void;
  onSkillChange: (skill: SkillDef) => void;
}) {
  const scope = useMemo(() => ({ skills, onSkillChange }), [skills, onSkillChange]);

  return (
    <JobSkillsScopeContext.Provider value={scope}>
      <InspectorStackProvider>
        <InspectorStackHost
          rootTitle={`${draft.abbr || draft.name} · tree`}
          root={<JobSkillTreeRoot draft={draft} skills={skills} onChange={onChange} />}
          className="map-editor-skill-tree-stack"
        />
      </InspectorStackProvider>
    </JobSkillsScopeContext.Provider>
  );
}
