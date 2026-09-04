import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** One nested inspector frame (pushed on top of a live root panel). */
export interface InspectorFrame {
  /** Stable id for open / popTo (e.g. `skill:fire`). */
  id: string;
  /** Panel title. */
  title: string;
  /** Short breadcrumb label (defaults to title). */
  crumb?: string;
  /**
   * Nesting tier key. Only one frame per level may be open at a time —
   * opening another with the same level replaces it (and anything above).
   * Example: all skill inspectors use `level: "skill"`.
   */
  level?: string;
  /** Body of this inspector level. Rebuilt when the frame is (re)opened. */
  render: () => ReactNode;
}

export interface InspectorStackApi {
  /** Nested frames only (outer root is provided separately by the host). */
  stack: InspectorFrame[];
  depth: number;
  /** Push or refresh a frame by id (moves it to the top). */
  open: (frame: InspectorFrame) => void;
  pop: () => void;
  popTo: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

const InspectorStackContext = createContext<InspectorStackApi | null>(null);

export function useInspectorStack(): InspectorStackApi {
  const ctx = useContext(InspectorStackContext);
  if (!ctx) {
    throw new Error("useInspectorStack must be used within InspectorStackProvider");
  }
  return ctx;
}

/** Optional access when a component may render outside a stack. */
export function useOptionalInspectorStack(): InspectorStackApi | null {
  return useContext(InspectorStackContext);
}

export function InspectorStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<InspectorFrame[]>([]);

  const open = useCallback((frame: InspectorFrame) => {
    setStack((prev) => {
      const byId = prev.findIndex((f) => f.id === frame.id);
      if (byId >= 0) {
        // Refresh this frame and trim anything nested above it.
        return [...prev.slice(0, byId), frame];
      }
      if (frame.level) {
        const byLevel = prev.findIndex((f) => f.level === frame.level);
        if (byLevel >= 0) {
          // Only one inspector per level — replace peer and drop deeper frames.
          return [...prev.slice(0, byLevel), frame];
        }
      }
      return [...prev, frame];
    });
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => (prev.length === 0 ? prev : prev.slice(0, -1)));
  }, []);

  const popTo = useCallback((id: string) => {
    setStack((prev) => {
      if (id === "__root__") return [];
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      return prev.slice(0, idx + 1);
    });
  }, []);

  const clear = useCallback(() => setStack([]), []);

  const has = useCallback((id: string) => stack.some((f) => f.id === id), [stack]);

  const api = useMemo<InspectorStackApi>(
    () => ({ stack, depth: stack.length, open, pop, popTo, clear, has }),
    [stack, open, pop, popTo, clear, has],
  );

  return <InspectorStackContext.Provider value={api}>{children}</InspectorStackContext.Provider>;
}
