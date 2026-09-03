import { useState } from "react";
import { login, register, setStoredToken } from "../net/auth";
import { useGame } from "../state/store";

type Mode = "login" | "register";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setAuth = useGame((s) => s.setAuth);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = mode === "login" ? await login(username, password) : await register(username, password);
      setStoredToken(result.token);
      setAuth({
        token: result.token,
        username: result.username,
        characters: result.characters,
        hasCharacter: result.has_character,
        character: result.character ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitLabel = busy ? "Please wait…" : mode === "login" ? "Log In" : "Create Account";

  return (
    <div className="login-screen">
      <div className="xiv-window login-panel">
        <div className="xiv-titlebar">
          <span className="xiv-title">FF5 Multiplayer</span>
        </div>
        <div className="xiv-body">
          <p className="subtitle">Sign in to enter the world</p>
          <div className="xiv-tabs">
            <button
              type="button"
              className={`xiv-tab ${mode === "login" ? "on" : ""}`}
              onClick={() => setMode("login")}
            >
              Log In
            </button>
            <button
              type="button"
              className={`xiv-tab ${mode === "register" ? "on" : ""}`}
              onClick={() => setMode("register")}
            >
              Register
            </button>
          </div>
          <label className="field-label" htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            className="xiv-input"
            value={username}
            maxLength={20}
            autoComplete="username"
            placeholder="3–20 characters"
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className="field-label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="xiv-input"
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="At least 6 characters"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {error && <div className="error-text">{error}</div>}
          <button
            type="button"
            className="xiv-btn gold wide"
            disabled={busy || username.trim().length < 3 || password.length < 6}
            onClick={submit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
