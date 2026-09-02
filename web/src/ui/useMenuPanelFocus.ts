import { useEffect } from "react";
import { focusPrimaryDialogButton } from "./dialogFocus";

/** Focus the primary action when a login / wizard panel mounts or step changes. */
export function useMenuPanelFocus(...deps: unknown[]) {
  useEffect(() => {
    const t = window.setTimeout(() => focusPrimaryDialogButton(), 0);
    return () => window.clearTimeout(t);
  }, deps);
}
