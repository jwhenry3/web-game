import { useEffect, useRef, useState } from "react";
import { WorldRenderer } from "./WorldRenderer";
import "./three.css";

export function ThreeGame({ onFallback }: { onFallback?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let world: WorldRenderer | undefined;
    try { world = new WorldRenderer(host.current!, setError); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    return () => world?.dispose();
  }, [attempt]);
  return <>
    <div className="three-host" ref={host} />
    <div className="three-controls"><span>WASD · Move</span><span>Click · Walk / Target</span><span>Right drag · Orbit</span><span>Scroll · Zoom</span><span>Shift · Dodge</span></div>
    {error && <div className="three-error" role="alert"><strong>3D view unavailable</strong><p>{error}</p><button className="cm-btn" onClick={() => { setError(null); setAttempt(v => v + 1); }}>Retry</button>{onFallback && <button className="cm-btn" onClick={onFallback}>Use 2D</button>}</div>}
  </>;
}
