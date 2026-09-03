import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { persistEntities, type ItemDef, type QuestDef } from "../editor/contentStore";
import {
  createDefaultTemplate,
  createEntityDefinition,
  type EntityDefinition,
  type EntityKind,
} from "../editor/entities";
import {
  ENTITY_KIND_LABELS,
  ENTITY_TEMPLATE_GROUPS,
  ENTITY_TEMPLATE_KINDS,
  groupEntitiesByKind,
  isEntityTemplateKind,
} from "../editor/entityCatalog";
import { DEFAULT_INTERACTABLE_ROLES, type NpcRole } from "../editor/sceneCatalog";
import type { EditorObject } from "../editor/editorTypes";
import type { AdminMapInfo } from "../net/adminMaps";
import type { ImportedTileset } from "../editor/tilesetConfig";
import { HoverTooltip } from "../ui/HoverTooltip";
import { EntityEditorView } from "./EntityEditorView";
import { MapEditorInspector } from "./MapEditorInspector";
import { NewEntityDialog } from "./NewEntityDialog";

interface Props {
  entities: EntityDefinition[];
  onEntitiesChange: (entities: EntityDefinition[]) => void;
  items: ItemDef[];
  quests: QuestDef[];
  tileset: ImportedTileset | null;
  maps: AdminMapInfo[];
  currentMapId: string;
  status: string | null;
  error: string | null;
  onStatus: (s: string | null) => void;
  /** Open the new-entity dialog immediately (e.g. navigated from Map page). */
  openNewDialog?: boolean;
  onNewDialogHandled?: () => void;
}

function EntityKindGlyph({ kind }: { kind: EntityKind }) {
  switch (kind) {
    case "npc_combat":
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M2 14 7.5 8.5 9 10l-5.5 5.5zm12-12L8.5 7.5 7 6l5.5-5.5zM9.5 6.5 14 2l1.5 1.5-4.5 4.5zm-3 3L2 14 3.5 15.5 8 11z" />
        </svg>
      );
    case "npc_service":
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="5" r="3" fill="currentColor" />
          <path fill="currentColor" d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5v1H3z" />
        </svg>
      );
    case "quest_trigger":
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 1.5A5 5 0 0 0 3.5 8c0 1.6.7 2.5 1.8 3.4.7.6 1.2 1.1 1.2 2.1v.5h2.5v-.5c0-1.4.6-2 1.4-2.7 1-.9 1.6-1.8 1.6-3.3A5 5 0 0 0 8 1.5zm-1.2 12.8h2.4V16H6.8z"
          />
        </svg>
      );
    case "item":
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M8 1.5 13.5 8 8 14.5 2.5 8z" />
        </svg>
      );
    default:
      return <span>•</span>;
  }
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M7 2h2v5h5v2H9v5H7V9H2V7h5z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M2 1.5h9.2L14.5 4.8V14.5H2zM3.5 3v4h7V3zm1.5 0h4v2.5H5zm-1.5 5.5v5h8v-5z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 2a6 6 0 1 0 5.65 4H11.5A4.5 4.5 0 1 1 8 3.5V6l3.5-2.5L8 1z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 1h4l1 1h3v2H2V2h3zm-.5 4h9l-.7 9.2A1.5 1.5 0 0 1 12.3 15H3.7a1.5 1.5 0 0 1-1.5-1.4z"
      />
    </svg>
  );
}

function ToolbarIconButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "gold" | "danger";
  children: ReactNode;
}) {
  return (
    <HoverTooltip content={label} disabled={disabled}>
      <button
        type="button"
        className={`xiv-btn map-editor-chrome-icon-btn ${tone === "gold" ? "gold" : ""} ${tone === "danger" ? "danger" : ""}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {children}
      </button>
    </HoverTooltip>
  );
}

export function EntityEditorPage({
  entities,
  onEntitiesChange,
  items,
  quests,
  tileset,
  maps,
  currentMapId,
  status,
  error,
  onStatus,
  openNewDialog,
  onNewDialogHandled,
}: Props) {
  const templateEntities = useMemo(
    () => entities.filter((e) => isEntityTemplateKind(e.kind)),
    [entities],
  );
  const [selectedId, setSelectedId] = useState<string | null>(templateEntities[0]?.id ?? null);
  const [draft, setDraft] = useState<EntityDefinition | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [interactableRoles] = useState<NpcRole[]>([...DEFAULT_INTERACTABLE_ROLES]);

  useEffect(() => {
    if (openNewDialog) {
      setDialogOpen(true);
      onNewDialogHandled?.();
    }
  }, [openNewDialog, onNewDialogHandled]);

  const selected = useMemo(
    () => templateEntities.find((e) => e.id === selectedId) ?? null,
    [templateEntities, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({
      ...selected,
      template: JSON.parse(JSON.stringify(selected.template)) as EditorObject,
    });
  }, [selected]);

  useEffect(() => {
    if (selectedId && !templateEntities.some((e) => e.id === selectedId)) {
      setSelectedId(templateEntities[0]?.id ?? null);
    }
  }, [templateEntities, selectedId]);

  const byKind = useMemo(() => groupEntitiesByKind(templateEntities), [templateEntities]);

  const persist = useCallback(
    (next: EntityDefinition[]) => {
      persistEntities(next);
      onEntitiesChange(next);
    },
    [onEntitiesChange],
  );

  const createNew = (kind: EntityKind, name: string) => {
    if (!ENTITY_TEMPLATE_KINDS.includes(kind)) return;
    const ent = createEntityDefinition(name, kind, interactableRoles);
    persist([...entities, ent]);
    setSelectedId(ent.id);
    setDialogOpen(false);
    onStatus(`Created entity "${ent.name}"`);
  };

  const saveDraft = () => {
    if (!draft) return;
    const next = entities.map((e) => (e.id === draft.id ? draft : e));
    persist(next);
    onStatus(`Saved entity "${draft.name}"`);
  };

  const resetDraft = () => {
    if (!draft || !confirm("Reset this entity template to defaults?")) return;
    const next = {
      ...draft,
      template: createDefaultTemplate(draft.kind, interactableRoles),
    };
    setDraft(next);
    persist(entities.map((e) => (e.id === next.id ? next : e)));
    onStatus("Entity template reset");
  };

  const deleteSelected = () => {
    if (!draft || !confirm(`Delete entity "${draft.name}"?`)) return;
    const next = entities.filter((e) => e.id !== draft.id);
    persist(next);
    setSelectedId(next.filter((e) => isEntityTemplateKind(e.kind))[0]?.id ?? null);
    onStatus(`Deleted "${draft.name}"`);
  };

  const updateTemplate = (obj: EditorObject) => {
    if (!draft) return;
    setDraft({ ...draft, template: obj });
  };

  const renameDraft = (name: string) => {
    if (!draft) return;
    setDraft({ ...draft, name });
  };

  const dirty =
    draft != null &&
    selected != null &&
    JSON.stringify(draft) !== JSON.stringify(selected);

  return (
    <div className="map-editor-entities-shell">
      <div className="map-editor-chrome map-editor-chrome--toolbar xiv-window">
        <div className="map-editor-chrome-toolbar map-editor-entity-toolbar">
          {(status || error) && (
            <div className="map-editor-chrome-messages">
              {status && <p className="map-editor-status">{status}</p>}
              {error && <p className="error-text">{error}</p>}
            </div>
          )}

          <div className="map-editor-chrome-actions">
            <ToolbarIconButton label="New entity" onClick={() => setDialogOpen(true)} tone="gold">
              <PlusIcon />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={dirty ? "Save entity" : "Saved"}
              onClick={saveDraft}
              disabled={!draft || !dirty}
              tone={dirty ? "gold" : undefined}
            >
              <SaveIcon />
            </ToolbarIconButton>
            <ToolbarIconButton label="Reset template" onClick={resetDraft} disabled={!draft}>
              <ResetIcon />
            </ToolbarIconButton>
            <ToolbarIconButton label="Delete entity" onClick={deleteSelected} disabled={!draft} tone="danger">
              <TrashIcon />
            </ToolbarIconButton>
          </div>
        </div>
      </div>

      <div className="map-editor-layout map-editor-layout--entities">
        <div className="map-editor-dock-left">
          <div className="map-editor-toolbox xiv-window">
            <div className="xiv-titlebar">
              <span className="xiv-title">Templates</span>
            </div>
            <div className="xiv-body map-editor-toolbox-body">
              {templateEntities.length === 0 && <p className="dim">No entities yet. Create one to get started.</p>}
              {ENTITY_TEMPLATE_GROUPS.map((group) => {
                const groupEntities = group.entries.flatMap((e) => byKind.get(e.kind) ?? []);
                if (groupEntities.length === 0) return null;
                return (
                  <div key={`lib-${group.id}`} className="map-editor-entity-library-section">
                    <div className="map-editor-group-label">{group.label}</div>
                    {groupEntities.map((ent) => (
                      <button
                        key={ent.id}
                        type="button"
                        className={`xiv-btn wide map-editor-prefab-item ${selectedId === ent.id ? "on" : ""}`}
                        onClick={() => setSelectedId(ent.id)}
                      >
                        <span className="map-editor-prefab-item-main">
                          <span className={`map-editor-entity-kind-glyph map-editor-entity-kind-btn--${ent.kind}`}>
                            <EntityKindGlyph kind={ent.kind} />
                          </span>
                          <span>{ent.name}</span>
                        </span>
                        <span className="dim">{ENTITY_KIND_LABELS[ent.kind]}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {draft ? (
          <EntityEditorView key={draft.id} entity={draft} tileset={tileset} onSelectObject={() => {}} />
        ) : (
          <div className="map-editor-viewport map-editor-viewport--entity">
            <p className="dim map-editor-inspector-empty">Select or create an entity template.</p>
          </div>
        )}

        <MapEditorInspector
          obj={draft?.template ?? null}
          maps={maps}
          currentMapId={currentMapId}
          tileset={tileset}
          items={items}
          quests={quests}
          onUpdate={updateTemplate}
          onDelete={() => {}}
          templateMode
          entitySettings={
            draft
              ? {
                  name: draft.name,
                  onName: renameDraft,
                }
              : undefined
          }
        />
      </div>

      <NewEntityDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={createNew} />
    </div>
  );
}
