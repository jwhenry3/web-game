import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Last line of defense: a render error must never leave the player staring at
// a black screen with no way back.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unrecoverable UI error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login-screen">
        <div className="xiv-window login-panel">
          <div className="xiv-titlebar">
            <span className="xiv-title">Something went wrong</span>
          </div>
          <div className="xiv-body">
            <p className="subtitle">The interface hit an unexpected error.</p>
            <div className="error-text">{this.state.error.message}</div>
            <button className="xiv-btn gold wide" onClick={() => location.reload()}>
              Reload Game
            </button>
            <p className="hint">Your hero's progress is saved on the server.</p>
          </div>
        </div>
      </div>
    );
  }
}
