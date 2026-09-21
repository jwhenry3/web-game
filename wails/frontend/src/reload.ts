import { ReloadAll } from "../wailsjs/go/app/App";
import { getStoredToken } from "./net/auth";

/** True when running inside the Wails webview with the ReloadAll binding. */
export function wailsBridgeReady(): boolean {
  const w = window as unknown as { go?: { app?: { App?: { ReloadAll?: unknown } } } };
  return typeof w.go?.app?.App?.ReloadAll === "function";
}

/**
 * Restart the game backend and reload the app window. In standalone builds Go
 * reboots the embedded cluster in place; in client-only mode it asks the dev
 * server's admin API to restart, then waits for it to come back. The promise
 * may never resolve — the page unloads once Go triggers WindowReload.
 */
export async function reloadBackendAndFrontend(): Promise<void> {
  if (!wailsBridgeReady()) {
    window.location.reload();
    return;
  }
  await ReloadAll(getStoredToken() ?? "");
}
