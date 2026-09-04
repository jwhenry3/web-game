import { useEffect, useState } from "react";
import { useGame } from "./state/store";
import { AuthScreen } from "./components/AuthScreen";
import { CharacterSelectScreen } from "./components/CharacterSelectScreen";
import { CharacterCreationWizard } from "./components/CharacterCreationWizard";
import { PhaserGame } from "./phaser/PhaserGame";
import { EntityOverlays } from "./components/EntityOverlays";
import { WorldHUD } from "./components/WorldHUD";
import { HouseHUD } from "./components/HouseHUD";
import { InviteToasts } from "./components/InviteToasts";
import { pluginHost } from "./core/plugins/pluginHost";
import { SidePanel } from "./components/SidePanel";
import { GameWindows, WindowBar } from "./components/GameWindows";
import { WorldSkillDialogs } from "./components/WorldSkillDialogs";
import { NpcDialog } from "./components/NpcDialog";
import { JobChangeDialog } from "./components/JobChangeDialog";
import { Hotbar } from "./components/Hotbar";
import { HouseToolbar } from "./components/HouseToolbar";
import { HousePlaceLayer } from "./components/HousePlaceLayer";
import { GameHotkeys } from "./components/GameHotkeys";
import { MainMenu } from "./components/MainMenu";
import { ExpBar } from "./components/ExpBar";
import { ItemMenuProvider } from "./components/ItemContextMenu";
import { fetchMe, getStoredToken, setStoredToken } from "./net/auth";
import { TitleScreen } from "./components/TitleScreen";
import { AdminLoginScreen } from "./components/AdminLoginScreen";
import { MapEditorScreen } from "./components/MapEditorScreen";

function AppBody() {
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
        <div className="cm-window login-panel">
          <div className="cm-body">
            <p className="subtitle">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "title") {
    return <TitleScreen />;
  }

  if (screen === "admin_auth") {
    return <AdminLoginScreen />;
  }

  if (screen === "map_editor") {
    return <MapEditorScreen />;
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
    <ItemMenuProvider>
      <div className="game-layout">
        <div className="game-stage">
          <PhaserGame />
          <EntityOverlays />
          {screen === combat.battleScreen ? (
            <CombatHUD />
          ) : screen === "house" ? (
            <HouseHUD />
          ) : (
            <WorldHUD />
          )}
          <SidePanel />
          {screen === "house" ? <HouseToolbar /> : <Hotbar />}
          {screen === "house" && <HousePlaceLayer />}
          <ExpBar />
          <WindowBar />
          <GameWindows />
          <WorldSkillDialogs />
          <NpcDialog />
          <JobChangeDialog />
          <InviteToasts />
          <MainMenu />
        </div>
      </div>
    </ItemMenuProvider>
  );
}

export function App() {
  return (
    <>
      <GameHotkeys />
      <AppBody />
    </>
  );
}
