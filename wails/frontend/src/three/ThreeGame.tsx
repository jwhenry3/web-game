import { useEffect, useRef, useState } from "react";
import { useGame } from "../state/store";
import { WorldRenderer } from "./WorldRenderer";
import { HouseRenderer } from "./HouseRenderer";
import "./three.css";

/** Single 3D host — the overworld and camp interiors share this mount, and
 * screen transitions swap the active renderer in place. */
export function ThreeGame() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inHouse = useGame((s) => s.screen === "house");
  useEffect(() => {
    let world: { dispose(): void } | undefined;
    try {
      world = inHouse
        ? new HouseRenderer(host.current!, setError)
        : new WorldRenderer(host.current!, setError);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return () => world?.dispose();
  }, [attempt, inHouse]);
  return <>
    <div className="three-host" ref={host} />
    <div className="three-controls"><span>WASD · Move</span><span>Click · Walk / Target</span><span>Right drag · Orbit</span><span>Scroll · Zoom</span><span>Shift · Dodge</span></div>
    {error && <div className="three-error" role="alert"><strong>3D view unavailable</strong><p>{error}</p><button className="cm-btn" onClick={() => { setError(null); setAttempt(v => v + 1); }}>Retry</button></div>}
  </>;
}
