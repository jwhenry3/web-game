import type Phaser from "phaser";
import type { ComponentType } from "react";
import type { Envelope, MessageType } from "../../types";
import type { useGame } from "../../state/store";

export const CONTRACTS_VERSION = "1.0.0";

export type GameStore = ReturnType<typeof useGame.getState>;

export interface PluginContext {
  moduleId: string;
  config: Record<string, unknown>;
  getState: typeof useGame.getState;
  setState: typeof useGame.setState;
  send: (type: MessageType, payload?: unknown) => void;
  onBattleEvent: (handler: (detail: unknown) => void) => () => void;
  registerScreen: (screen: string, component: ComponentType) => void;
  registerBattleScene: (key: string, scene: new () => Phaser.Scene) => void;
  registerHandler: (type: string, handler: (env: Envelope) => void) => void;
}

export interface ClientModule {
  id: string;
  register(ctx: PluginContext): void;
  dispose?(): void;
}

export interface ModulesManifest {
  version: number;
  combat: string;
  modules: Array<{
    id: string;
    name: string;
    version: string;
    capabilities: string[];
    frontend: { pluginId: string };
    config?: Record<string, unknown>;
  }>;
}

export interface LoadedCombatPlugin {
  id: string;
  battleScreen: string;
  HUD: ComponentType;
  battleSceneKey: string;
}
