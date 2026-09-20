/**
 * Friendly NPC kinds — service townsfolk (job masters, quest givers) rendered
 * on the shared paperdoll rig. Mirrors the "npc" / "job_master" entries in
 * CREATURE_PRESETS (tools/paperdoll_layers.py) — keep the two in sync.
 */

import { DEFAULT_APPEARANCE, type CharacterAppearance } from "./heroes99";

export type NpcKind = "npc" | "job_master";

export const NPC_DOLL_PRESETS: Record<
  NpcKind,
  { appearance: Partial<CharacterAppearance> }
> = {
  npc: {
    appearance: {
      skin: "c2",
      face: "ms2",
      hair: "m3",
      hairColor: "c1",
      cloth: "cloth12",
      clothColor: "c6",
      weapon: "",
    },
  },
  job_master: {
    appearance: {
      skin: "c3",
      face: "ms4",
      hair: "m2",
      hairColor: "c5",
      cloth: "cloth9",
      clothColor: "c4",
      weapon: "weapon5",
      weaponColor: "c3",
    },
  },
};

/** Full appearance for an NPC kind — preset over the human default. */
export function npcAppearance(kind: NpcKind): CharacterAppearance {
  return { ...DEFAULT_APPEARANCE, ...NPC_DOLL_PRESETS[kind].appearance };
}
