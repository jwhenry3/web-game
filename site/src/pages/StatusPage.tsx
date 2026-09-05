import { useEffect, useState } from "react";
import { formatUptime, subscribeStatus, type StatusSnapshot } from "../lib/status";

export function StatusPage() {
  const [snap, setSnap] = useState<StatusSnapshot | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const unsub = subscribeStatus((next, source) => {
      setLive(source === "ws");
      setSnap(next);
    });
    return () => unsub();
  }, []);

  return (
    <section className="page status-page">
      <header className="page-head">
        <h1>Server status</h1>
        <p>Live cluster snapshot — player counts only, no identities.</p>
      </header>

      {!snap ? (
        <p className="muted">Connecting…</p>
      ) : (
        <>
          <div className="status-summary" role="group" aria-label="Cluster summary">
            <div>
              <span className="label">Cluster</span>
              <strong>{snap.name}</strong>
            </div>
            <div>
              <span className="label">Players</span>
              <strong>{snap.players}</strong>
            </div>
            <div>
              <span className="label">Battles</span>
              <strong>{snap.battles}</strong>
            </div>
            <div>
              <span className="label">Uptime</span>
              <strong>{formatUptime(snap.uptime_sec)}</strong>
            </div>
            <div>
              <span className="label">EXP rate</span>
              <strong>{snap.exp.rate.toFixed(2)}×</strong>
            </div>
            <div>
              <span className="label">Feed</span>
              <strong className={live ? "ok" : "warn"}>{live ? "Live WS" : "Polling"}</strong>
            </div>
          </div>

          <div className="status-table-wrap">
            <table className="status-table">
              <thead>
                <tr>
                  <th>Map</th>
                  <th>State</th>
                  <th>Players</th>
                  <th>Battles</th>
                  <th>Combat</th>
                </tr>
              </thead>
              <tbody>
                {snap.maps.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="map-name">{m.name}</span>
                      <span className="map-id">{m.id}</span>
                    </td>
                    <td>
                      {!m.enabled ? (
                        <span className="pill off">disabled</span>
                      ) : m.running ? (
                        <span className="pill on">running</span>
                      ) : (
                        <span className="pill warn">stopped</span>
                      )}
                    </td>
                    <td>{m.players}</td>
                    <td>{m.battles}</td>
                    <td className="mono">{m.combat || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
