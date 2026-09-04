import { useEffect, useState } from "react";
import type { EditorObject } from "../editor/editorTypes";
import { propNumber, propString, setProp } from "../editor/editorTypes";
import { isNpcEntity, normalizeNpcObject } from "../editor/npcEntity";
import { OBJECT_TYPE_LABELS } from "../editor/sceneCatalog";
import type { AdminMapInfo } from "../net/adminMaps";
import type { DropPoolDef, ItemDef, QuestDef } from "../editor/contentStore";
import type { ImportedTileset } from "../editor/tilesetConfig";
import { EntityTypeInspector, usesEntityTypeInspector } from "./EntityTypeInspector";
import { MapServerInspector } from "./MapServerInspector";
import { TransitionDestPicker } from "./TransitionDestPicker";

interface Props {
  obj: EditorObject | null;
  maps: AdminMapInfo[];
  currentMapId: string;
  tileset: ImportedTileset | null;
  onUpdate: (obj: EditorObject) => void;
  onDelete: () => void;
  prefabSettings?: {
    name: string;
    width: number;
    height: number;
    onName: (n: string) => void;
    onResize: (w: number, h: number) => void;
  };
  entitySettings?: {
    name: string;
    onName: (n: string) => void;
  };
  /** Entity template editor — hides map-only fields. */
  templateMode?: boolean;
  items?: ItemDef[];
  quests?: QuestDef[];
  drops?: DropPoolDef[];
  /** When no object is selected, show map server options for the current map. */
  onServerApplied?: () => void;
  onServerStatus?: (msg: string | null) => void;
  onServerError?: (msg: string | null) => void;
}

