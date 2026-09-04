import { useMemo, useState } from "react";
import type { EditorObject } from "../editor/editorTypes";
import { objectColor } from "../editor/editorCanvasUtils";
import { objectsMatch } from "../editor/objectProps";
import {
  buildRegionHierarchy,
  hierarchyChildKindLabel,
  hierarchyChildLabel,
  isSanctuaryRegion,
  type HierarchyChild,
} from "../editor/hierarchyTree";
import { objectDisplayName, objectKey, OBJECT_TYPE_LABELS } from "../editor/sceneCatalog";

interface Props {
  objects: EditorObject[];
  selected: EditorObject | null;
  onSelect: (obj: EditorObject | null) => void;
  onDelete: (obj: EditorObject) => void;
}

export function MapEditorHierarchy({ objects, selected, onSelect, onDelete }: Props) {
  const tree = useMemo(() => buildRegionHierarchy(objects), [objects]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const toggleRegion = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const objectCount = objects.length;

  return (
    <div className="map-editor-hierarchy cm-window">
      <div className="cm-titlebar">
        <span className="cm-title">Hierarchy</span>
        <span className="map-editor-hierarchy-count dim">{objectCount}</span>
      </div>
      <div className="cm-body map-editor-hierarchy-body">
        {objects.length === 0 && <p className="dim map-editor-hierarchy-empty">No scene objects</p>}
        {tree.regions.map((node) => {
          const key = objectKey(node.region);
          const isCollapsed = collapsed.has(key);
          const regionSel = selected != null && objectsMatch(selected, node.region);
          const regionLabel = isSanctuaryRegion(node.region)
            ? OBJECT_TYPE_LABELS.sanctuary
            : OBJECT_TYPE_LABELS.region;
          const regionTooltip = `${regionLabel}: ${objectDisplayName(node.region)}`;
          return (
            <div key={key} className="map-editor-hierarchy-region">
              <div className={`map-editor-hierarchy-item ${regionSel ? "on" : ""}`}>
                <button
                  type="button"
                  className="map-editor-hierarchy-toggle"
                  onClick={() => toggleRegion(key)}
                  aria-label={isCollapsed ? "Expand" : "Collapse"}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
                <button
                  type="button"
                  className="map-editor-hierarchy-select"
                  title={regionTooltip}
                  onClick={() => onSelect(node.region)}
                >
                  <span
                    className="map-editor-hierarchy-dot"
                    style={{ background: objectColor(isSanctuaryRegion(node.region) ? "sanctuary" : node.region.type) }}
                  />
                  <span className="map-editor-hierarchy-name">{objectDisplayName(node.region)}</span>
                </button>
                <button
                  type="button"
                  className="cm-btn map-editor-hierarchy-delete"
                  title="Delete"
                  onClick={() => onDelete(node.region)}
                >
                  ×
                </button>
              </div>
              {!isCollapsed && node.children.length > 0 && (
                <div className="map-editor-hierarchy-children">
                  {node.children.map((child) => (
                    <HierarchyChildRow
                      key={`${key}:${child.kind}:${objectKey(child.obj)}`}
                      child={child}
                      selected={selected}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {tree.unassigned.map((child) => (
          <HierarchyChildRow
            key={`unassigned:${child.kind}:${objectKey(child.obj)}`}
            child={child}
            selected={selected}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function HierarchyChildRow({
  child,
  selected,
  onSelect,
  onDelete,
}: {
  child: HierarchyChild;
  selected: EditorObject | null;
  onSelect: (obj: EditorObject | null) => void;
  onDelete: (obj: EditorObject) => void;
}) {
  const isSel = selected != null && objectsMatch(selected, child.obj);
  const colorType =
    child.kind === "sanctuary"
      ? "sanctuary"
      : child.kind === "save_point"
        ? "save_point"
        : child.kind === "npc"
          ? child.obj.type
          : "exit";

  const label = hierarchyChildLabel(child);
  const tooltip = hierarchyTooltip(child);

  return (
    <div className={`map-editor-hierarchy-item map-editor-hierarchy-item--child ${isSel ? "on" : ""}`}>
      <button type="button" className="map-editor-hierarchy-select" title={tooltip} onClick={() => onSelect(child.obj)}>
        <span className="map-editor-hierarchy-dot" style={{ background: objectColor(colorType) }} />
        <span className="map-editor-hierarchy-name">{label}</span>
      </button>
      <button type="button" className="cm-btn map-editor-hierarchy-delete" title="Delete" onClick={() => onDelete(child.obj)}>
        ×
      </button>
    </div>
  );
}

function hierarchyTooltip(child: HierarchyChild): string {
  const kind = hierarchyChildKindLabel(child.kind);
  const name = hierarchyChildLabel(child);
  if (child.kind === "npc") {
    const typeLabel = OBJECT_TYPE_LABELS[child.obj.type] ?? child.obj.type;
    return `${kind} · ${typeLabel}: ${name}`;
  }
  return `${kind}: ${name}`;
}
