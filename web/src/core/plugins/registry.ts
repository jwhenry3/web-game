import type { ClientModule } from "./contracts";

export const PLUGIN_REGISTRY: Record<string, () => Promise<{ default: ClientModule }>> = {
  "combat.atb": () => import("../../plugins/combat-atb"),
  "combat.realtime": () => import("../../plugins/combat-realtime"),
};
