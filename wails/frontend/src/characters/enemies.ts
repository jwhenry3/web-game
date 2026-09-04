/** Overworld / battle enemy kinds — SVG sprites baked into Heroes 99 frame layout. */

export type EnemyKind = "goblin" | "dire_wolf" | "stone_imp";

export const ENEMY_KINDS: EnemyKind[] = ["goblin", "dire_wolf", "stone_imp"];

export const ENEMY_KIND_LABELS: Record<EnemyKind, string> = {
  goblin: "Goblin",
  dire_wolf: "Dire Wolf",
  stone_imp: "Stone Imp",
};

export const ENEMY_SPRITE_SRC: Record<EnemyKind, string> = {
  goblin: "/assets/enemies/goblin.svg",
  dire_wolf: "/assets/enemies/dire_wolf.svg",
  stone_imp: "/assets/enemies/stone_imp.svg",
};

export const ENEMY_KIND_BY_NAME: Record<string, EnemyKind> = {
  Goblin: "goblin",
  "Dire Wolf": "dire_wolf",
  "Stone Imp": "stone_imp",
};

export function enemyKindFromName(name: string, kind?: string): EnemyKind {
  if (kind && ENEMY_KINDS.includes(kind as EnemyKind)) return kind as EnemyKind;
  return ENEMY_KIND_BY_NAME[name] ?? "goblin";
}

export function enemyTextureKey(kind: EnemyKind): string {
  return `enemy_${kind}`;
}

/** World-map tint fallback (used before textures load). */
export const ENEMY_COLORS: Record<EnemyKind, number> = {
  goblin: 0x5a9e3c,
  dire_wolf: 0x8a6a4a,
  stone_imp: 0x6a6a8a,
};
