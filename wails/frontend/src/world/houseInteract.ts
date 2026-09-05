import { net } from "../net/socket";
import { useGame } from "../state/store";

const INTERACT_RANGE = 80;

/** Interact with nearest house door/storage when in the house screen. */
export function tryHouseInteract(): boolean {
  const state = useGame.getState();
  if (state.screen !== "house" || !state.house || !state.selfId) return false;
  if (state.mainMenuOpen || state.openWindow) return false;
  const me = state.house.players.find((p) => p.id === state.selfId);
  if (!me) return false;
  let best: { kind: string; dist: number } | null = null;
  for (const poi of state.house.pois ?? []) {
    const dist = Math.hypot(me.x - poi.x, me.y - poi.y);
    if (dist <= INTERACT_RANGE && (!best || dist < best.dist)) {
      best = { kind: poi.kind, dist };
    }
  }
  if (!best) return false;
  if (best.kind === "storage") net.houseInteract("storage");
  else net.houseInteract("door");
  return true;
}
