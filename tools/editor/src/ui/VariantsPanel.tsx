import { useMemo } from "react";
import { slotLayer, type Doc } from "../model/types";
import type { VariantSel } from "../model/types";

interface Opts {
  skin: string[];
  face: string[];
  hair: string[];
  hairColor: string[];
  cloth: string[];
  clothColor: string[];
  weapon: string[];
  weaponColor: string[];
  subWeapon: string[];
  subWeaponColor: string[];
  ears: string[];
  horns: string[];
  wings: string[];
  tail: string[];
}

/** Scan skin attachment keys to derive variant options per layer. */
function scanVariants(doc: Doc): Opts {
  const skins = doc.skeleton.skins[0]?.attachments ?? {};
  const out: Opts = {
    skin: [], face: [], hair: [], hairColor: [],
    cloth: [], clothColor: [], weapon: [], weaponColor: [],
    subWeapon: [], subWeaponColor: [],
    ears: [], horns: [], wings: [], tail: [],
  };
  const add = (list: string[], v: string) => {
    if (v && !list.includes(v)) list.push(v);
  };
  for (const slot of Object.keys(skins)) {
    const layer = slotLayer(doc.spec, slot);
    for (const att of Object.keys(skins[slot]!)) {
      if (layer === "skin") add(out.skin, att.slice(5));
      else if (layer === "face") add(out.face, att.slice(5));
      else if (layer?.startsWith("hair_")) {
        const m = /^hair_(\w+?)_(c\d+)$/.exec(att);
        if (m) {
          add(out.hair, m[1]!);
          add(out.hairColor, m[2]!);
        }
      } else if (layer === "cloth_bot" || layer === "cloth_top") {
        const m = /^(cloth\d+)_(c\d+)$/.exec(att);
        if (m) {
          add(out.cloth, m[1]!);
          add(out.clothColor, m[2]!);
        }
      } else if (layer === "weapon_top" || layer === "weapon_front" || layer === "weapon_bot" || layer === "weapon_over") {
        const m = /^(weapon\d+)(?:_(c\d+))?$/.exec(att);
        if (m) {
          const bot = layer === "weapon_bot" || layer === "weapon_over";
          add(bot ? out.subWeapon : out.weapon, m[1]!);
          if (m[2]) add(bot ? out.subWeaponColor : out.weaponColor, m[2]);
        }
      } else if (layer === "ears" || layer === "tail") {
        // ears_point_c7 / tail_spade_c8 — skin-toned creature parts.
        const m = /^\w+_(\w+?)_(c\d+)$/.exec(att);
        if (m) add(layer === "ears" ? out.ears : out.tail, m[1]!);
      } else if (layer === "horns") {
        add(out.horns, att.slice(6));
      } else if (layer === "wings") {
        add(out.wings, att.slice(6));
      }
    }
  }
  for (const k of Object.keys(out) as (keyof Opts)[]) out[k].sort();
  return out;
}

export function VariantsPanel({
  doc,
  sel,
  setSel,
  selAtt,
}: {
  doc: Doc;
  sel: VariantSel;
  setSel: (s: VariantSel) => void;
  selAtt: { slot: string; att: string } | null;
}) {
  const opts = useMemo(() => scanVariants(doc), [doc]);
  const shapeKeys = Array.isArray(doc.spec.shapeKeys) ? doc.spec.shapeKeys : [];
  const shapeGroups = useMemo(() => {
    const groups = new Map<string, typeof shapeKeys>();
    for (const k of shapeKeys) {
      const g = k.group ?? "Other";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(k);
    }
    return [...groups];
  }, [shapeKeys]);
  const row = (label: string, key: keyof Opts) => (
    <div className="ed-row" key={key}>
      <label>{label}</label>
      <select value={sel[key]} onChange={(e) => setSel({ ...sel, [key]: e.target.value })}>
        <option value="">— none —</option>
        {opts[key].map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
  return (
    <>
      <h3>Appearance variant</h3>
      <button onClick={() => setSel({ ...sel, face: "", hair: "", cloth: "", weapon: "", subWeapon: "", ears: "", horns: "", wings: "", tail: "" })}>
        Show bare base
      </button>
      {row("Skin", "skin")}
      {row("Face", "face")}
      {row("Hair", "hair")}
      {row("Hair color", "hairColor")}
      {row("Cloth", "cloth")}
      {row("Cloth color", "clothColor")}
      {row("Weapon", "weapon")}
      {row("Weapon color", "weaponColor")}
      {row("Sub weapon", "subWeapon")}
      {row("Sub color", "subWeaponColor")}
      {row("Ears", "ears")}
      {row("Horns", "horns")}
      {row("Wings", "wings")}
      {row("Tail", "tail")}
      {shapeGroups.length > 0 && (
        <>
          <h3>Shape keys</h3>
          {shapeGroups.map(([group, keys]) => (
            <div key={group}>
              <h4>{group}</h4>
              {keys.map((k) => {
                // Show the effective value — unset keys sit at the rig's
                // baseline (spec.shapeDefaults), not the authored pose.
                const v = sel.shape[k.name] ?? doc.spec.shapeDefaults?.[k.name] ?? 1;
                return (
                  <div className="ed-row" key={k.name}>
                    <label>
                      {k.label ?? k.name} <span className="ed-hint">{v.toFixed(2)}</span>
                    </label>
                    <input
                      type="range"
                      min={k.min}
                      max={k.max}
                      step={0.01}
                      value={v}
                      onChange={(e) =>
                        setSel({ ...sel, shape: { ...sel.shape, [k.name]: +e.target.value } })
                      }
                      onDoubleClick={() => {
                        const shape = { ...sel.shape };
                        delete shape[k.name];
                        setSel({ ...sel, shape });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <button onClick={() => setSel({ ...sel, shape: {} })}>Reset shape</button>
          <div className="ed-hint">
            Bone-scale morphs for body diversity — saved as a preset spec's
            defaults. Unset keys use the rig's adult baseline; double-click a
            slider to return it there.
          </div>
        </>
      )}
      {selAtt && (
        <div className="ed-hint">
          editing: {selAtt.slot} → {selAtt.att}
        </div>
      )}
    </>
  );
}
