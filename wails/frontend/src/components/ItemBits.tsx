import { net } from "../net/socket";
import { useGame } from "../state/store";
import { HOTBAR_SLOTS, RARITY_COLORS, itemQty, type Item, type ProfileInfo } from "../types";
import { hotbarSlotLabel } from "../input/keybinds";
import { HoverTooltip } from "../ui/HoverTooltip";
import { EmptySlotTooltipContent, ItemTooltipContent } from "../ui/tooltipContent";
import { setHotbarDragImage, writeHotbarDrag } from "../ui/hotbarDrag";
import { useItemContextMenu } from "./ItemContextMenu";
import { runPrimaryItemAction } from "../ui/itemActions";

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

export function ItemListRow({
  item,
  profile,
  selected,
  equipped,
  equippedSlot,
  locked,
  showLevel = true,
  onClick,
}: {
  item: Item;
  profile: ProfileInfo;
  selected?: boolean;
  equipped?: boolean;
  equippedSlot?: string;
  locked?: boolean;
  showLevel?: boolean;
  onClick?: () => void;
}) {
  const { open: openContextMenu } = useItemContextMenu();
  const consumable = item.kind === "consumable";
  const qty = itemQty(item);
  const row = (
    <div className={`xiv-item-row-wrap ${selected ? "selected" : ""} ${equipped ? "equipped" : ""}`}>
      <button
        type="button"
        className="xiv-item-row"
        onClick={onClick}
        onDoubleClick={(e) => {
          e.preventDefault();
          runPrimaryItemAction(item, profile, equippedSlot, locked);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu({
            item,
            profile,
            equippedSlot,
            locked,
            x: e.clientX,
            y: e.clientY,
          });
        }}
        draggable={consumable}
        onDragStart={(e) => {
          if (!consumable || !item.consumable) return;
          writeHotbarDrag(e, { kind: "item", id: item.consumable });
          setHotbarDragImage(e, consumableIconSrc(item.consumable), qty);
        }}
      >
        <span className="xiv-item-row-icon">
          <GameIcon src={itemIconSrc(item)} alt="" size={20} />
          {equipped && (
            <span className="xiv-item-row-equipped" title="Equipped">
              E
            </span>
          )}
        </span>
        <span className="xiv-item-row-name" style={{ color: RARITY_COLORS[item.rarity] }}>
          {item.name}
        </span>
        {consumable && qty > 1 && <span className="xiv-item-row-meta">×{qty}</span>}
        {showLevel && !consumable && item.level > 0 && (
          <span className="xiv-item-row-meta">i{item.level}</span>
        )}
      </button>
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
