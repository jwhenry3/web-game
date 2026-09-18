import type { HotbarBinding, ProfileInfo } from "../types";
import type { Item } from "../types";
import { ICONS } from "./icons";
import { ITEM_ICON_IDS } from "./itemIcons.gen";
import { SKILL_ICON_IDS } from "./skillIcons.gen";

const SKILL_ICON_BASE = "/assets/skills";
const ITEM_ICON_BASE = "/assets/items";

export function itemStats(item: Item): string {
  if (!item.stats) return "";
  return Object.entries(item.stats)
    .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
    .join("  ");
}

/**
 * Generated-icon keys for an item (scripts/gen-item-icons.mjs), tried in
 * order. Equipment keys off type: weapon-<type> for weapons,
 * armor-<slot>-<class> for armor (missing class defaults to medium,
 * matching starter gear). Decor/craft items carry their def id in `type`,
 * so they get per-item art (decor_woven_rug, craft_lumber, …) with the
 * generic kind icon as fallback.
 */
function itemIconKeys(item: Item): string[] {
  if (item.kind === "consumable") {
    return item.consumable ? [`consumable-${item.consumable}`] : [];
  }
  if (item.kind === "decoration" || item.kind === "crafting" || item.kind === "material") {
    const generic = item.kind === "decoration" ? "kind-decoration" : "kind-material";
    return item.type ? [item.type, generic] : [generic];
  }
  if (item.slot === "weapon" || item.slot === "sub_weapon") {
    return item.type ? [`weapon-${item.type}`] : [];
  }
  if (item.slot) return [`armor-${item.slot}-${item.type || "medium"}`];
  return [];
}

export function itemIconSrc(item: Item): string {
  for (const key of itemIconKeys(item)) {
    if (ITEM_ICON_IDS.has(key)) return `${ITEM_ICON_BASE}/${key}.png`;
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
  const key = `consumable-${consumableId}`;
  if (ITEM_ICON_IDS.has(key)) return `${ITEM_ICON_BASE}/${key}.png`;
  return ICONS.default;
}

export function skillIconSrc(skillId: string, unlocked = true): string {
  // Generated per-skill art (scripts/gen-skill-icons.mjs); locked rows show
  // the same glyph dimmed so the skill stays identifiable. Unknown ids fall
  // back to the generic pack icons.
  if (SKILL_ICON_IDS.has(skillId)) return `${SKILL_ICON_BASE}/${skillId}.png`;
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
