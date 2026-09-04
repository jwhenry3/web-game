import { useGame } from "../state/store";

export function TitleScreen() {
  const setScreen = useGame((s) => s.setScreen);

  return (
    <div className="login-screen title-screen">
      <div className="cm-window login-panel title-panel">
        <div className="cm-titlebar">
          <span className="cm-title">Clara Mundi</span>
        </div>
        <div className="cm-body title-body">
          <p className="subtitle">Choose how to continue</p>
          <button type="button" className="cm-btn gold wide title-btn" onClick={() => setScreen("auth")}>
            Play Game
          </button>
          <button type="button" className="cm-btn wide title-btn" onClick={() => setScreen("admin_auth")}>
            Game Designer
          </button>
          <p className="dim title-hint">Game Designer requires an admin account (default: admin / admin)</p>
        </div>
      </div>
    </div>
  );
}
