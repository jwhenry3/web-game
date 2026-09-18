/**
 * UI themes. The selected id is persisted in GameOptions and applied as a
 * `.theme-<id>` class on <html>, where it overrides the --cm-* tokens defined
 * in styles.css (:root holds the "gilded" defaults, so no .theme-gilded block
 * is needed).
 */
export type ThemeId = "azure" | "gilded" | "parchment" | "material" | "rune";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  hint: string;
  /** Preview chips: [panel, accent, text]. */
  swatches: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  { id: "azure", label: "Azure", hint: "Deep blue crystal glow", swatches: ["#16204a", "#7ea0e0", "#e4eaf6"] },
  { id: "parchment", label: "Parchment", hint: "Weathered paper", swatches: ["#e7d8b2", "#8a6330", "#3a2c16"] },
  { id: "material", label: "Material", hint: "Flat modern surfaces", swatches: ["#1e1e24", "#9a7ff0", "#eceaf2"] },
  { id: "rune", label: "Rune", hint: "Light blue-grey chrome", swatches: ["#cdd5e6", "#4e639c", "#232c42"] },
  { id: "gilded", label: "Gilded", hint: "Classic dark & gold", swatches: ["#121214", "#c9a24a", "#e6e2d6"] },
];

export const DEFAULT_THEME: ThemeId = "azure";

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}

/** Applies the theme to the whole document. */
export function applyTheme(id: ThemeId): void {
  const root = document.documentElement;
  for (const cls of [...root.classList]) {
    if (cls.startsWith("theme-")) root.classList.remove(cls);
  }
  root.classList.add(`theme-${id}`);
}
