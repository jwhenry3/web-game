import { setPlatformFetch } from "./net/platform";
import { setGameTransport } from "./net/transport";
import { loadVfxProfiles } from "./vfx/battleVfxProfiles";
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

  // Data-driven battle VFX profiles — optional JSON overlay merged over the
  // compiled defaults. Awaits before mount so the first battle can't race it;
  // missing/invalid files silently fall back to defaults.
  await loadVfxProfiles();
}
