import { SpinePlugin } from "@esotericsoftware/spine-phaser-v4";
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { useGame } from "../state/store";
import { buildGameScenes } from "./BootScene";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current!,
      width: 960,
      height: 600,
      backgroundColor: "#0a0f1e",
      scene: buildGameScenes(useGame.getState().screen === "house" ? "house" : "world"),
      plugins: {
        // Scene-level Spine runtime — gives every scene `load.spineSkeleton`,
        // `load.spineAtlas`, `add.spine`, and `scene.spine`.
        scene: [{ key: "spine", plugin: SpinePlugin, mapping: "spine" }],
      },
      scale: {
        // Canvas always fills the stage at native resolution; each scene
        // zooms its camera via trackContentZoom so the rendered content
        // scales with the window (clamped 0.75–1.25).
        mode: Phaser.Scale.RESIZE,
      },
    });
    gameRef.current = game;
    (window as unknown as { __game?: Phaser.Game }).__game = game;

    const unsub = useGame.subscribe((s, prev) => {
      if (s.screen === prev.screen) return;
      if (s.screen === "house") {
        game.scene.sleep("world");
        game.scene.start("house");
      } else if (s.screen === "world") {
        if (game.scene.isActive("house") || game.scene.isSleeping("house")) {
          game.scene.stop("house");
        }
        if (game.scene.isSleeping("world")) game.scene.wake("world");
        else if (!game.scene.isActive("world")) game.scene.start("world");
      }
    });

    return () => {
      unsub();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="phaser-host" ref={hostRef} />;
}
