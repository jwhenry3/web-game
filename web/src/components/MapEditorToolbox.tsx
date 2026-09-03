import { useEffect, useState } from "react";
import type { EditorTool } from "../editor/editorTypes";
import { isMapPlaceTool } from "../editor/editorCanvasUtils";
import type { EntityDefinition } from "../editor/entities";
import {
  ENTITY_KIND_LABELS,
  MAP_ENTITY_PLACEMENT_ENTRIES,
  MAP_REGION_PLACEMENT_ENTRIES,
  groupEntitiesByKind,
  isEntityTemplateKind,
} from "../editor/entityCatalog";
import type { MapPrefab } from "../editor/prefabs";
import { createEmptyPrefab, savePrefabs } from "../editor/prefabs";
import { TERRAIN_COLORS } from "../editor/tilePalette";
import type { EditorInteractMode, ToolboxTab } from "../editor/sceneCatalog";
import type { ImportedTileset } from "../editor/tilesetConfig";
import { MapEditorTilesetPanel, MapEditorTilesetToolbar } from "./MapEditorTilesetPanel";

interface Props {
  tool: EditorTool;
  onTool: (t: EditorTool) => void;
  scope: "map" | "prefab";
  /** Prefab editor local tabs. Ignored when interactMode is set for map scope. */
  tab: ToolboxTab;
  onTab: (t: ToolboxTab) => void;
  /** Map-scope interaction mode from the scene toolbar. */
  interactMode?: EditorInteractMode;
  tileset: ImportedTileset | null;
  onTilesetChange: (ts: ImportedTileset | null) => void;
  selectedTileIndex: number | null;
  onSelectTileIndex: (i: number | null) => void;
  prefabs: MapPrefab[];
  onPrefabsChange: (p: MapPrefab[]) => void;
  activePrefabId: string | null;
  editingPrefabId: string | null;
  onActivePrefab: (id: string | null) => void;
  onEditPrefab: (id: string, prefab?: MapPrefab) => void;
  stampMode: boolean;
  onCaptureMode: () => void;
  capturing: boolean;
  entities: EntityDefinition[];
  activeEntityId: string | null;
  onActiveEntity: (id: string | null) => void;
  entityStampMode: boolean;
  onRequestNewEntity?: () => void;
}

export function MapEditorToolbox({
  tool,
  onTool,
  scope,
  tab,
  onTab,
  interactMode,
  tileset,
  onTilesetChange,
  selectedTileIndex,
  onSelectTileIndex,
  prefabs,
  onPrefabsChange,
  activePrefabId,
  editingPrefabId,
  onActivePrefab,
  onEditPrefab,
  stampMode,
  onCaptureMode,
  capturing,
  entities,
  activeEntityId,
  onActiveEntity,
  entityStampMode,
  onRequestNewEntity,
}: Props) {
  const mapMode = scope === "map" ? interactMode ?? "entity" : null;
  const prefabTab: ToolboxTab = tab === "prefabs" ? "terrain" : tab === "region" ? "entities" : tab;

  return (
    <div className="map-editor-toolbox xiv-window">
      <div className="xiv-titlebar">
        <span className="xiv-title">Toolbox</span>
      </div>

      {scope === "prefab" && (
        <div className="map-editor-toolbox-tabs">
          <button
            type="button"
            className={`map-editor-toolbox-tab ${prefabTab === "terrain" ? "on" : ""}`}
            onClick={() => onTab("terrain")}
          >
            Terrain
          </button>
          <button
            type="button"
            className={`map-editor-toolbox-tab ${prefabTab === "entities" ? "on" : ""}`}
            onClick={() => onTab("entities")}
          >
            Place
          </button>
        </div>
      )}

      {scope === "map" && mapMode === "entity" && (
        <div className="map-editor-toolbox-tabs">
          <button
            type="button"
            className={`map-editor-toolbox-tab ${tab === "entities" ? "on" : ""}`}
            onClick={() => onTab("entities")}
          >
            Place
          </button>
          <button
            type="button"
            className={`map-editor-toolbox-tab ${tab === "prefabs" ? "on" : ""}`}
            onClick={() => onTab("prefabs")}
          >
            Prefabs
          </button>
        </div>
      )}

      <div className="map-editor-toolbox-body">
        {((scope === "map" && mapMode === "terrain") || (scope === "prefab" && prefabTab === "terrain")) && (
          <TerrainTools
            tool={tool}
            onTool={onTool}
            tileset={tileset}
            onTilesetChange={onTilesetChange}
            selectedTileIndex={selectedTileIndex}
            onSelectTileIndex={onSelectTileIndex}
            showTileset={scope === "map"}
          />
        )}

        {scope === "map" && mapMode === "region" && <RegionTools tool={tool} onTool={onTool} />}

        {scope === "map" && mapMode === "entity" && tab === "prefabs" && (
          <PrefabsTab
            prefabs={prefabs}
            onPrefabsChange={onPrefabsChange}
            activePrefabId={activePrefabId}
            editingPrefabId={editingPrefabId}
            onActivePrefab={onActivePrefab}
            onEditPrefab={onEditPrefab}
            stampMode={stampMode}
            onCaptureMode={onCaptureMode}
            capturing={capturing}
            tileset={tileset}
          />
        )}

        {((scope === "map" && mapMode === "entity" && tab === "entities") ||
          (scope === "prefab" && prefabTab === "entities")) && (
          <PlaceEntitiesTab
            tool={tool}
            onTool={onTool}
            entities={entities}
            activeEntityId={activeEntityId}
            onActiveEntity={onActiveEntity}
            entityStampMode={entityStampMode}
            onRequestNewEntity={onRequestNewEntity}
            includeMarkers={scope === "map"}
          />
        )}
      </div>
    </div>
  );
}

