import { mergeKeybinds } from "../input/keybinds";
import type { KeybindMap } from "../input/keybinds";
import { facingFromAxes, FACING_YAW_DEFAULT, type FacingYaw } from "./facing";

const down = new Set<string>();

function onKeyDown(e: KeyboardEvent) {
  down.add(e.code);
  if (e.key.length === 1) down.add(e.key.toLowerCase());
}

function onKeyUp(e: KeyboardEvent) {
  down.delete(e.code);
  if (e.key.length === 1) down.delete(e.key.toLowerCase());
}

let wired = false;
let facing: FacingYaw = FACING_YAW_DEFAULT;

export function ensureKeyboard(): void {
  if (wired) return;
  wired = true;
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => down.clear());
}

function bindingHeld(binding: string): boolean {
  const b = (binding ?? "").trim().toLowerCase();
  if (!b) return false;
  if (b === "space" || b === " ") return down.has("Space");
  if (b === "w") return down.has("KeyW") || down.has("w");
  if (b === "a") return down.has("KeyA") || down.has("a");
  if (b === "s") return down.has("KeyS") || down.has("s");
  if (b === "d") return down.has("KeyD") || down.has("d");
  if (b === "arrowup") return down.has("ArrowUp");
  if (b === "arrowdown") return down.has("ArrowDown");
  if (b === "arrowleft") return down.has("ArrowLeft");
  if (b === "arrowright") return down.has("ArrowRight");
  if (b.length === 1 && b >= "a" && b <= "z") {
    return down.has(`Key${b.toUpperCase()}`) || down.has(b);
  }
  return down.has(binding) || down.has(b);
}

/**
 * Read move intent. When `cameraYaw` is set (FollowOrbitCamera.yaw), axes are
 * rotated into map space so W stays away-from-camera on the ground plane.
 * `facing` is continuous model yaw in radians.
 */
export function readMoveAxes(
  keybinds?: KeybindMap | null,
  cameraYaw = 0,
): { dx: number; dy: number; facing: FacingYaw } {
  const binds = mergeKeybinds(keybinds);
  let dx = 0;
  let dy = 0;
  if (bindingHeld(binds.move_left ?? "a")) dx -= 1;
  if (bindingHeld(binds.move_right ?? "d")) dx += 1;
  if (bindingHeld(binds.move_up ?? "w")) dy -= 1;
  if (bindingHeld(binds.move_down ?? "s")) dy += 1;
  if (dx !== 0 || dy !== 0) {
    const c = Math.cos(cameraYaw);
    const s = Math.sin(cameraYaw);
    const mx = dx * c + dy * s;
    const my = -dx * s + dy * c;
    dx = mx;
    dy = my;
  }
  facing = facingFromAxes(dx, dy, facing);
  return { dx, dy, facing };
}

export function getFacing(): FacingYaw {
  return facing;
}

export function setFacing(f: FacingYaw): void {
  facing = f;
}
