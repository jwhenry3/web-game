import { useEffect, useRef } from "react";
import { GameRenderer } from "./GameRenderer";

/** Three.js game canvas host (replaces PhaserGame). */
export function ThreeGame() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const game = new GameRenderer(host);
    game.start();
    return () => game.dispose();
  }, []);

  return <div className="three-host" ref={hostRef} />;
}
