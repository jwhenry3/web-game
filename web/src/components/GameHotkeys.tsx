import { useEffect } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { getChatControl } from "../input/chatControl";
import {
  bindingMatchesEvent,
  isKeybindCaptureActive,
  mergeKeybinds,
  resolveHotbarSlot,
  resolveWindowToggle,
} from "../input/keybinds";
import {
  clickFocusedDialogButton,
  focusPrimaryDialogButton,
  getActiveDialogRoot,
  handleDialogArrowKey,
  isFocusedDialogButton,
} from "../ui/dialogFocus";
import { tryWorldInteract } from "../world/interact";

function inGameScreen(screen: string): boolean {
  return screen === "world" || screen === "battle";
}

function dialogIsOpen(state: ReturnType<typeof useGame.getState>): boolean {
  return !!(
    state.mainMenuOpen ||
    state.worldSkillDialog ||
    state.teleportConfirm ||
    state.openWindow ||
    getActiveDialogRoot()
  );
}

export function GameHotkeys() {
  useEffect(() => {
    const onArrow = (e: KeyboardEvent) => {
      if (isKeybindCaptureActive()) return;
      handleDialogArrowKey(e);
    };

    const onKey = (e: KeyboardEvent) => {
      if (isKeybindCaptureActive()) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inFormField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const chat = getChatControl();
      const chatFocused = chat?.isFocused() ?? false;

      const state = useGame.getState();
      const keybinds = mergeKeybinds(state.profile?.keybinds);
      const inGame = inGameScreen(state.screen);

      if (e.key === "Enter") {
        if (inFormField && !isFocusedDialogButton()) return;
        if (isFocusedDialogButton()) {
          e.preventDefault();
          clickFocusedDialogButton();
          return;
        }
        if (chatFocused) return;
        if (inGame && dialogIsOpen(state)) return;
        if (inGame && chat) {
          e.preventDefault();
          state.setChatTab("general");
          chat.focus();
        }
        return;
      }

      if (inFormField && !chatFocused) return;

      if (e.key === "Escape") {
        if (!inGame) return;
        if (state.teleportConfirm) {
          state.closeTeleportConfirm();
          return;
        }
        if (state.worldSkillDialog) {
          state.closeWorldSkillDialog();
          return;
        }
        if (state.mainMenuOpen) {
          if (state.mainMenuView === "options") {
            state.setMainMenuView("menu");
          } else {
            state.closeMainMenu();
          }
          return;
        }
        if (chatFocused) {
          chat?.blur();
          return;
        }
        if (state.openWindow || state.bindSlot || state.selectedAction) {
          state.closeWindow();
          state.setSelectedAction(null);
          state.setBindSlot(null);
          return;
        }
        state.openMainMenu();
        return;
      }

      if (bindingMatchesEvent(keybinds.interact ?? "Space", e)) {
        e.preventDefault();
        if (isFocusedDialogButton()) {
          clickFocusedDialogButton();
          return;
        }
        if (dialogIsOpen(state)) {
          focusPrimaryDialogButton();
          return;
        }
        if (!inGame) return;
        if (state.teleportConfirm) {
          net.useWorldSkill("teleport", state.teleportConfirm.id);
          state.closeTeleportConfirm();
          state.closeWorldSkillDialog();
          return;
        }
        if (state.worldSkillDialog === "return" && state.profile?.save_point_id) {
          net.useWorldSkill("return");
          return;
        }
        if (!state.mainMenuOpen && !state.openWindow) {
          tryWorldInteract();
        }
        return;
      }

      if (!inGame) return;

      const hotbarSlot = resolveHotbarSlot(e, keybinds);
      if (hotbarSlot) {
        const { screen, battle, rtBattle } = state;
        if (screen === "battle" && (battle || rtBattle)) {
          e.preventDefault();
          net.activateHotbar(hotbarSlot);
        } else if (screen === "world") {
          e.preventDefault();
          net.activateHotbar(hotbarSlot);
        }
        return;
      }

      const win = resolveWindowToggle(e, keybinds);
      if (win) {
        if (win === "map" && state.worldSkillDialog) return;
        e.preventDefault();
        state.toggleWindow(win);
      }
    };
    window.addEventListener("keydown", onArrow, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onArrow, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
