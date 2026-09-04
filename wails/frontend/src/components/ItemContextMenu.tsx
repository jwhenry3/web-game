import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Item, ProfileInfo } from "../types";
import { itemActions, type ItemAction } from "../ui/itemActions";
import { useGame } from "../state/store";

type ItemMenuState = {
  item: Item;
  profile: ProfileInfo;
  equippedSlot?: string;
  locked?: boolean;
  x: number;
  y: number;
};

type ItemMenuContextValue = {
  open: (state: ItemMenuState) => void;
  close: () => void;
};

const ItemMenuContext = createContext<ItemMenuContextValue | null>(null);

function ItemContextMenuPanel({
  menu,
  onClose,
}: {
  menu: ItemMenuState;
  onClose: () => void;
}) {
  const bindSlot = useGame((s) => s.bindSlot);
  const actions = itemActions(menu.item, menu.profile, menu.equippedSlot, menu.locked, bindSlot);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".xiv-item-context-menu")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(menu.x, vw - 200);
  const top = Math.min(menu.y, vh - Math.max(actions.length, 1) * 36 - 16);

  return createPortal(
    <div
      className="xiv-item-context-menu xiv-panel"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {actions.length === 0 ? (
        <p className="hint xiv-item-context-empty">No actions available.</p>
      ) : (
        actions.map((action: ItemAction) => (
          <button
            key={action.id}
            type="button"
            className="xiv-item-context-item"
            disabled={action.disabled}
            title={action.title}
            onClick={() => {
              action.run();
              onClose();
            }}
          >
            {action.label}
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}

export function ItemMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ItemMenuState | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const open = useCallback((state: ItemMenuState) => setMenu(state), []);

  return (
    <ItemMenuContext.Provider value={{ open, close }}>
      {children}
      {menu && <ItemContextMenuPanel menu={menu} onClose={close} />}
    </ItemMenuContext.Provider>
  );
}

export function useItemContextMenu() {
  const ctx = useContext(ItemMenuContext);
  if (!ctx) throw new Error("useItemContextMenu requires ItemMenuProvider");
  return ctx;
}
