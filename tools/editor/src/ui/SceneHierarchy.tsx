import { useMemo, useState, type DragEvent } from "react";
import { childrenByParent, type SceneObject } from "../../../../wails/frontend/src/three/scene3d";
import { PREFAB_BY_ID } from "../../../../wails/frontend/src/three/prefabs";
import { useSceneStore, type SceneStore } from "../scene3d/store";

const OBJECT_MIME = "application/x-scene3d-object";
type DropZone = "before" | "into" | "after";

const ICONS: Record<string, string> = { Buildings: "⌂", Nature: "❦", Landmarks: "✦", Primitives: "◼", Lights: "☼", Utility: "◇" };

/** Unity-style hierarchy: nested tree, click/shift-click select, eye toggle,
 * drag onto a row to parent, drag to a row's top/bottom edge to reorder. */
export function SceneHierarchy({ store }: { store: SceneStore }) {
  const doc = useSceneStore(store, s => s.doc);
  const selection = useSceneStore(store, s => s.selection);
  const terrainSelected = useSceneStore(store, s => s.terrainSelected);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drop, setDrop] = useState<{ id: string; zone: DropZone } | null>(null);
  const kids = useMemo(() => childrenByParent(doc), [doc]);
  const query = search.trim().toLowerCase();

  const toggle = (id: string) => setCollapsed(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const zoneOf = (e: DragEvent<HTMLElement>): DropZone => {
    const r = e.currentTarget.getBoundingClientRect(), t = (e.clientY - r.top) / r.height;
    return t < .25 ? "before" : t > .75 ? "after" : "into";
  };
  const onDrop = (e: DragEvent<HTMLElement>, target: string | null) => {
    e.preventDefault(); e.stopPropagation();
    const id = e.dataTransfer.getData(OBJECT_MIME);
    setDrop(null);
    if (!id) return;
    if (target === null) { store.reparent(id, null); return; }
    const zone = zoneOf(e);
    if (zone === "into") store.reparent(id, target); else store.reorder(id, target, zone === "after");
  };

  // Searching flattens the tree to matches; otherwise walk respecting collapsed nodes.
  const visible: { o: SceneObject; depth: number }[] = [];
  if (query) {
    for (const o of doc.objects) if (o.name.toLowerCase().includes(query) || o.prefab.includes(query)) visible.push({ o, depth: 0 });
  } else {
    const walk = (parent: string, depth: number) => {
      for (const o of kids.get(parent) ?? []) {
        visible.push({ o, depth });
        if (!collapsed.has(o.id)) walk(o.id, depth + 1);
      }
    };
    walk("", 0);
  }

  return (
    <>
      <div className="ed-dock-title">Hierarchy <span>{doc.objects.length}</span></div>
      <div className="ed-search"><input aria-label="Search objects" placeholder="Search objects…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="ed-tree sc-tree" onDragOver={e => { if (e.dataTransfer.types.includes(OBJECT_MIME)) e.preventDefault(); }} onDrop={e => onDrop(e, null)} onClick={e => { if (e.target === e.currentTarget) store.select([]); }}>
        <div className="ed-tree-root">▾ <strong>{doc.map || "scene"}</strong></div>
        {!query && (
          <div
            className={`ed-tree-item sc-tree-item ${terrainSelected ? "selected" : ""}`}
            role="treeitem"
            aria-selected={terrainSelected}
            onClick={() => store.selectTerrain()}
          >
            <span className="sc-tree-caret" style={{ visibility: "hidden" }} />
            <span className="ed-bone-icon" title="Terrain">▲</span>
            <span className="sc-tree-name">Terrain</span>
          </div>
        )}
        {visible.map(({ o, depth }) => {
          const hasKids = (kids.get(o.id)?.length ?? 0) > 0;
          const selected = selection.includes(o.id);
          const def = PREFAB_BY_ID.get(o.prefab);
          return (
            <div
              key={o.id}
              className={`ed-tree-item sc-tree-item ${selected ? "selected" : ""} ${drop?.id === o.id ? `drop-${drop.zone}` : ""} ${o.visible ? "" : "hidden"}`}
              style={{ paddingLeft: 8 + Math.min(depth, 8) * 14 }}
              role="treeitem"
              aria-selected={selected}
              draggable
              onDragStart={e => { e.dataTransfer.setData(OBJECT_MIME, o.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={e => { if (!e.dataTransfer.types.includes(OBJECT_MIME)) return; e.preventDefault(); e.stopPropagation(); const zone = zoneOf(e); if (drop?.id !== o.id || drop.zone !== zone) setDrop({ id: o.id, zone }); }}
              onDragLeave={() => setDrop(d => (d?.id === o.id ? null : d))}
              onDrop={e => onDrop(e, o.id)}
              onClick={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) store.toggleSelect(o.id); else store.select([o.id]); }}
              onDoubleClick={() => { store.select([o.id]); store.requestFrame(); }}
            >
              <button className="sc-tree-caret" aria-label={collapsed.has(o.id) ? "Expand" : "Collapse"} style={{ visibility: hasKids ? "visible" : "hidden" }} onClick={e => { e.stopPropagation(); toggle(o.id); }}>{collapsed.has(o.id) ? "▸" : "▾"}</button>
              <span className="ed-bone-icon" title={def?.label ?? o.prefab}>{ICONS[def?.category ?? "Utility"] ?? "◇"}</span>
              <span className="sc-tree-name" title={o.prefabInstance?`Linked prefab: ${o.prefabInstance.assetId}`:undefined}>{o.prefabInstance?'◆ ':''}{o.name}{o.prefabInstance?.overrides.length?' *':''}</span>
              <button className="sc-tree-eye" aria-label={o.visible ? "Hide" : "Show"} aria-pressed={!o.visible} onClick={e => { e.stopPropagation(); store.patchObject(o.id, { visible: !o.visible }); }}>{o.visible ? "◉" : "◌"}</button>
            </div>
          );
        })}
        {!visible.length && <p className="ed-empty">{doc.objects.length ? "No matches" : "Drag prefabs from Project into the Scene"}</p>}
      </div>
    </>
  );
}
