import { Component, Suspense, lazy, useCallback, useState } from "react";
import type { ReactNode } from "react";

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

export type Workspace = "world" | "content";

const WORKSPACES: { id: Workspace; label: string }[] = [
  { id: "world", label: "World" },
  { id: "content", label: "Content" },
];

// Retired scene modes map to the workspace that absorbed them.
const LEGACY_WS: Record<string, Workspace> = {
  scene: "world",
  world: "world",
  prefabs: "world",
  terrain: "world",
  content: "content",
  characters: "content",
  effects: "content",
};

function workspaceFromUrl(): Workspace {
  const p = new URLSearchParams(location.search);
  const ws = p.get("ws") ?? "";
  // Legacy deep links: ?ws=scene&mode=<mode>
  if (ws === "scene") return LEGACY_WS[p.get("mode") ?? ""] ?? "world";
  return LEGACY_WS[ws] ?? "world";
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
          {ws === "content" ? <ContentWorkspace /> : <SceneWorkspace />}
        </Suspense>
      </WorkspaceBoundary>
    </div>
  );
}
