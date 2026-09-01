import { net } from "../net/socket";
import { useGame } from "../state/store";
import { HOTBAR_SLOTS, RARITY_COLORS, itemQty, type Item, type ProfileInfo } from "../types";
import { HoverTooltip } from "../ui/HoverTooltip";
import { EmptySlotTooltipContent, ItemTooltipContent } from "../ui/tooltipContent";
import { writeHotbarDrag } from "../ui/hotbarDrag";

import { GameIcon } from "../ui/GameIcon";
import { itemIconSrc, itemStats } from "../ui/itemDisplay";

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
          {s}
        </option>
      ))}
    </select>
  );
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

export function ItemDetail({
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
  const consumable = item.kind === "consumable";
  const qty = itemQty(item);
  const isWeapon = item.slot === "weapon";
  const hasSub = !!profile.sub_job;
  return (
    <div className="xiv-detail">
      <div className="xiv-detail-name" style={{ color: RARITY_COLORS[item.rarity] }}>
        {item.name}
        {consumable && qty > 1 ? ` ×${qty}` : ""}
      </div>
      <div className="xiv-detail-meta">
        {consumable ? "Medicine" : item.slot}
        {item.type ? ` · ${item.type}` : ""} · iLvl {item.level} · {item.rarity}
        {consumable ? " · drag to hotbar" : ""}
      </div>
      {itemStats(item) && <div className="xiv-detail-stats">{itemStats(item)}</div>}
      <div className="xiv-detail-actions">
        {consumable ? (
          <>
            <button className="xiv-btn gold" onClick={() => net.useItemFromBag(item.id)}>
              Use
            </button>
            <BindButtons kind="item" id={item.consumable || item.id} />
          </>
        ) : equippedSlot ? (
          <button className="xiv-btn" disabled={locked} onClick={() => net.unequip(equippedSlot)}>
            Unequip
          </button>
        ) : isWeapon ? (
          <>
            <button className="xiv-btn gold" disabled={locked} onClick={() => net.equip(item.id, "weapon")}>
              Equip (Main)
            </button>
            {hasSub && (
              <button className="xiv-btn gold" disabled={locked} onClick={() => net.equip(item.id, "sub_weapon")}>
                Equip (Sub)
              </button>
            )}
          </>
        ) : (
          <button className="xiv-btn gold" disabled={locked} onClick={() => net.equip(item.id)}>
            Equip
          </button>
        )}
      </div>
    </div>
  );
}
