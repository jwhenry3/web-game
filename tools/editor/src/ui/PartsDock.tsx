import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { slotLayer } from "../model/types";
import {
  deletePart,
  listParts,
  loadPart,
  savePart,
  type PartDoc,
  type PartInfo,
} from "../api";
import type {
  Atlas,
  AtlasRegion,
  Attachment,
  CatalogEntry,
  Doc,
  Skeleton,
  Spec,
} from "../model/types";

interface Actions {
  setSpec: (fn: (s: Spec) => Spec) => void;
  setSkeleton: (fn: (s: Skeleton) => Skeleton) => void;
  setAtlas: (fn: (a: Atlas) => Atlas) => void;
  repack: (extra?: Map<string, HTMLCanvasElement>) => void;
  setSelAtt: (a: { slot: string; att: string } | null) => void;
}

/** Mount-preview override: while armed, attForSlot mounts `key` on every slot
 * of `layer` that carries it, so a catalog part renders on the doll without
 * touching the variant selection. */
export interface PartPreview {
  layer: string;
  key: string;
}

interface Row {
  layer: string;
  e: CatalogEntry;
}

const rowId = (slot: string, key: string) => `${slot}/${key}`;

/** spec.catalog, with a fallback derived from the skin — imported rigs and
 * pre-catalog specs still get a registry view. */
function catalogOf(doc: Doc): Record<string, CatalogEntry[]> {
  if (doc.spec.catalog) return doc.spec.catalog;
  const out: Record<string, CatalogEntry[]> = {};
  const skins = doc.skeleton.skins[0]?.attachments ?? {};
  for (const [slot, atts] of Object.entries(skins)) {
    const layer = slotLayer(doc.spec, slot) ?? slot;
    const list = (out[layer] ??= []);
    for (const [key, att] of Object.entries(atts)) {
      const e: CatalogEntry = { key, slot };
      if (att.rotation) e.rotation = att.rotation;
      if (att.scaleX !== undefined && att.scaleX !== 1) e.scaleX = att.scaleX;
      if (att.scaleY !== undefined && att.scaleY !== 1) e.scaleY = att.scaleY;
      list.push(e);
    }
  }
  return out;
}

function Thumb({
  region,
  atlasCanvas,
  size,
}: {
  region: AtlasRegion | undefined;
  atlasCanvas: React.RefObject<HTMLCanvasElement | null>;
  size: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    const src = atlasCanvas.current;
    if (!src || !region) return;
    const s = Math.min(size / region.w, size / region.h, 8);
    const w = Math.max(1, Math.round(region.w * s));
    const h = Math.max(1, Math.round(region.h * s));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      src,
      region.x, region.y, region.w, region.h,
      (size - w) / 2, (size - h) / 2, w, h,
    );
  });
  return <canvas ref={ref} className="ed-cat-thumb" />;
}

type SortCol = "key" | "layer" | "slot" | "rot" | "scale" | "label";

