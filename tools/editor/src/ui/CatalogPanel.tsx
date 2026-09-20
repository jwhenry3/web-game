import { useEffect, useRef, useState } from "react";
import { slotLayer, type Doc } from "../App";
import type { AtlasRegion, CatalogEntry, Skeleton, Spec } from "../model/types";

interface Actions {
  setSpec: (fn: (s: Spec) => Spec) => void;
  setSkeleton: (fn: (s: Skeleton) => Skeleton) => void;
  setAtlas: (fn: (a: Doc["atlas"]) => Doc["atlas"]) => void;
  repack: (extra?: Map<string, HTMLCanvasElement>) => void;
  setSelAtt: (a: { slot: string; att: string } | null) => void;
}

const THUMB = 44;

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
      list.push(e);
    }
  }
  return out;
}

function Thumb({
  region,
  atlasCanvas,
}: {
  region: AtlasRegion | undefined;
  atlasCanvas: React.RefObject<HTMLCanvasElement | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = THUMB;
    c.height = THUMB;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, THUMB, THUMB);
    const src = atlasCanvas.current;
    if (!src || !region) return;
    const s = Math.min(THUMB / region.w, THUMB / region.h, 6);
    const w = Math.max(1, Math.round(region.w * s));
    const h = Math.max(1, Math.round(region.h * s));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      src,
      region.x, region.y, region.w, region.h,
      (THUMB - w) / 2, (THUMB - h) / 2, w, h,
    );
  });
  return <canvas ref={ref} className="ed-cat-thumb" />;
}

export function CatalogPanel({
  doc,
  atlasCanvas,
  actions,
}: {
  doc: Doc;
  atlasCanvas: React.RefObject<HTMLCanvasElement | null>;
  actions: Actions;
}) {
  const catalog = catalogOf(doc);
  const layers = doc.spec.layers.map((l) => l.name);
  const [layer, setLayer] = useState<string>(layers[0] ?? "");
  const [filter, setFilter] = useState("");
  const [newKey, setNewKey] = useState("");
  const [srcKey, setSrcKey] = useState("");
  const [slots, setSlots] = useState<Set<string>>(new Set());

  const entries = (catalog[layer] ?? []).slice().sort((a, b) => a.key.localeCompare(b.key));
  const skins = doc.skeleton.skins[0]?.attachments ?? {};
  const layerSlots = [...new Set(entries.map((e) => e.slot))].sort();
  const visible = entries.filter(
    (e) => !filter || e.key.toLowerCase().includes(filter.toLowerCase()),
  );
  const src = entries.find((e) => e.key === srcKey) ?? entries[0];
  const mountSlots = slots.size ? slots : new Set(layerSlots);

  // Layer switched — reset the clone source and target slots.
  const pickLayer = (name: string) => {
    setLayer(name);
    setSrcKey("");
    setSlots(new Set());
  };

  const register = () => {
    const key = newKey.trim();
    const srcAtt = src ? skins[src.slot]?.[src.key] : undefined;
    const srcRegion = srcAtt?.path ? doc.atlas.regions.get(srcAtt.path) : undefined;
    if (!key || !src || !srcAtt || !srcRegion || !atlasCanvas.current) return;
    const src2 = atlasCanvas.current;
    const targets = layerSlots.filter(
      (s) => mountSlots.has(s) && !(skins[s]?.[key] ?? catalog[layer]?.some((e) => e.key === key && e.slot === s)),
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
      const cat = { ...(s.catalog ?? catalogOf(doc)) };
      const list = [...(cat[layer] ?? [])];
      for (const slot of targets) {
        const e: CatalogEntry = { key, slot };
        if (srcAtt.rotation) e.rotation = srcAtt.rotation;
        list.push(e);
      }
      cat[layer] = list;
      return { ...s, catalog: cat };
    });
    actions.repack(extra);
    setNewKey("");
  };

  const remove = (e: CatalogEntry) => {
    const att = skins[e.slot]?.[e.key];
    actions.setSkeleton((s) => {
      const skins2 = [
        { ...s.skins[0]!, attachments: { ...s.skins[0]!.attachments } },
        ...s.skins.slice(1),
      ];
      const atts = { ...(skins2[0]!.attachments[e.slot] ?? {}) };
      delete atts[e.key];
      skins2[0]!.attachments[e.slot] = atts;
      return { ...s, skins: skins2 };
    });
    actions.setSpec((s) => ({
      ...s,
      catalog: Object.fromEntries(
        Object.entries(s.catalog ?? catalogOf(doc)).map(([l, list]) => [
          l,
          list.filter((x) => !(x.key === e.key && x.slot === e.slot)),
        ]),
      ),
    }));
    if (att?.path) {
      const path = att.path;
      actions.setAtlas((a) => {
        const regions = new Map(a.regions);
        regions.delete(path);
        return { ...a, regions };
      });
      actions.repack();
    }
  };

  return (
    <>
      <h3>Appearance catalog</h3>
      <div className="ed-hint">
        Registered parts per layer — the variant keys the rig can mount on each
        slot. Register clones the art into a new atlas region; save to persist.
      </div>
      <div className="ed-row">
        <label>layer</label>
        <select value={layer} onChange={(e) => pickLayer(e.target.value)}>
          {layers.map((l) => (
            <option key={l} value={l}>
              {l} ({catalog[l]?.length ?? 0})
            </option>
          ))}
        </select>
      </div>
      <div className="ed-row">
        <label>filter</label>
        <input
          placeholder="key contains…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="ed-cat-grid">
        {visible.map((e) => {
          const att = skins[e.slot]?.[e.key];
          const region = att?.path ? doc.atlas.regions.get(att.path) : undefined;
          return (
            <div
              key={`${e.slot}/${e.key}`}
              className="ed-cat-card"
              title={`${e.slot} / ${e.key}`}
              onClick={() => actions.setSelAtt({ slot: e.slot, att: e.key })}
            >
              <Thumb region={region} atlasCanvas={atlasCanvas} />
              <div className="ed-cat-key">{e.key}</div>
              <div className="ed-cat-meta">
                {layerSlots.length > 1 ? e.slot.split("_").pop() : ""}
                {e.rotation ? ` ${e.rotation}°` : ""}
              </div>
              <button
                className="ed-cat-del"
                title="Remove part"
                onClick={(ev) => {
                  ev.stopPropagation();
                  remove(e);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        {!visible.length && <div className="ed-hint">No parts match.</div>}
      </div>

      <h3>Register part</h3>
      <div className="ed-row">
        <label>clone</label>
        <select value={src?.key ?? ""} onChange={(e) => setSrcKey(e.target.value)}>
          {entries.map((e) => (
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
      <div className="ed-hint">
        Clones the source variant's art into <code>{`{slot}__${newKey.trim() || "key"}`}</code>{" "}
        and records it in <code>spec.catalog</code>. Regenerate rebuilds the
        catalog from the generator — registered parts in generated rigs are
        generator-owned.
      </div>
    </>
  );
}