export function MapEditorInspector({
  obj,
  maps,
  currentMapId,
  tileset,
  onUpdate,
  onDelete,
  prefabSettings,
  entitySettings,
  templateMode,
  items,
  quests,
  drops,
  onServerApplied,
  onServerStatus,
  onServerError,
}: Props) {
  if (prefabSettings && !obj) {
    return <PrefabInspector settings={prefabSettings} />;
  }

  if (!obj) {
    return (
      <div className="map-editor-inspector-panel cm-window">
        <div className="cm-titlebar">
          <span className="cm-title">Inspector</span>
        </div>
        <div className="cm-body map-editor-inspector-body">
          {entitySettings ? (
            <div className="map-editor-inspector">
              <div className="map-editor-group-label">Entity</div>
              <label className="field-label">Template name</label>
              <input className="cm-input" value={entitySettings.name} onChange={(e) => entitySettings.onName(e.target.value)} />
            </div>
          ) : currentMapId && !templateMode ? (
            <MapServerInspector
              mapId={currentMapId}
              onApplied={onServerApplied}
              onStatus={onServerStatus}
              onError={onServerError}
            />
          ) : (
            <p className="dim map-editor-inspector-empty">Select an object in the scene or hierarchy.</p>
          )}
        </div>
      </div>
    );
  }

  const patch = (next: Partial<EditorObject>) => {
    const merged = { ...obj, ...next };
    onUpdate(isNpcEntity(merged) ? normalizeNpcObject(merged) : merged);
  };
  const patchProp = (name: string, type: string, value: string | number | boolean) =>
    patch({ properties: setProp(obj.properties, name, type, value) });

  const typeLabel = OBJECT_TYPE_LABELS[obj.type] ?? obj.type;

  return (
    <div className="map-editor-inspector-panel cm-window">
      <div className="cm-titlebar">
        <span className="cm-title">Inspector</span>
      </div>
      {!entitySettings && (
        <div className="map-editor-panel-toolbar">
          <button type="button" className="cm-btn danger wide" onClick={onDelete}>
            Delete object
          </button>
        </div>
      )}
      <div className="cm-body map-editor-inspector-body">
        <div className="map-editor-inspector">
          {entitySettings && (
            <>
              <div className="map-editor-group-label">Entity template</div>
              <label className="field-label">Template name</label>
              <input className="cm-input" value={entitySettings.name} onChange={(e) => entitySettings.onName(e.target.value)} />
            </>
          )}

          {usesEntityTypeInspector(obj) ? (
            <EntityTypeInspector
              obj={obj}
              onUpdate={onUpdate}
              templateMode={templateMode}
              items={items}
              quests={quests}
              drops={drops}
            />
          ) : (
            <>
              <div className="map-editor-group-label">{typeLabel}</div>
              <label className="field-label">Object name</label>
              <input className="cm-input" value={obj.name} onChange={(e) => patch({ name: e.target.value })} />

              {obj.type === "save_point" && (
                <>
                  <label className="field-label">Crystal name</label>
                  <input
                    className="cm-input"
                    value={propString(obj.properties, "name")}
                    onChange={(e) => patchProp("name", "string", e.target.value)}
                  />
                  <label className="field-label">Unique ID</label>
                  <input className="cm-input" value={propString(obj.properties, "id", obj.name)} readOnly disabled />
                </>
              )}

              {obj.type === "exit" && (
                <>
                  <label className="field-label">Destination map</label>
                  <select
                    className="cm-input"
                    value={propString(obj.properties, "destMap")}
                    onChange={(e) => patchProp("destMap", "string", e.target.value)}
                  >
                    <option value="">— select map —</option>
                    {maps
                      .filter((m) => m.id !== currentMapId)
                      .map((m) => (
                        <option key={m.id} value={m.id} disabled={m.enabled === false}>
                          {m.name}
                          {m.enabled === false ? " (disabled)" : ""}
                        </option>
                      ))}
                  </select>
                  <label className="field-label">Spawn position</label>
                  <TransitionDestPicker
                    maps={maps}
                    destMapId={propString(obj.properties, "destMap")}
                    destX={propNumber(obj.properties, "destX", 100)}
                    destY={propNumber(obj.properties, "destY", 100)}
                    tileset={tileset}
                    onPick={(_mapId, x, y) => {
                      let props = setProp(obj.properties, "destX", "float", x);
                      props = setProp(props, "destY", "float", y);
                      onUpdate({ ...obj, properties: props });
                    }}
                  />
                </>
              )}

              {obj.type === "region" && (
                <>
                  <label className="field-label">Unique ID</label>
                  <input className="cm-input" value={propString(obj.properties, "id", obj.name)} readOnly disabled />
                  <label className="field-label">Kind</label>
                  <input
                    className="cm-input"
                    value={propString(obj.properties, "kind", "wilderness")}
                    onChange={(e) => patchProp("kind", "string", e.target.value)}
                  />
                </>
              )}

              {obj.type === "sanctuary" && (
                <>
                  <label className="field-label">Unique ID</label>
                  <input className="cm-input" value={propString(obj.properties, "id", obj.name)} readOnly disabled />
                  <label className="field-label">Display name</label>
                  <input
                    className="cm-input"
                    value={propString(obj.properties, "name")}
                    onChange={(e) => patchProp("name", "string", e.target.value)}
                  />
                  <label className="field-label">Kind</label>
                  <input
                    className="cm-input"
                    value={propString(obj.properties, "kind", "camp")}
                    onChange={(e) => patchProp("kind", "string", e.target.value)}
                  />
                </>
              )}
            </>
          )}

          {!obj.point && (
            <p className="dim map-editor-inspector-meta">
              {obj.polygon && obj.polygon.length >= 3
                ? `Polygon: ${obj.polygon.length} verts · bounds ${Math.round(obj.width)}×${Math.round(obj.height)}`
                : `Bounds: ${Math.round(obj.width)}×${Math.round(obj.height)} at (${Math.round(obj.x)}, ${Math.round(obj.y)})`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PrefabInspector({
  settings,
}: {
  settings: {
    name: string;
    width: number;
    height: number;
    onName: (n: string) => void;
    onResize: (w: number, h: number) => void;
  };
}) {
  const [w, setW] = useState(String(settings.width));
  const [h, setH] = useState(String(settings.height));
  useEffect(() => {
    setW(String(settings.width));
    setH(String(settings.height));
  }, [settings.width, settings.height]);

  return (
    <div className="map-editor-inspector-panel cm-window">
      <div className="cm-titlebar">
        <span className="cm-title">Inspector</span>
      </div>
      <div className="map-editor-panel-toolbar">
        <button
          type="button"
          className="cm-btn gold wide"
          onClick={() => settings.onResize(parseInt(w, 10) || 1, parseInt(h, 10) || 1)}
        >
          Apply size
        </button>
      </div>
      <div className="cm-body map-editor-inspector-body">
        <div className="map-editor-inspector">
          <div className="map-editor-group-label">Prefab</div>
          <label className="field-label">Name</label>
          <input className="cm-input" value={settings.name} onChange={(e) => settings.onName(e.target.value)} />
          <label className="field-label">Size (tiles)</label>
          <div className="map-editor-prefab-size">
            <input className="cm-input" type="number" min={1} max={128} value={w} onChange={(e) => setW(e.target.value)} />
            <span>×</span>
            <input className="cm-input" type="number" min={1} max={128} value={h} onChange={(e) => setH(e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
