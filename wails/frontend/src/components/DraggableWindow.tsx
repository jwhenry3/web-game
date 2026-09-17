import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

type Offset = { x: number; y: number };

/**
 * Titlebar-drag positioning for floating game windows. `scale` composes into
 * the transform after the translate so pointer drags stay 1:1 in screen px.
 */
export function useWindowDrag(resetKey?: string | number | null, scale = 1) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    drag.current = null;
  }, [resetKey]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest("button, a, input, select, textarea, .cm-close")) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: offset.x,
        origY: offset.y,
      };
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    setOffset({
      x: d.origX + (e.clientX - d.startX),
      y: d.origY + (e.clientY - d.startY),
    });
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return {
    style: {
      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    } satisfies CSSProperties,
    titlebarProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      className: "cm-titlebar cm-titlebar--drag",
    },
  };
}

export function DraggableWindowShell({
  resetKey,
  className,
  title,
  onClose,
  children,
  bodyClassName,
  scale = 1,
}: {
  resetKey?: string | number | null;
  className?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  bodyClassName?: string;
  scale?: number;
}) {
  const { style, titlebarProps } = useWindowDrag(resetKey, scale);

  return (
    <div
      className={className ?? "cm-window"}
      style={{ ...style, ["--win-scale" as string]: scale }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div {...titlebarProps}>
        <span className="cm-title">{title}</span>
        <button type="button" className="cm-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={bodyClassName ?? "cm-body"}>{children}</div>
    </div>
  );
}
