import { useEffect, useState } from "react";
import { ENTITY_KIND_LABELS, ENTITY_TEMPLATE_GROUPS, type EntityKind } from "../editor/entityCatalog";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (kind: EntityKind, name: string) => void;
}

export function NewEntityDialog({ open, onClose, onCreate }: Props) {
  const firstKind = ENTITY_TEMPLATE_GROUPS[0]!.entries[0]!.kind;
  const [kind, setKind] = useState<EntityKind>(firstKind);
  const [name, setName] = useState(ENTITY_KIND_LABELS[firstKind]);

  useEffect(() => {
    if (!open) return;
    setKind(firstKind);
    setName(ENTITY_KIND_LABELS[firstKind]);
  }, [open, firstKind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(kind, trimmed);
  };

  return (
    <div className="modal-backdrop map-editor-dialog-backdrop" onPointerDown={onClose}>
      <div className="cm-window map-editor-new-entity-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cm-titlebar">
          <span className="cm-title">New Entity</span>
        </div>
        <form className="cm-body map-editor-new-entity-body" onSubmit={submit}>
          <p className="dim map-editor-tileset-hint">
            Create a reusable template. Save points, sanctuaries, and transitions are placed on the Map page.
          </p>

          <label className="field-label">Type</label>
          <div className="map-editor-new-entity-kinds">
            {ENTITY_TEMPLATE_GROUPS.map((group) => (
              <div key={group.id} className="map-editor-entity-group">
                <div className="map-editor-hierarchy-group-label">{group.label}</div>
                {group.entries.map((entry) => (
                  <label key={entry.kind} className={`map-editor-kind-option ${kind === entry.kind ? "on" : ""}`}>
                    <input
                      type="radio"
                      name="entity-kind"
                      checked={kind === entry.kind}
                      onChange={() => {
                        setKind(entry.kind);
                        setName(ENTITY_KIND_LABELS[entry.kind]);
                      }}
                    />
                    <span>
                      <strong>{entry.label}</strong>
                      <span className="dim">{entry.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <label className="field-label">Name</label>
          <input
            className="cm-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Display name for this template"
          />

          <div className="map-editor-dialog-actions">
            <button type="button" className="cm-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cm-btn gold" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
