import { loadAppearance } from "./appearanceStorage";
import {
  appearanceFromRace,
  appearanceFromWire,
  applyGameWeapon,
  type CharacterAppearance,
} from "./heroes99";
import type { CharacterAppearanceWire, ProfileInfo } from "../types";
import { mainWeaponTypeFromProfile, subWeaponTypeFromProfile } from "../types";

/** Build a composed appearance, mapping the equipped weapon type to Heroes 99 sprites. */
export function resolveCharacterAppearance(opts: {
  playerId: string;
  selfId: string | null;
  profile: ProfileInfo | null;
  race?: string;
  weapon?: string;
  subWeapon?: string;
  wire?: CharacterAppearanceWire;
}): CharacterAppearance {
  const fromWire = appearanceFromWire(opts.wire);
  const isSelf = opts.playerId === opts.selfId;
  const base =
    fromWire ??
    (isSelf
      ? loadAppearance(opts.playerId, opts.race)
      : appearanceFromRace(opts.race ?? "humanus"));
  const equipped = isSelf ? mainWeaponTypeFromProfile(opts.profile) : undefined;
  const subEquipped = isSelf ? subWeaponTypeFromProfile(opts.profile) : undefined;
  // The entity/preview weapon is authoritative ("" = unarmed → bare hands);
  // the profile lookup only fills in when no weapon info was supplied.
  return applyGameWeapon(base, opts.weapon ?? equipped, opts.subWeapon ?? subEquipped);
}
