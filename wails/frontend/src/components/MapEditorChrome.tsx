import type { AdminMapInfo } from "../net/adminMaps";
import { EDITOR_INTERACT_MODES, type EditorInteractMode } from "../editor/sceneCatalog";

export type EditorMode = "world" | "prefab";

interface Props {
  mode?: EditorMode;
  mapOptions: AdminMapInfo[];
  selectedMapId: string;
  onMapChange?: (id: string) => void;
  onSave: () => void;
  onBack?: () => void;
  onCreateMap?: () => void;
  onEnableMap?: () => void;
  onDisableMap?: () => void;
  onRemoveMap?: () => void;
  interactMode?: EditorInteractMode;
  onInteractMode?: (mode: EditorInteractMode) => void;
  status: string | null;
  error: string | null;
  editingPrefabName?: string;
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 1.5h9.2L14.5 4.8V14.5H2zM3.5 3v4h7V3zm1.5 0h4v2.5H5zm-1.5 5.5v5h8v-5z"
      />
    </svg>
  );
}

export function MapEditorChrome({
  mode = "world",
  mapOptions,
  selectedMapId,
  onMapChange,
  onSave,
  onBack,
  onCreateMap,
  onEnableMap,
  onDisableMap,
  onRemoveMap,
  interactMode,
  onInteractMode,
  status,
  error,
  editingPrefabName,
}: Props) {
  const selected = mapOptions.find((m) => m.id === selectedMapId) ?? null;
  const canToggle = !!selected && !selected.default;

  return (
    <div className="map-editor-chrome map-editor-chrome--toolbar cm-window">
      <div className="map-editor-chrome-toolbar">
        {mode === "world" && onMapChange && (
          <select
            className="cm-input map-editor-chrome-map-select"
            value={selectedMapId}
            aria-label="Map"
            onChange={(e) => onMapChange(e.target.value)}
          >
            {mapOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {!m.enabled ? " (disabled)" : !m.running ? " (offline)" : ""}
                {m.has_override ? " •" : ""}
              </option>
            ))}
          </select>
        )}

        {mode === "prefab" && (
          <span className="map-editor-chrome-prefab-name">{editingPrefabName ?? "Prefab"}</span>
        )}

        {mode === "world" && interactMode && onInteractMode && (
          <div className="map-editor-mode-switch" role="tablist" aria-label="Edit mode">
            {EDITOR_INTERACT_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={interactMode === m.id}
                className={`map-editor-mode-switch-btn ${interactMode === m.id ? "on" : ""}`}
                onClick={() => onInteractMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {(status || error) && (
          <div className="map-editor-chrome-messages">
            {status && <p className="map-editor-status">{status}</p>}
            {error && <p className="error-text">{error}</p>}
          </div>
        )}

        <div className="map-editor-chrome-actions">
          {mode === "world" && onCreateMap && (
            <button type="button" className="cm-btn" onClick={onCreateMap} title="Create map">
              New map
            </button>
          )}
          {mode === "world" && canToggle && selected && !selected.enabled && onEnableMap && (
            <button type="button" className="cm-btn gold" onClick={onEnableMap} title="Enable map server">
              Enable
            </button>
          )}
          {mode === "world" && canToggle && selected?.enabled && onDisableMap && (
            <button type="button" className="cm-btn" onClick={onDisableMap} title="Disable map server">
              Disable
            </button>
          )}
          {mode === "world" && canToggle && onRemoveMap && (
            <button type="button" className="cm-btn" onClick={onRemoveMap} title="Remove map">
              Remove
            </button>
          )}
          <button
            type="button"
            className="cm-btn gold map-editor-chrome-icon-btn"
            onClick={onSave}
            title={mode === "prefab" ? "Save prefab" : "Save"}
            aria-label={mode === "prefab" ? "Save prefab" : "Save"}
            disabled={mode === "world" && selected != null && !selected.enabled}
          >
            <SaveIcon />
          </button>
          {mode === "prefab" && onBack && (
            <button type="button" className="cm-btn" onClick={onBack}>
              Back to map
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
