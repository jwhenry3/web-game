import { useEffect, useMemo } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { activeBattleView } from "../battle/activeBattle";
import type { BattleEntity } from "../types";
import { captureEligible, isEnemyEntity } from "../types";
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
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const pct = safeMax > 0 ? Math.min(100, Math.max(0, (safeValue / safeMax) * 100)) : 0;
  return (
    <div className="ff-gauge">
      {label && <span className="ff-gauge-label">{label}</span>}
      <div className="ff-gauge-track">
        <div className="ff-gauge-fill" style={{ width: `${pct}%`, background: color }} />
        <span className="ff-gauge-text">
          {Math.round(safeValue)}/{safeMax}
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
      <Gauge
        value={e.hp}
        max={e.max_hp}
        color={(e.max_hp > 0 ? e.hp / e.max_hp : 0) > 0.35 ? "#3dcc6e" : "#e04b4b"}
      />
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
  const commandPetId = useGame((s) => s.commandPetId);
  const setCommandPetId = useGame((s) => s.setCommandPetId);

  const self = battle?.entities.find((e) => e.id === selfId);
  const focusId = battleTargetId ?? self?.target_id;
  const gcdReady = !!self && self.alive && (self.skill_atb ?? self.atb) >= 100 && !self.casting_skill_id && !battle?.end;

  useEffect(() => {
    if (!gcdReady && useGame.getState().selectedAction) setSelected(null);
  }, [gcdReady, setSelected]);

  if (!battle || !profile || !self) return null;

  const players = battle.entities.filter((e) => e.is_player);
  const allies = battle.entities.filter((e) => e.is_ally);
  const enemies = battle.entities.filter((e) => isEnemyEntity(e));
  const target = battle.entities.find((e) => e.id === focusId) ?? enemies.find((e) => e.alive);
  const canCapture = !!target && isEnemyEntity(target) && captureEligible(target) && gcdReady;
  const end = battle.end;
  const myReward = end?.rewards?.find((r) => r.player_id === selfId);

  return (
    <div className="hud battle-hud ffcm-hud">
      <div className="ff-party-list cm-panel">
        <div className="cm-panel-head">Party</div>
        {players.map((e) => (
          <PartyRow
            key={e.id}
            e={e}
            targetable={!!selected?.heals && e.alive}
            focused={e.id === focusId}
            onClick={() => net.clickEntity(e)}
          />
        ))}
        {allies.map((e) => (
          <div key={e.id} className="ff-ally-pet-wrap">
            <PartyRow
              e={e}
              targetable={!!selected?.heals && e.alive}
              focused={e.id === focusId || commandPetId === e.id}
              onClick={() => net.clickEntity(e)}
            />
            {e.owner_id === selfId && e.alive && (
              <button
                type="button"
                tabIndex={-1}
                className={`ff-pet-cmd ${commandPetId === e.id ? "on" : ""}`}
                onClick={() => setCommandPetId(commandPetId === e.id ? null : e.id)}
              >
                {commandPetId === e.id ? "Commanding…" : e.has_queued_action ? "Queued" : "Command"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="ff-enemy-dock">
        <button type="button" className="flee-btn" tabIndex={-1} onClick={() => net.leaveBattle()}>
          Leave
        </button>
        <div className="ff-enemy-list cm-panel">
          <div className="cm-panel-head">Enemies</div>
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
        <div className="ff-target-info cm-panel">
          <div className="ff-target-head">
            <strong>{target.name}</strong>
            <span className="dim">Lv {target.level}</span>
          </div>
          <Gauge value={target.hp} max={target.max_hp} color="#c94a4a" label="HP" />
          <StatusIcons statuses={target.statuses} />
          {canCapture && (
            <button
              type="button"
              className="ff-capture-btn"
              title="Same as the Capture hotbar skill"
              tabIndex={-1}
              onClick={() => net.capture(target.id)}
            >
              Capture
            </button>
          )}
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

      {commandPetId && (
        <div className="ff-flytext">
          <div className="log-line">Commanding pet — choose a skill, then a target (one action, then AI resumes)</div>
        </div>
      )}

      {self.casting_skill_id && (
        <div className="ff-self-cast" aria-label="Casting">
          <Gauge value={self.cast_progress ?? 0} max={100} color="#a78bfa" label="Cast" />
        </div>
      )}

      {selected && !commandPetId && (
        <div className="ff-flytext">
          <div className="log-line">
            {selected.name}: click {selected.heals ? "an ally (or press key again for self)" : "an enemy"}
          </div>
        </div>
      )}

      {end && (
        <div className="modal-backdrop">
          <div className="cm-window end-modal">
            <div className="cm-titlebar">
              <span className="cm-title">{end.victory ? "Victory" : "Defeat"}</span>
            </div>
            <div className="cm-body">
            <h2>{end.victory ? "Victoria" : "Clades"}</h2>
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
            <button type="button" className="cm-btn gold wide" onClick={() => net.leaveBattle()}>
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
