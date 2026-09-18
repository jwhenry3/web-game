import { net } from "../net/socket";
import {
  HOTBAR_SLOTS,
  formatWeaponList,
  itemQty,
  jobAllowedWeapons,
  jobAllowsWeapon,
  jobLabel,
  type Item,
  type ProfileInfo,
} from "../types";
import { hotbarSlotLabel } from "../input/keybinds";
import type { ItemBagId } from "./itemTransfer";

export type ItemAction = {
  id: string;
  label: string;
  disabled?: boolean;
  title?: string;
  run: () => void;
};

export type ItemActionContext = {
  bag?: ItemBagId;
  /** True while the house storage dual-window UI is open. */
  houseStorageOpen?: boolean;
  onPlaceFurniture?: (item: Item) => void;
  /** Equipment window: doll slot currently marked active for equipping. */
  activeSlot?: string;
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
  ctx: ItemActionContext = {},
): ItemAction[] {
  const bag = ctx.bag ?? "inventory";
  const qty = itemQty(item);

  if (bag === "house_storage") {
    return [
      {
        id: "withdraw",
        label: qty > 1 ? `Withdraw ×${qty}` : "Withdraw",
        run: () => net.houseStorageWithdraw(item.id, qty),
      },
    ];
  }

  const actions: ItemAction[] = [];

  if (ctx.houseStorageOpen && !equippedSlot) {
    actions.push({
      id: "deposit",
      label: qty > 1 ? `Deposit ×${qty}` : "Deposit",
      run: () => net.houseStorageDeposit(item.id, qty),
    });
    if (ctx.onPlaceFurniture) {
      actions.push({
        id: "place_furniture",
        label: "Place at feet",
        run: () => ctx.onPlaceFurniture!(item),
      });
    }
  }

  const consumable = item.kind === "consumable";
  const isWeapon = item.slot === "weapon";
  const hasSub = !!profile.sub_job;
  const gearLocked = !!locked && !consumable;

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

  if (item.kind === "decoration" || item.kind === "crafting" || item.kind === "material") {
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

function weaponSlotAllowed(slot: "weapon" | "sub_weapon", item: Item, profile: ProfileInfo): boolean {
  const jobId = slot === "weapon" ? profile.main_job : profile.sub_job;
  return !!jobId && jobAllowsWeapon(jobId, item.type);
}

/**
 * Double-click weapon equip: an active weapon doll slot wins when the job can
 * use the weapon there; otherwise the first empty slot (main, then sub), and
 * with both filled it falls back to main.
 */
function primaryWeaponEquipSlot(
  item: Item,
  profile: ProfileInfo,
  activeSlot?: string,
): "weapon" | "sub_weapon" | null {
  if (
    (activeSlot === "weapon" || activeSlot === "sub_weapon") &&
    weaponSlotAllowed(activeSlot, item, profile)
  ) {
    return activeSlot;
  }
  const mainFilled = !!profile.equipped?.weapon;
  const subFilled = !!profile.equipped?.sub_weapon;
  if (!mainFilled && weaponSlotAllowed("weapon", item, profile)) return "weapon";
  if (mainFilled && !subFilled && weaponSlotAllowed("sub_weapon", item, profile)) {
    return "sub_weapon";
  }
  if (weaponSlotAllowed("weapon", item, profile)) return "weapon";
  if (weaponSlotAllowed("sub_weapon", item, profile)) return "sub_weapon";
  return null;
}

/** Double-click: deposit/withdraw in house storage; otherwise use/equip. */
export function runPrimaryItemAction(
  item: Item,
  profile: ProfileInfo,
  equippedSlot?: string,
  locked?: boolean,
  ctx: ItemActionContext = {},
): boolean {
  const bag = ctx.bag ?? "inventory";
  const qty = itemQty(item);

  if (bag === "house_storage") {
    net.houseStorageWithdraw(item.id, qty);
    return true;
  }

  if (ctx.houseStorageOpen && !equippedSlot) {
    net.houseStorageDeposit(item.id, qty);
    return true;
  }

  const consumable = item.kind === "consumable";
  const gearLocked = !!locked && !consumable;
  if (gearLocked) return false;

  if (consumable) {
    net.useItemFromBag(item.id);
    return true;
  }

  if (item.kind === "decoration" || item.kind === "crafting" || item.kind === "material") {
    return false;
  }

  if (equippedSlot) {
    net.unequip(equippedSlot);
    return true;
  }

  if (item.slot === "weapon") {
    const slot = primaryWeaponEquipSlot(item, profile, ctx.activeSlot);
    if (!slot) return false;
    net.equip(item.id, slot);
    return true;
  }

  net.equip(item.id);
  return true;
}
