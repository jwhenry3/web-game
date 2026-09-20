import { Component, Suspense, lazy, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { CharacterWorkspace } from "./workspaces/CharacterWorkspace";

// Workspaces load lazily — a broken one (e.g. mid-refactor syntax error)
// fails inside its own boundary instead of taking down the whole editor.
const MapWorkspace = lazy(() => import("./workspaces/MapWorkspace"));
const EffectsWorkspace = lazy(() => import("./workspaces/EffectsWorkspace"));
const HairWorkspace = lazy(() =>
  import("./workspaces/HairWorkspace").then((m) => ({ default: m.HairWorkspace })),
);

class WorkspaceBoundary extends Component<
  { children: ReactNode },
  { err: string | null }
> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { err: String(e) };
  }
  render() {
    if (this.state.err) {
      return <div className="ed-err">Workspace failed to load: {this.state.err}</div>;
    }
    return this.props.children;
  }
}

export type Workspace = "characters" | "hair" | "maps" | "effects";

const WORKSPACES: { id: Workspace; label: string }[] = [
  { id: "characters", label: "Characters" },
  { id: "hair", label: "Hair" },
  { id: "maps", label: "Maps" },
  { id: "effects", label: "Effects" },
];

function workspaceFromUrl(): Workspace {
  const q = new URLSearchParams(location.search).get("ws");
  return q === "hair" || q === "maps" || q === "effects" ? q : "characters";
}

export function App() {
  const [ws, setWs] = useState<Workspace>(workspaceFromUrl);

  const switchWs = useCallback((w: Workspace) => {
    setWs(w);
    const q = new URLSearchParams(location.search);
    if (w === "characters") q.delete("ws");
    else q.set("ws", w);
    history.replaceState(null, "", `?${q}`);
  }, []);

  return (
    <div className="ed-root">
      <header className="ed-titlebar">
        <span className="ed-logo" aria-hidden="true">◇</span>
        <strong>Editor</strong>
        <nav className="ed-ws-tabs" role="tablist" aria-label="Workspace">
          {WORKSPACES.map((w) => (
            <button
              key={w.id}
              role="tab"
              aria-selected={ws === w.id}
              className={ws === w.id ? "active" : ""}
              onClick={() => switchWs(w.id)}
            >
              {w.label}
            </button>
          ))}
        </nav>
      </header>
      <WorkspaceBoundary>
        <Suspense fallback={<div className="ed-err">Loading…</div>}>
          {ws === "characters" && <CharacterWorkspace />}
          {ws === "hair" && <HairWorkspace />}
          {ws === "maps" && <MapWorkspace />}
          {ws === "effects" && <EffectsWorkspace />}
        </Suspense>
      </WorkspaceBoundary>
    </div>
  );
}
