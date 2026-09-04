import { useEffect, useMemo } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { activeBattleView } from "../battle/activeBattle";
import type { BattleEntity } from "../types";
import type { BattleView } from "../state/store";
import { RARITY_COLORS } from "../types";
import { StatusIcons } from "../ui/StatusIcons";

function Gauge({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="ff-gauge">
      {label && <span className="ff-gauge-label">{label}</span>}
      <div className="ff-gauge-track">
        <div className="ff-gauge-fill" style={{ width: `${pct}%`, background: color }} />
        <span className="ff-gauge-text">
          {Math.round(value)}/{max}
        </span>
      </div>
    </div>
  );
}

function PartyRow({
  e,
  targetable,
  focused,
  onClick,
}: {
  e: BattleEntity;
  targetable?: boolean;
  focused?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`ff-party-row ${e.alive ? "" : "entity-dead"} ${focused ? "ff-targeted" : ""} ${targetable ? "targetable ff-focused" : ""}`}
      onClick={onClick}
    >
      <div className="ff-party-name">{e.name}</div>
      <StatusIcons statuses={e.statuses} className="status-icons--compact" />
      <Gauge value={e.hp} max={e.max_hp} color={e.hp / e.max_hp > 0.35 ? "#3dcc6e" : "#e04b4b"} />
      <Gauge value={e.mp} max={e.max_mp} color="#4aa3e8" />
    </button>
  );
}

export function BattleHUD() {
  const battleRaw = useGame((s) => s.battle);
  const rtBattle = useGame((s) => s.rtBattle);
  const battle: BattleView | null = useMemo(() => activeBattleView(battleRaw, rtBattle), [battleRaw, rtBattle]);
  const profile = useGame((s) => s.profile);
  const selfId = useGame((s) => s.selfId);
  const battleTargetId = useGame((s) => s.battleTargetId);
  const selected = useGame((s) => s.selectedAction);
  const setSelected = useGame((s) => s.setSelectedAction);

  const self = battle?.entities.find((e) => e.id === selfId);
  const focusId = battleTargetId ?? self?.target_id;
  const gcdReady = !!self && self.alive && (self.skill_atb ?? self.atb) >= 100 && !self.casting_skill_id && !battle?.end;

  useEffect(() => {
    if (!gcdReady && useGame.getState().selectedAction) setSelected(null);
  }, [gcdReady, setSelected]);

  if (!battle || !profile || !self) return null;

  const players = battle.entities.filter((e) => e.is_player);
  const enemies = battle.entities.filter((e) => !e.is_player);
  const target = battle.entities.find((e) => e.id === focusId) ?? enemies.find((e) => e.alive);
  const end = battle.end;
  const myReward = end?.rewards?.find((r) => r.player_id === selfId);

  return (
    <div className="hud battle-hud ffxiv-hud">
      <div className="ff-party-list xiv-panel">
        <div className="xiv-panel-head">Party</div>
        {players.map((e) => (
          <PartyRow
            key={e.id}
            e={e}
            targetable={!!selected?.heals && e.alive}
            focused={e.id === focusId}
            onClick={() => net.clickEntity(e)}
          />
        ))}
      </div>

      <div className="ff-enemy-dock">
        <button type="button" className="flee-btn" tabIndex={-1} onClick={() => net.leaveBattle()}>
          Leave
        </button>
        <div className="ff-enemy-list xiv-panel">
          <div className="xiv-panel-head">Enemies</div>
          {enemies.map((e) => (
            <button
              key={e.id}
              type="button"
              tabIndex={-1}
              className={`ff-enemy-row ${e.alive ? "" : "entity-dead"} ${e.id === focusId ? "ff-targeted" : ""} ${selected && !selected.heals && e.alive ? "targetable" : ""}`}
              onClick={() => net.clickEntity(e)}
            >
              <span>{e.name}</span>
              <StatusIcons statuses={e.statuses} className="status-icons--compact" />
              <Gauge value={e.hp} max={e.max_hp} color="#c94a4a" />
            </button>
          ))}
        </div>
      </div>

      {target && (
        <div className="ff-target-info xiv-panel">
          <div className="ff-target-head">
            <strong>{target.name}</strong>
            <span className="dim">Lv {target.level}</span>
          </div>
          <Gauge value={target.hp} max={target.max_hp} color="#c94a4a" label="HP" />
          <StatusIcons statuses={target.statuses} />
        </div>
      )}

      <div
        className={`ff-parameter ${gcdReady ? "gcd-ready" : ""} ${selected?.heals && self.alive ? "targetable ff-self-target" : ""}`}
        onClick={() => {
          if (selected?.heals && self.alive) net.clickEntity(self);
        }}
      >
        <Gauge value={self.hp} max={self.max_hp} color="#3dcc6e" label="HP" />
        <Gauge value={self.mp} max={self.max_mp} color="#4aa3e8" label="MP" />
      </div>

      {self.casting_skill_id && (
        <div className="ff-self-cast" aria-label="Casting">
          <Gauge value={self.cast_progress ?? 0} max={100} color="#a78bfa" label="Cast" />
        </div>
      )}

      {selected && (
        <div className="ff-flytext">
          <div className="log-line">
            {selected.name}: click {selected.heals ? "an ally (or press key again for self)" : "an enemy"}
          </div>
        </div>
      )}

      {end && (
        <div className="modal-backdrop">
          <div className="xiv-window end-modal">
            <div className="xiv-titlebar">
              <span className="xiv-title">{end.victory ? "Victory" : "Defeat"}</span>
            </div>
            <div className="xiv-body">
            <h2>{end.victory ? "Duty Complete" : "Wipe"}</h2>
            {myReward && (
              <div className="reward-block">
                <p>
                  +{myReward.xp} XP
                  {myReward.party_bonus ? " (party bonus)" : ""}
                  {myReward.passive ? " (passive)" : ""}
                  {myReward.levels_gained > 0 && (
                    <strong className="levelup"> — LEVEL UP! Now Lv {myReward.new_level}</strong>
                  )}
                </p>
                <div className="loot-list">
                  {myReward.loot.map((item) => (
                    <div key={item.id} className="inventory-item">
                      <span className="item-name" style={{ color: RARITY_COLORS[item.rarity] }}>
                        {item.name}
                        {item.qty && item.qty > 1 ? ` ×${item.qty}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!end.victory && <p className="hint">Your party was wiped out. No rewards this time.</p>}
            <button type="button" className="xiv-btn gold wide" onClick={() => net.leaveBattle()}>
              Return to World
            </button>
            <p className="hint" style={{ marginTop: 8, textAlign: "center" }}>
              You can return now, or wait to be sent back automatically.
            </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
