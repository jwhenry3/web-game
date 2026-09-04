import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { id: string; name: string; cols: number; rows: number }) => Promise<void>;
}

export function CreateMapDialog({ open, onClose, onCreate }: Props) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [cols, setCols] = useState("80");
  const [rows, setRows] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanId = id.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(cleanId)) {
      setError("Id must be lowercase letters/digits/underscore (start with a letter).");
      return;
    }
    const c = parseInt(cols, 10);
    const r = parseInt(rows, 10);
    if (!Number.isFinite(c) || !Number.isFinite(r) || c < 16 || r < 16) {
      setError("Size must be at least 16×16.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        id: cleanId,
        name: name.trim() || cleanId,
        cols: c,
        rows: r,
      });
      setId("");
      setName("");
      setCols("80");
      setRows("60");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="map-editor-dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="map-editor-dialog cm-window"
        role="dialog"
        aria-label="Create map"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <div className="cm-titlebar">
          <span className="cm-title">New map</span>
        </div>
        <div className="cm-body map-editor-dialog-body">
          <label className="field-label">Map id</label>
          <input
            className="cm-input"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="cave"
            autoFocus
            disabled={busy}
          />
          <label className="field-label">Display name</label>
          <input
            className="cm-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cave"
            disabled={busy}
          />
          <div className="map-editor-dialog-row">
            <div>
              <label className="field-label">Width (tiles)</label>
              <input className="cm-input" value={cols} onChange={(e) => setCols(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="field-label">Height (tiles)</label>
              <input className="cm-input" value={rows} onChange={(e) => setRows(e.target.value)} disabled={busy} />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="map-editor-dialog-actions">
            <button type="button" className="cm-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="cm-btn gold" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
