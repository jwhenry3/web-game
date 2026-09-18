import { useEffect } from "react";
import { net } from "../net/socket";
import { gameDialogOpen, useGame } from "../state/store";
import { getChatControl } from "../input/chatControl";
import {
  bindingMatchesEvent,
  isKeybindCaptureActive,
  mergeKeybinds,
  resolveHotbarSlot,
  resolveWindowToggle,
} from "../input/keybinds";
import { tryWorldInteract } from "../world/interact";
import { tryHouseInteract } from "../world/houseInteract";
// import { tryHouseInteract } from "../phaser/HouseScene";
import { clearHousePlace, getHousePlaceState, setHousePickMode } from "../world/housePlaceBridge";
import {
  getHouseSkinPickerOpen,
  setHouseSkinPickerOpen,
  toggleHouseSkinPicker,
} from "../world/houseSkinBridge";

function inGameScreen(screen: string): boolean {
  return screen === "world" || screen === "house";
}

function dialogIsOpen(state: ReturnType<typeof useGame.getState>): boolean {
  return gameDialogOpen(state);
}

/** House tool strip uses 1–5 so WASD movement stays free. */
function tryHouseToolKey(e: KeyboardEvent, state: ReturnType<typeof useGame.getState>): boolean {
  if (state.screen !== "house" || !state.house) return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  const key =
    e.code === "Digit1" || e.key === "1"
      ? "1"
      : e.code === "Digit2" || e.key === "2"
        ? "2"
        : e.code === "Digit3" || e.key === "3"
          ? "3"
          : e.code === "Digit4" || e.key === "4"
            ? "4"
            : e.code === "Digit5" || e.key === "5"
              ? "5"
              : null;
  if (!key) return false;

  const isOwner = !!state.house.is_owner;
  if (key === "1") {
    if (!isOwner) return true;
    clearHousePlace();
    setHouseSkinPickerOpen(false);
    state.toggleWindow("house_storage");
    return true;
  }
  if (key === "2") {
    if (!isOwner) return true;
    setHouseSkinPickerOpen(false);
    setHousePickMode(!getHousePlaceState().pickMode);
    return true;
  }
  if (key === "3") {
    if (!getHousePlaceState().pickMode) return true;
    clearHousePlace();
    return true;
  }
  if (key === "4") {
    if (!isOwner) return true;
    clearHousePlace();
    toggleHouseSkinPicker();
    return true;
  }
  if (key === "5") {
    clearHousePlace();
    setHouseSkinPickerOpen(false);
    net.leaveHouse();
    return true;
  }
  return false;
}

export function GameHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isKeybindCaptureActive()) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inFormField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!target?.isContentEditable;
      const chat = getChatControl();
      const chatFocused = chat?.isFocused() ?? false;

      const state = useGame.getState();
      const keybinds = mergeKeybinds(state.profile?.keybinds);
      const inGame = inGameScreen(state.screen);

      if (e.key === "Enter") {
        if (inFormField) return;
        if (chatFocused) return;
        if (inGame && dialogIsOpen(state)) return;
        if (inGame && chat) {
          e.preventDefault();
          state.setChatTab("general");
          chat.focus();
        }
        return;
      }

      if (e.key === "Escape" && (!inFormField || chatFocused)) {
        if (!inGame) return;
        if (state.teleportConfirm) {
          state.closeTeleportConfirm();
          return;
        }
        if (state.worldSkillDialog) {
          state.closeWorldSkillDialog();
          return;
        }
        if (state.npcDialog) {
          state.closeNpcDialog();
          return;
        }
        if (state.jobChangeDialog) {
          state.closeJobChangeDialog();
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
        if (state.openWindow || state.bindSlot || state.selectedAction || state.commandPetId) {
          state.closeWindow();
          state.setSelectedAction(null);
          state.setCommandPetId(null);
          state.setBindSlot(null);
          return;
        }
        if (state.screen === "house" && getHousePlaceState().pickMode) {
          clearHousePlace();
          return;
        }
        if (state.screen === "house" && getHouseSkinPickerOpen()) {
          setHouseSkinPickerOpen(false);
          return;
        }
        const selfEnt = state.selfId ? state.entities[state.selfId] : undefined;
        if (selfEnt?.target_id) {
          net.setTarget("");
          return;
        }
        state.openMainMenu();
        return;
      }

      // Keystrokes aimed at a form field — chat included — are text entry, not
      // game keybinds. Only Enter/Escape above apply while typing.
      if (inFormField || chatFocused) return;

      if (bindingMatchesEvent(keybinds.interact ?? "Space", e)) {
        e.preventDefault();
        if (dialogIsOpen(state)) return;
        if (!inGame) return;
        if (state.teleportConfirm) {
          net.useWorldSkill("port", state.teleportConfirm.id);
          state.closeTeleportConfirm();
          state.closeWorldSkillDialog();
          return;
        }
        if (state.worldSkillDialog === "return" && state.profile?.save_point_id) {
          net.useWorldSkill("return");
          return;
        }
        if (!state.mainMenuOpen && !state.openWindow) {
          if (state.screen === "house") tryHouseInteract();
          else tryWorldInteract();
        }
        return;
      }

      if (!inGame) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (chatFocused || dialogIsOpen(state)) return;
        if (state.screen === "world") {
          // Left/right cycle hostile targets, up/down cycle allies. No-ops
          // outside combat (no self combat entity).
          const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
          const dir: 1 | -1 = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
          net.cycleTarget(horizontal ? "horizontal" : "vertical", dir);
        }
        return;
      }

      // Tab cycles hostile targets (Shift+Tab backwards) when no UI owns input;
      // with a menu/window/dialog open it keeps its normal focus behaviour.
      if (e.key === "Tab") {
        if (dialogIsOpen(state)) return;
        e.preventDefault();
        if (state.screen === "world") net.tabTarget(e.shiftKey ? -1 : 1);
        return;
      }

      if (
        !chatFocused &&
        !state.mainMenuOpen &&
        !state.worldSkillDialog &&
        !state.npcDialog &&
        !state.jobChangeDialog &&
        !state.teleportConfirm &&
        !(state.openWindow && state.openWindow !== "house_storage") &&
        tryHouseToolKey(e, state)
      ) {
        e.preventDefault();
        return;
      }

      if (bindingMatchesEvent(keybinds.mount ?? "r", e)) {
        e.preventDefault();
        if (dialogIsOpen(state)) return;
        net.mountToggle();
        return;
      }

      const hotbarSlot = resolveHotbarSlot(e, keybinds);
      if (hotbarSlot) {
        if (dialogIsOpen(state)) return;
        if (state.screen === "house") return;
        if (state.screen === "world") {
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
    // Capture phase so hotbar/targeting win over focused HUD buttons.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return null;
}
