import { net } from "../net/socket";
import {
  HOTBAR_SLOTS,
  formatWeaponList,
  jobAllowedWeapons,
  jobAllowsWeapon,
  jobLabel,
  type Item,
  type ProfileInfo,
} from "../types";
import { hotbarSlotLabel } from "../input/keybinds";

export type ItemAction = {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
  run: () => void;
};

function weaponSlotLabel(slot: "weapon" | "sub_weapon", profile: ProfileInfo): string {
  if (slot === "sub_weapon") return "Equip (Sub)";
  return `Equip (Main · ${jobLabel(profile.main_job)})`;
}

function weaponSlotDeniedReason(slot: "weapon" | "sub_weapon", profile: ProfileInfo, weaponType?: string): string | undefined {
  const jobId = slot === "weapon" ? profile.main_job : profile.sub_job;
  if (slot === "sub_weapon" && !profile.sub_job) return "Equip a sub job first.";
  if (!weaponType) return "This weapon has no type.";
  if (jobAllowsWeapon(jobId, weaponType)) return undefined;
  return `${jobLabel(jobId)} allows ${formatWeaponList(jobAllowedWeapons(jobId))}.`;
}

export function itemActions(
  item: Item,
  profile: ProfileInfo,
  equippedSlot?: string,
  locked?: boolean,
  bindSlot?: string | null,
): ItemAction[] {
  const consumable = item.kind === "consumable";
  const isWeapon = item.slot === "weapon";
  const hasSub = !!profile.sub_job;
  const gearLocked = !!locked && !consumable;
  const actions: ItemAction[] = [];

  if (consumable) {
    actions.push({
      id: "use",
      label: "Use",
      run: () => net.useItemFromBag(item.id),
    });
    if (bindSlot) {
      actions.push({
        id: `hotbar:${bindSlot}`,
        label: `Set to hotbar ${hotbarSlotLabel(bindSlot)}`,
        run: () => net.setHotbar(bindSlot, "item", item.consumable || item.id),
      });
    } else {
      for (const slot of HOTBAR_SLOTS) {
        actions.push({
          id: `hotbar:${slot}`,
          label: `Hotbar ${hotbarSlotLabel(slot)}`,
          run: () => net.setHotbar(slot, "item", item.consumable || item.id),
        });
      }
    }
    return actions;
  }

  if (gearLocked) return actions;

  if (equippedSlot) {
    actions.push({
      id: `unequip:${equippedSlot}`,
      label: "Unequip",
      run: () => net.unequip(equippedSlot),
    });
    return actions;
  }

  if (isWeapon) {
    const mainDenied = weaponSlotDeniedReason("weapon", profile, item.type);
    actions.push({
      id: "equip:weapon",
      label: weaponSlotLabel("weapon", profile),
      disabled: !!mainDenied,
      title: mainDenied,
      run: () => net.equip(item.id, "weapon"),
    });
    if (hasSub) {
      const subDenied = weaponSlotDeniedReason("sub_weapon", profile, item.type);
      actions.push({
        id: "equip:sub_weapon",
        label: `Equip (Sub · ${jobLabel(profile.sub_job!)})`,
        disabled: !!subDenied,
        title: subDenied,
        run: () => net.equip(item.id, "sub_weapon"),
      });
    }
    return actions;
  }

  actions.push({
    id: "equip",
    label: "Equip",
    run: () => net.equip(item.id),
  });
  return actions;
}

function primaryWeaponEquipSlot(item: Item, profile: ProfileInfo): "weapon" | "sub_weapon" | null {
  if (jobAllowsWeapon(profile.main_job, item.type)) return "weapon";
  if (profile.sub_job && jobAllowsWeapon(profile.sub_job, item.type)) return "sub_weapon";
  return null;
}

/** Double-click: use consumables; toggle equip state for gear. */
export function runPrimaryItemAction(
  item: Item,
  profile: ProfileInfo,
  equippedSlot?: string,
  locked?: boolean,
): boolean {
  const consumable = item.kind === "consumable";
  const gearLocked = !!locked && !consumable;
  if (gearLocked) return false;

  if (consumable) {
    net.useItemFromBag(item.id);
    return true;
  }

  if (equippedSlot) {
    net.unequip(equippedSlot);
    return true;
  }

  if (item.slot === "weapon") {
    const slot = primaryWeaponEquipSlot(item, profile);
    if (!slot) return false;
    net.equip(item.id, slot);
    return true;
  }

  net.equip(item.id);
  return true;
}
