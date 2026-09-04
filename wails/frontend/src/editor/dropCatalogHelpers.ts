import type { DropPoolDef, DropPoolEntry } from "./gameContentTypes";

let dropSeq = 0;

export function createDefaultDropPool(): DropPoolDef {
  dropSeq += 1;
  return {
    id: `pool_new_${dropSeq}`,
    name: "New Drop Pool",
    entries: [{ item_id: "potion", chance: 45 }],
  };
}

export function normalizeDropPoolEntry(raw: Partial<DropPoolEntry> | null | undefined): DropPoolEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const item_id = String(raw.item_id ?? "").trim();
  if (!item_id) return null;
  let chance = Number(raw.chance);
  if (!Number.isFinite(chance)) chance = 0;
  chance = Math.max(0, Math.min(100, Math.round(chance)));
  return { item_id, chance };
}

export function normalizeDropPoolDef(raw: Partial<DropPoolDef> | null | undefined): DropPoolDef {
  const id = String(raw?.id ?? "").trim() || `pool_${Date.now()}`;
  const name = String(raw?.name ?? "").trim() || id;
  const entries: DropPoolEntry[] = [];
  if (Array.isArray(raw?.entries)) {
    for (const e of raw.entries) {
      const n = normalizeDropPoolEntry(e);
      if (n) entries.push(n);
    }
  }
  return { id, name, entries };
}