export function PartsDock({
  doc,
  selAtt,
  preview,
  setPreview,
  editPixels,
  atlasCanvas,
  actions,
}: {
  doc: Doc;
  selAtt: { slot: string; att: string } | null;
  preview: PartPreview | null;
  setPreview: (p: PartPreview | null) => void;
  editPixels: () => void;
  atlasCanvas: React.RefObject<HTMLCanvasElement | null>;
  actions: Actions;
}) {
  const catalog = useMemo(() => catalogOf(doc), [doc]);
  const skins = doc.skeleton.skins[0]?.attachments ?? {};
  const layers = doc.spec.layers.map((l) => l.name);

  const [layer, setLayer] = useState("");
  const [slotFilter, setSlotFilter] = useState("");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [thumbSize, setThumbSize] = useState(56);
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "key", dir: 1 });
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);

  // Register-part form.
  const [newKey, setNewKey] = useState("");
  const [srcKey, setSrcKey] = useState("");
  const [slots, setSlots] = useState<Set<string>>(new Set());
  const [batchRot, setBatchRot] = useState("0");
  const [batchScale, setBatchScale] = useState("1");

  // Saved-parts library (tools/parts/*.part.json via /editor-api/part*).
  const [libParts, setLibParts] = useState<PartInfo[]>([]);
  const [libSel, setLibSel] = useState("");
  const [libDoc, setLibDoc] = useState<PartDoc | null>(null);
  const [mountSlot, setMountSlot] = useState("");
  const [mountKey, setMountKey] = useState("");

  const refreshParts = useCallback(async () => {
    try {
      setLibParts(await listParts());
    } catch {
      /* dev api offline */
    }
  }, []);
  useEffect(() => {
    void refreshParts();
  }, [refreshParts]);

  useEffect(() => {
    if (!libSel) {
      setLibDoc(null);
      return;
    }
    void loadPart(libSel).then((p) => {
      setLibDoc(p);
      if (p) {
        setMountKey(p.id);
        setMountSlot(
          p.slot && doc.skeleton.slots.some((s) => s.name === p.slot) ? p.slot : "",
        );
      }
    });
  }, [libSel, doc]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const [l, list] of Object.entries(catalog)) {
      for (const e of list) out.push({ layer: l, e });
    }
    return out;
  }, [catalog]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!layer || r.layer === layer) &&
        (!slotFilter || r.e.slot === slotFilter) &&
        (!f ||
          r.e.key.toLowerCase().includes(f) ||
          (r.e.label ?? "").toLowerCase().includes(f)),
    );
    const dir = sort.dir;
    list.sort((a, b) => {
      let cmp = 0;
      if (sort.col === "key") cmp = a.e.key.localeCompare(b.e.key);
      else if (sort.col === "layer")
        cmp = a.layer.localeCompare(b.layer) || a.e.key.localeCompare(b.e.key);
      else if (sort.col === "slot")
        cmp = a.e.slot.localeCompare(b.e.slot) || a.e.key.localeCompare(b.e.key);
      else if (sort.col === "rot")
        cmp = (a.e.rotation ?? 0) - (b.e.rotation ?? 0) || a.e.key.localeCompare(b.e.key);
      else if (sort.col === "scale")
        cmp = (a.e.scaleX ?? 1) - (b.e.scaleX ?? 1) || a.e.key.localeCompare(b.e.key);
      else cmp = (a.e.label ?? "").localeCompare(b.e.label ?? "") || a.e.key.localeCompare(b.e.key);
      return cmp * dir;
    });
    return list;
  }, [rows, layer, slotFilter, filter, sort]);

  const pageSize = view === "grid" ? 240 : 400;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageClamped = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(pageClamped * pageSize, pageClamped * pageSize + pageSize);

  /** Skeleton slots owned by the selected layer (includes empty ones). */
  const layerSlots = useMemo(
    () =>
      layer
        ? doc.skeleton.slots
            .filter((s) => slotLayer(doc.spec, s.name) === layer)
            .map((s) => s.name)
        : [],
    [doc, layer],
  );

  const checkedRows = useMemo(
    () => rows.filter((r) => checked.has(rowId(r.e.slot, r.e.key))),
    [rows, checked],
  );
  const checkedLayers = new Set(checkedRows.map((r) => r.layer));
  const batchLayer = checkedLayers.size === 1 ? [...checkedLayers][0]! : null;
  const batchSlots = batchLayer
    ? doc.skeleton.slots
        .filter((s) => slotLayer(doc.spec, s.name) === batchLayer)
        .map((s) => s.name)
    : [];

  const selRow = selAtt
    ? (rows.find((r) => r.e.slot === selAtt.slot && r.e.key === selAtt.att) ?? null)
    : null;

  const pickLayer = (name: string) => {
    setLayer(name);
    setSlotFilter("");
    setSrcKey("");
    setSlots(new Set());
    setPage(0);
  };

  const pick = (r: Row, ev: React.MouseEvent) => {
    const id = rowId(r.e.slot, r.e.key);
    if (ev.shiftKey && anchor.current) {
      const a = filtered.findIndex((x) => rowId(x.e.slot, x.e.key) === anchor.current);
      const b = filtered.findIndex((x) => rowId(x.e.slot, x.e.key) === id);
      if (a >= 0 && b >= 0) {
        const next = new Set(checked);
        for (const x of filtered.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          next.add(rowId(x.e.slot, x.e.key));
        }
        setChecked(next);
      }
    } else if (ev.ctrlKey || ev.metaKey) {
      const next = new Set(checked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setChecked(next);
    }
    anchor.current = id;
    actions.setSelAtt({ slot: r.e.slot, att: r.e.key });
  };

  const toggleChecked = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  };

  // ---- part mutations ---------------------------------------------------

  const patchAtt = (slot: string, key: string, patch: Partial<Attachment>) =>
    actions.setSkeleton((s) => {
      const skins2 = [
        { ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } },
        ...s.skins.slice(1),
      ];
      const atts = { ...(skins2[0]!.attachments[slot] ?? {}) };
      if (!atts[key]) return s;
      atts[key] = { ...atts[key]!, ...patch };
      skins2[0]!.attachments[slot] = atts;
      return { ...s, skins: skins2 };
    });

  const patchEntry = (l: string, slot: string, key: string, patch: Partial<CatalogEntry>) =>
    actions.setSpec((s) => {
      const cat = { ...(s.catalog ?? catalog) };
      cat[l] = (cat[l] ?? []).map((e) =>
        e.slot === slot && e.key === key ? { ...e, ...patch } : e,
      );
      return { ...s, catalog: cat };
    });

  /** Remove parts: drops skin attachments + catalog entries, then deletes
   * atlas regions no surviving attachment still references, and repacks. */
  const removeRows = (items: Row[]) => {
    if (!items.length) return;
    const gone = new Set(items.map((r) => rowId(r.e.slot, r.e.key)));
    const used = new Set<string>();
    for (const [slot, atts] of Object.entries(skins)) {
      for (const [k, att] of Object.entries(atts)) {
        if (!gone.has(rowId(slot, k)) && att.path) used.add(att.path);
      }
    }
    const orphans = new Set<string>();
    for (const r of items) {
      const p = skins[r.e.slot]?.[r.e.key]?.path;
      if (p && !used.has(p)) orphans.add(p);
    }
    actions.setSkeleton((s) => {
      const skins2 = [
        { ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } },
        ...s.skins.slice(1),
      ];
      for (const r of items) {
        const atts = { ...(skins2[0]!.attachments[r.e.slot] ?? {}) };
        delete atts[r.e.key];
        skins2[0]!.attachments[r.e.slot] = atts;
      }
      return { ...s, skins: skins2 };
    });
    actions.setSpec((s) => {
      const cat = { ...(s.catalog ?? catalog) };
      for (const r of items) {
        cat[r.layer] = (cat[r.layer] ?? []).filter(
          (e) => !(e.slot === r.e.slot && e.key === r.e.key),
        );
      }
      return { ...s, catalog: cat };
    });
    if (orphans.size) {
      actions.setAtlas((a) => {
        const regions = new Map(a.regions);
        for (const p of orphans) regions.delete(p);
        return { ...a, regions };
      });
      actions.repack();
    }
    setChecked(new Set());
    if (selAtt && gone.has(rowId(selAtt.slot, selAtt.att))) actions.setSelAtt(null);
    if (preview && items.some((r) => r.layer === preview.layer && r.e.key === preview.key)) {
      setPreview(null);
    }
  };

  const setRotationRows = (items: Row[], deg: number) => {
    for (const r of items) {
      patchAtt(r.e.slot, r.e.key, { rotation: deg });
      patchEntry(r.layer, r.e.slot, r.e.key, { rotation: deg });
    }
  };

  /** Uniform scale on checked parts — sets both attachment axes. */
  const setScaleRows = (items: Row[], v: number) => {
    for (const r of items) {
      patchAtt(r.e.slot, r.e.key, { scaleX: v, scaleY: v });
      patchEntry(r.layer, r.e.slot, r.e.key, { scaleX: v, scaleY: v });
    }
  };

  /** Re-slot parts: moves each attachment + catalog entry to another slot in
   * the same layer. Skips targets that already carry the key. */
  const moveRows = (items: Row[], toSlot: string) => {
    if (!toSlot) return;
    actions.setSkeleton((s) => {
      const skins2 = [
        { ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } },
        ...s.skins.slice(1),
      ];
      for (const r of items) {
        const from = skins2[0]!.attachments[r.e.slot];
        const att = from?.[r.e.key];
        if (!att || r.e.slot === toSlot) continue;
        const dest = { ...(skins2[0]!.attachments[toSlot] ?? {}) };
        if (dest[r.e.key]) continue;
        dest[r.e.key] = att;
        skins2[0]!.attachments[toSlot] = dest;
        const src = { ...from };
        delete src[r.e.key];
        skins2[0]!.attachments[r.e.slot] = src;
      }
      return { ...s, skins: skins2 };
    });
    actions.setSpec((s) => {
      const cat = { ...(s.catalog ?? catalog) };
      for (const r of items) {
        cat[r.layer] = (cat[r.layer] ?? []).map((e) =>
          e.slot === r.e.slot && e.key === r.e.key ? { ...e, slot: toSlot } : e,
        );
      }
      return { ...s, catalog: cat };
    });
    if (selAtt && items.some((r) => r.e.slot === selAtt.slot && r.e.key === selAtt.att)) {
      actions.setSelAtt({ slot: toSlot, att: selAtt.att });
    }
    setChecked(new Set());
  };

  /** Rename a variant key across every slot of its layer (skin attachments,
   * registered-clone atlas paths, catalog entries, selection, preview). */
  const renameKey = (l: string, oldKey: string, newKeyRaw: string): boolean => {
    const newKey = newKeyRaw.trim();
    if (!newKey || newKey === oldKey) return false;
    for (const [slot, atts] of Object.entries(skins)) {
      if (slotLayer(doc.spec, slot) === l && atts[oldKey] && atts[newKey]) return false;
    }
    actions.setSkeleton((s) => {
      const skins2 = [
        { ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } },
        ...s.skins.slice(1),
      ];
      for (const [slot, atts] of Object.entries(skins2[0]!.attachments)) {
        if (slotLayer(doc.spec, slot) !== l || !atts[oldKey]) continue;
        const a2 = { ...atts };
        a2[newKey] = a2[oldKey]!;
        if (a2[newKey]!.path === `${slot}__${oldKey}`) {
          a2[newKey] = { ...a2[newKey]!, path: `${slot}__${newKey}` };
        }
        delete a2[oldKey];
        skins2[0]!.attachments[slot] = a2;
      }
      return { ...s, skins: skins2 };
    });
    actions.setAtlas((a) => {
      const regions = new Map(a.regions);
      for (const slot of doc.skeleton.slots.map((x) => x.name)) {
        if (slotLayer(doc.spec, slot) !== l) continue;
        const r = regions.get(`${slot}__${oldKey}`);
        if (r) {
          regions.delete(`${slot}__${oldKey}`);
          regions.set(`${slot}__${newKey}`, r);
        }
      }
      return { ...a, regions };
    });
    actions.setSpec((s) => {
      const cat = { ...(s.catalog ?? catalog) };
      cat[l] = (cat[l] ?? []).map((e) => (e.key === oldKey ? { ...e, key: newKey } : e));
      return { ...s, catalog: cat };
    });
    if (selAtt && slotLayer(doc.spec, selAtt.slot) === l && selAtt.att === oldKey) {
      actions.setSelAtt({ slot: selAtt.slot, att: newKey });
    }
    if (preview?.layer === l && preview.key === oldKey) setPreview({ layer: l, key: newKey });
    return true;
  };

  // ---- register (clone) ---------------------------------------------------

  const regEntries = (catalog[layer] ?? []).slice().sort((a, b) => a.key.localeCompare(b.key));
  const src = regEntries.find((e) => e.key === srcKey) ?? regEntries[0];
  const mountSlots = slots.size ? slots : new Set(layerSlots);

  const register = () => {
    const key = newKey.trim();
    const srcAtt = src ? skins[src.slot]?.[src.key] : undefined;
    const srcRegion = srcAtt?.path ? doc.atlas.regions.get(srcAtt.path) : undefined;
    if (!key || !src || !srcAtt || !srcRegion || !atlasCanvas.current) return;
    const src2 = atlasCanvas.current;
    const targets = layerSlots.filter(
      (s) =>
        mountSlots.has(s) &&
        !(skins[s]?.[key] ?? catalog[layer]?.some((e) => e.key === key && e.slot === s)),
    );
    if (!targets.length) return;
    const extra = new Map<string, HTMLCanvasElement>();
    for (const slot of targets) {
      const copy = document.createElement("canvas");
      copy.width = srcRegion.w;
      copy.height = srcRegion.h;
      copy
        .getContext("2d")!
        .drawImage(src2, srcRegion.x, srcRegion.y, srcRegion.w, srcRegion.h, 0, 0, srcRegion.w, srcRegion.h);
      extra.set(`${slot}__${key}`, copy);
    }
    actions.setSkeleton((s) => {
      const skins2 = [
        { ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } },
        ...s.skins.slice(1),
      ];
      for (const slot of targets) {
        const atts = { ...(skins2[0]!.attachments[slot] ?? {}) };
        atts[key] = { ...srcAtt, path: `${slot}__${key}` };
        skins2[0]!.attachments[slot] = atts;
      }
      return { ...s, skins: skins2 };
    });
    actions.setSpec((s) => {
      const cat = { ...(s.catalog ?? catalog) };
      const list = [...(cat[layer] ?? [])];
      for (const slot of targets) {
        const e: CatalogEntry = { key, slot };
        if (srcAtt.rotation) e.rotation = srcAtt.rotation;
        if (srcAtt.scaleX !== undefined && srcAtt.scaleX !== 1) e.scaleX = srcAtt.scaleX;
        if (srcAtt.scaleY !== undefined && srcAtt.scaleY !== 1) e.scaleY = srcAtt.scaleY;
        list.push(e);
      }
      cat[layer] = list;
      return { ...s, catalog: cat };
    });
    actions.repack(extra);
    setNewKey("");
  };

  /** Mount a library part onto a slot: decodes the saved pixels into a new
   * atlas region, adds the skin attachment + catalog entry, and repacks. */
  const mountPart = async () => {
    const part = libDoc;
    const key = mountKey.trim();
    if (!part || !key || !mountSlot || !atlasCanvas.current) return;
    if (skins[mountSlot]?.[key]) return;
    const img = new Image();
    img.src = `data:image/png;base64,${part.pngBase64}`;
    await img.decode();
    const copy = document.createElement("canvas");
    copy.width = img.naturalWidth;
    copy.height = img.naturalHeight;
    copy.getContext("2d")!.drawImage(img, 0, 0);
    // Attachment w/h are skeleton units — rescale by the target rig's px/unit
    // density (derived from a sibling attachment, else the saved density).
    const sibling = Object.values(skins[mountSlot] ?? {}).find((a) => a.path && a.width);
    const sibRegion = sibling?.path ? doc.atlas.regions.get(sibling.path) : undefined;
    const density =
      sibRegion && sibling?.width ? sibRegion.w / sibling.width : (part.pxPerUnit ?? 1);
    const path = `${mountSlot}__${key}`;
    const att: Attachment = {
      path,
      x: part.attachment.x,
      y: part.attachment.y,
      width: img.naturalWidth / density,
      height: img.naturalHeight / density,
    };
    if (part.attachment.rotation) att.rotation = part.attachment.rotation;
    if (part.attachment.scaleX !== undefined) att.scaleX = part.attachment.scaleX;
    if (part.attachment.scaleY !== undefined) att.scaleY = part.attachment.scaleY;
    const toSlot = mountSlot;
    actions.setSkeleton((s) => {
      const skins2 = [
        { ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } },
        ...s.skins.slice(1),
      ];
      const atts = { ...(skins2[0]!.attachments[toSlot] ?? {}) };
      atts[key] = att;
      skins2[0]!.attachments[toSlot] = atts;
      return { ...s, skins: skins2 };
    });
    const mountLayer = slotLayer(doc.spec, toSlot);
    if (mountLayer) {
      actions.setSpec((s) => {
        const cat = { ...(s.catalog ?? catalog) };
        const list = [...(cat[mountLayer] ?? [])];
        if (!list.some((e) => e.key === key && e.slot === toSlot)) {
          const e: CatalogEntry = { key, slot: toSlot };
          if (att.rotation) e.rotation = att.rotation;
          if (att.scaleX !== undefined && att.scaleX !== 1) e.scaleX = att.scaleX;
          if (att.scaleY !== undefined && att.scaleY !== 1) e.scaleY = att.scaleY;
          list.push(e);
        }
        cat[mountLayer] = list;
        return { ...s, catalog: cat };
      });
    }
    actions.repack(new Map([[path, copy]]));
    actions.setSelAtt({ slot: toSlot, att: key });
  };

  // ---- render -------------------------------------------------------------

  const allChecked = filtered.length > 0 && filtered.every((r) => checked.has(rowId(r.e.slot, r.e.key)));
  const th = (col: SortCol, label: string) => (
    <th
      onClick={() =>
        setSort((s) => (s.col === col ? { col, dir: -s.dir as 1 | -1 } : { col, dir: 1 }))
      }
    >
      {label}
      {sort.col === col ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="ed-partdock">
      <div className="ed-dock-title">
        <span className="ed-scene-tab">Parts</span>
        <span>
          {filtered.length} of {rows.length} parts
          {preview ? ` · previewing ${preview.key}` : ""}
        </span>
      </div>
      <div className="ed-partdock-body">
        <div className="ed-partdock-layers">
          <button
            className={`ed-tree-item ${layer === "" ? "selected" : ""}`}
            onClick={() => pickLayer("")}
          >
            all layers<span className="count">{rows.length}</span>
          </button>
          {layers.map((l) => (
            <button
              key={l}
              className={`ed-tree-item ${layer === l ? "selected" : ""}`}
              onClick={() => pickLayer(l)}
            >
              {l}
              <span className="count">{catalog[l]?.length ?? 0}</span>
            </button>
          ))}
          {layerSlots.length > 0 && (
            <div className="ed-partdock-slots">
              <button
                className={slotFilter === "" ? "active" : ""}
                onClick={() => setSlotFilter("")}
              >
                all slots
              </button>
              {layerSlots.map((s) => (
                <button
                  key={s}
                  className={slotFilter === s ? "active" : ""}
                  onClick={() => setSlotFilter(slotFilter === s ? "" : s)}
                >
                  {s.split("_").pop()}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ed-partdock-main">
          <div className="ed-animdock-tools">
            <input
              type="checkbox"
              title="check all filtered parts"
              checked={allChecked}
              onChange={(e) =>
                setChecked(
                  e.target.checked
                    ? new Set(filtered.map((r) => rowId(r.e.slot, r.e.key)))
                    : new Set(),
                )
              }
            />
            <input
              placeholder="filter key or label…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            />
            <span className="ed-tl-sep" />
            <button
              className={view === "grid" ? "ed-view-active" : ""}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
            <button
              className={view === "table" ? "ed-view-active" : ""}
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              Table
            </button>
            {view === "grid" && (
              <input
                type="range"
                min={36}
                max={96}
                step={4}
                value={thumbSize}
                title="thumbnail size"
                onChange={(e) => setThumbSize(+e.target.value)}
              />
            )}
            <span className="ed-tl-sep" />
            <button disabled={pageClamped <= 0} onClick={() => setPage(pageClamped - 1)}>
              ◀
            </button>
            <span className="ed-hint">
              {filtered.length
                ? `${pageClamped * pageSize + 1}–${Math.min(filtered.length, (pageClamped + 1) * pageSize)} of ${filtered.length}`
                : "0"}
            </span>
            <button
              disabled={pageClamped >= pageCount - 1}
              onClick={() => setPage(pageClamped + 1)}
            >
              ▶
            </button>
            {preview && (
              <>
                <span className="ed-tl-sep" />
                <span className="ed-partdock-preview-chip">
                  ◉ {preview.key}
                  <button title="clear mount preview" onClick={() => setPreview(null)}>
                    ×
                  </button>
                </span>
              </>
            )}
            <span className="spacer" />
            {checked.size > 0 && (
              <span className="ed-batch">
                <strong>{checked.size}</strong> checked
                <button onClick={() => removeRows(checkedRows)}>Delete</button>
                <label>rot</label>
                <input
                  type="number"
                  step={1}
                  value={batchRot}
                  onChange={(e) => setBatchRot(e.target.value)}
                />
                <button onClick={() => setRotationRows(checkedRows, Number(batchRot))}>
                  Set
                </button>
                <label>scale</label>
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={batchScale}
                  onChange={(e) => setBatchScale(e.target.value)}
                />
                <button onClick={() => setScaleRows(checkedRows, Number(batchScale) || 1)}>
                  Set
                </button>
                <select
                  value=""
                  disabled={!batchLayer}
                  title={batchLayer ? "move checked parts to slot" : "move requires a single layer"}
                  onChange={(e) => {
                    moveRows(checkedRows, e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="">move to…</option>
                  {batchSlots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button onClick={() => setChecked(new Set())}>Clear</button>
              </span>
            )}
          </div>

          <div className="ed-partdock-list">
            {view === "grid" ? (
              <div
                className="ed-cat-grid"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize + 44}px, 1fr))` }}
              >
                {pageRows.map((r) => {
                  const id = rowId(r.e.slot, r.e.key);
                  const att = skins[r.e.slot]?.[r.e.key];
                  const region = att?.path ? doc.atlas.regions.get(att.path) : undefined;
                  const sel = selAtt?.slot === r.e.slot && selAtt.att === r.e.key;
                  return (
                    <div
                      key={id}
                      className={`ed-cat-card ${sel ? "sel" : ""}`}
                      title={`${r.layer} / ${r.e.slot} / ${r.e.key} — double-click to preview`}
                      onClick={(e) => pick(r, e)}
                      onDoubleClick={() => setPreview({ layer: r.layer, key: r.e.key })}
                    >
                      <input
                        type="checkbox"
                        className="ed-cat-check"
                        checked={checked.has(id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleChecked(id)}
                      />
                      <Thumb region={region} atlasCanvas={atlasCanvas} size={thumbSize} />
                      <div className="ed-cat-key">{r.e.label || r.e.key}</div>
                      <div className="ed-cat-meta">
                        {!layer ? `${r.layer} · ` : ""}
                        {r.e.slot.split("_").pop()}
                        {r.e.rotation ? ` ${r.e.rotation}°` : ""}
                        {r.e.scaleX !== undefined && r.e.scaleX !== 1
                          ? ` ×${r.e.scaleX}${r.e.scaleY !== undefined && r.e.scaleY !== r.e.scaleX ? `/×${r.e.scaleY}` : ""}`
                          : ""}
                      </div>
                    </div>
                  );
                })}
                {!pageRows.length && <div className="ed-hint">No parts match.</div>}
              </div>
            ) : (
              <table className="ed-table ed-partdock-table">
                <thead>
                  <tr>
                    <th />
                    {th("key", "key")}
                    {!layer && th("layer", "layer")}
                    {th("slot", "slot")}
                    {th("rot", "rot")}
                    {th("scale", "scale")}
                    {th("label", "label")}
                    <th>region</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const id = rowId(r.e.slot, r.e.key);
                    const att = skins[r.e.slot]?.[r.e.key];
                    const region = att?.path ? doc.atlas.regions.get(att.path) : undefined;
                    const sel = selAtt?.slot === r.e.slot && selAtt.att === r.e.key;
                    return (
                      <tr
                        key={id}
                        className={sel ? "sel" : ""}
                        onClick={(e) => pick(r, e)}
                        onDoubleClick={() => setPreview({ layer: r.layer, key: r.e.key })}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked.has(id)}
                            onChange={() => toggleChecked(id)}
                          />
                        </td>
                        <td>{r.e.key}</td>
                        {!layer && <td>{r.layer}</td>}
                        <td title={r.e.slot}>{r.e.slot.split("_").pop()}</td>
                        <td>{r.e.rotation ?? ""}</td>
                        <td>
                          {r.e.scaleX !== undefined && r.e.scaleX !== 1
                            ? `${r.e.scaleX}${r.e.scaleY !== undefined && r.e.scaleY !== r.e.scaleX ? `/${r.e.scaleY}` : ""}`
                            : ""}
                        </td>
                        <td>{r.e.label ?? ""}</td>
                        <td className="ed-hint">
                          {region ? `${region.w}×${region.h}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {!pageRows.length && (
                    <tr>
                      <td colSpan={8} className="ed-hint">
                        No parts match.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="ed-partdock-detail">
          {selRow ? (
            <PartDetail
              key={`${selRow.e.slot}/${selRow.e.key}`}
              doc={doc}
              row={selRow}
              skins={skins}
              preview={preview}
              setPreview={setPreview}
              editPixels={editPixels}
              atlasCanvas={atlasCanvas}
              layerSlots={doc.skeleton.slots
                .filter((s) => slotLayer(doc.spec, s.name) === selRow.layer)
                .map((s) => s.name)}
              onPatchAtt={patchAtt}
              onPatchEntry={patchEntry}
              onRename={renameKey}
              onMove={(toSlot) => moveRows([selRow], toSlot)}
              onRemove={() => removeRows([selRow])}
              onLibraryChanged={refreshParts}
            />
          ) : (
            <div className="ed-hint">
              Select a part to edit its mount, rotation, and offsets.
              Shift-click ranges or ctrl-click to multi-select.
            </div>
          )}

          <h3>Register part</h3>
          {!layer ? (
            <div className="ed-hint">Pick a layer on the left to register parts.</div>
          ) : (
            <>
              <div className="ed-row">
                <label>clone</label>
                <select value={src?.key ?? ""} onChange={(e) => setSrcKey(e.target.value)}>
                  {regEntries.map((e) => (
                    <option key={`${e.slot}/${e.key}`} value={e.key}>
                      {e.key}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ed-row">
                <label>new key</label>
                <input
                  placeholder="e.g. weapon7_c5"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
              </div>
              {layerSlots.length > 1 && (
                <div className="ed-row">
                  <label>slots</label>
                  {layerSlots.map((s) => (
                    <label key={s} className="ed-cat-slot">
                      <input
                        type="checkbox"
                        checked={slots.size ? slots.has(s) : true}
                        onChange={(ev) => {
                          const next = new Set(slots.size ? slots : layerSlots);
                          if (ev.target.checked) next.add(s);
                          else next.delete(s);
                          setSlots(next);
                        }}
                      />
                      {s.split("_").pop()}
                    </label>
                  ))}
                </div>
              )}
              <div className="ed-row">
                <button
                  onClick={register}
                  disabled={
                    !newKey.trim() ||
                    !src ||
                    [...mountSlots].every((s) => !!skins[s]?.[newKey.trim()])
                  }
                >
                  Register {newKey.trim() || "…"}
                </button>
              </div>
            </>
          )}
          <div className="ed-hint">
            Clones the source variant's art into a new atlas region and records
            it in <code>spec.catalog</code>.
          </div>

          <h3>Parts library</h3>
          <div className="ed-row">
            <select value={libSel} onChange={(ev) => setLibSel(ev.target.value)}>
              <option value="">saved parts…</option>
              {libParts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.layer ? ` (${p.layer})` : ""}
                </option>
              ))}
            </select>
            <button title="refresh" onClick={() => void refreshParts()}>
              ⟳
            </button>
          </div>
          {libDoc && (
            <>
              <div className="ed-row">
                <img
                  src={`data:image/png;base64,${libDoc.pngBase64}`}
                  alt={libDoc.id}
                  style={{
                    imageRendering: "pixelated",
                    maxWidth: 72,
                    maxHeight: 72,
                    background: "rgba(255,255,255,0.06)",
                  }}
                />
                <span className="ed-hint">
                  {libDoc.slot ? `from ${libDoc.slot}` : ""}
                </span>
              </div>
              <div className="ed-row">
                <label>key</label>
                <input value={mountKey} onChange={(ev) => setMountKey(ev.target.value)} />
              </div>
              <div className="ed-row">
                <label>slot</label>
                <select value={mountSlot} onChange={(ev) => setMountSlot(ev.target.value)}>
                  <option value="">—</option>
                  {doc.skeleton.slots.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ed-row">
                <button
                  className="primary"
                  disabled={
                    !mountSlot || !mountKey.trim() || !!skins[mountSlot]?.[mountKey.trim()]
                  }
                  onClick={() => void mountPart()}
                >
                  Mount part
                </button>
                <button
                  onClick={() => {
                    void deletePart(libDoc.id).then(refreshParts);
                    setLibSel("");
                    setLibDoc(null);
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="ed-hint">
                Mounts the saved art onto a slot as a new variant —
                attachment offsets, rotation, and scale carry over.
              </div>
            </>
          )}
          {!libParts.length && (
            <div className="ed-hint">
              No saved parts yet — select a part and use Save to library.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Detail editor for the primary-selected part: rename, re-slot, rotation,
 * label, attachment offsets, mount preview, pixel-edit handoff. */
function PartDetail({
  doc,
  row,
  skins,
  preview,
  setPreview,
  editPixels,
  atlasCanvas,
  layerSlots,
  onPatchAtt,
  onPatchEntry,
  onRename,
  onMove,
  onRemove,
  onLibraryChanged,
}: {
  doc: Doc;
  row: Row;
  skins: Record<string, Record<string, Attachment>>;
  preview: PartPreview | null;
  setPreview: (p: PartPreview | null) => void;
  editPixels: () => void;
  atlasCanvas: React.RefObject<HTMLCanvasElement | null>;
  layerSlots: string[];
  onPatchAtt: (slot: string, key: string, patch: Partial<Attachment>) => void;
  onPatchEntry: (layer: string, slot: string, key: string, patch: Partial<CatalogEntry>) => void;
  onRename: (layer: string, oldKey: string, newKey: string) => boolean;
  onMove: (toSlot: string) => void;
  onRemove: () => void;
  onLibraryChanged: () => void;
}) {
  const { layer, e } = row;
  const att = skins[e.slot]?.[e.key];
  const region = att?.path ? doc.atlas.regions.get(att.path) : undefined;
  const [keyDraft, setKeyDraft] = useState(e.key);
  const [libId, setLibId] = useState("");
  const previewing = preview?.layer === layer && preview.key === e.key;

  /** Snapshot the region's pixels + mount metadata into tools/parts/<id>. */
  const saveToLibrary = async () => {
    const src = atlasCanvas.current;
    const id = libId.trim();
    if (!att || !region || !src || !id) return;
    const c = document.createElement("canvas");
    c.width = region.w;
    c.height = region.h;
    c.getContext("2d")!.drawImage(src, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    const a: Attachment = {};
    for (const f of ["x", "y", "width", "height", "rotation", "scaleX", "scaleY"] as const) {
      if (att[f] !== undefined) a[f] = att[f];
    }
    await savePart({
      id,
      label: e.label || e.key,
      char: doc.spec.output?.name,
      layer,
      slot: e.slot,
      attachment: a,
      pngBase64: c.toDataURL("image/png").split(",")[1]!,
      pxPerUnit: att.width ? region.w / att.width : undefined,
    });
    setLibId("");
    onLibraryChanged();
  };

  const num = (v: number | undefined) => (v === undefined ? "" : v);
  const commitNum =
    (field: "x" | "y" | "rotation" | "scaleX" | "scaleY") =>
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      const isScale = field === "scaleX" || field === "scaleY";
      const v = ev.target.value === "" ? (isScale ? 1 : 0) : Number(ev.target.value);
      onPatchAtt(e.slot, e.key, { [field]: v });
      if (field === "rotation") onPatchEntry(layer, e.slot, e.key, { rotation: v });
      if (isScale) onPatchEntry(layer, e.slot, e.key, { [field]: v });
    };

  return (
    <>
      <h3>Part</h3>
      <Thumb region={region} atlasCanvas={atlasCanvas} size={72} />
      <div className="ed-row">
        <label>key</label>
        <input value={keyDraft} onChange={(ev) => setKeyDraft(ev.target.value)} />
        <button
          disabled={!keyDraft.trim() || keyDraft.trim() === e.key}
          onClick={() => {
            if (!onRename(layer, e.key, keyDraft)) setKeyDraft(e.key);
          }}
        >
          Rename
        </button>
      </div>
      <div className="ed-row">
        <label>layer / slot</label>
        <span className="ed-hint">{layer}</span>
        <select value={e.slot} onChange={(ev) => onMove(ev.target.value)}>
          {[...new Set([e.slot, ...layerSlots])].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="ed-row">
        <label>rotation°</label>
        <input
          type="number"
          step={1}
          value={num(e.rotation ?? att?.rotation)}
          onChange={commitNum("rotation")}
        />
      </div>
      <div className="ed-row">
        <label>scale x / y</label>
        <input
          type="number"
          step={0.05}
          min={0.05}
          value={att?.scaleX ?? e.scaleX ?? 1}
          onChange={commitNum("scaleX")}
        />
        <input
          type="number"
          step={0.05}
          min={0.05}
          value={att?.scaleY ?? e.scaleY ?? 1}
          onChange={commitNum("scaleY")}
        />
      </div>
      <div className="ed-row">
        <label>offset x / y</label>
        <input type="number" step={0.5} value={num(att?.x)} onChange={commitNum("x")} />
        <input type="number" step={0.5} value={num(att?.y)} onChange={commitNum("y")} />
      </div>
      <div className="ed-row">
        <label>label</label>
        <input
          defaultValue={e.label ?? ""}
          placeholder="display label"
          onBlur={(ev) =>
            onPatchEntry(layer, e.slot, e.key, { label: ev.target.value.trim() || undefined })
          }
        />
      </div>
      <div className="ed-hint">
        {att?.path ?? "no region"}
        {region ? ` · ${region.w}×${region.h}` : ""}
        {att?.width ? ` · draws ${att.width}×${att.height}` : ""}
      </div>
      <div className="ed-row">
        <button
          aria-pressed={previewing}
          className={previewing ? "ed-previewing" : ""}
          onClick={() => setPreview(previewing ? null : { layer, key: e.key })}
        >
          {previewing ? "◉ Previewing" : "Preview on doll"}
        </button>
        <button onClick={editPixels}>Edit pixels</button>
        <button onClick={onRemove}>Remove</button>
      </div>
      <div className="ed-row">
        <input
          placeholder="library id"
          value={libId}
          onChange={(ev) => setLibId(ev.target.value)}
        />
        <button disabled={!libId.trim() || !region} onClick={() => void saveToLibrary()}>
          Save to library
        </button>
      </div>
    </>
  );
}
