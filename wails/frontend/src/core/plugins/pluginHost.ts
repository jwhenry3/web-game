import type { ComponentType } from "react";
import type { LoadedCombatPlugin, ModulesManifest, PluginContext } from "./contracts";
import { PLUGIN_REGISTRY } from "./registry";
import { useGame } from "../../state/store";
import type { Envelope, MessageType } from "../../types";
import { apiUrl, platformFetch } from "../../net/platform";

type Handler = (env: Envelope) => void;
type BattleListener = (detail: unknown) => void;

export class PluginHost {
  private handlers = new Map<string, Handler>();
  private battleScreen = "battle";
  private battleSceneKey = "battle";
  private HUD: ComponentType = () => null;
  private combatModuleId = "";
  private battleListeners = new Set<BattleListener>();

  getCombatPlugin(): LoadedCombatPlugin {
    return {
      id: this.combatModuleId,
      battleScreen: this.battleScreen,
      HUD: this.HUD,
      battleSceneKey: this.battleSceneKey,
    };
  }

  async loadFromManifest(manifest: ModulesManifest): Promise<void> {
    this.handlers.clear();
    const combatMod = manifest.modules.find((m) => m.id === manifest.combat);
    if (!combatMod) {
      throw new Error(`Combat module ${manifest.combat} not found in manifest`);
    }
    const pluginId = combatMod.frontend.pluginId;
    const loader = PLUGIN_REGISTRY[pluginId];
    if (!loader) {
      throw new Error(`Unknown frontend plugin ${pluginId}`);
    }
    const mod = await loader();
    const ctx = this.createContext(combatMod.id, combatMod.config ?? {});
    mod.default.register(ctx);
    this.combatModuleId = combatMod.id;
    useGame.setState({ combatMode: combatMod.id });
  }

  private createContext(moduleId: string, config: Record<string, unknown>): PluginContext {
    return {
      moduleId,
      config,
      getState: useGame.getState,
      setState: useGame.setState,
      send: (type, payload) => {
        const ws = (window as unknown as { __gameSocketSend?: (t: MessageType, p?: unknown) => void }).__gameSocketSend;
        ws?.(type, payload);
      },
      onBattleEvent: (handler) => {
        this.battleListeners.add(handler);
        return () => this.battleListeners.delete(handler);
      },
      registerScreen: (screen, component) => {
        this.battleScreen = screen;
        this.HUD = component;
      },
      registerBattleScene: (key, _scene) => {
        // Phaser scenes are unused by the Three.js renderer; keep the key for HUD routing.
        this.battleSceneKey = key;
        void _scene;
      },
      registerHandler: (type, handler) => {
        this.handlers.set(type, handler);
      },
    };
  }

  registerHandler(type: string, handler: Handler) {
    this.handlers.set(type, handler);
  }

  dispatch(env: Envelope): boolean {
    const handler = this.handlers.get(env.type);
    if (!handler) return false;
    handler(env);
    return true;
  }

  emitBattleEvent(detail: unknown) {
    for (const l of this.battleListeners) l(detail);
  }
}

export const pluginHost = new PluginHost();

export async function applyMapSnapshot(map: {
  combat: string;
  modules: ModulesManifest["modules"];
}): Promise<void> {
  if (pluginHost.getCombatPlugin().id === map.combat && map.combat) {
    return;
  }
  await pluginHost.loadFromManifest({
    version: 1,
    combat: map.combat,
    modules: map.modules,
  });
}

export async function bootstrapPlugins(): Promise<PluginHost> {
  const manifest: ModulesManifest = await platformFetch(apiUrl("/api/modules")).then((r) => {
    if (!r.ok) throw new Error("Failed to load /api/modules");
    return r.json();
  });
  await pluginHost.loadFromManifest(manifest);
  return pluginHost;
}
