import { useRef } from "react";
import {
  importTilesetFromFile,
  TILE_ROLE_OPTIONS,
  type ImportedTileset,
  type TileRole,
  setTileRole,
} from "../editor/tilesetConfig";
import { TERRAIN_COLORS } from "../editor/tilePalette";

interface Props {
  tileset: ImportedTileset | null;
  onChange: (ts: ImportedTileset | null) => void;
  selectedTileIndex: number | null;
  onSelectTile: (index: number | null) => void;
}

export function MapEditorTilesetToolbar({
  tileset,
  onChange,
  onSelectTile,
}: {
  tileset: ImportedTileset | null;
  onChange: (ts: ImportedTileset | null) => void;
  onSelectTile: (index: number | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File) => {
    const ts = await importTilesetFromFile(file);
    onChange(ts);
    onSelectTile(0);
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
          e.target.value = "";
        }}
      />
      {!tileset ? (
        <button type="button" className="xiv-btn gold wide" onClick={() => fileRef.current?.click()}>
          Import tileset…
        </button>
      ) : (
        <>
          <button type="button" className="xiv-btn wide" onClick={() => fileRef.current?.click()}>
            Replace image…
          </button>
          <button type="button" className="xiv-btn danger wide" onClick={() => onChange(null)}>
            Remove tileset
          </button>
        </>
      )}
    </>
  );
}

export function MapEditorTilesetPanel({ tileset, onChange, selectedTileIndex, onSelectTile }: Props) {
  if (!tileset) {
    return (
      <div className="map-editor-tileset-panel">
        <div className="map-editor-group-label">Tileset</div>
        <p className="dim map-editor-tileset-hint">
          Editor uses colored blocks by default. Import a PNG tileset from the toolbar above to map tiles to terrain types.
        </p>
      </div>
    );
  }

  const role = selectedTileIndex != null ? tileset.roles[String(selectedTileIndex)] ?? "unset" : "unset";

  return (
    <div className="map-editor-tileset-panel">
      <div className="map-editor-group-label">Tileset: {tileset.name}</div>
      <label className="field-label">First GID</label>
      <input
        className="xiv-input"
        type="number"
        value={tileset.firstGid}
        onChange={(e) => onChange({ ...tileset, firstGid: parseInt(e.target.value, 10) || 577 })}
      />
      <div className="map-editor-tileset-preview-wrap">
        <div
          className="map-editor-tileset-preview"
          style={{
            backgroundImage: `url(${tileset.imageDataUrl})`,
            width: tileset.columns * 20,
            height: Math.ceil(tileset.tileCount / tileset.columns) * 20,
            backgroundSize: `${tileset.columns * 20}px auto`,
          }}
        >
          {Array.from({ length: tileset.tileCount }, (_, i) => {
            const r = tileset.roles[String(i)] ?? "unset";
            const c = r !== "unset" ? TERRAIN_COLORS[r] : undefined;
            return (
              <button
                key={i}
                type="button"
                className={`map-editor-tileset-cell ${selectedTileIndex === i ? "on" : ""}`}
                style={c ? { boxShadow: `inset 0 0 0 3px ${c}` } : undefined}
                title={`Tile ${i}`}
                onClick={() => onSelectTile(i)}
              />
            );
          })}
        </div>
      </div>
      {selectedTileIndex != null && (
        <>
          <label className="field-label">Tile {selectedTileIndex} role</label>
          <select
            className="xiv-input"
            value={role}
            onChange={(e) => onChange(setTileRole(tileset, selectedTileIndex, e.target.value as TileRole))}
          >
            {TILE_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
