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
  return screen === "world" || screen === "battle" || screen === "house";
}

function dialogIsOpen(state: ReturnType<typeof useGame.getState>): boolean {
  return !!(
    state.mainMenuOpen ||
    state.worldSkillDialog ||
    state.npcDialog ||
    state.jobChangeDialog ||
    state.teleportConfirm ||
    state.openWindow
  );
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
      const inFormField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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
        if (state.openWindow || state.bindSlot || state.selectedAction) {
          state.closeWindow();
          state.setSelectedAction(null);
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
        state.openMainMenu();
        return;
      }

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
        if (state.screen === "battle" && (state.battle || state.rtBattle)) {
          const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
          const dir: 1 | -1 = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
          net.cycleBattleTarget(horizontal ? "horizontal" : "vertical", dir);
        }
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

      const hotbarSlot = resolveHotbarSlot(e, keybinds);
      if (hotbarSlot) {
        const { screen, battle, rtBattle } = state;
        if (screen === "house") return;
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
    // Capture phase so hotbar/targeting win over focused HUD buttons.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return null;
}
