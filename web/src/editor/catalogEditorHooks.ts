import { useCallback, useEffect, useMemo, useState } from "react";

export function useCatalogEditor<T extends { id: string; name: string }>(
  items: T[],
  onItemsChange: (items: T[]) => void,
  persist: (items: T[]) => void,
  onStatus: (status: string | null) => void,
  createDefault: () => T,
) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [draft, setDraft] = useState<T | null>(null);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(JSON.parse(JSON.stringify(selected)) as T);
  }, [selected]);

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const persistAll = useCallback(
    (next: T[]) => {
      persist(next);
      onItemsChange(next);
    },
    [onItemsChange, persist],
  );

  const dirty = draft != null && selected != null && JSON.stringify(draft) !== JSON.stringify(selected);

  const saveDraft = () => {
    if (!draft) return;
    const next = items.map((item) => (item.id === draft.id ? draft : item));
    persistAll(next);
    onStatus(`Saved "${draft.name}"`);
  };

  const createNew = () => {
    const item = createDefault();
    persistAll([...items, item]);
    setSelectedId(item.id);
    onStatus(`Created "${item.name}"`);
  };

  const deleteSelected = () => {
    if (!draft || !confirm(`Delete "${draft.name}"?`)) return;
    const next = items.filter((item) => item.id !== draft.id);
    persistAll(next);
    setSelectedId(next[0]?.id ?? null);
    onStatus(`Deleted "${draft.name}"`);
  };

  return {
    selectedId,
    setSelectedId,
    draft,
    setDraft,
    dirty,
    saveDraft,
    createNew,
    deleteSelected,
  };
}
