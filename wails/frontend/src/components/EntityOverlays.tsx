import { useSyncExternalStore } from "react";
import {
  getWorldOverlays,
  subscribeEntityOverlays,
  type EntityOverlayMark,
  type InteractPromptMark,
  type PoiLabelMark,
  type WorldOverlayFrame,
} from "../world/entityOverlayBridge";

function useWorldOverlays(): WorldOverlayFrame {
  return useSyncExternalStore(subscribeEntityOverlays, getWorldOverlays, getWorldOverlays);
}

function Nameplate({ mark }: { mark: EntityOverlayMark }) {
  return (
    <div
      className={`cm-nameplate cm-nameplate--${mark.variant}`}
      style={{ left: mark.nameX, top: mark.nameY }}
    >
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
  if (entities.length === 0 && pois.length === 0 && interacts.length === 0) return null;
  return (
    <div className="cm-entity-overlays" aria-hidden>
      {pois.map((mark) => (
        <PoiLabel key={`poi-${mark.id}`} mark={mark} />
      ))}
      {entities.map((mark) => (
        <Nameplate key={`name-${mark.id}`} mark={mark} />
      ))}
      {entities.map((mark) =>
        mark.castPct != null ? <EntityCastBar key={`cast-${mark.id}`} mark={mark} /> : null,
      )}
      {interacts.map((mark) => (
        <InteractPrompt key={`ix-${mark.id}`} mark={mark} />
      ))}
    </div>
  );
}
