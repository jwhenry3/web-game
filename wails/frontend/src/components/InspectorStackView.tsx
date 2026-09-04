import { useEffect, type ReactNode } from "react";
import { useInspectorStack, type InspectorFrame } from "../editor/inspectorStack";

function CrumbBar({
  rootTitle,
  stack,
  onPopTo,
  onPop,
}: {
  rootTitle: string;
  stack: InspectorFrame[];
  onPopTo: (id: string) => void;
  onPop: () => void;
}) {
  if (stack.length === 0) return null;
  return (
    <div className="inspector-stack-crumbs" role="navigation" aria-label="Inspector path">
      <button type="button" className="inspector-stack-crumb-link" onClick={() => onPopTo("__root__")}>
        {rootTitle}
      </button>
      {stack.map((frame, i) => {
        const label = frame.crumb ?? frame.title;
        const isLast = i === stack.length - 1;
        return (
          <span key={frame.id} className="inspector-stack-crumb">
            <span className="inspector-stack-crumb-sep" aria-hidden="true">
              /
            </span>
            {isLast ? (
              <span className="inspector-stack-crumb-current">{label}</span>
            ) : (
              <button type="button" className="inspector-stack-crumb-link" onClick={() => onPopTo(frame.id)}>
                {label}
              </button>
            )}
          </span>
        );
      })}
      <button type="button" className="cm-btn inspector-stack-back" onClick={onPop} aria-label="Back">
        Back
      </button>
    </div>
  );
}

/**
 * Host for a recursive inspector: live `root` panel plus zero or more nested panels.
 * Pushing a frame keeps the outer scope visible to the left.
 */
export function InspectorStackHost({
  rootTitle,
  root,
  className,
  minPanelWidth = 260,
  clearOnUnmount = true,
}: {
  rootTitle: string;
  root: ReactNode;
  className?: string;
  minPanelWidth?: number;
  clearOnUnmount?: boolean;
}) {
  const { stack, pop, popTo, clear } = useInspectorStack();

  useEffect(() => {
    if (!clearOnUnmount) return;
    return () => clear();
  }, [clear, clearOnUnmount]);

  return (
    <div className={`inspector-stack ${className ?? ""}`}>
      <CrumbBar rootTitle={rootTitle} stack={stack} onPopTo={popTo} onPop={pop} />
      <div className="inspector-stack-panels">
        <section
          className={`inspector-stack-panel cm-window ${stack.length === 0 ? "inspector-stack-panel--active" : "inspector-stack-panel--ancestor"}`}
          style={{ minWidth: minPanelWidth }}
          aria-label={rootTitle}
        >
          <div className="cm-titlebar inspector-stack-panel-title">
            <span>{rootTitle}</span>
          </div>
          <div className="cm-body inspector-stack-panel-body">{root}</div>
        </section>

        {stack.map((frame, i) => {
          const isTop = i === stack.length - 1;
          return (
            <section
              key={frame.id}
              className={`inspector-stack-panel cm-window ${isTop ? "inspector-stack-panel--active" : "inspector-stack-panel--ancestor"}`}
              style={{ minWidth: minPanelWidth }}
              aria-label={frame.title}
            >
              <div className="cm-titlebar inspector-stack-panel-title">
                <span>{frame.title}</span>
                {isTop && (
                  <button type="button" className="cm-btn inspector-stack-panel-close" onClick={pop} aria-label="Close">
                    ×
                  </button>
                )}
              </div>
              <div className="cm-body inspector-stack-panel-body">{frame.render()}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Button that opens (or focuses) a nested inspector frame. */
export function InspectorDrillButton({
  frame,
  children,
  className,
  disabled,
}: {
  frame: InspectorFrame;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { open, has } = useInspectorStack();
  const active = has(frame.id);
  return (
    <button
      type="button"
      className={`${className ?? "cm-btn wide"} ${active ? "on" : ""}`}
      disabled={disabled}
      onClick={() => open(frame)}
    >
      {children}
    </button>
  );
}
