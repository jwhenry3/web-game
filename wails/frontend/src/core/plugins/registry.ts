import type { ClientModule } from "./contracts";

export const PLUGIN_REGISTRY: Record<string, () => Promise<{ default: ClientModule }>> = {
  "combat.ordo": () => import("../../plugins/combat-atb"),
  "combat.atb": () => import("../../plugins/combat-atb"), // legacy alias
  "combat.realtime": () => import("../../plugins/combat-realtime"),
};
