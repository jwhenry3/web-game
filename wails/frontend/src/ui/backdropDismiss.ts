import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";

/** Backdrop click-to-close that ignores HTML5 item drags (which otherwise dismiss the layer). */
export function useBackdropDismiss(onClose: () => void) {
  const itemDragActive = useRef(false);
  const suppressUntil = useRef(0);

  useEffect(() => {
    const arm = () => {
      itemDragActive.current = true;
      suppressUntil.current = performance.now() + 400;
    };
    const disarm = () => {
      itemDragActive.current = false;
      // Swallow the synthetic post-drag click/mousedown some browsers deliver to the backdrop.
      suppressUntil.current = performance.now() + 150;
    };
    window.addEventListener("dragstart", arm, true);
    window.addEventListener("dragend", disarm, true);
    window.addEventListener("drop", disarm, true);
    return () => {
      window.removeEventListener("dragstart", arm, true);
      window.removeEventListener("dragend", disarm, true);
      window.removeEventListener("drop", disarm, true);
    };
  }, []);

  return useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (itemDragActive.current) return;
      if (performance.now() < suppressUntil.current) return;
      onClose();
    },
    [onClose],
  );
}
