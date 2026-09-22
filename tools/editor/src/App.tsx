import { Component, Suspense, lazy, useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { SceneMode } from "./workspaces/SceneWorkspace";

// The workspace loads lazily — a broken one (e.g. mid-refactor syntax error)
// fails inside its own boundary instead of taking down the whole editor.
const SceneWorkspace = lazy(() => import("./workspaces/SceneWorkspace"));
const ContentWorkspace = lazy(() => import("./content/ContentWorkspace"));

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

export type Workspace = SceneMode | "content";

const WORKSPACES: { id: Workspace; label: string }[] = [
  { id: "prefabs", label: "Prefabs" },
  { id: "terrain", label: "Terrain" },
  { id: "characters", label: "Characters" },
  { id: "effects", label: "Effects" },
  { id: "content", label: "Content" },
];

function workspaceFromUrl(): Workspace {
  const p = new URLSearchParams(location.search);
  const ws = p.get("ws");
  if (WORKSPACES.some((w) => w.id === ws)) return ws as Workspace;
  // Legacy deep links: ?ws=scene&mode=<mode>
  const mode = p.get("mode");
  if (ws === "scene" && WORKSPACES.some((w) => w.id === mode)) return mode as Workspace;
  return "prefabs";
}

export function App() {
  const [ws, setWs] = useState<Workspace>(workspaceFromUrl);

  const switchWs = useCallback((w: Workspace) => {
    setWs(w);
    const q = new URLSearchParams(location.search);
    q.set("ws", w);
    q.delete("mode");
    history.replaceState(null, "", `?${q}`);
  }, []);

  return (
    <div className="ed-root">
      <header className="ed-titlebar">
        <span className="ed-logo" aria-hidden="true">◇</span>
        <strong>Scene Editor</strong>
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
          {ws === "content" ? <ContentWorkspace /> : <SceneWorkspace mode={ws} />}
        </Suspense>
      </WorkspaceBoundary>
    </div>
  );
}
