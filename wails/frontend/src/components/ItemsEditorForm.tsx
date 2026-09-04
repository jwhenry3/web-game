import type { ItemDef } from "../editor/contentStore";
import {
  EQUIP_SLOTS,
  ITEM_KINDS,
  ITEM_RARITIES,
  ITEM_STAT_KEYS,
  ITEM_TARGETS,
  WEAPON_TYPES,
} from "../editor/gameContentTypes";
import {
  isWeaponSlot,
  normalizeItemDef,
  patchItemEffects,
  patchItemStat,
  setItemKind,
  toggleAllowedSlot,
} from "../editor/itemCatalogHelpers";
import {
  CheckboxField,
  FieldLabel,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "./CatalogEditorShell";

interface ItemFormProps {
  draft: ItemDef;
  onChange: (draft: ItemDef) => void;
}

function useItemDraft(draft: ItemDef, onChange: (draft: ItemDef) => void) {
  const item = normalizeItemDef(draft);
  const patch = (next: ItemDef) => onChange(normalizeItemDef(next));
  return { item, patch };
}

/** Shared catalog fields — kind, identity, description. */
export function ItemCoreForm({ draft, onChange }: ItemFormProps) {
  const { item, patch } = useItemDraft(draft, onChange);

  return (
    <>
      <TextField label="ID" value={item.id} readOnly />
      <TextField label="Name" value={item.name} onChange={(name) => patch({ ...item, name })} />
      <SelectField
        label="Kind"
        value={item.kind}
        onChange={(kind) => patch(setItemKind(item, kind))}
        options={ITEM_KINDS}
      />
      <TextAreaField
        label="Description"
        value={item.description ?? ""}
        onChange={(description) => patch({ ...item, description })}
        rows={3}
      />
      <p className="dim map-editor-role-hint">
        Core item identity. Edit consumable or equipment behavior in the module panel →
      </p>
    </>
  );
}

/** Consumable module — targeting, effects, stacking. */
export function ConsumableModuleForm({ draft, onChange }: ItemFormProps) {
  const { item, patch } = useItemDraft(draft, onChange);

  return (
    <>
      <SelectField
        label="Allowed target"
        value={item.target ?? "ally"}
        onChange={(target) => patch({ ...item, target })}
        options={ITEM_TARGETS.map((t) => ({ id: t.id, label: `${t.label} — ${t.hint}` }))}
      />
      <div className="map-editor-group-label">Effects (base at item level 1)</div>
      <NumberField
        label="Restore HP"
        value={item.effects?.heal_hp ?? 0}
        min={0}
        onChange={(heal_hp) => patch(patchItemEffects(item, { heal_hp }))}
      />
      <NumberField
        label="Restore MP"
        value={item.effects?.restore_mp ?? 0}
        min={0}
        onChange={(restore_mp) => patch(patchItemEffects(item, { restore_mp }))}
      />
      <NumberField
        label="Bonus per item level"
        value={item.effects?.per_level ?? 0}
        min={0}
        onChange={(per_level) => patch(patchItemEffects(item, { per_level }))}
      />
      <p className="dim map-editor-role-hint">
        Final effect = base + (per level × item instance level). Battle use shares the skill GCD.
      </p>
      <CheckboxField
        label="Stackable in inventory"
        checked={item.stackable ?? true}
        onChange={(stackable) => patch({ ...item, stackable })}
      />
      <NumberField
        label="Max stack size"
        value={item.max_stack ?? 99}
        min={1}
        onChange={(max_stack) => patch({ ...item, max_stack })}
      />
    </>
  );
}

/** Equipment module — slots, weapon type, rarity, stats. */
export function EquipmentModuleForm({ draft, onChange }: ItemFormProps) {
  const { item, patch } = useItemDraft(draft, onChange);
  const showWeaponFields = isWeaponSlot(item.slot) || item.allowed_slots?.some(isWeaponSlot);

  return (
    <>
      <SelectField
        label="Primary slot"
        value={item.slot ?? "weapon"}
        onChange={(slot) => {
          const next: ItemDef = { ...item, slot };
          if (!isWeaponSlot(slot)) {
            next.weapon_type = undefined;
            next.allowed_slots = [slot];
          } else if (!next.allowed_slots?.length) {
            next.allowed_slots = ["weapon", "sub_weapon"];
          }
          patch(next);
        }}
        options={EQUIP_SLOTS.map((s) => ({ id: s.id, label: s.label }))}
      />

      <FieldLabel>Allowed equip slots</FieldLabel>
      <div className="map-editor-check-list">
        {(showWeaponFields
          ? EQUIP_SLOTS.filter((s) => s.group === "weapon")
          : EQUIP_SLOTS.filter((s) => s.id === item.slot)
        ).map((slot) => (
          <label key={slot.id} className="map-editor-check">
            <input
              type="checkbox"
              checked={(item.allowed_slots ?? []).includes(slot.id)}
              onChange={(e) => patch(toggleAllowedSlot(item, slot.id, e.target.checked))}
            />
            {slot.label}
          </label>
        ))}
      </div>

      {showWeaponFields && (
        <SelectField
          label="Weapon type"
          value={item.weapon_type ?? "sword"}
          onChange={(weapon_type) => patch({ ...item, weapon_type })}
          options={WEAPON_TYPES}
        />
      )}

      <SelectField
        label="Rarity"
        value={item.rarity ?? "common"}
        onChange={(rarity) => patch({ ...item, rarity })}
        options={ITEM_RARITIES}
      />
      <NumberField label="Item level" value={item.level ?? 1} min={1} onChange={(level) => patch({ ...item, level })} />

      <div className="map-editor-group-label">Stats</div>
      {ITEM_STAT_KEYS.map((stat) => (
        <NumberField
          key={stat.id}
          label={stat.label}
          value={item.stats?.[stat.id] ?? 0}
          onChange={(value) => patch(patchItemStat(item, stat.id, value))}
        />
      ))}
      <p className="dim map-editor-role-hint">
        Static gear template. Procedural loot rolls stats randomly; use this for shops, quests, and hand-placed rewards.
      </p>
    </>
  );
}
