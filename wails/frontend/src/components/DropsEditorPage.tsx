import { useMemo } from "react";
import { useCatalogEditor } from "../editor/catalogEditorHooks";
import { persistDrops, type DropPoolDef, type ItemDef } from "../editor/contentStore";
import { createDefaultDropPool } from "../editor/dropCatalogHelpers";
import { CatalogEditorShell, type CatalogTableColumn } from "./CatalogEditorShell";
import { ContentIdSelect } from "./ContentIdSelect";

interface Props {
  drops: DropPoolDef[];
  items: ItemDef[];
  onDropsChange: (drops: DropPoolDef[]) => void;
  status: string | null;
  error: string | null;
  onStatus: (status: string | null) => void;
}

export function DropsEditorPage({ drops, items, onDropsChange, status, error, onStatus }: Props) {
  const editor = useCatalogEditor(drops, onDropsChange, persistDrops, onStatus, createDefaultDropPool);

  const columns: CatalogTableColumn<DropPoolDef>[] = useMemo(
    () => [
      { id: "name", label: "Name", render: (d) => d.name },
      { id: "id", label: "ID", render: (d) => <span className="dim">{d.id}</span> },
      {
        id: "entries",
        label: "Entries",
        width: "72px",
        render: (d) => d.entries?.length ?? 0,
      },
    ],
    [],
  );

  return (
    <CatalogEditorShell
      listTitle="Drop pools"
      items={drops}
      columns={columns}
      searchPlaceholder="Search drop pools…"
      getSearchText={(d) => `${d.name} ${d.id}`}
      selectedId={editor.selectedId}
      onSelect={editor.setSelectedId}
      draft={editor.draft}
      dirty={editor.dirty}
      status={status}
      error={error}
      emptyHint="No drop pools yet. Create one or seed with npm run seed:content."
      onNew={editor.createNew}
      onSave={editor.saveDraft}
      onDelete={editor.deleteSelected}
      onDraftChange={editor.setDraft}
      detailSections={(draft, onChange) => [
        {
          id: "core",
          label: "Pool",
          content: (
            <>
              <label className="field-label">Name</label>
              <input
                className="cm-input"
                value={draft.name}
                onChange={(e) => onChange({ ...draft, name: e.target.value })}
              />
              <label className="field-label">ID</label>
              <input
                className="cm-input"
                value={draft.id}
                onChange={(e) => onChange({ ...draft, id: e.target.value.trim() })}
              />
            </>
          ),
        },
        {
          id: "entries",
          label: "Entries",
          content: (
            <DropEntriesEditor
              entries={draft.entries ?? []}
              items={items}
              onChange={(entries) => onChange({ ...draft, entries })}
            />
          ),
        },
      ]}
    />
  );
}

function DropEntriesEditor({
  entries,
  items,
  onChange,
}: {
  entries: DropPoolDef["entries"];
  items: ItemDef[];
  onChange: (entries: DropPoolDef["entries"]) => void;
}) {
  const patch = (index: number, next: Partial<DropPoolDef["entries"][number]>) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, ...next } : e)));
  };

  return (
    <div className="map-editor-encounter-list">
      {entries.map((entry, i) => (
        <div key={`${entry.item_id}-${i}`} className="map-editor-encounter-row">
          <label className="field-label">Item</label>
          <ContentIdSelect
            value={entry.item_id}
            onChange={(item_id) => patch(i, { item_id })}
            options={items}
            emptyLabel="— pick item —"
          />
          <label className="field-label">Chance %</label>
          <input
            className="cm-input"
            type="number"
            min={0}
            max={100}
            value={entry.chance}
            onChange={(e) => patch(i, { chance: parseInt(e.target.value, 10) || 0 })}
          />
          <button
            type="button"
            className="cm-btn"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="cm-btn"
        onClick={() => onChange([...entries, { item_id: items[0]?.id ?? "potion", chance: 25 }])}
      >
        Add entry
      </button>
    </div>
  );
}
