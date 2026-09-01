import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(value);
      else (ref as MutableRefObject<T | null>).current = value;
    }
  };
}

type Placement = "top" | "bottom";

export function HoverTooltip({
  content,
  children,
  disabled,
}: {
  content: ReactNode;
  children: ReactElement;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>("top");
  const [style, setStyle] = useState<CSSProperties>({ top: 0, left: 0, visibility: "hidden" });
  const anchorRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;

    const rect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    let top = rect.top - tipRect.height - gap;
    let place: Placement = "top";
    if (top < margin) {
      place = "bottom";
      top = rect.bottom + gap;
    }

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

    setPlacement(place);
    setStyle({ top, left, visibility: "visible" });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, content, reposition]);

  const child = Children.only(children);
  if (!isValidElement(child)) return children;

  const el = child as ReactElement<{
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: (e: FocusEvent<HTMLElement>) => void;
    ref?: Ref<HTMLElement>;
  }>;

  const onMouseEnter = (e: MouseEvent<HTMLElement>) => {
    el.props.onMouseEnter?.(e);
    if (!disabled) setOpen(true);
  };
  const onMouseLeave = (e: MouseEvent<HTMLElement>) => {
    el.props.onMouseLeave?.(e);
    setOpen(false);
  };
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    el.props.onFocus?.(e);
    if (!disabled) setOpen(true);
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    el.props.onBlur?.(e);
    setOpen(false);
  };

  const merged = cloneElement(el, {
    ref: mergeRefs(el.props.ref, anchorRef),
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
  });

  return (
    <>
      {merged}
      {open &&
        content &&
        createPortal(
          <div
            ref={tipRef}
            className={`xiv-tooltip xiv-tooltip-${placement}`}
            style={{ position: "fixed", zIndex: 20000, pointerEvents: "none", ...style }}
            role="tooltip"
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
