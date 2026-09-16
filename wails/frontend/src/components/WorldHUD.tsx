import { useEffect, useRef, useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { captureEligible, isEnemyEntity, type StatusSnapshot } from "../types";
import { StatusIcons } from "../ui/StatusIcons";
import { Minimap } from "./Minimap";

const STAMINA_MAX = 100;

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
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const pct = safeMax > 0 ? Math.min(100, Math.max(0, (safeValue / safeMax) * 100)) : 0;
  return (
    <div className="ff-gauge">
      <span className="ff-gauge-label">{label}</span>
      <div className="ff-gauge-track">
        <div className="ff-gauge-fill" style={{ width: `${pct}%`, background: color }} />
        <span className="ff-gauge-text">
          {Math.round(safeValue)}/{safeMax}
        </span>
      </div>
    </div>
  );
}

interface TargetView {
  id: string;
  name: string;
  level?: number;
  hp: number;
  max_hp: number;
  mp?: number;
  max_mp?: number;
  hostile: boolean;
  alive: boolean;
  statuses?: StatusSnapshot[];
  capturable?: boolean;
}

export function WorldHUD() {
  const profile = useGame((s) => s.profile);
  const selfId = useGame((s) => s.selfId);
  const players = useGame((s) => s.players);
  const npcs = useGame((s) => s.npcs);
  const combatEntities = useGame((s) => s.combatEntities);
  const combatLog = useGame((s) => s.combatLog);
  const party = useGame((s) => s.party);
  const selected = useGame((s) => s.selectedAction);
  const commandPetId = useGame((s) => s.commandPetId);
  const [now, setNow] = useState(() => Date.now());
  const localCastStart = useRef(0);
  const localCastKey = useRef("");

  const self = selfId ? players[selfId] : undefined;
  const selfCombat = selfId ? combatEntities[selfId] : undefined;
  const inCombat = !!(self?.in_combat || selfCombat);
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
    (castingId === "port"
      ? "Port"
      : castingId === "return"
        ? "Return"
        : castingId === "camp"
          ? "Camp"
          : "Cast");

  useEffect(() => {
    if (immuneUntil <= Date.now() && !casting) return;
    const t = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(t);
  }, [immuneUntil, casting]);

  if (!profile || !selfId) return null;

  const hp = self?.hp ?? selfCombat?.hp ?? 0;
  const maxHp = self?.max_hp ?? selfCombat?.max_hp ?? profile.stats?.hp ?? 0;
  const mp = self?.mp ?? selfCombat?.mp ?? 0;
  const maxMp = self?.max_mp ?? selfCombat?.max_mp ?? profile.stats?.mp ?? 0;
  const stamina = self?.stamina ?? 0;
  const recovering = immuneUntil > now && !inCombat;

  // Focus target: the server-driven target_id, resolved against the combat
  // entity map first (freshest snapshots), then world NPCs and players.
  const focusId = self?.target_id ?? selfCombat?.target_id;
  let target: TargetView | undefined;
  if (focusId) {
    const ce = combatEntities[focusId];
    const npc = ce ? undefined : npcs[focusId];
    const pl = ce || npc ? undefined : players[focusId];
    if (ce) {
      target = {
        id: ce.id,
        name: ce.name,
        level: ce.level,
        hp: ce.hp,
        max_hp: ce.max_hp,
        mp: ce.mp,
        max_mp: ce.max_mp,
        hostile: isEnemyEntity(ce),
        alive: ce.alive,
        statuses: ce.statuses,
        capturable: ce.capturable,
      };
    } else if (npc) {
      target = {
        id: npc.id,
        name: npc.name,
        level: npc.level,
        hp: npc.hp,
        max_hp: npc.max_hp,
        hostile: true,
        alive: npc.hp > 0,
      };
    } else if (pl) {
      target = {
        id: pl.id,
        name: pl.name,
        level: pl.level,
        hp: pl.hp,
        max_hp: pl.max_hp,
        mp: pl.mp,
        max_mp: pl.max_mp,
        hostile: false,
        alive: pl.hp > 0,
      };
    }
  }
  const canCapture =
    !!target && target.hostile && !!target.capturable && captureEligible(target);

  return (
    <div className="hud world-hud">
      <div className="cm-hud-left">
        {party && party.members.length > 0 && (
          <div className="cm-panel">
            <div className="cm-panel-head">Party</div>
            {party.members.map((m) => {
              const ce = combatEntities[m.id];
              const wp = players[m.id];
              const mhp = ce?.hp ?? wp?.hp;
              const mmax = ce?.max_hp ?? wp?.max_hp;
              return (
                <button
                  key={m.id}
                  type="button"
                  tabIndex={-1}
                  className={`ff-party-row ${m.id === selfId ? "ff-focused" : ""} ${ce && !ce.alive ? "entity-dead" : ""} ${selected?.heals ? "targetable" : ""}`}
                  onClick={() =>
                    net.clickEntity({
                      id: m.id,
                      alive: ce ? ce.alive : wp ? wp.hp > 0 : true,
                      is_player: true,
                      is_ally: true,
                    })
                  }
                >
                  <div className="ff-party-name">
                    {m.name}
                    {m.leader ? " ★" : ""}
                    {m.in_combat ? " ⚔" : ""}
                  </div>
                  <StatusIcons statuses={ce?.statuses} className="status-icons--compact" />
                  {mhp != null && mmax != null && (
                    <ResourceBar
                      label="HP"
                      value={mhp}
                      max={mmax}
                      color={mmax > 0 && mhp / mmax <= 0.35 ? "#e04b4b" : "#3dcc6e"}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
        {combatLog.length > 0 && (
          <div className="cm-panel">
            <div className="cm-panel-head">Combat</div>
            {combatLog.slice(-8).map((line, i) => (
              <div key={`${combatLog.length}-${i}`} className="log-line">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {target && (
        <div className="ff-target-info cm-panel">
          <div className="ff-target-head">
            <strong>
              {target.name}
              {!target.alive ? " (KO)" : ""}
            </strong>
            {target.level != null && <span className="dim">Lv {target.level}</span>}
          </div>
          <ResourceBar
            label="HP"
            value={target.hp}
            max={target.max_hp}
            color={target.hostile ? "#c94a4a" : "#3dcc6e"}
          />
          {!target.hostile && target.mp != null && target.max_mp != null && (
            <ResourceBar label="MP" value={target.mp} max={target.max_mp} color="#4aa3e8" />
          )}
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

      <div className="cm-param-world">
        <ResourceBar label="HP" value={hp} max={maxHp} color="#3dcc6e" />
        <ResourceBar label="MP" value={mp} max={maxMp} color="#4aa3e8" />
        <ResourceBar label="ST" value={stamina} max={STAMINA_MAX} color="#e8c96a" />
        {recovering && (
          <span className="dim hud-immune-note">Invulnerable {((immuneUntil - now) / 1000).toFixed(1)}s</span>
        )}
      </div>

      {casting && (
        <div className="cm-world-cast" role="status" aria-label={`${castName} casting`}>
          <div className="cm-world-cast-name">{castName}</div>
          <div className="ff-gauge-track">
            <div className="ff-gauge-fill" style={{ width: `${castPct}%`, background: "#a78bfa" }} />
            <span className="ff-gauge-text">{castLeft.toFixed(1)}s</span>
          </div>
        </div>
      )}

      {(commandPetId || selected) && (
        <div className="ff-flytext">
          {commandPetId ? (
            <div className="log-line">
              Commanding pet — choose a skill, then a target (one action, then AI resumes)
            </div>
          ) : (
            selected && (
              <div className="log-line">
                {selected.name}: click{" "}
                {selected.heals ? "an ally (or press key again for self)" : "an enemy"}
              </div>
            )
          )}
        </div>
      )}

      <Minimap />
    </div>
  );
}
