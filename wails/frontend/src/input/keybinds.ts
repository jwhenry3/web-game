import Phaser from "phaser";
import type { WindowId } from "../types";

export type KeybindMap = Record<string, string>;

export const HOTBAR_ROW_1 = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
export const HOTBAR_ROW_2 = [
  "ctrl+1",
  "ctrl+2",
  "ctrl+3",
  "ctrl+4",
  "ctrl+5",
  "ctrl+6",
  "ctrl+7",
  "ctrl+8",
] as const;
export const HOTBAR_ROW_3 = [
  "shift+1",
  "shift+2",
  "shift+3",
  "shift+4",
  "shift+5",
  "shift+6",
  "shift+7",
  "shift+8",
] as const;

/** Visual order top → bottom: Shift row, Ctrl row, then 1–8 (primary) at the bottom. */
export const HOTBAR_ROWS = [
  { id: "row3", label: "Shift + 1 – 8", slots: HOTBAR_ROW_3 },
  { id: "row2", label: "Ctrl + 1 – 8", slots: HOTBAR_ROW_2 },
  { id: "row1", label: "1 – 8", slots: HOTBAR_ROW_1 },
] as const;

export const HOTBAR_SLOTS = [...HOTBAR_ROW_1, ...HOTBAR_ROW_2, ...HOTBAR_ROW_3] as const;
export type HotbarSlotId = (typeof HOTBAR_SLOTS)[number];

export type KeybindAction =
  | "move_up"
  | "move_down"
  | "move_left"
  | "move_right"
  | "interact"
  | `hotbar:${HotbarSlotId}`
  | `window:${WindowId}`;

const WINDOW_ACTIONS: Record<WindowId, KeybindAction> = {
  character: "window:character",
  equipment: "window:equipment",
  inventory: "window:inventory",
  skills: "window:skills",
  social: "window:social",
  map: "window:map",
  house_storage: "window:house_storage",
  pets: "window:pets",
};

const KNOWN_ACTIONS = new Set<string>([
  "move_up",
  "move_down",
  "move_left",
  "move_right",
  "interact",
  "window:character",
  "window:equipment",
  "window:inventory",
  "window:skills",
  "window:social",
  "window:map",
  "window:pets",
  ...HOTBAR_SLOTS.map((s) => `hotbar:${s}`),
]);

export function defaultKeybinds(): KeybindMap {
  const out: KeybindMap = {
    move_up: "w",
    move_down: "s",
    move_left: "a",
    move_right: "d",
    interact: "Space",
    "window:character": "c",
    "window:equipment": "e",
    "window:inventory": "i",
    "window:skills": "k",
    "window:social": "o",
    "window:map": "m",
    "window:pets": "p",
  };
  for (const slot of HOTBAR_ROW_1) out[`hotbar:${slot}`] = slot;
  for (const slot of HOTBAR_ROW_2) out[`hotbar:${slot}`] = `Control+${slot.slice(5)}`;
  for (const slot of HOTBAR_ROW_3) out[`hotbar:${slot}`] = `Shift+${slot.slice(6)}`;
  return out;
}

export function mergeKeybinds(custom?: KeybindMap | null): KeybindMap {
  const out = defaultKeybinds();
  if (!custom) return out;
  for (const [action, binding] of Object.entries(custom)) {
    if (!KNOWN_ACTIONS.has(action)) continue;
    const v = binding.trim();
    if (v) out[action] = v;
  }
  return out;
}

/** Physical digit from KeyboardEvent.code (layout-independent). */
function digitFromCode(code: string): string | null {
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  return null;
}

/** Normalize a keyboard event to a binding string for comparison. */
export function eventBinding(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  let key = e.key;
  // Prefer Digit/Numpad codes so hotbar 1–8 works on AZERTY and similar layouts
  // where the unshifted key produces a symbol instead of the digit.
  const digit = digitFromCode(e.code);
  if (digit) key = digit;
  else if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

export function bindingMatchesEvent(binding: string, e: KeyboardEvent): boolean {
  return eventBinding(e) === binding;
}

export function resolveHotbarSlot(e: KeyboardEvent, keybinds: KeybindMap): HotbarSlotId | null {
  const pressed = eventBinding(e);
  for (const slot of HOTBAR_SLOTS) {
    if (keybinds[`hotbar:${slot}`] === pressed) return slot;
  }
  return null;
}

export function resolveWindowToggle(e: KeyboardEvent, keybinds: KeybindMap): WindowId | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const pressed = eventBinding(e);
  for (const [win, action] of Object.entries(WINDOW_ACTIONS) as [WindowId, KeybindAction][]) {
    if (keybinds[action] === pressed) return win;
  }
  return null;
}

