import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";

function ResourceBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="ff-gauge">
      <span className="ff-gauge-label">{label}</span>
      <div className="ff-gauge-track">
        <div className="ff-gauge-fill" style={{ width: `${pct}%`, background: color }} />
        <span className="ff-gauge-text">
          {Math.round(value)}/{max}
        </span>
      </div>
    </div>
  );
}

export function WorldHUD() {
  const profile = useGame((s) => s.profile);
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.players);
  const [now, setNow] = useState(() => Date.now());
  const localCastStart = useRef(0);
  const localCastKey = useRef("");

  const self = selfId ? players[selfId] : undefined;
  const immuneUntil = self?.immune_until ?? 0;
  const castingId = self?.casting_skill_id;
  const castMs = self?.cast_time_ms ?? 0;
  const castEndsAt = self?.cast_ends_at ?? 0;
  const casting = !!castingId && castMs > 0;
  const castKey = casting ? `${castingId}:${castEndsAt}` : "";

  if (castKey && castKey !== localCastKey.current) {
    localCastKey.current = castKey;
    localCastStart.current = Date.now();
  }
  if (!casting) {
    localCastKey.current = "";
    localCastStart.current = 0;
  }

  const castElapsed = casting ? Math.max(0, Date.now() - localCastStart.current) : 0;
  const castPct = casting ? Math.min(100, (castElapsed / castMs) * 100) : 0;
  const castLeft = casting ? Math.max(0, (castMs - castElapsed) / 1000) : 0;
  const castName =
    profile?.skills.find((s) => s.id === castingId)?.name ??
    (castingId === "teleport" ? "Teleport" : "Cast");

  useEffect(() => {
    if (immuneUntil <= Date.now() && !casting) return;
    const t = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(t);
  }, [immuneUntil, casting]);

  if (!profile || !selfId) return null;

  const hp = profile.stats?.hp ?? 0;
  const mp = profile.stats?.mp ?? 0;
  const recovering = immuneUntil > now && !(self?.in_battle ?? false);

  return (
    <div className="hud world-hud">
      <div className="xiv-param-world">
        <ResourceBar label="HP" value={hp} max={hp} color="#3dcc6e" />
        <ResourceBar label="MP" value={mp} max={mp} color="#4aa3e8" />
        {recovering && (
          <span className="dim hud-immune-note">Invulnerable {((immuneUntil - now) / 1000).toFixed(1)}s</span>
        )}
      </div>

      {casting && (
        <div className="xiv-world-cast" role="status" aria-label={`${castName} casting`}>
          <div className="xiv-world-cast-name">{castName}</div>
          <div className="ff-gauge-track">
            <div className="ff-gauge-fill" style={{ width: `${castPct}%`, background: "#a78bfa" }} />
            <span className="ff-gauge-text">{castLeft.toFixed(1)}s</span>
          </div>
        </div>
      )}
    </div>
  );
}
