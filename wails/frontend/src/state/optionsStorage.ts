export interface GameOptions {
  musicVolume: number;
  sfxVolume: number;
  confirmLogout: boolean;
  /**
   * Per-element UI scale percentages (50–300). Sparse map keyed by
   * "win:<windowId>" or "hud:<group>"; missing keys render at 100%.
   */
  uiScale: Record<string, number>;
}

export const DEFAULT_OPTIONS: GameOptions = {
  musicVolume: 80,
  sfxVolume: 80,
  confirmLogout: true,
  uiScale: {},
};

const KEY = "ffv-game-options";

export function loadOptions(): GameOptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const merged = { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
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
