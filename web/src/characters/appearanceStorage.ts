import {
  DEFAULT_APPEARANCE,
  appearanceFromRace,
  mergeAppearance,
  type CharacterAppearance,
} from "./heroes99";

const KEY = "ffv-character-appearance";

function isHeroes99Appearance(value: unknown): value is CharacterAppearance {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.cloth === "string" && typeof v.hair === "string";
}

export function loadAppearance(
  playerId: string | null,
  race?: string,
): CharacterAppearance {
  const fallback = race ? appearanceFromRace(race) : DEFAULT_APPEARANCE;
  if (!playerId) return fallback;
  try {
    const raw = localStorage.getItem(`${KEY}:${playerId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CharacterAppearance>;
    if (!isHeroes99Appearance(parsed)) return fallback;
    return mergeAppearance(fallback, parsed);
  } catch {
    return fallback;
  }
}

export function saveAppearance(
  playerId: string,
  appearance: CharacterAppearance,
): void {
  localStorage.setItem(`${KEY}:${playerId}`, JSON.stringify(appearance));
}

export function loadDraftAppearance(race: string): CharacterAppearance {
  try {
    const raw = localStorage.getItem(`${KEY}:draft`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CharacterAppearance>;
      if (isHeroes99Appearance(parsed)) {
        return mergeAppearance(appearanceFromRace(race), parsed);
      }
    }
  } catch {
    /* ignore */
  }
  return appearanceFromRace(race);
}

export function saveDraftAppearance(appearance: CharacterAppearance): void {
  localStorage.setItem(`${KEY}:draft`, JSON.stringify(appearance));
}
