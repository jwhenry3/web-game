import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { useGame } from "../state/store";
import { GAME_SCENES } from "./BootScene";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current!,
      width: 960,
      height: 600,
      backgroundColor: "#0a0f1e",
      scene: GAME_SCENES,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    // Switch scenes when the player enters/leaves a battle instance.
    const unsub = useGame.subscribe((s, prev) => {
      if (s.screen === prev.screen) return;
      if (s.screen === "battle") {
        game.scene.sleep("world");
        game.scene.run("battle");
      } else if (s.screen === "world") {
        game.scene.sleep("battle");
        game.scene.run("world");
      }
    });

    return () => {
      unsub();
      game.destroy(true);
    };
  }, []);

  return <div className="phaser-host" ref={hostRef} />;
}
