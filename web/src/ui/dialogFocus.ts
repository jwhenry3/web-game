const DIALOG_ROOT =
  ".main-menu-panel, .xiv-skill-dialog, .xiv-skill-dialog-layer, .xiv-window-layer .xiv-window, .xiv-toast, .login-panel, .end-modal";

const FOCUSABLE_BUTTON =
  "button:not([disabled]):not(.xiv-close):not([tabindex='-1'])";

function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

export function getActiveDialogRoot(): Element | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const root = active.closest(DIALOG_ROOT);
    if (root) return root;
  }
  const dialogs = document.querySelectorAll(DIALOG_ROOT);
  return dialogs.length ? dialogs[dialogs.length - 1]! : null;
}

export function getDialogFocusableButtons(root: Element): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(FOCUSABLE_BUTTON)).filter(isVisible);
}

function focusedDialogButton(buttons: HTMLButtonElement[]): HTMLButtonElement | null {
  const active = document.activeElement;
  if (!active) return null;
  if (active.tagName === "BUTTON") {
    const btn = active as HTMLButtonElement;
    return buttons.includes(btn) ? btn : null;
  }
  const btn = active.closest("button");
  if (!btn || !buttons.includes(btn as HTMLButtonElement)) return null;
  return btn as HTMLButtonElement;
}

export function moveDialogFocus(delta: 1 | -1): boolean {
  const root = getActiveDialogRoot();
  if (!root) return false;
  const buttons = getDialogFocusableButtons(root);
  if (!buttons.length) return false;

  const current = focusedDialogButton(buttons);
  if (!current) {
    buttons[delta === 1 ? 0 : buttons.length - 1]!.focus();
    return true;
  }

  let idx = buttons.indexOf(current);
  if (idx < 0) {
    buttons[0]!.focus();
    return true;
  }
  idx = (idx + delta + buttons.length) % buttons.length;
  buttons[idx]!.focus();
  return true;
}

export function handleDialogArrowKey(e: KeyboardEvent): boolean {
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return false;

  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target?.closest(".xiv-tree")) return false;
  if (target?.closest(".job-grid")) return false;

  const root = getActiveDialogRoot();
  if (!root) return false;

  e.preventDefault();
  e.stopPropagation();

  const delta: 1 | -1 = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
  moveDialogFocus(delta);
  return true;
}

export function focusPrimaryDialogButton(root?: Element | null) {
  const scope = root ?? getActiveDialogRoot();
  if (!scope) return;
  const primary =
    scope.querySelector<HTMLElement>("button.gold:not(.xiv-close):not([disabled])") ??
    scope.querySelector<HTMLElement>("button.main-menu-btn.gold:not([disabled])") ??
    scope.querySelector<HTMLElement>("button:not(.xiv-close):not(.xiv-tab):not([disabled])");
  primary?.focus();
}

export function isFocusedDialogButton(): boolean {
  const el = document.activeElement;
  if (!el || el.tagName !== "BUTTON") return false;
  return !!el.closest(DIALOG_ROOT);
}

export function clickFocusedDialogButton(): boolean {
  const el = document.activeElement;
  if (el?.tagName !== "BUTTON") return false;
  if (!el.closest(DIALOG_ROOT)) return false;
  (el as HTMLButtonElement).click();
  return true;
}

export function blurGameHudFocus() {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.closest(".hotbar, .xiv-mainmenu, .xiv-window-bar")) {
    el.blur();
  }
}
