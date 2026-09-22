/**
 * Overworld / battle enemy kinds. All kinds render through the 3D rig
 * library (actors.ts buildEnemyRig); ENEMY_DOLL_PRESETS carries the
 * appearance customization each kind composes on top of the shared rigs.
 */

import { DEFAULT_APPEARANCE, type CharacterAppearance } from "./heroes99";

export type EnemyKind = "goblin" | "dire_wolf" | "stone_imp" | "imp";

export const ENEMY_KINDS: EnemyKind[] = ["goblin", "dire_wolf", "stone_imp", "imp"];

export const ENEMY_KIND_LABELS: Record<EnemyKind, string> = {
  goblin: "Goblin",
  dire_wolf: "Dire Wolf",
  stone_imp: "Stone Imp",
  imp: "Imp",
};

/** UI icons — doll kinds use the baked paper-doll previews. */
export const ENEMY_SPRITE_SRC: Record<EnemyKind, string> = {
  goblin: "/assets/spine/doll_goblin_icon.png",
  dire_wolf: "/assets/spine/doll_dire_wolf_icon.png",
  stone_imp: "/assets/spine/doll_stone_imp_icon.png",
  imp: "/assets/spine/doll_imp_icon.png",
};

export const ENEMY_KIND_BY_NAME: Record<string, EnemyKind> = {
  Goblin: "goblin",
  "Dire Wolf": "dire_wolf",
  "Stone Imp": "stone_imp",
  Imp: "imp",
};

export function enemyKindFromName(name: string, kind?: string): EnemyKind {
  if (kind && ENEMY_KINDS.includes(kind as EnemyKind)) return kind as EnemyKind;
  return ENEMY_KIND_BY_NAME[name] ?? "goblin";
}

/**
 * Doll presets — humanoids compose creature parts on the shared humanoid
 * rig (mirrors CREATURE_PRESETS in tools/paperdoll_layers.py); quadrupeds
 * use the quaddoll-style 3D rig (mirrors BEAST_PRESETS in tools/gen_quadruped.py).
 * Keep both generators in sync with this table.
 */
export const ENEMY_DOLL_PRESETS: Partial<
  Record<
    EnemyKind,
    {
      scale: number;
      appearance: Partial<CharacterAppearance>;
    }
  >
> = {
  goblin: {
    scale: 0.85,
    appearance: {
      skin: "c7",
      face: "ms6_gob",
      hair: "",
      cloth: "cloth5",
      clothColor: "c3",
      weapon: "weapon3",
      subWeapon: "weapon7",
      subWeaponColor: "c3",
      ears: "point",
      shape: { head: 1.15, height: 0.9, ears: 1.35 },
    },
  },
  imp: {
    scale: 0.75,
    appearance: {
      skin: "c8",
      face: "ms9_imp",
      hair: "",
      cloth: "cloth10",
      clothColor: "c8",
      weapon: "weapon6",
      ears: "long",
      horns: "imp",
      wings: "bat",
      tail: "spade",
      shape: { height: 0.9, ears: 1.2, horns: 1.15 },
    },
  },
  stone_imp: {
    scale: 0.75,
    appearance: {
      skin: "c9",
      face: "ms12_stone",
      hair: "",
      cloth: "",
      weapon: "",
      ears: "long",
      horns: "imp",
      wings: "stone",
      tail: "spade",
      shape: {
        chest: 1.2,
        armWidth: 1.15,
        legWidth: 1.1,
        height: 0.95,
        head: 0.9,
        horns: 1.2,
        wings: 1.25,
      },
    },
  },
  // Quadruped — scale 1.0 renders it at the player's display scale: still
  // shorter than a humanoid, but "dire" in bulk.
  dire_wolf: {
    scale: 1.0,
    appearance: { skin: "c11", face: "c11" },
  },
};

/** Full appearance for a doll-kind enemy — preset over the human default. */
export function enemyDollAppearance(kind: EnemyKind): CharacterAppearance {
  return { ...DEFAULT_APPEARANCE, ...ENEMY_DOLL_PRESETS[kind]?.appearance };
}

export function enemyTextureKey(kind: EnemyKind): string {
  return `enemy_${kind}`;
}

/** World-map tint fallback (used before textures load). */
export const ENEMY_COLORS: Record<EnemyKind, number> = {
  goblin: 0x5a9e3c,
  dire_wolf: 0x8a6a4a,
  stone_imp: 0x6a6a8a,
  imp: 0xc45c50,
};
