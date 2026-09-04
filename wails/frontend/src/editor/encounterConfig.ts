/** Combat NPC encounter config stored as JSON string property `encounter`. */

export interface EncounterEnemy {
  kind: string;
  levelMin: number;
  levelMax: number;
  dropPoolId: string;
}

export interface EncounterConfig {
  minEnemies: number;
  maxEnemies: number;
  enemies: EncounterEnemy[];
}

export function defaultEncounterEnemy(kind: string, level: number, dropPoolId = ""): EncounterEnemy {
  const lv = Math.max(1, Math.floor(level) || 1);
  return {
    kind: kind || "goblin",
    levelMin: lv,
    levelMax: lv,
    dropPoolId,
  };
}

export function defaultEncounterConfig(kind: string, level: number, dropPoolId = ""): EncounterConfig {
  return {
    minEnemies: 2,
    maxEnemies: 3,
    enemies: [defaultEncounterEnemy(kind, level, dropPoolId)],
  };
}

export function serializeEncounter(cfg: EncounterConfig): string {
  return JSON.stringify(normalizeEncounter(cfg));
}

export function parseEncounter(raw: string, fallbackKind = "goblin", fallbackLevel = 1): EncounterConfig {
  if (!raw?.trim()) {
    return defaultEncounterConfig(fallbackKind, fallbackLevel);
  }
  try {
    return normalizeEncounter(JSON.parse(raw) as Partial<EncounterConfig>, fallbackKind, fallbackLevel);
  } catch {
    return defaultEncounterConfig(fallbackKind, fallbackLevel);
  }
}

export function normalizeEncounter(
  raw: Partial<EncounterConfig> | null | undefined,
  fallbackKind = "goblin",
  fallbackLevel = 1,
): EncounterConfig {
  const base = defaultEncounterConfig(fallbackKind, fallbackLevel);
  if (!raw || typeof raw !== "object") return base;

  let minEnemies = Math.floor(Number(raw.minEnemies));
  let maxEnemies = Math.floor(Number(raw.maxEnemies));
  if (!Number.isFinite(minEnemies) || minEnemies < 1) minEnemies = base.minEnemies;
  if (!Number.isFinite(maxEnemies) || maxEnemies < 1) maxEnemies = base.maxEnemies;
  if (maxEnemies < minEnemies) maxEnemies = minEnemies;

  const enemiesIn = Array.isArray(raw.enemies) ? raw.enemies : [];
  const enemies: EncounterEnemy[] = [];
  for (const e of enemiesIn) {
    if (!e || typeof e !== "object") continue;
    const kind = String((e as EncounterEnemy).kind || "").trim() || fallbackKind;
    let levelMin = Math.floor(Number((e as EncounterEnemy).levelMin));
    let levelMax = Math.floor(Number((e as EncounterEnemy).levelMax));
    if (!Number.isFinite(levelMin) || levelMin < 1) levelMin = fallbackLevel;
    if (!Number.isFinite(levelMax) || levelMax < 1) levelMax = levelMin;
    if (levelMax < levelMin) levelMax = levelMin;
    const dropPoolId = String((e as EncounterEnemy).dropPoolId || "").trim();
    enemies.push({ kind, levelMin, levelMax, dropPoolId });
  }
  if (enemies.length === 0) {
    enemies.push(...base.enemies);
  }

  return { minEnemies, maxEnemies, enemies };
}

/** Default drop pool id seeded per enemy kind. */
export function defaultDropPoolIdForKind(kind: string): string {
  return `pool_${kind || "goblin"}`;
}
