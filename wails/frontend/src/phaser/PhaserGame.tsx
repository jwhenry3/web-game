/**
 * PhaserGame — DISABLED while the Three.js placeholder renderer is active.
 * Restore by swapping ThreeGame → PhaserGame in App.tsx and uncommenting below.
 */
/*
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { useGame } from "../state/store";
import { pluginHost } from "../core/plugins/pluginHost";
import { buildGameScenes } from "./BootScene";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const combatMode = useGame((s) => s.combatMode);

  useEffect(() => {
    const combat = pluginHost.getCombatPlugin();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current!,
      width: 960,
      height: 600,
      backgroundColor: "#0a0f1e",
      scene: buildGameScenes(),
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });
    gameRef.current = game;

    const unsub = useGame.subscribe((s, prev) => {
      if (s.screen === prev.screen) return;
      if (s.screen === combat.battleScreen) {
        game.scene.sleep("world");
        if (game.scene.isActive("house")) game.scene.stop("house");
        if (!game.scene.getScene(combat.battleSceneKey)) return;
        game.scene.stop(combat.battleSceneKey);
        game.scene.start(combat.battleSceneKey);
      } else if (s.screen === "house") {
        if (game.scene.getScene(combat.battleSceneKey)) {
          game.scene.stop(combat.battleSceneKey);
        }
        game.scene.sleep("world");
        game.scene.start("house");
      } else if (s.screen === "world") {
        if (game.scene.getScene(combat.battleSceneKey)) {
          game.scene.stop(combat.battleSceneKey);
        }
        if (game.scene.isActive("house") || game.scene.isSleeping("house")) {
          game.scene.stop("house");
        }
        game.scene.wake("world");
      }
    });

    const state = useGame.getState();
    if (state.screen === combat.battleScreen && game.scene.getScene(combat.battleSceneKey)) {
      game.scene.sleep("world");
      game.scene.start(combat.battleSceneKey);
    } else if (state.screen === "house") {
      game.scene.sleep("world");
      game.scene.start("house");
    }

    return () => {
      unsub();
      game.destroy(true);
      gameRef.current = null;
    };
  }, [combatMode]);

  return <div className="phaser-host" ref={hostRef} />;
}
*/

export function PhaserGame() {
  return null;
}
