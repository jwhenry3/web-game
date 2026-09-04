import { useEffect, useRef } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { equippedSlotForItem } from "../types";
import { hasItemTransfer, readItemTransfer } from "../ui/itemTransfer";
import {
  clearHousePlace,
  houseTileWalkable,
  setHousePlaceHover,
  stagePointToWorld,
  worldToHouseTile,
} from "../world/housePlaceBridge";

/** Document-level drag→floor placement from inventory. */
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

    const stageEl = () => anchorRef.current?.parentElement;

    const stageCoords = (clientX: number, clientY: number) => {
      const stage = stageEl();
      if (!stage) return null;
      const rect = stage.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const occupied = (col: number, row: number) =>
      (house.furniture ?? []).some((f) => f.col === col && f.row === row);

    const updateHover = (clientX: number, clientY: number) => {
      const stage = stageCoords(clientX, clientY);
      if (!stage) return;
      const world = stagePointToWorld(stage.x, stage.y);
      if (!world) return;
      const tile = worldToHouseTile(world.x, world.y);
      if (!tile) return;
      const valid = houseTileWalkable(tile.col, tile.row) && !occupied(tile.col, tile.row);
      setHousePlaceHover({ col: tile.col, row: tile.row, valid });
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasItemTransfer(e)) return;
      e.preventDefault();
      // Must match writeItemTransfer's effectAllowed ("move"); "copy" shows 🚫 and blocks drop.
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
      const stage = stageCoords(e.clientX, e.clientY);
      if (!stage) return;
      const world = stagePointToWorld(stage.x, stage.y);
      if (!world) return;
      const tile = worldToHouseTile(world.x, world.y);
      if (!tile) return;
      if (!houseTileWalkable(tile.col, tile.row) || occupied(tile.col, tile.row)) return;
      net.housePlaceFurniture(drag.itemId, tile.col, tile.row);
    };

    const onDragEnd = () => setHousePlaceHover(null);

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onDragEnd);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onDragEnd);
    };
  }, [screen, house]);

  if (screen !== "house" || !house) return null;
  return <div ref={anchorRef} className="house-place-layer" aria-hidden />;
}
