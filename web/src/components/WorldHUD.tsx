import { useEffect, useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";

export function WorldHUD() {
  const profile = useGame((s) => s.profile);
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.players);
  const battleInvite = useGame((s) => s.battleInvite);
  const [now, setNow] = useState(() => Date.now());

  const self = selfId ? players[selfId] : undefined;
  const immuneUntil = self?.immune_until ?? 0;
  const immuneLeft = Math.max(0, immuneUntil - now);

  useEffect(() => {
    if (immuneUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [immuneUntil]);

  if (!profile || !selfId) return null;
  const locked = self?.in_battle ?? false;
  const recovering = immuneLeft > 0 && !locked;

  return (
    <div className="hud world-hud">
      {battleInvite && !locked && (
        <div className="xiv-battle-invite xiv-panel">
          <div className="xiv-panel-head">Battle Nearby</div>
          <p className="hint">
            <strong>{battleInvite.from_name}</strong> engaged a foe nearby.
          </p>
          <div className="xiv-social-invite-btns">
            <button className="xiv-btn gold" onClick={() => net.joinBattle(battleInvite.battle_id)}>
              Join Battle
            </button>
            <button className="xiv-btn" onClick={() => net.declineBattleInvite()}>
              Decline
            </button>
          </div>
          <p className="hint">Declining still earns passive EXP if your party wins.</p>
        </div>
      )}

      <div className="xiv-panel xiv-param-world">
        <div className="xiv-char-name">{profile.name}</div>
        <div className="dim">
          {profile.main_job}
          {profile.sub_job ? ` / ${profile.sub_job}` : ""} · Lv {profile.level}
        </div>
        <p className="hint">
          {recovering
            ? `Invulnerable ${(immuneLeft / 1000).toFixed(1)}s`
            : profile.save_point_name
              ? `Save point: ${profile.save_point_name}. Click a crystal to change it.`
              : "Click a save crystal to set your respawn point."}
        </p>
      </div>
    </div>
  );
}
