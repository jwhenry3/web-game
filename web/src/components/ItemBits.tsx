import { net } from "../net/socket";
import { useGame } from "../state/store";
import { HOTBAR_SLOTS, RARITY_COLORS, itemQty, type Item, type ProfileInfo } from "../types";
import { hotbarSlotLabel } from "../input/keybinds";
import { HoverTooltip } from "../ui/HoverTooltip";
import { EmptySlotTooltipContent, ItemTooltipContent } from "../ui/tooltipContent";
import { setHotbarDragImage, writeHotbarDrag } from "../ui/hotbarDrag";

import { GameIcon } from "../ui/GameIcon";
import { consumableIconSrc, itemIconSrc } from "../ui/itemDisplay";

export function BindButtons({ kind, id }: { kind: "skill" | "item"; id: string }) {
  const bindSlot = useGame((s) => s.bindSlot);
  if (bindSlot) {
    return (
      <button className="xiv-btn" onClick={() => net.bindToHotbar(kind, id)}>
        Set to {bindSlot}
      </button>
    );
  }
  return (
    <select
      className="xiv-select"
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) net.setHotbar(e.target.value, kind, id);
        e.target.value = "";
      }}
    >
      <option value="">Hotbar…</option>
      {HOTBAR_SLOTS.map((s) => (
        <option key={s} value={s}>
          {hotbarSlotLabel(s)}
        </option>
      ))}
    </select>
  );
}

function ItemActionMenu({
  item,
  profile,
  equippedSlot,
  locked,
}: {
  item: Item;
  profile: ProfileInfo;
  equippedSlot?: string;
  locked?: boolean;
}) {
  const bindSlot = useGame((s) => s.bindSlot);
  const consumable = item.kind === "consumable";
  const isWeapon = item.slot === "weapon";
  const hasSub = !!profile.sub_job;
  const gearLocked = !!locked && !consumable;

  const runAction = (value: string) => {
    if (value === "use") {
      net.useItemFromBag(item.id);
      return;
    }
    if (value.startsWith("hotbar:")) {
      net.setHotbar(value.slice(7), "item", item.consumable || item.id);
      return;
    }
    if (value.startsWith("unequip:")) {
      net.unequip(value.slice(8));
      return;
    }
    if (value === "equip:weapon") {
      net.equip(item.id, "weapon");
      return;
    }
    if (value === "equip:sub_weapon") {
      net.equip(item.id, "sub_weapon");
      return;
    }
    if (value === "equip") {
      net.equip(item.id);
    }
  };

  return (
    <select
      className="xiv-select xiv-item-action"
      defaultValue=""
      disabled={gearLocked}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const value = e.target.value;
        e.target.value = "";
        if (value) runAction(value);
      }}
    >
      <option value="">Actions…</option>
      {consumable ? (
        <>
          <option value="use">Use</option>
          {bindSlot ? (
            <option value={`hotbar:${bindSlot}`}>Set to {bindSlot}</option>
          ) : (
            HOTBAR_SLOTS.map((slot) => (
              <option key={slot} value={`hotbar:${slot}`}>
                Hotbar {hotbarSlotLabel(slot)}
              </option>
            ))
          )}
        </>
      ) : equippedSlot ? (
        <option value={`unequip:${equippedSlot}`}>Unequip</option>
      ) : isWeapon ? (
        <>
          <option value="equip:weapon">Equip (Main)</option>
          {hasSub && <option value="equip:sub_weapon">Equip (Sub)</option>}
        </>
      ) : (
        <option value="equip">Equip</option>
      )}
    </select>
  );
}

export function ItemListRow({
  item,
  profile,
  selected,
  equipped,
  equippedSlot,
  locked,
  onClick,
}: {
  item: Item;
  profile: ProfileInfo;
  selected?: boolean;
  equipped?: boolean;
  equippedSlot?: string;
  locked?: boolean;
  onClick?: () => void;
}) {
  const consumable = item.kind === "consumable";
  const qty = itemQty(item);
  const row = (
    <div className={`xiv-item-row-wrap ${selected ? "selected" : ""} ${equipped ? "equipped" : ""}`}>
      <button
        type="button"
        className="xiv-item-row"
        onClick={onClick}
        draggable={consumable}
        onDragStart={(e) => {
          if (!consumable || !item.consumable) return;
          writeHotbarDrag(e, { kind: "item", id: item.consumable });
          setHotbarDragImage(e, consumableIconSrc(item.consumable), qty);
        }}
      >
        <span className="xiv-item-row-icon">
          <GameIcon src={itemIconSrc(item)} alt="" size={20} />
        </span>
        <span className="xiv-item-row-name" style={{ color: RARITY_COLORS[item.rarity] }}>
          {item.name}
        </span>
        {equipped && (
          <span className="xiv-item-row-equipped" title="Equipped">
            E
          </span>
        )}
        {consumable && qty > 1 && <span className="xiv-item-row-meta">×{qty}</span>}
        {!consumable && item.level > 0 && <span className="xiv-item-row-meta">i{item.level}</span>}
      </button>
      <ItemActionMenu item={item} profile={profile} equippedSlot={equippedSlot} locked={locked} />
    </div>
  );

  return <HoverTooltip content={<ItemTooltipContent item={item} />}>{row}</HoverTooltip>;
}

export function ItemSlot({
  item,
  empty,
  emptyLabel,
  selected,
  equipped,
  onClick,
}: {
  item?: Item;
  empty?: string;
  emptyLabel?: string;
  selected?: boolean;
  equipped?: boolean;
  onClick?: () => void;
}) {
  const stackable = item && item.kind !== "equipment";
  const qty = item ? itemQty(item) : 0;
  const slotTip = empty ? (emptyLabel ?? empty) : undefined;
  const button = (
    <button
      type="button"
      className={`xiv-slot ${selected ? "selected" : ""} ${equipped ? "equipped" : ""} ${!item ? "empty" : ""}`}
      onClick={onClick}
      draggable={!!stackable}
      onDragStart={(e) => {
        if (!stackable || !item?.consumable) return;
        writeHotbarDrag(e, { kind: "item", id: item.consumable });
      }}
    >
      {item ? (
        <>
          <span className="xiv-slot-glyph">
            <GameIcon src={itemIconSrc(item)} alt="" size={16} />
          </span>
          {stackable && <span className="xiv-slot-ilvl">{qty}</span>}
        </>
      ) : (
        <span className="xiv-slot-empty">{empty?.slice(0, 1) ?? ""}</span>
      )}
    </button>
  );

  if (item) {
    return <HoverTooltip content={<ItemTooltipContent item={item} />}>{button}</HoverTooltip>;
  }
  if (slotTip) {
    return <HoverTooltip content={<EmptySlotTooltipContent label={slotTip} />}>{button}</HoverTooltip>;
  }
  return button;
}
