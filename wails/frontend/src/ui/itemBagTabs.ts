import type { Item } from "../types";

/** Inventory / house-storage filter tabs. */
export type ItemBagTab = "all" | "gear" | "items" | "decor" | "craft";

export const ITEM_BAG_TABS: { id: ItemBagTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gear", label: "Gear" },
  { id: "items", label: "Items" },
  { id: "decor", label: "Decor" },
  { id: "craft", label: "Craft" },
];

/** Map an item into a bag category (excludes "all"). */
export function itemBagCategory(item: Item): Exclude<ItemBagTab, "all"> {
  switch (item.kind) {
    case "equipment":
      return "gear";
    case "consumable":
      return "items";
    case "decoration":
      return "decor";
    case "crafting":
    case "material":
      return "craft";
    default:
      if (item.slot) return "gear";
      if (item.consumable) return "items";
      return "items";
  }
}

export function filterItemsByBagTab(items: Item[], tab: ItemBagTab): Item[] {
  if (tab === "all") return items;
  return items.filter((i) => itemBagCategory(i) === tab);
}

export function isDecorationItem(item: Item): boolean {
  return itemBagCategory(item) === "decor";
}

export function isCraftingItem(item: Item): boolean {
  return itemBagCategory(item) === "craft";
}
