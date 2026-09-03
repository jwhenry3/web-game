import { useState } from "react";
import { adminLogin } from "../net/adminMaps";
import { useGame } from "../state/store";

export function AdminLoginScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const setAdminAuth = useGame((s) => s.setAdminAuth);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await adminLogin(username, password);
      if (!result.is_admin) {
        throw new Error("This account does not have map editor access.");
      }
      setAdminAuth({ token: result.token, username: result.username });
      setScreen("map_editor");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="xiv-window login-panel map-editor-panel">
        <div className="xiv-titlebar">
          <span className="xiv-title">Map Editor — Admin Login</span>
        </div>
        <div className="xiv-body">
          <p className="subtitle">Sign in with an admin account to edit world maps.</p>
          <label className="field-label" htmlFor="admin-user">
            Username
          </label>
          <input
            id="admin-user"
            className="xiv-input"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className="field-label" htmlFor="admin-pass">
            Password
          </label>
          <input
            id="admin-pass"
            className="xiv-input"
            type="password"
            value={password}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="error-text">{error}</p>}
          <div className="map-editor-actions">
            <button type="button" className="xiv-btn gold" disabled={busy} onClick={() => void submit()}>
              {busy ? "Signing in…" : "Enter Map Editor"}
            </button>
            <button type="button" className="xiv-btn" onClick={() => setScreen("title")}>
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
