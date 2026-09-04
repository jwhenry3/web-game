import { useEffect, useMemo, useState } from "react";
import {
  fetchMapServerConfig,
  updateMapServerConfig,
  type MapServerInfo,
  type MapServerUpdate,
} from "../net/adminMaps";

const COMBAT_LABELS: Record<string, string> = {
  "combat.realtime": "Realtime",
  "combat.ordo": "Ordo",
  "combat.atb": "Ordo",
};

interface Props {
  mapId: string;
  onApplied?: () => void;
  onStatus?: (msg: string | null) => void;
  onError?: (msg: string | null) => void;
}

export function MapServerInspector({ mapId, onApplied, onStatus, onError }: Props) {
  const [remote, setRemote] = useState<MapServerInfo | null>(null);
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [combat, setCombat] = useState("combat.realtime");
  const [battleSpeed, setBattleSpeed] = useState("0.75");
  const [addr, setAddr] = useState(":0");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRemote(null);
    setLoadError(null);
    void (async () => {
      try {
        const info = await fetchMapServerConfig(mapId);
        if (cancelled) return;
        setRemote(info);
        setName(info.name);
        setEnabled(info.enabled);
        setCombat(info.combat);
        setBattleSpeed(String(info.battle_speed));
        setAddr(info.addr || ":0");
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  const dirty = useMemo(() => {
    if (!remote) return false;
    const speed = Number(battleSpeed);
    return (
      name.trim() !== remote.name ||
      enabled !== remote.enabled ||
      combat !== remote.combat ||
      addr.trim() !== remote.addr ||
      (!Number.isNaN(speed) && speed !== remote.battle_speed)
    );
  }, [remote, name, enabled, combat, addr, battleSpeed]);

  const onSave = async () => {
    if (!remote || busy) return;
    const speed = Number(battleSpeed);
    if (!name.trim()) {
      onError?.("Display name is required.");
      return;
    }
    if (!(speed > 0)) {
      onError?.("Battle speed must be greater than 0.");
      return;
    }
    const body: MapServerUpdate = {
      name: name.trim(),
      enabled,
      combat,
      battle_speed: speed,
      addr: addr.trim() || ":0",
    };
    setBusy(true);
    onError?.(null);
    onStatus?.("Saving server options…");
    try {
      const info = await updateMapServerConfig(mapId, body);
      setRemote(info);
      setName(info.name);
      setEnabled(info.enabled);
      setCombat(info.combat);
      setBattleSpeed(String(info.battle_speed));
      setAddr(info.addr || ":0");
      onStatus?.(
        info.enabled
          ? info.running
            ? "Server options saved — map server running."
            : "Server options saved."
          : "Server options saved — map server stopped.",
      );
      onApplied?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
      onStatus?.(null);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return <p className="error-text map-editor-inspector-empty">{loadError}</p>;
  }
  if (!remote) {
    return <p className="dim map-editor-inspector-empty">Loading server options…</p>;
  }

  const combatOptions = remote.combat_options?.length
    ? remote.combat_options
    : ["combat.realtime", "combat.ordo"];

  return (
    <div className="map-editor-inspector">
      <div className="map-editor-group-label">Map</div>
      <label className="field-label">Map id</label>
      <input className="cm-input" value={remote.id} readOnly disabled />
      <label className="field-label">Display name</label>
      <input className="cm-input" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />

      <div className="map-editor-group-label">Server</div>
      <label className="map-editor-check">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || remote.default}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>Spin up map server</span>
      </label>
      {remote.default && <p className="dim map-editor-hint">The default map cannot be disabled.</p>}
      <label className="field-label">Config file</label>
      <input className="cm-input" value={remote.config_path} readOnly disabled title={remote.config_path} />
      <p className="dim map-editor-hint">
        Status: {remote.running ? "running" : enabled ? "offline" : "disabled"}
        {remote.default ? " · default map" : ""}
      </p>

      <label className="field-label">Combat system</label>
      <select className="cm-input" value={combat} onChange={(e) => setCombat(e.target.value)} disabled={busy}>
        {combatOptions.map((id) => (
          <option key={id} value={id}>
            {COMBAT_LABELS[id] ?? id}
          </option>
        ))}
      </select>

      <label className="field-label">Battle speed</label>
      <input
        className="cm-input"
        type="number"
        min={0.05}
        max={3}
        step={0.05}
        value={battleSpeed}
        onChange={(e) => setBattleSpeed(e.target.value)}
        disabled={busy}
      />
      <p className="dim map-editor-hint">1.0 is baseline tempo; Ordo uses this for tick rate.</p>

      <label className="field-label">Listen addr</label>
      <input className="cm-input" value={addr} onChange={(e) => setAddr(e.target.value)} disabled={busy} />
      <p className="dim map-editor-hint">Use :0 for an ephemeral in-process port (typical for designer maps).</p>

      <label className="field-label">Overworld</label>
      <input className="cm-input" value={remote.overworld} readOnly disabled />

      <button type="button" className="cm-btn gold wide" disabled={!dirty || busy} onClick={() => void onSave()}>
        {busy ? "Saving…" : dirty ? "Save server options" : "No changes"}
      </button>
    </div>
  );
}
