import { net } from "../net/socket";
import { useGame } from "../state/store";
import { HOTBAR_SLOTS, RARITY_COLORS, itemQty, type Item, type ProfileInfo } from "../types";
import { hotbarSlotLabel } from "../input/keybinds";
import { HoverTooltip } from "../ui/HoverTooltip";
import { EmptySlotTooltipContent, ItemTooltipContent } from "../ui/tooltipContent";
import { setHotbarDragImage, writeHotbarDrag } from "../ui/hotbarDrag";
import { writeItemTransfer, type ItemBagId } from "../ui/itemTransfer";
import { useItemContextMenu } from "./ItemContextMenu";
import { runPrimaryItemAction, type ItemActionContext } from "../ui/itemActions";

import { GameIcon } from "../ui/GameIcon";
import { consumableIconSrc, itemIconSrc } from "../ui/itemDisplay";

export function BindButtons({ kind, id }: { kind: "skill" | "item"; id: string }) {
  const bindSlot = useGame((s) => s.bindSlot);
  if (bindSlot) {
    return (
      <button className="cm-btn" onClick={() => net.bindToHotbar(kind, id)}>
        Set to {bindSlot}
      </button>
    );
  }
  return (
    <select
      className="cm-select"
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
  bag = "inventory",
  transferEnabled = false,
  actionCtx,
  onClick,
}: {
  item: Item;
  profile: ProfileInfo;
  selected?: boolean;
  equipped?: boolean;
  equippedSlot?: string;
  locked?: boolean;
  showLevel?: boolean;
  bag?: ItemBagId;
  /** Allow dragging this row for bag↔bag transfer (and hotbar if consumable). */
  transferEnabled?: boolean;
  actionCtx?: ItemActionContext;
  onClick?: () => void;
}) {
  const { open: openContextMenu } = useItemContextMenu();
  const consumable = item.kind === "consumable";
  const qty = itemQty(item);
  const canHotbarDrag = bag === "inventory" && consumable && !!item.consumable;
  const canTransferDrag = transferEnabled && !(bag === "inventory" && equipped);
  const draggable = canHotbarDrag || canTransferDrag;
  const ctx: ItemActionContext = { bag, ...actionCtx };

  const row = (
    <div className={`cm-item-row-wrap ${selected ? "selected" : ""} ${equipped ? "equipped" : ""}`}>
      <button
        type="button"
        className="cm-item-row"
        onClick={onClick}
        onDoubleClick={(e) => {
          e.preventDefault();
          runPrimaryItemAction(item, profile, equippedSlot, locked, ctx);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu({
            item,
            profile,
            equippedSlot,
            locked,
            bag,
            actionCtx: ctx,
            x: e.clientX,
            y: e.clientY,
          });
        }}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) return;
          if (canTransferDrag) {
            writeItemTransfer(e, { source: bag, itemId: item.id, qty });
          }
          if (canHotbarDrag && item.consumable) {
            writeHotbarDrag(e, { kind: "item", id: item.consumable });
            setHotbarDragImage(e, consumableIconSrc(item.consumable), qty);
          } else {
            e.dataTransfer.setDragImage(e.currentTarget, 16, 16);
          }
          if (canTransferDrag && canHotbarDrag) e.dataTransfer.effectAllowed = "copyMove";
          else if (canTransferDrag) e.dataTransfer.effectAllowed = "move";
        }}
      >
        <span className="cm-item-row-icon">
          <GameIcon src={itemIconSrc(item)} alt="" size={20} />
          {equipped && (
            <span className="cm-item-row-equipped" title="Equipped">
              E
            </span>
          )}
        </span>
        <span className="cm-item-row-name" style={{ color: RARITY_COLORS[item.rarity] }}>
          {item.name}
        </span>
        {consumable && qty > 1 && <span className="cm-item-row-meta">×{qty}</span>}
        {showLevel && !consumable && item.level > 0 && (
          <span className="cm-item-row-meta">i{item.level}</span>
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
      className={`cm-slot ${selected ? "selected" : ""} ${equipped ? "equipped" : ""} ${!item ? "empty" : ""}`}
      onClick={onClick}
      draggable={!!stackable}
      onDragStart={(e) => {
        if (!stackable || !item?.consumable) return;
        writeHotbarDrag(e, { kind: "item", id: item.consumable });
      }}
    >
      {item ? (
        <>
          <span className="cm-slot-glyph">
            <GameIcon src={itemIconSrc(item)} alt="" size={16} />
          </span>
          {stackable && <span className="cm-slot-ilvl">{qty}</span>}
        </>
      ) : (
        <span className="cm-slot-empty">{emptyLabel ?? empty ?? "—"}</span>
      )}
    </button>
  );

  return (
    <HoverTooltip content={item ? <ItemTooltipContent item={item} /> : <EmptySlotTooltipContent label={slotTip ?? "Empty"} />}>
      {button}
    </HoverTooltip>
  );
}
