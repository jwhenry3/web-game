import { useSyncExternalStore } from "react";
import {
  getWorldOverlays,
  subscribeEntityOverlays,
  type EntityOverlayMark,
  type InteractPromptMark,
  type PoiLabelMark,
  type WorldOverlayFrame,
} from "../world/entityOverlayBridge";
import { StatusIcons } from "../ui/StatusIcons";
import { JobIdentityBadges } from "../ui/JobIdentity";
import { useGame } from "../state/store";

function useWorldOverlays(): WorldOverlayFrame {
  return useSyncExternalStore(subscribeEntityOverlays, getWorldOverlays, getWorldOverlays);
}

function Nameplate({ mark, selfJob }: { mark: EntityOverlayMark; selfJob?: string }) {
  return (
    <div
      className={`cm-nameplate cm-nameplate--${mark.variant}`}
      style={{ left: mark.nameX, top: mark.nameY }}
    >
      {mark.variant === "self" && selfJob && (
        <JobIdentityBadges jobId={selfJob} iconOnly className="job-identity--nameplate" />
      )}
      {mark.label}
    </div>
  );
}

function EntityCastBar({ mark }: { mark: EntityOverlayMark }) {
  if (mark.castPct == null) return null;
  const pct = Math.max(0, Math.min(1, mark.castPct));
  return (
    <div className="cm-entity-cast" style={{ left: mark.castX, top: mark.castY }}>
      <div className="cm-entity-cast-track">
        <div
          className={`cm-entity-cast-fill${pct >= 1 ? " is-ready" : ""}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Down-pointing chevron over the focus target's nameplate. */
function TargetArrow({ mark }: { mark: EntityOverlayMark }) {
  if (!mark.targeted) return null;
  return <div className="cm-target-arrow" style={{ left: mark.nameX, top: mark.nameY }} />;
}

/** Compact combat HP bar over the nameplate for engaged/damaged entities. */
function EntityHpBar({ mark }: { mark: EntityOverlayMark }) {
  if (!mark.hp || mark.hp.max <= 0) return null;
  const ratio = Math.max(0, Math.min(1, mark.hp.value / mark.hp.max));
  const color = ratio > 0.5 ? "#3dcc6e" : ratio > 0.25 ? "#facc15" : "#ef4444";
  return (
    <div className="cm-entity-hp" style={{ left: mark.nameX, top: mark.nameY - 11 }}>
      <div className="cm-entity-hp-fill" style={{ width: `${ratio * 100}%`, background: color }} />
    </div>
  );
}

/** Status icon chips under the nameplate. */
function EntityStatuses({ mark }: { mark: EntityOverlayMark }) {
  if (!mark.statuses?.length) return null;
  return (
    <div className="cm-entity-statuses" style={{ left: mark.nameX, top: mark.nameY + 9 }}>
      <StatusIcons statuses={mark.statuses} className="status-icons--compact" />
    </div>
  );
}

function PoiLabel({ mark }: { mark: PoiLabelMark }) {
  return (
    <div
      className={`cm-poi-label cm-poi-label--${mark.variant}`}
      style={{ left: mark.x, top: mark.y }}
    >
      {mark.label}
    </div>
  );
}

function InteractPrompt({ mark }: { mark: InteractPromptMark }) {
  return (
    <div className="cm-interact-prompt" style={{ left: mark.x, top: mark.y }}>
      {mark.keyLabel}
    </div>
  );
}

/** Nameplates, cast bars, POI labels, and interact prompts above the Phaser canvas. */
export function EntityOverlays() {
  const { entities, pois, interacts } = useWorldOverlays();
  const selfJob = useGame((s) => s.profile?.main_job);
  if (entities.length === 0 && pois.length === 0 && interacts.length === 0) return null;
  return (
    <div className="cm-entity-overlays" aria-hidden>
      {pois.map((mark) => (
        <PoiLabel key={`poi-${mark.id}`} mark={mark} />
      ))}
      {entities.map((mark) => (
        <Nameplate key={`name-${mark.id}`} mark={mark} selfJob={selfJob} />
      ))}
      {entities.map((mark) =>
        mark.targeted ? <TargetArrow key={`ta-${mark.id}`} mark={mark} /> : null,
      )}
      {entities.map((mark) =>
        mark.castPct != null ? <EntityCastBar key={`cast-${mark.id}`} mark={mark} /> : null,
      )}
      {entities.map((mark) =>
        mark.hp ? <EntityHpBar key={`hp-${mark.id}`} mark={mark} /> : null,
      )}
      {entities.map((mark) =>
        mark.statuses?.length ? <EntityStatuses key={`st-${mark.id}`} mark={mark} /> : null,
      )}
      {interacts.map((mark) => (
        <InteractPrompt key={`ix-${mark.id}`} mark={mark} />
      ))}
    </div>
  );
}
