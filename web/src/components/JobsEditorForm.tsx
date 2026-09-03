import {
  combatSkillOptions,
  computeSkillTreeTiers,
  removeSkillTreeNode,
  treePrereqOptions,
  updateSkillTreeNode,
} from "../editor/jobCatalogHelpers";
import { JOB_CATEGORIES, WEAPON_TYPES, type JobDef, type JobSkillNode, type SkillDef } from "../editor/gameContentTypes";
import { ContentIdSelect } from "./ContentIdSelect";
import { CheckboxField, FieldLabel, NumberField, SelectField, TextField } from "./CatalogEditorShell";

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

function JobSkillTreeDiagram({ tree, skills }: { tree: JobSkillNode[]; skills: SkillDef[] }) {
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
      {Array.from({ length: maxTier + 1 }, (_, tier) => (
        <div key={tier} className="map-editor-skill-tree-tier">
          {(byTier.get(tier) ?? []).map((node) => (
            <div key={node.skill_id} className="map-editor-skill-tree-node-box">
              <span className="map-editor-skill-tree-node-name">{skillName(node.skill_id)}</span>
              {node.prereq_skill_id ? (
                <span className="dim map-editor-skill-tree-node-prereq">requires {skillName(node.prereq_skill_id)}</span>
              ) : (
                <span className="dim map-editor-skill-tree-node-prereq">root</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function JobSkillTreeInspector({
  draft,
  skills,
  onChange,
}: {
  draft: JobDef;
  skills: SkillDef[];
  onChange: (draft: JobDef) => void;
}) {
  const tree = draft.skill_tree ?? [];
  const skillOptions = combatSkillOptions(skills);
  const unusedSkills = skillOptions.filter((opt) => !tree.some((n) => n.skill_id === opt.id));

  const addNode = () => {
    const nextId = unusedSkills[0]?.id;
    if (!nextId) return;
    onChange({ ...draft, skill_tree: [...tree, { skill_id: nextId }] });
  };

  return (
    <>
      <div className="map-editor-group-label">Skill tree</div>
      <p className="dim map-editor-role-hint">
        Assign catalog skills to this job. The same skill can appear on multiple jobs with different prerequisites.
      </p>

      {tree.length === 0 && <p className="dim">No skills in tree yet.</p>}

      {tree.map((node, index) => (
        <div key={`${node.skill_id}-${index}`} className="map-editor-skill-tree-node-row">
          <FieldLabel>Skill</FieldLabel>
          <ContentIdSelect
            value={node.skill_id}
            onChange={(skill_id) => onChange(updateSkillTreeNode(draft, index, { skill_id }))}
            options={skillOptions}
            emptyLabel="— pick skill —"
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
          <button type="button" className="xiv-btn wide" onClick={() => onChange(removeSkillTreeNode(draft, index))}>
            Remove from tree
          </button>
        </div>
      ))}

      <button type="button" className="xiv-btn wide" onClick={addNode} disabled={unusedSkills.length === 0}>
        Add skill node
      </button>

      <JobSkillTreeDiagram tree={tree} skills={skills} />
    </>
  );
}
