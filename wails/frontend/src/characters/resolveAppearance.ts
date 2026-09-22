import { loadAppearance } from "./appearanceStorage";
import {
  appearanceFromRace,
  appearanceFromWire,
  applyGameClothes,
  applyGameWeapon,
  type CharacterAppearance,
} from "./heroes99";
import type { CharacterAppearanceWire, ProfileInfo } from "../types";
import { equippedArmorClassFromProfile, mainWeaponTypeFromProfile, subWeaponTypeFromProfile } from "../types";

/** Build a composed appearance, mapping the equipped weapon type and armor
 * weight class to Heroes 99 sprites. */
export function resolveCharacterAppearance(opts: {
  playerId: string;
  selfId: string | null;
  profile: ProfileInfo | null;
  race?: string;
  weapon?: string;
  subWeapon?: string;
  /** Explicit armor class override — "" forces the unarmored tunic. */
  armorClass?: string;
  wire?: CharacterAppearanceWire;
}): CharacterAppearance {
  const fromWire = appearanceFromWire(opts.wire);
  const isSelf = opts.playerId === opts.selfId;
  const base =
    fromWire ??
    (isSelf
      ? loadAppearance(opts.playerId, opts.race)
      : appearanceFromRace(opts.race ?? "humanus"));
  // Clothes follow gear, not the saved pick. The wire cloth is the server's
  // resolved look; an explicit armorClass (equipment preview) overrides it.
  let resolved = base;
  if (opts.armorClass !== undefined) {
    resolved = applyGameClothes(resolved, opts.armorClass || undefined);
  } else if (!fromWire) {
    resolved = applyGameClothes(resolved, isSelf ? equippedArmorClassFromProfile(opts.profile) : undefined);
  }
  const equipped = isSelf ? mainWeaponTypeFromProfile(opts.profile) : undefined;
  const subEquipped = isSelf ? subWeaponTypeFromProfile(opts.profile) : undefined;
  // The entity/preview weapon is authoritative ("" = unarmed → bare hands);
  // the profile lookup only fills in when no weapon info was supplied.
  return applyGameWeapon(resolved, opts.weapon ?? equipped, opts.subWeapon ?? subEquipped);
}
