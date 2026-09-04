import { useMemo } from "react";
import { useCatalogEditor } from "../editor/catalogEditorHooks";
import { persistItems, type ItemDef } from "../editor/contentStore";
import { createDefaultItem } from "../editor/itemCatalogHelpers";
import { ITEM_KINDS } from "../editor/gameContentTypes";
import {
  CatalogEditorShell,
  type CatalogTableColumn,
  type CatalogTableFilter,
} from "./CatalogEditorShell";
import { ConsumableModuleForm, EquipmentModuleForm, ItemCoreForm } from "./ItemsEditorForm";

interface Props {
  items: ItemDef[];
  onItemsChange: (items: ItemDef[]) => void;
  status: string | null;
  error: string | null;
  onStatus: (status: string | null) => void;
}

function itemDetailLabel(item: ItemDef): string {
  if (item.kind === "consumable") return item.target ?? "—";
  if (item.slot === "weapon" || item.slot === "sub_weapon") return item.weapon_type ?? item.slot;
  return item.slot ?? "—";
}

export function ItemsEditorPage({ items, onItemsChange, status, error, onStatus }: Props) {
  const editor = useCatalogEditor(items, onItemsChange, persistItems, onStatus, () => createDefaultItem("consumable"));

  const columns: CatalogTableColumn<ItemDef>[] = useMemo(
    () => [
      { id: "name", label: "Name", render: (i) => i.name },
      { id: "id", label: "ID", render: (i) => <span className="dim">{i.id}</span> },
      { id: "kind", label: "Kind", render: (i) => ITEM_KINDS.find((k) => k.id === i.kind)?.label ?? i.kind },
      { id: "detail", label: "Slot / target", render: (i) => itemDetailLabel(i) },
      {
        id: "rarity",
        label: "Rarity",
        width: "72px",
        render: (i) => (i.kind === "equipment" ? i.rarity ?? "—" : "—"),
      },
      {
        id: "level",
        label: "Lv",
        width: "40px",
        render: (i) => (i.kind === "equipment" ? (i.level ?? "—") : "—"),
      },
    ],
    [],
  );

  const filters: CatalogTableFilter<ItemDef>[] = useMemo(
    () => [
      {
        id: "kind",
        label: "Kind",
        options: ITEM_KINDS,
        match: (i, v) => i.kind === v,
      },
    ],
    [],
  );

  return (
    <CatalogEditorShell
      listTitle="Items"
      items={items}
      columns={columns}
      filters={filters}
      searchPlaceholder="Search items…"
      getSearchText={(i) => `${i.name} ${i.id} ${i.description ?? ""}`}
      selectedId={editor.selectedId}
      onSelect={editor.setSelectedId}
      draft={editor.draft}
      dirty={editor.dirty}
      status={status}
      error={error}
      emptyHint="No items yet. Create one to get started."
      onNew={editor.createNew}
      onSave={editor.saveDraft}
      onDelete={editor.deleteSelected}
      onDraftChange={editor.setDraft}
      detailSections={(draft, onChange) => [
        {
          id: "core",
          label: "Core",
          content: <ItemCoreForm draft={draft} onChange={onChange} />,
        },
        {
          id: "module",
          label: draft.kind === "equipment" ? "Equipment" : "Consumable",
          content:
            draft.kind === "consumable" ? (
              <ConsumableModuleForm draft={draft} onChange={onChange} />
            ) : (
              <EquipmentModuleForm draft={draft} onChange={onChange} />
            ),
        },
      ]}
    />
  );
}
