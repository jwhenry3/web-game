import { setPlatformFetch } from "./net/platform";
import { setGameTransport } from "./net/transport";
import { setMovementBridge } from "./world/movementBridge";
import { wailsMovementBridge } from "./wailsMovement";
import { wailsPlatformFetch } from "./wailsPlatform";
import { wailsTransport, wireTransportEvents } from "./wailsTransport";

let wired = false;

/** Install Go-backed transport before the React tree mounts.
 *  Do not setApiBase — Go APIGet/APIPost already prepend the server URL. */
export async function bootstrapWails(): Promise<void> {
  if (wired) return;
  wired = true;

  setPlatformFetch(wailsPlatformFetch);
  wireTransportEvents();
  setGameTransport(wailsTransport);
  setMovementBridge(wailsMovementBridge);
}
