import type { HotbarBinding, ProfileInfo } from "../types";
import type { Item } from "../types";
import { ICONS } from "./icons";

export function itemStats(item: Item): string {
  if (!item.stats) return "";
  return Object.entries(item.stats)
    .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
    .join("  ");
}

export function itemIconSrc(item: Item): string {
  if (item.kind === "consumable") {
    return consumableIconSrc(item.consumable ?? "");
  }
  switch (item.slot) {
    case "weapon":
      return ICONS.weapon;
    case "sub_weapon":
      return ICONS.subWeapon;
    case "head":
      return ICONS.head;
    case "chest":
      return ICONS.chest;
    case "hands":
      return ICONS.hands;
    case "legs":
      return ICONS.legs;
    case "feet":
      return ICONS.feet;
    case "back":
      return ICONS.back;
    default:
      return ICONS.default;
  }
}

export function consumableIconSrc(consumableId: string): string {
  if (consumableId === "ether") return ICONS.ether;
  if (consumableId === "hi_potion") return ICONS.hiPotion;
  if (consumableId === "potion") return ICONS.potion;
  return ICONS.default;
}

export function skillIconSrc(skillId: string, unlocked = true): string {
  if (skillId === "attack") return ICONS.attack;
  return unlocked ? ICONS.skillUnlocked : ICONS.skillLocked;
}

export function hotbarIconSrc(
  bind: HotbarBinding | undefined,
  profile: ProfileInfo,
): string | null {
  if (!bind) return null;
  if (bind.kind === "item") return consumableIconSrc(bind.id);
  const sk = profile.skills.find((s) => s.id === bind.id);
  return skillIconSrc(bind.id, sk?.unlocked ?? false);
}
