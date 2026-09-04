export interface GameOptions {
  musicVolume: number;
  sfxVolume: number;
  confirmLogout: boolean;
}

export const DEFAULT_OPTIONS: GameOptions = {
  musicVolume: 80,
  sfxVolume: 80,
  confirmLogout: true,
};

const KEY = "ffv-game-options";

export function loadOptions(): GameOptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    return { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(options: GameOptions): void {
  localStorage.setItem(KEY, JSON.stringify(options));
}