export function actionLabel(action: string): string {
  if (action.startsWith("hotbar:")) return hotbarSlotLabel(action.slice(7));
  switch (action) {
    case "move_up":
      return "Move Up";
    case "move_down":
      return "Move Down";
    case "move_left":
      return "Move Left";
    case "move_right":
      return "Move Right";
    case "interact":
      return "Confirm / Interact";
    case "window:character":
      return "Character Window";
    case "window:equipment":
      return "Equipment Window";
    case "window:inventory":
      return "Inventory Window";
    case "window:skills":
      return "Actions Window";
    case "window:social":
      return "Social Window";
    case "window:map":
      return "Map Window";
    case "window:pets":
      return "Pets Window";
    default:
      return action;
  }
}

export function hotbarSlotLabel(slot: string): string {
  if (slot.startsWith("ctrl+")) return `Ctrl+${slot.slice(5)}`;
  if (slot.startsWith("shift+")) return `Shift+${slot.slice(6)}`;
  return slot;
}

export function hotbarKeyLabel(slot: string, keybinds: KeybindMap): string {
  return keybinds[`hotbar:${slot}`] ?? hotbarSlotLabel(slot);
}

export const KEYBIND_SECTIONS: { title: string; actions: string[] }[] = [
  {
    title: "Movement",
    actions: ["move_up", "move_down", "move_left", "move_right"],
  },
  {
    title: "Interact",
    actions: ["interact"],
  },
  {
    title: "Hotbar Row 1",
    actions: HOTBAR_ROW_1.map((s) => `hotbar:${s}`),
  },
  {
    title: "Hotbar Row 2 (Ctrl)",
    actions: HOTBAR_ROW_2.map((s) => `hotbar:${s}`),
  },
  {
    title: "Hotbar Row 3 (Shift)",
    actions: HOTBAR_ROW_3.map((s) => `hotbar:${s}`),
  },
  {
    title: "Windows",
    actions: Object.values(WINDOW_ACTIONS),
  },
];

export function bindingToDisplay(binding: string): string {
  return binding.replace(/Control/g, "Ctrl").replace(/\+/g, " + ");
}

/** Map binding string to Phaser Keyboard key code name. */
export function bindingToPhaserKey(binding: string): string | null {
  const parts = binding.split("+");
  const key = parts[parts.length - 1]!;
  const map: Record<string, string> = {
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    Space: "SPACE",
    w: "W",
    a: "A",
    s: "S",
    d: "D",
    c: "C",
    e: "E",
    i: "I",
    k: "K",
    o: "O",
    m: "M",
  };
  if (map[key]) return map[key]!;
  if (/^[1-8]$/.test(key)) return key;
  return null;
}

export function bindingToPhaserKeyCode(binding: string): number | null {
  const name = bindingToPhaserKey(binding);
  if (!name) return null;
  const codes = Phaser.Input.Keyboard.KeyCodes as Record<string, number>;
  return codes[name] ?? null;
}

let keybindCapture: ((binding: string) => void) | null = null;

export function isKeybindCaptureActive(): boolean {
  return keybindCapture !== null;
}

export function captureNextKey(onCapture: (binding: string) => void): () => void {
  keybindCapture = (binding) => {
    keybindCapture = null;
    onCapture(binding);
  };
  return () => {
    keybindCapture = null;
  };
}

export function notifyKeybindCapture(e: KeyboardEvent): boolean {
  if (!keybindCapture) return false;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") {
    keybindCapture = null;
    return true;
  }
  const binding = eventBinding(e);
  keybindCapture(binding);
  return true;
}

export function keybindOverrides(merged: KeybindMap): KeybindMap {
  const defaults = defaultKeybinds();
  const out: KeybindMap = {};
  for (const [action, binding] of Object.entries(merged)) {
    if (defaults[action] !== binding) out[action] = binding;
  }
  return out;
}
