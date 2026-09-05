import type { MovementBridge } from "./world/movementBridge";
import { StepMove } from "../wailsjs/go/app/App";

export const wailsMovementBridge: MovementBridge = {
  async slidePlayer(_map, fromX, fromY, toX, toY) {
    const pos = await StepMove(fromX, fromY, toX, toY);
    return { x: pos.x, y: pos.y };
  },
};
