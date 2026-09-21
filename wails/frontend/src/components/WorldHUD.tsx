import { useEffect, useRef, useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import {
  captureEligible,
  isEnemyEntity,
  isPetEntity,
  type StatusSnapshot,
  type WorldEntity,
} from "../types";
import { StatusIcons } from "../ui/StatusIcons";
import { JobIdentityBadges } from "../ui/JobIdentity";
import { hudScaleKey, uiScaleFactor } from "../ui/uiScale";
import { useWindowDrag } from "./DraggableWindow";
import { Minimap } from "./Minimap";

const STAMINA_MAX = 100;

/** FFXI party-frame HP color: green → yellow → orange → red as HP drops. */
function hpBarColor(pct: number): string {
  if (pct > 75) return "#6fbf4a";
  if (pct > 50) return "#cfc23c";
  if (pct > 25) return "#e08a3c";
  return "#e04b4b";
}

/** FFXI-style parameter gauge: label left, bar, current value at the right. */
function ParamGauge({
  label,
  value,
  max,
  color,
  thin,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  thin?: boolean;
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const pct = safeMax > 0 ? Math.min(100, Math.max(0, (safeValue / safeMax) * 100)) : 0;
  return (
    <div
      className={`ffxi-gauge${thin ? " ffxi-gauge--thin" : ""}`}
      title={`${label} ${Math.round(safeValue)} / ${safeMax}`}
    >
      <span className="ffxi-gauge-label">{label}</span>
      <div className="ffxi-gauge-track">
        <div className="ffxi-gauge-fill" style={{ width: `${pct}%`, background: color }} />
        <span className="ffxi-gauge-value">{Math.round(safeValue)}</span>
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
  const entities = useGame((s) => s.entities);
  const combatIds = useGame((s) => s.combatIds);
  const party = useGame((s) => s.party);
  const selected = useGame((s) => s.selectedAction);
  const commandPetId = useGame((s) => s.commandPetId);
  const partyScale = useGame((s) => uiScaleFactor(s.options.uiScale, hudScaleKey("party")));
  const { style: partyStyle, titlebarProps: partyDragProps } = useWindowDrag(
    "party-window",
    partyScale,
  );
  const { className: _partyDragClass, ...partyDrag } = partyDragProps;
  const [now, setNow] = useState(() => Date.now());
  const localCastStart = useRef(0);
  const localCastKey = useRef("");

  const self = selfId ? entities[selfId] : undefined;
  const selfCombat = selfId && combatIds[selfId] ? entities[selfId] : undefined;
  const inCombat = !!(self?.engaged || selfCombat);
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

  const recovering = immuneUntil > now && !inCombat;

  // Focus target: the server-driven target_id, resolved against the unified
  // entity map (combat ticks merge the freshest snapshots into it).
  const focusId = self?.target_id ?? selfCombat?.target_id;
  let target: TargetView | undefined;
  if (focusId) {
    const fe = entities[focusId];
    if (fe) {
      const inFight = !!combatIds[focusId];
      target = {
        id: fe.id,
        name: fe.name,
        level: fe.level,
        hp: fe.hp,
        max_hp: fe.max_hp,
        mp: fe.mp,
        max_mp: fe.max_mp,
        hostile: isEnemyEntity(fe),
        alive: inFight ? fe.alive : fe.hp > 0,
        statuses: fe.statuses,
        capturable: fe.capturable,
      };
    }
  }
  const canCapture =
    !!target && target.hostile && !!target.capturable && captureEligible(target);

  // Pets out in the world, grouped by owning player id for nested party rows.
  const petsByOwner = new Map<string, WorldEntity[]>();
  for (const e of Object.values(entities)) {
    if (!isPetEntity(e) || !e.owner_id) continue;
    const list = petsByOwner.get(e.owner_id) ?? [];
    list.push(e);
    petsByOwner.set(e.owner_id, list);
  }

  // FFXI-style party window: always shows the local player, then party
  // members in server order, with each member's pets nested underneath.
  interface MemberView {
    id: string;
    name: string;
    level?: number;
    leader?: boolean;
    in_combat?: boolean;
  }
  const members: MemberView[] = party?.members ?? [];
  const memberViews: MemberView[] = members.some((m) => m.id === selfId)
    ? members
    : [{ id: selfId, name: profile.name, level: profile.level }, ...members];

  const renderMember = (m: MemberView) => {
    const isSelf = m.id === selfId;
    const e = entities[m.id];
    const inFight = !!combatIds[m.id];
    const hp = isSelf ? (e?.hp ?? selfCombat?.hp ?? 0) : e?.hp;
    const maxHp = isSelf
      ? (e?.max_hp ?? selfCombat?.max_hp ?? profile.stats?.hp ?? 0)
      : e?.max_hp;
    const mp = isSelf ? (e?.mp ?? selfCombat?.mp ?? 0) : e?.mp;
    const maxMp = isSelf
      ? (e?.max_mp ?? selfCombat?.max_mp ?? profile.stats?.mp ?? 0)
      : e?.max_mp;
    const stamina = isSelf ? (e?.stamina ?? 0) : e?.stamina;
    const pets = petsByOwner.get(m.id) ?? [];
    return (
      <div key={m.id} className="ff-party-frame">
        <button
          type="button"
          tabIndex={-1}
          className={`ff-party-row ${isSelf ? "ff-focused" : ""} ${inFight && e && !e.alive ? "entity-dead" : ""} ${selected?.heals ? "targetable" : ""}`}
          onClick={() =>
            net.clickEntity(
              e
                ? { ...e, alive: inFight ? e.alive : e.hp > 0 }
                : {
                    id: m.id,
                    name: m.name,
                    kind: "player",
                    x: 0,
                    y: 0,
                    z: 0,
                    grounded: true,
                    hp: 0,
                    max_hp: 0,
                    alive: true,
                    is_ally: true,
                  },
            )
          }
        >
          <div className="ff-party-name">
            {isSelf && <JobIdentityBadges jobId={profile.main_job} iconOnly />}
            {m.name}
            {m.leader ? " ★" : ""}
            {m.in_combat ? " ⚔" : ""}
            {m.level != null && <span className="dim"> Lv{m.level}</span>}
          </div>
          <StatusIcons
            statuses={inFight || isSelf ? e?.statuses : undefined}
            className="status-icons--compact"
          />
          {hp != null && maxHp != null && (
            <ParamGauge
              label="HP"
              value={hp}
              max={maxHp}
              color={hpBarColor(maxHp > 0 ? (hp / maxHp) * 100 : 0)}
            />
          )}
          {mp != null && maxMp != null && maxMp > 0 && (
            <ParamGauge label="MP" value={mp} max={maxMp} color="#4aa3e8" thin />
          )}
          {stamina != null && (
            <ParamGauge label="ST" value={stamina} max={STAMINA_MAX} color="#8fd4c8" thin />
          )}
          {isSelf && recovering && (
            <span className="dim hud-immune-note">
              Invulnerable {((immuneUntil - now) / 1000).toFixed(1)}s
            </span>
          )}
        </button>
        {pets.map((p) => {
          const pInFight = !!combatIds[p.id];
          return (
            <button
              key={p.id}
              type="button"
              tabIndex={-1}
              className={`ff-pet-row ${pInFight && !p.alive ? "entity-dead" : ""} ${selected?.heals ? "targetable" : ""}`}
              onClick={() => net.clickEntity(p)}
            >
              <div className="ff-pet-name">{p.name}</div>
              <ParamGauge
                label="HP"
                value={p.hp}
                max={p.max_hp}
                color={hpBarColor(p.max_hp > 0 ? (p.hp / p.max_hp) * 100 : 0)}
              />
              {p.max_mp != null && p.max_mp > 0 && (
                <ParamGauge label="MP" value={p.mp ?? 0} max={p.max_mp} color="#4aa3e8" thin />
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="hud world-hud">
      <div
        className="ff-party-window"
        style={partyStyle}
        {...partyDrag}
        onMouseDown={(e) => e.stopPropagation()}
        title="Drag to move"
      >
        {memberViews.map(renderMember)}
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
          <ParamGauge
            label="HP"
            value={target.hp}
            max={target.max_hp}
            color={hpBarColor(target.max_hp > 0 ? (target.hp / target.max_hp) * 100 : 0)}
          />
          {!target.hostile && target.mp != null && target.max_mp != null && (
            <ParamGauge label="MP" value={target.mp} max={target.max_mp} color="#4aa3e8" thin />
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
