export const ITEM_TRANSFER_MIME = "application/x-cm-item-transfer";

export type ItemBagId = "inventory" | "house_storage";

export interface ItemTransferDrag {
  source: ItemBagId;
  itemId: string;
  qty: number;
}

type TransferEvent = { dataTransfer: DataTransfer | null };

export function writeItemTransfer(e: TransferEvent, payload: ItemTransferDrag) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(ITEM_TRANSFER_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "move";
}

export function readItemTransfer(e: TransferEvent): ItemTransferDrag | null {
  const raw = e.dataTransfer?.getData(ITEM_TRANSFER_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ItemTransferDrag;
    if (
      (parsed.source === "inventory" || parsed.source === "house_storage") &&
      typeof parsed.itemId === "string" &&
      parsed.itemId
    ) {
      return {
        source: parsed.source,
        itemId: parsed.itemId,
        qty: Math.max(1, Number(parsed.qty) || 1),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function hasItemTransfer(e: TransferEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes(ITEM_TRANSFER_MIME);
}
