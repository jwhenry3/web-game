import { DEFAULT_THEME, isThemeId, type ThemeId } from "../ui/themes";

export interface GameOptions {
  musicVolume: number;
  sfxVolume: number;
  confirmLogout: boolean;
  /** UI theme id, applied as .theme-<id> on <html>. */
  theme: ThemeId;
  /**
   * Per-element UI scale percentages (50–300). Sparse map keyed by
   * "win:<windowId>" or "hud:<group>"; missing keys render at 100%.
   */
  uiScale: Record<string, number>;
  /** Debug gizmo: draw entity collision bounds in world/house scenes. */
  showCollisionBounds: boolean;
}

export const DEFAULT_OPTIONS: GameOptions = {
  musicVolume: 80,
  sfxVolume: 80,
  confirmLogout: true,
  theme: DEFAULT_THEME,
  uiScale: {},
  showCollisionBounds: false,
};

const KEY = "ffv-game-options";

export function loadOptions(): GameOptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const merged = { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
    if (!isThemeId(merged.theme)) merged.theme = DEFAULT_THEME;
    if (
      typeof merged.uiScale !== "object" ||
      merged.uiScale === null ||
      Array.isArray(merged.uiScale)
    ) {
      merged.uiScale = {};
    }
    return merged;
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(options: GameOptions): void {
  localStorage.setItem(KEY, JSON.stringify(options));
}