function TerrainTools({
  tool,
  onTool,
  tileset,
  onTilesetChange,
  selectedTileIndex,
  onSelectTileIndex,
  showTileset,
}: {
  tool: EditorTool;
  onTool: (t: EditorTool) => void;
  tileset: ImportedTileset | null;
  onTilesetChange: (ts: ImportedTileset | null) => void;
  selectedTileIndex: number | null;
  onSelectTileIndex: (i: number | null) => void;
  showTileset: boolean;
}) {
  return (
    <div className="map-editor-panel-stack">
      {showTileset && (
        <div className="map-editor-panel-toolbar">
          <MapEditorTilesetToolbar tileset={tileset} onChange={onTilesetChange} onSelectTile={onSelectTileIndex} />
        </div>
      )}
      <div className="map-editor-panel-scroll">
        <button type="button" className={`xiv-btn wide ${tool === "select" ? "on" : ""}`} onClick={() => onTool("select")}>
          Select (V)
        </button>
        <div className="map-editor-group-label">Paint terrain</div>
        <div className="map-editor-tool-list">
          <TerrainBtn tool={tool} id="terrain_grass" label="Grass" color={TERRAIN_COLORS.grass} onTool={onTool} />
          <TerrainBtn tool={tool} id="terrain_dirt" label="Dirt" color={TERRAIN_COLORS.dirt} onTool={onTool} />
          <TerrainBtn tool={tool} id="terrain_cliff" label="Cliff" color={TERRAIN_COLORS.cliff} onTool={onTool} />
          <TerrainBtn tool={tool} id="terrain_cobble" label="Cobble" color={TERRAIN_COLORS.cobble} onTool={onTool} />
          <TerrainBtn tool={tool} id="terrain_water" label="Water" color={TERRAIN_COLORS.water} onTool={onTool} />
          <TerrainBtn tool={tool} id="terrain_erase" label="Erase" color={TERRAIN_COLORS.empty} onTool={onTool} />
        </div>
        <div className="map-editor-group-label">Collision</div>
        <div className="map-editor-tool-list">
          <button
            type="button"
            className={`xiv-btn map-editor-tool-btn ${tool === "collision_block" ? "on" : ""}`}
            onClick={() => onTool("collision_block")}
          >
            <span className="map-editor-swatch" style={{ background: TERRAIN_COLORS.collision }} />
            Block
          </button>
          <button
            type="button"
            className={`xiv-btn map-editor-tool-btn ${tool === "collision_walk" ? "on" : ""}`}
            onClick={() => onTool("collision_walk")}
          >
            Walkable
          </button>
        </div>
        {showTileset && (
          <MapEditorTilesetPanel
            tileset={tileset}
            onChange={onTilesetChange}
            selectedTileIndex={selectedTileIndex}
            onSelectTile={onSelectTileIndex}
          />
        )}
      </div>
    </div>
  );
}

