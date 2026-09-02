import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { useGame } from "../state/store";
import { pluginHost } from "../core/plugins/pluginHost";
import { buildGameScenes } from "./BootScene";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

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
        if (!game.scene.getScene(combat.battleSceneKey)) return;
        game.scene.start(combat.battleSceneKey);
      } else if (s.screen === "world") {
        if (game.scene.getScene(combat.battleSceneKey)) {
          game.scene.stop(combat.battleSceneKey);
        }
        game.scene.wake("world");
      }
    });

    const state = useGame.getState();
    if (state.screen === combat.battleScreen && game.scene.getScene(combat.battleSceneKey)) {
      game.scene.sleep("world");
      game.scene.start(combat.battleSceneKey);
    }

    return () => {
      unsub();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="phaser-host" ref={hostRef} />;
}
