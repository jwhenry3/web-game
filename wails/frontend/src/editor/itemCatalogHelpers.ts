import type { EquipSlot, ItemDef, ItemEffects, ItemStatKey } from "./gameContentTypes";

export function createDefaultConsumable(id = `item_${Date.now()}`): ItemDef {
  return {
    id,
    name: "New Consumable",
    kind: "consumable",
    description: "",
    target: "ally",
    effects: { heal_hp: 0, restore_mp: 0, per_level: 0 },
    stackable: true,
    max_stack: 99,
  };
}

export function createDefaultEquipment(id = `gear_${Date.now()}`): ItemDef {
  return {
    id,
    name: "New Equipment",
    kind: "equipment",
    description: "",
    slot: "weapon",
    allowed_slots: ["weapon", "sub_weapon"],
    weapon_type: "sword",
    rarity: "common",
    level: 1,
    stats: {},
  };
}

export function createDefaultItem(kind: ItemDef["kind"] = "consumable"): ItemDef {
  return kind === "equipment" ? createDefaultEquipment() : createDefaultConsumable();
}

export function normalizeItemDef(item: ItemDef): ItemDef {
  if (item.kind === "equipment") {
    const slot = item.slot ?? "weapon";
    const isWeapon = slot === "weapon" || slot === "sub_weapon" || item.allowed_slots?.some((s) => s === "weapon" || s === "sub_weapon");
    return {
      ...createDefaultEquipment(item.id),
      ...item,
      slot,
      allowed_slots: item.allowed_slots?.length
        ? item.allowed_slots
        : isWeapon
          ? ["weapon", "sub_weapon"]
          : [slot],
      stats: { ...item.stats },
    };
  }
  return {
    ...createDefaultConsumable(item.id),
    ...item,
    effects: { ...item.effects },
  };
}

export function itemCatalogSubtitle(item: ItemDef): string {
  if (item.kind === "consumable") {
    const parts: string[] = ["consumable"];
    const fx = item.effects;
    if (fx?.heal_hp) parts.push(`+${fx.heal_hp} HP`);
    if (fx?.restore_mp) parts.push(`+${fx.restore_mp} MP`);
    if (item.target === "self") parts.push("self");
    return parts.join(" · ");
  }
  const slot = item.slot ?? "gear";
  const stats = item.stats ? Object.entries(item.stats).filter(([, v]) => v).map(([k, v]) => `+${v} ${k.toUpperCase()}`) : [];
  return [slot, item.rarity ?? "common", ...stats.slice(0, 2)].filter(Boolean).join(" · ");
}

export function patchItemEffects(item: ItemDef, patch: Partial<ItemEffects>): ItemDef {
  return { ...item, effects: { ...item.effects, ...patch } };
}

export function patchItemStat(item: ItemDef, key: ItemStatKey, value: number): ItemDef {
  const stats = { ...item.stats };
  if (value === 0) delete stats[key];
  else stats[key] = value;
  return { ...item, stats };
}

export function toggleAllowedSlot(item: ItemDef, slot: EquipSlot, enabled: boolean): ItemDef {
  const current = new Set(item.allowed_slots ?? (item.slot ? [item.slot] : []));
  if (enabled) current.add(slot);
  else current.delete(slot);
  const allowed = [...current];
  return {
    ...item,
    allowed_slots: allowed.length > 0 ? allowed : item.slot ? [item.slot] : [],
  };
}

export function setItemKind(item: ItemDef, kind: ItemDef["kind"]): ItemDef {
  if (item.kind === kind) return normalizeItemDef(item);
  const base = kind === "equipment" ? createDefaultEquipment(item.id) : createDefaultConsumable(item.id);
  return normalizeItemDef({ ...base, id: item.id, name: item.name });
}

export function isWeaponSlot(slot?: EquipSlot): boolean {
  return slot === "weapon" || slot === "sub_weapon";
}
