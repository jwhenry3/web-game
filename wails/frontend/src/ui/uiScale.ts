import type { CSSProperties } from "react";
import type { WindowId } from "../types";

/** UI scale slider bounds (percent). */
export const UI_SCALE_MIN = 50;
export const UI_SCALE_MAX = 300;
export const UI_SCALE_STEP = 5;
export const UI_SCALE_DEFAULT = 100;

/**
 * Independently scalable HUD groups. Each key maps to a `--ui-<key>` custom
 * property set on .game-stage and consumed via `zoom`/`calc()` in styles.css.
 */
export const HUD_SCALE_GROUPS: { key: string; label: string }[] = [
  { key: "hotbar", label: "Hotbar" },
  { key: "petbar", label: "Pet Bar" },
  { key: "chat", label: "Chat Panel" },
  { key: "menubar", label: "Menu Buttons" },
  { key: "expbar", label: "EXP Bar" },
  { key: "gauges", label: "HP / MP / ST Gauges" },
  { key: "castbar", label: "Cast Bar" },
  { key: "target", label: "Target Frame" },
  { key: "party", label: "Party List" },
  { key: "minimap", label: "Minimap" },
  { key: "flytext", label: "Action Prompts" },
];

/** Floating game windows that can be scaled independently. */
export const WINDOW_SCALE_GROUPS: { key: WindowId; label: string }[] = [
  { key: "character", label: "Character" },
  { key: "equipment", label: "Equipment" },
  { key: "inventory", label: "Inventory" },
  { key: "skills", label: "Actions & Traits" },
  { key: "social", label: "Social" },
  { key: "pets", label: "Pets" },
  { key: "map", label: "Map" },
  { key: "house_storage", label: "House Storage" },
];

export function windowScaleKey(id: WindowId): string {
  return `win:${id}`;
}

export function hudScaleKey(key: string): string {
  return `hud:${key}`;
}

/** Stored percentage for a scale key, clamped to the slider range. */
export function uiScalePercent(
  map: Record<string, number> | undefined,
  key: string,
): number {
  const v = map?.[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return UI_SCALE_DEFAULT;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, v));
}

/** Scale factor (1 = 100%) for a scale key. */
export function uiScaleFactor(
  map: Record<string, number> | undefined,
  key: string,
): number {
  return uiScalePercent(map, key) / 100;
}

/** CSS custom properties on .game-stage that drive each HUD group's zoom. */
export function hudScaleVars(
  map: Record<string, number> | undefined,
): CSSProperties {
  const vars: Record<string, string> = {};
  for (const g of HUD_SCALE_GROUPS) {
    vars[`--ui-${g.key}`] = String(uiScaleFactor(map, hudScaleKey(g.key)));
  }
  return vars as CSSProperties;
}
