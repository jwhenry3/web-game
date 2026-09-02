import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
export function WorldHUD() {
  const profile = useGame((s) => s.profile);
  const mapInfo = useGame((s) => s.mapInfo);
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.players);
  const [now, setNow] = useState(() => Date.now());
  const localCastStart = useRef(0);
  const localCastKey = useRef("");

  const self = selfId ? players[selfId] : undefined;
  const immuneUntil = self?.immune_until ?? 0;
  const immuneLeft = Math.max(0, immuneUntil - now);
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
  const locked = self?.in_battle ?? false;
  const recovering = immuneLeft > 0 && !locked;

  return (
    <div className="hud world-hud">
      <div className="xiv-panel xiv-param-world">
        <div className="xiv-char-name">{profile.name}</div>
        <div className="dim">
          {mapInfo?.name ? `${mapInfo.name} · ` : ""}
          {profile.main_job}
          {profile.sub_job ? ` / ${profile.sub_job}` : ""} · Lv {profile.level}
        </div>
        <p className="hint">
          {mapInfo?.name ? `Walk the glowing zone line to leave ${mapInfo.name}. ` : ""}
          {recovering
            ? `Invulnerable ${(immuneLeft / 1000).toFixed(1)}s`
            : profile.save_point_name
              ? `Save point: ${profile.save_point_name}. Click a crystal to change it.`
              : "Click a save crystal to set your respawn point."}
        </p>
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
