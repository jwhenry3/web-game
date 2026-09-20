import { useGame } from "../state/store";

const LABELS: Record<"house" | "world", string> = {
  house: "Entering camp…",
  world: "Returning to the field…",
};

/** Full-stage loading screen shown while a camp↔world transfer is in flight.
 * Covers the canvas + HUD so pointer input is blocked until the destination's
 * state lands (keyboard is gated via gameDialogOpen → uiOwnsKeyboard). */
export function ZoneTransition() {
  const transition = useGame((s) => s.transition);
  if (!transition) return null;
  return (
    <div className="zone-transition" role="status" aria-live="polite">
      <div className="zone-transition-spinner" aria-hidden />
      <div className="zone-transition-label">{LABELS[transition]}</div>
    </div>
  );
}
