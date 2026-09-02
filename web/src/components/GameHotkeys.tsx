import { useEffect } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import type { WindowId } from "../types";

const WINDOW_KEYS: Record<string, WindowId> = {
  c: "character",
  e: "equipment",
  i: "inventory",
  k: "skills",
  o: "social",
};

export function GameHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        const state = useGame.getState();
        if (state.mainMenuOpen) {
          if (state.mainMenuView === "options") {
            state.setMainMenuView("menu");
          } else {
            state.closeMainMenu();
          }
          return;
        }
        if (state.openWindow || state.bindSlot || state.selectedAction) {
          state.closeWindow();
          state.setSelectedAction(null);
          state.setBindSlot(null);
          return;
        }
        if (state.screen === "world" || state.screen === "battle") {
          state.openMainMenu();
        }
        return;
      }

      if (e.key >= "1" && e.key <= "5") {
        const { screen, battle, rtBattle } = useGame.getState();
        if (screen === "battle" && (battle || rtBattle)) {
          e.preventDefault();
          net.activateHotbar(e.key);
        }
        return;
      }

      const win = WINDOW_KEYS[e.key.toLowerCase()];
      if (win && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        useGame.getState().toggleWindow(win);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
