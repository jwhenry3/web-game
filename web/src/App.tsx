import { useEffect, useState } from "react";
import { useGame } from "./state/store";
import { AuthScreen } from "./components/AuthScreen";
import { CharacterSelectScreen } from "./components/CharacterSelectScreen";
import { CharacterCreationWizard } from "./components/CharacterCreationWizard";
import { PhaserGame } from "./phaser/PhaserGame";
import { WorldHUD } from "./components/WorldHUD";
import { pluginHost } from "./core/plugins/pluginHost";
import { SidePanel } from "./components/SidePanel";
import { GameWindows, WindowBar } from "./components/GameWindows";
import { Hotbar } from "./components/Hotbar";
import { GameHotkeys } from "./components/GameHotkeys";
import { MainMenu } from "./components/MainMenu";
import { ExpBar } from "./components/ExpBar";
import { fetchMe, getStoredToken, setStoredToken } from "./net/auth";

export function App() {
  const screen = useGame((s) => s.screen);
  const setAuth = useGame((s) => s.setAuth);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getStoredToken();
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        const me = await fetchMe(token);
        if (cancelled) return;
        setAuth({
          token,
          username: me.username,
          characters: me.characters,
          hasCharacter: me.has_character,
          character: me.character ?? null,
        });
      } catch {
        setStoredToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAuth]);

  if (booting) {
    return (
      <div className="login-screen">
        <div className="xiv-window login-panel">
          <div className="xiv-body">
            <p className="subtitle">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "auth") {
    return <AuthScreen />;
  }

  if (screen === "select") {
    return <CharacterSelectScreen />;
  }

  if (screen === "create") {
    return <CharacterCreationWizard />;
  }

  const combat = pluginHost.getCombatPlugin();
  const CombatHUD = combat.HUD;

  return (
    <div className="game-layout">
      <GameHotkeys />
      <div className="game-stage">
        <PhaserGame />
        {screen === combat.battleScreen ? <CombatHUD /> : <WorldHUD />}
        <SidePanel />
        <Hotbar />
        <ExpBar />
        <WindowBar />
        <GameWindows />
        <MainMenu />
      </div>
    </div>
  );
}
