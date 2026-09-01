import { useEffect, useState } from "react";
import { deleteCharacter, MAX_CHARACTERS } from "../net/auth";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { ALL_JOBS, RACES } from "../types";

export function CharacterSelectScreen() {
  const username = useGame((s) => s.username);
  const characters = useGame((s) => s.characters);
  const authToken = useGame((s) => s.authToken);
  const setScreen = useGame((s) => s.setScreen);
  const setCharacters = useGame((s) => s.setCharacters);
  const logout = useGame((s) => s.logout);
  const loginError = useGame((s) => s.loginError);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (loginError) setBusy(null);
  }, [loginError]);

  const raceName = (id: string) => RACES.find((r) => r.id === id)?.name ?? id;
  const jobName = (id: string) => ALL_JOBS.find((j) => j.id === id)?.abbr ?? id;

  const play = (name: string) => {
    setBusy(name);
    setError(null);
    useGame.setState({ character: characters.find((c) => c.name === name) ?? null, loginError: null });
    net.enterWorld({ player_name: name });
  };

  const startCreate = () => {
    setError(null);
    setScreen("create");
  };

  const doLogout = () => {
    net.disconnect();
    logout();
  };

  const doDelete = async (name: string) => {
    if (!authToken) return;
    setBusy(name);
    setError(null);
    try {
      const result = await deleteCharacter(authToken, name);
      setCharacters(result.characters);
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  };

  const atLimit = characters.length >= MAX_CHARACTERS;

  return (
    <div className="login-screen">
      <div className="xiv-window login-panel character-select-panel">
        <div className="xiv-titlebar">
          <span className="xiv-title">Select Character</span>
        </div>
        <div className="xiv-body">
          <p className="subtitle">Signed in as {username}</p>
          <div className="character-list">
            {characters.map((c) => (
              <div key={c.name} className="character-row">
                <div className="character-row-info">
                  <span className="character-row-name">{c.name}</span>
                  <span className="character-row-meta">
                    {raceName(c.race)} · {jobName(c.main_job)}
                    {c.sub_job ? ` / ${jobName(c.sub_job)}` : ""}
                  </span>
                </div>
                <div className="character-row-actions">
                  {confirmDelete === c.name ? (
                    <>
                      <span className="hint">Delete {c.name}?</span>
                      <button
                        className="xiv-btn danger"
                        disabled={busy !== null}
                        onClick={() => doDelete(c.name)}
                      >
                        Confirm
                      </button>
                      <button
                        className="xiv-btn"
                        disabled={busy !== null}
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="xiv-btn gold"
                        disabled={busy !== null}
                        onClick={() => play(c.name)}
                      >
                        {busy === c.name ? "Entering…" : "Play"}
                      </button>
                      <button
                        className="xiv-btn danger"
                        disabled={busy !== null}
                        onClick={() => setConfirmDelete(c.name)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {(error || loginError) && <div className="error-text">{error ?? loginError}</div>}
          <button
            className="xiv-btn wide"
            disabled={atLimit || busy !== null}
            onClick={startCreate}
          >
            {atLimit ? `Character limit (${MAX_CHARACTERS})` : "Create New Character"}
          </button>
          <button className="xiv-btn wide logout-btn" disabled={busy !== null} onClick={doLogout}>
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
