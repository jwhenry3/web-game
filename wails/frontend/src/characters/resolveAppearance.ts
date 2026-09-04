import { loadAppearance } from "./appearanceStorage";
import {
  appearanceFromRace,
  appearanceFromWire,
  applyGameWeapon,
  type CharacterAppearance,
} from "./heroes99";
import type { CharacterAppearanceWire, ProfileInfo } from "../types";
import { mainWeaponTypeFromProfile } from "../types";

/** Build a composed appearance, mapping the equipped weapon type to Heroes 99 sprites. */
export function resolveCharacterAppearance(opts: {
  playerId: string;
  selfId: string | null;
  profile: ProfileInfo | null;
  race?: string;
  weapon?: string;
  wire?: CharacterAppearanceWire;
}): CharacterAppearance {
  const fromWire = appearanceFromWire(opts.wire);
  const base =
    fromWire ??
    (opts.playerId === opts.selfId
      ? loadAppearance(opts.playerId, opts.race)
      : appearanceFromRace(opts.race ?? "hume"));
  const equipped =
    opts.playerId === opts.selfId ? mainWeaponTypeFromProfile(opts.profile) : undefined;
  return applyGameWeapon(base, equipped ?? opts.weapon);
}