function TerrainBtn({
  tool,
  id,
  label,
  color,
  onTool,
}: {
  tool: EditorTool;
  id: EditorTool;
  label: string;
  color: string;
  onTool: (t: EditorTool) => void;
}) {
  return (
    <button type="button" className={`xiv-btn map-editor-tool-btn ${tool === id ? "on" : ""}`} onClick={() => onTool(id)}>
      <span className="map-editor-swatch" style={{ background: color }} />
      {label}
    </button>
  );
}

function RegionTools({ tool, onTool }: { tool: EditorTool; onTool: (t: EditorTool) => void }) {
  return (
    <div className="map-editor-panel-stack">
      <div className="map-editor-panel-scroll">
        <button type="button" className={`xiv-btn wide ${tool === "select" ? "on" : ""}`} onClick={() => onTool("select")}>
          Select (V)
        </button>
        <div className="map-editor-group-label">Regions</div>
        <div className="map-editor-tool-list map-editor-place-tools">
          {MAP_REGION_PLACEMENT_ENTRIES.map((entry) => (
            <button
              key={entry.tool}
              type="button"
              data-map-editor-keep-placement=""
              className={`xiv-btn wide ${tool === entry.tool ? "on" : ""}`}
              title={entry.hint}
              onClick={() => onTool(entry.tool)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {(tool === "region" || tool === "sanctuary") && (
          <p className="dim map-editor-place-hint">
            Click tile corners to add vertices · Click first point / Enter / double-click to close · Esc cancel
          </p>
        )}
        {tool === "portal" && (
          <p className="dim map-editor-place-hint">Drag on the map to place · Esc to cancel</p>
        )}
      </div>
    </div>
  );
}

function PlaceEntitiesTab({
  tool,
  onTool,
  entities,
  activeEntityId,
  onActiveEntity,
  entityStampMode,
  onRequestNewEntity,
  includeMarkers,
}: {
  tool: EditorTool;
  onTool: (t: EditorTool) => void;
  entities: EntityDefinition[];
  activeEntityId: string | null;
  onActiveEntity: (id: string | null) => void;
  entityStampMode: boolean;
  onRequestNewEntity?: () => void;
  includeMarkers: boolean;
}) {
  type PlaceSubTab = "markers" | "npcs" | "quests" | "items";
  const placeTabs: { id: PlaceSubTab; label: string }[] = includeMarkers
    ? [
        { id: "markers", label: "Markers" },
        { id: "npcs", label: "NPCs" },
        { id: "quests", label: "Quests" },
        { id: "items", label: "Items" },
      ]
    : [
        { id: "npcs", label: "NPCs" },
        { id: "quests", label: "Quests" },
        { id: "items", label: "Items" },
      ];

  const [placeTab, setPlaceTab] = useState<PlaceSubTab>(includeMarkers ? "markers" : "npcs");
  const templateEntities = entities.filter((e) => isEntityTemplateKind(e.kind));
  const byKind = groupEntitiesByKind(templateEntities);

  useEffect(() => {
    if (!placeTabs.some((t) => t.id === placeTab)) {
      setPlaceTab(placeTabs[0]!.id);
    }
  }, [includeMarkers]);

  const libraryKinds =
    placeTab === "npcs"
      ? (["npc_combat", "npc_service"] as const)
      : placeTab === "quests"
        ? (["quest_trigger"] as const)
        : placeTab === "items"
          ? (["item"] as const)
          : [];

  const libraryList = libraryKinds.flatMap((k) => byKind.get(k) ?? []);
  const markerTools = placeTab === "markers" ? MAP_ENTITY_PLACEMENT_ENTRIES : [];

  return (
    <div className="map-editor-panel-stack">
      <div className="map-editor-place-tabs">
        {placeTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`map-editor-place-tab ${placeTab === t.id ? "on" : ""}`}
            onClick={() => setPlaceTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {onRequestNewEntity && (
        <div className="map-editor-panel-toolbar">
          <button type="button" className="xiv-btn gold wide" onClick={onRequestNewEntity}>
            New entity…
          </button>
        </div>
      )}

      <div className="map-editor-panel-scroll">
        {markerTools.length > 0 && (
          <>
            <div className="map-editor-tool-list map-editor-place-tools">
              {markerTools.map((entry) => (
                <button
                  key={entry.tool}
                  type="button"
                  data-map-editor-keep-placement=""
                  className={`xiv-btn wide ${tool === entry.tool ? "on" : ""}`}
                  title={entry.hint}
                  onClick={() => onTool(entry.tool)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            {isMapPlaceTool(tool) && (
              <p className="dim map-editor-place-hint">Click the map to place · Esc or click UI to cancel</p>
            )}
          </>
        )}

        {libraryKinds.length > 0 && (
          <>
            {libraryList.length === 0 ? (
              <p className="dim map-editor-place-empty">No templates in this category.</p>
            ) : (
              <div className="map-editor-place-library">
                {libraryList.map((ent) => (
                  <button
                    key={ent.id}
                    type="button"
                    data-map-editor-keep-placement=""
                    className={`xiv-btn wide map-editor-prefab-item ${activeEntityId === ent.id && entityStampMode ? "on" : ""}`}
                    onClick={() => onActiveEntity(ent.id)}
                  >
                    <span>{ent.name}</span>
                    <span className="dim">{ENTITY_KIND_LABELS[ent.kind]}</span>
                  </button>
                ))}
              </div>
            )}
            {entityStampMode && activeEntityId && libraryList.some((e) => e.id === activeEntityId) && (
              <p className="dim map-editor-place-hint">Click the map to place · Esc or click UI to cancel</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PrefabsTab({
  prefabs,
  onPrefabsChange,
  activePrefabId,
  editingPrefabId,
  onActivePrefab,
  onEditPrefab,
  stampMode,
  onCaptureMode,
  capturing,
  tileset,
}: {
  prefabs: MapPrefab[];
  onPrefabsChange: (p: MapPrefab[]) => void;
  activePrefabId: string | null;
  editingPrefabId: string | null;
  onActivePrefab: (id: string | null) => void;
  onEditPrefab: (id: string, prefab?: MapPrefab) => void;
  stampMode: boolean;
  onCaptureMode: () => void;
  capturing: boolean;
  tileset: ImportedTileset | null;
}) {
  const active = prefabs.find((p) => p.id === activePrefabId) ?? null;

  const persist = (next: MapPrefab[]) => {
    savePrefabs(next);
    onPrefabsChange(next);
  };

  const createNew = () => {
    const name = prompt("Prefab name?", `Prefab ${prefabs.length + 1}`);
    if (!name?.trim()) return;
    const w = parseInt(prompt("Width in tiles?", "8") || "8", 10) || 8;
    const h = parseInt(prompt("Height in tiles?", "8") || "8", 10) || 8;
    const pf = createEmptyPrefab(name.trim(), w, h, tileset);
    persist([...prefabs, pf]);
    onEditPrefab(pf.id, pf);
  };

  return (
    <div className="map-editor-panel-stack">
      <div className="map-editor-panel-toolbar">
        <button type="button" className="xiv-btn gold wide" onClick={createNew}>
          New prefab
        </button>
        <button
          type="button"
          data-map-editor-keep-placement=""
          className={`xiv-btn wide ${capturing ? "on" : ""}`}
          onClick={onCaptureMode}
        >
          {capturing ? "Drag on map…" : "Capture from map"}
        </button>
        {active && !editingPrefabId && (
          <button type="button" className="xiv-btn wide" onClick={() => onEditPrefab(active.id)}>
            Open editor
          </button>
        )}
      </div>
      <div className="map-editor-panel-scroll">
        <p className="dim map-editor-tileset-hint">Reusable tile + object stamps. Edit in isolation, then place on the map.</p>
        <div className="map-editor-prefab-list">
          {prefabs.length === 0 && <p className="dim">No prefabs yet.</p>}
          {prefabs.map((p) => (
            <div key={p.id} className={`map-editor-prefab-row ${editingPrefabId === p.id ? "editing" : ""}`}>
              <button
                type="button"
                data-map-editor-keep-placement=""
                className={`xiv-btn map-editor-prefab-item ${activePrefabId === p.id && stampMode ? "on" : ""}`}
                onClick={() => onActivePrefab(p.id)}
              >
                <span>{p.name}</span>
                <span className="dim">
                  {p.widthTiles}×{p.heightTiles}
                </span>
              </button>
              <button type="button" className="xiv-btn map-editor-prefab-edit" onClick={() => onEditPrefab(p.id)}>
                Edit
              </button>
            </div>
          ))}
        </div>
        {stampMode && active && activePrefabId === active.id && !editingPrefabId && (
          <p className="dim map-editor-place-hint">Click the map to place · Esc or click UI to cancel</p>
        )}
      </div>
    </div>
  );
}
