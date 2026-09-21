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
  /** 3D camera: follow distance in world units. */
  cameraDistance: number;
  /** 3D camera: elevation angle in degrees (0 = top-down, 80 = near eye level). */
  cameraPitch: number;
  /** 3D camera: screen-space look-at offsets; +x shifts the view right, +y up. */
  cameraOffsetX: number;
  cameraOffsetY: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  musicVolume: 80,
  sfxVolume: 80,
  confirmLogout: true,
  theme: DEFAULT_THEME,
  uiScale: {},
  showCollisionBounds: false,
  cameraDistance: 22,
  cameraPitch: 54,
  cameraOffsetX: 0,
  cameraOffsetY: 0,
};

const CAMERA_KEYS = ["cameraDistance", "cameraPitch", "cameraOffsetX", "cameraOffsetY"] as const;

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
    for (const key of CAMERA_KEYS) {
      if (typeof merged[key] !== "number" || !Number.isFinite(merged[key])) merged[key] = DEFAULT_OPTIONS[key];
    }
    return merged;
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(options: GameOptions): void {
  localStorage.setItem(KEY, JSON.stringify(options));
}
