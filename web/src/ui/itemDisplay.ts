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
    if (item.consumable === "ether") return ICONS.ether;
    if (item.consumable === "hi_potion") return ICONS.hiPotion;
    return ICONS.potion;
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
