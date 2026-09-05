import { useEffect, useRef } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { equippedSlotForItem } from "../types";
import { hasItemTransfer, readItemTransfer } from "../ui/itemTransfer";
import {
  clearHousePlace,
  clientPointToWorld,
  getHousePlaceState,
  houseTileWalkable,
  setHousePlaceHover,
  worldToHouseTile,
} from "../world/housePlaceBridge";

/** Document-level drag→floor placement + pick clicks for the house screen. */
export function HousePlaceLayer() {
  const screen = useGame((s) => s.screen);
  const house = useGame((s) => s.house);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (screen !== "house" || !house?.is_owner) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearHousePlace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, house?.is_owner]);

  useEffect(() => {
    if (screen !== "house" || !house?.is_owner) return;

    const occupied = (col: number, row: number) =>
      (house.furniture ?? []).some((f) => f.col === col && f.row === row);

    const tileAtClient = (clientX: number, clientY: number) => {
      const world = clientPointToWorld(clientX, clientY);
      if (!world) return null;
      const tile = worldToHouseTile(world.x, world.y);
      if (!tile) return null;
      const valid = houseTileWalkable(tile.col, tile.row) && !occupied(tile.col, tile.row);
      return { ...tile, valid, world };
    };

    const updateHover = (clientX: number, clientY: number) => {
      const tile = tileAtClient(clientX, clientY);
      if (!tile) {
        setHousePlaceHover(null);
        return;
      }
      setHousePlaceHover({ col: tile.col, row: tile.row, valid: tile.valid });
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasItemTransfer(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      updateHover(e.clientX, e.clientY);
    };

    const onDrop = (e: DragEvent) => {
      if (!hasItemTransfer(e)) return;
      e.preventDefault();
      const drag = readItemTransfer(e);
      setHousePlaceHover(null);
      if (!drag || drag.source !== "inventory") return;
      const profile = useGame.getState().profile;
      if (profile && equippedSlotForItem(profile.equipped, drag.itemId)) return;
      const tile = tileAtClient(e.clientX, e.clientY);
      if (!tile || !tile.valid) return;
      net.housePlaceFurniture(drag.itemId, tile.col, tile.row);
    };

    const onDragEnd = () => setHousePlaceHover(null);

    const onPointerMove = (e: PointerEvent) => {
      const place = getHousePlaceState();
      // Ghost while an item is armed for click-place, or while pick mode (tile highlight).
      if (!place.itemId && !place.pickMode) return;
      // Don't steal when interacting with UI chrome.
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".hotbar, .cm-window, .cm-window-layer, .side-panel, .house-toolbar")) return;
      updateHover(e.clientX, e.clientY);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".hotbar, .cm-window, .cm-window-layer, .side-panel, .house-toolbar, button, a, input")) {
        return;
      }
      const place = getHousePlaceState();
      const tile = tileAtClient(e.clientX, e.clientY);
      if (!tile) return;

      if (place.pickMode) {
        const furn = (house.furniture ?? []).find((f) => f.col === tile.col && f.row === tile.row);
        if (furn) {
          e.preventDefault();
          net.housePickFurniture(furn.id);
        }
        return;
      }

      if (place.itemId && tile.valid) {
        e.preventDefault();
        net.housePlaceFurniture(place.itemId, tile.col, tile.row);
        clearHousePlace();
      }
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [screen, house]);

  if (screen !== "house" || !house) return null;
  return <div ref={anchorRef} className="house-place-layer" aria-hidden />;
}
