import { useEffect, useState } from "react";
import { useGame } from "./state/store";
import { AuthScreen } from "./components/AuthScreen";
import { CharacterSelectScreen } from "./components/CharacterSelectScreen";
import { CharacterCreationWizard } from "./components/CharacterCreationWizard";
import { PhaserGame } from "./phaser/PhaserGame";
import { ThreeGame } from "./three/ThreeGame";
import { EntityOverlays } from "./components/EntityOverlays";
import { WorldHUD } from "./components/WorldHUD";
import { HouseHUD } from "./components/HouseHUD";
import { InviteToasts } from "./components/InviteToasts";
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
import { ZoneTransition } from "./components/ZoneTransition";
import { ExpBar } from "./components/ExpBar";
import { ItemMenuProvider } from "./components/ItemContextMenu";
import { fetchMe, getStoredToken, setStoredToken } from "./net/auth";
import { TitleScreen } from "./components/TitleScreen";
import { hudScaleVars } from "./ui/uiScale";
import { applyTheme, DEFAULT_THEME } from "./ui/themes";
// Game Designer (2D map editor) currently disabled.
// import { AdminLoginScreen } from "./components/AdminLoginScreen";
// import { MapEditorScreen } from "./components/MapEditorScreen";

function AppBody() {
  const screen = useGame((s) => s.screen);
  const setAuth = useGame((s) => s.setAuth);
  const uiScale = useGame((s) => s.options.uiScale);
  const [booting, setBooting] = useState(true);
  const [use3D, setUse3D] = useState(true);

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

  // Game Designer currently disabled.
  // if (screen === "admin_auth") {
  //   return <AdminLoginScreen />;
  // }
  // if (screen === "map_editor") {
  //   return <MapEditorScreen />;
  // }
  if (screen === "admin_auth" || screen === "map_editor") {
    return <TitleScreen />;
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

  return (
    <ItemMenuProvider>
      <div className="game-layout">
        <div className="game-stage" style={hudScaleVars(uiScale)}>
          {screen === "world" && use3D ? <ThreeGame onFallback={() => setUse3D(false)} /> : <PhaserGame />}
          {screen === "world" && <button type="button" className="cm-btn world-renderer-toggle" onClick={() => setUse3D(value => !value)}>{use3D ? "Switch to 2D" : "Switch to 3D"}</button>}
          <EntityOverlays />
          {screen === "house" ? <HouseHUD /> : <WorldHUD />}
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
          <ZoneTransition />
        </div>
      </div>
    </ItemMenuProvider>
  );
}

export function App() {
  const theme = useGame((s) => s.options.theme);

  useEffect(() => {
    applyTheme(theme ?? DEFAULT_THEME);
  }, [theme]);

  useEffect(() => {
    // Suppress the native context menu app-wide; custom React menus and
    // right-click world deselect handle the gesture instead. Text inputs
    // keep the default menu for copy/paste.
    const suppress = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", suppress);
    return () => window.removeEventListener("contextmenu", suppress);
  }, []);

  return (
    <>
      <GameHotkeys />
      <AppBody />
    </>
  );
}
