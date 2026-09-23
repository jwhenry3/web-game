import { useEffect, useRef } from 'react';

const storageKey = (id?: string) => (id ? `pane:${id}` : null);

/** Edge drag handle that resizes an adjacent pane. Rendered as a flex child
 * between two panes: `target="prev"` resizes the pane before it, `"next"`
 * the pane after it (the sign is automatic — dragging away from the centre
 * grows the pane). Sizes persist under `pane:<id>` in localStorage;
 * double-click resets to the stylesheet default. */
export function PaneHandle({ axis, target, id, min = 90, maxRatio = 0.85 }: {
  axis: 'x' | 'y';
  target: 'prev' | 'next';
  id?: string;
  min?: number;
  /** Max fraction of the parent the pane may take. */
  maxRatio?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sign = target === 'prev' ? 1 : -1;
  const prop = axis === 'x' ? 'width' : 'height';

  const pane = (): HTMLElement | null => {
    const el = ref.current;
    const sibling = target === 'prev' ? el?.previousElementSibling : el?.nextElementSibling;
    return sibling instanceof HTMLElement ? sibling : null;
  };

  useEffect(() => {
    const key = storageKey(id);
    const el = pane();
    if (!key || !el) return;
    const saved = Number(localStorage.getItem(key));
    if (saved > 0) el.style[prop] = `${saved}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, axis]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = pane();
    if (!el) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
    // A stylesheet max may cap the drag — lift it for the resized dimension.
    if (axis === 'y') el.style.maxHeight = 'none';
    else el.style.maxWidth = 'none';
    const start = el.getBoundingClientRect()[prop];
    const origin = axis === 'x' ? e.clientX : e.clientY;
    const extent = (axis === 'x' ? el.parentElement?.clientWidth : el.parentElement?.clientHeight) ?? 1200;
    const max = Math.max(min + 60, extent * maxRatio);
    const move = (ev: PointerEvent) => {
      const delta = ((axis === 'x' ? ev.clientX : ev.clientY) - origin) * sign;
      el.style[prop] = `${Math.min(Math.max(start + delta, min), max)}px`;
    };
    const up = () => {
      el.ownerDocument.defaultView?.removeEventListener('pointermove', move);
      el.ownerDocument.defaultView?.removeEventListener('pointerup', up);
      const key = storageKey(id);
      if (key) localStorage.setItem(key, String(Math.round(el.getBoundingClientRect()[prop])));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const reset = () => {
    const el = pane();
    if (!el) return;
    el.style[prop] = '';
    const key = storageKey(id);
    if (key) localStorage.removeItem(key);
  };

  return (
    <div
      ref={ref}
      className={`ed-pane-handle ${axis === 'x' ? 'vertical' : 'horizontal'}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
    />
  );
}
