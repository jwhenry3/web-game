import type { EditorObject } from "../editor/editorTypes";
import { propNumber, propString, setProp } from "../editor/editorTypes";
import { parseNpcServiceRoles, toggleNpcServiceRole } from "../editor/objectProps";
import {
  hasCombatRole,
  hasServiceRoles,
  isNpcEntity,
  normalizeNpcObject,
  npcInspectorLabel,
} from "../editor/npcEntity";
import { NPC_ROLES } from "../editor/sceneCatalog";
import {
  ENEMY_KIND_LABELS,
  ENEMY_KINDS,
  ENEMY_SPRITE_SRC,
  enemyKindFromName,
  type EnemyKind,
} from "../characters/enemies";
import type { ItemDef, QuestDef } from "../editor/contentStore";
import { ContentIdMultiSelect, ContentIdSelect } from "./ContentIdSelect";

const STORAGE_TYPES = [
  { id: "personal", label: "Personal bank" },
  { id: "guild", label: "Guild storage" },
  { id: "shared", label: "Account shared" },
];

const PICKUP_MODES = [
  { id: "interact", label: "Interact (confirm)" },
  { id: "walkover", label: "Walk over" },
  { id: "auto", label: "Auto collect nearby" },
];

const TRIGGER_MODES = [
  { id: "interact", label: "Interact" },
  { id: "enter", label: "Enter area / proximity" },
  { id: "auto", label: "Automatic on approach" },
];

interface Props {
  obj: EditorObject;
  onUpdate: (obj: EditorObject) => void;
  /** When true, hide map-placement-only fields like patrol region. */
  templateMode?: boolean;
  items?: ItemDef[];
  quests?: QuestDef[];
}

function ReadonlyId({ label = "Unique ID", value }: { label?: string; value: string }) {
  return (
    <>
      <label className="field-label">{label}</label>
      <input className="xiv-input" value={value} readOnly disabled title="Assigned automatically" />
    </>
  );
}

function EnemySpritePicker({
  value,
  onChange,
}: {
  value: EnemyKind;
  onChange: (kind: EnemyKind) => void;
}) {
  return (
    <div className="map-editor-sprite-picker" role="listbox" aria-label="Enemy sprite">
      {ENEMY_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          role="option"
          aria-selected={value === kind}
          className={`map-editor-sprite-option ${value === kind ? "on" : ""}`}
          onClick={() => onChange(kind)}
          title={ENEMY_KIND_LABELS[kind]}
        >
          <img src={ENEMY_SPRITE_SRC[kind]} alt="" className="map-editor-sprite-option-img" />
          <span className="map-editor-sprite-option-label">{ENEMY_KIND_LABELS[kind]}</span>
        </button>
      ))}
    </div>
  );
}

export function EntityTypeInspector({ obj, onUpdate, templateMode, items = [], quests = [] }: Props) {
  const patch = (next: Partial<EditorObject>) => {
    const merged = { ...obj, ...next };
    onUpdate(isNpcEntity(merged) ? normalizeNpcObject(merged) : merged);
  };
  const patchProp = (name: string, type: string, value: string | number | boolean) =>
    patch({ properties: setProp(obj.properties, name, type, value) });

  const npc = isNpcEntity(obj) ? normalizeNpcObject(obj) : null;

  if (npc) {
    const serviceRoles = parseNpcServiceRoles(npc);
    const combat = hasCombatRole(npc);
    const service = hasServiceRoles(npc);
    const uniqueId = propString(npc.properties, "id", npc.name);
    const enemyKind = enemyKindFromName(propString(npc.properties, "name"), propString(npc.properties, "kind"));

    const selectEnemySprite = (kind: EnemyKind) => {
      const prevKind = propString(npc.properties, "kind");
      const prevName = propString(npc.properties, "name");
      const prevLabel = ENEMY_KINDS.includes(prevKind as EnemyKind)
        ? ENEMY_KIND_LABELS[prevKind as EnemyKind]
        : "";
      let props = setProp(npc.properties, "kind", "string", kind);
      if (!prevName || prevName === prevLabel || prevName === prevKind) {
        props = setProp(props, "name", "string", ENEMY_KIND_LABELS[kind]);
      }
      onUpdate(normalizeNpcObject({ ...npc, properties: props }));
    };

    return (
      <>
        <div className="map-editor-group-label">{npcInspectorLabel(npc)}</div>
        <ReadonlyId value={uniqueId} />
        <label className="field-label">Display name</label>
        <input
          className="xiv-input"
          value={propString(npc.properties, "name")}
          onChange={(e) => patchProp("name", "string", e.target.value)}
        />

        {combat && (
          <>
            <div className="map-editor-group-label">Combat</div>
            <label className="field-label">Sprite</label>
            <EnemySpritePicker value={enemyKind} onChange={selectEnemySprite} />
            <label className="field-label">Level</label>
            <input
              className="xiv-input"
              type="number"
              min={1}
              value={propNumber(npc.properties, "level", 1)}
              onChange={(e) => patchProp("level", "int", parseInt(e.target.value, 10) || 1)}
            />
            {!templateMode && (
              <>
                <label className="field-label">Patrol region</label>
                <input
                  className="xiv-input"
                  value={propString(npc.properties, "region")}
                  onChange={(e) => patchProp("region", "string", e.target.value)}
                />
              </>
            )}
            {templateMode && (
              <p className="dim map-editor-role-hint">Patrol region is set when the NPC is placed on a map.</p>
            )}
          </>
        )}

        {service && (
          <>
            <div className="map-editor-group-label">Interaction roles</div>
            <p className="dim map-editor-role-hint">Enable the services this NPC provides.</p>
            {NPC_ROLES.map((role) => (
              <label key={role.id} className="map-editor-check" title={role.hint}>
                <input
                  type="checkbox"
                  checked={serviceRoles.includes(role.id)}
                  onChange={() => onUpdate(toggleNpcServiceRole(npc, role.id))}
                />
                {role.label}
              </label>
            ))}

            <div className="map-editor-group-label">Dialogue</div>
            <label className="field-label">Greeting</label>
            <input
              className="xiv-input"
              value={propString(npc.properties, "greeting")}
              onChange={(e) => patchProp("greeting", "string", e.target.value)}
              placeholder="First line when talking to this NPC"
            />
            <label className="field-label">Dialogue script</label>
            <textarea
              className="xiv-input map-editor-textarea"
              rows={4}
              value={propString(npc.properties, "dialogue")}
              onChange={(e) => patchProp("dialogue", "string", e.target.value)}
              placeholder="Optional longer dialogue / script id"
            />

            {serviceRoles.includes("shop") && (
              <>
                <div className="map-editor-group-label">Shop</div>
                <label className="field-label">Shop inventory key</label>
                <input
                  className="xiv-input"
                  value={propString(npc.properties, "shopId")}
                  onChange={(e) => patchProp("shopId", "string", e.target.value)}
                  placeholder="e.g. greenwood_general"
                />
                <label className="field-label">Shop items</label>
                <ContentIdMultiSelect
                  value={propString(npc.properties, "shopItems")}
                  onChange={(next) => patchProp("shopItems", "string", next)}
                  options={items}
                  emptyHint="Seed items with npm run seed:content"
                />
              </>
            )}

            {serviceRoles.includes("quest_giver") && (
              <>
                <div className="map-editor-group-label">Quests</div>
                <label className="field-label">Quest set ID</label>
                <input
                  className="xiv-input"
                  value={propString(npc.properties, "questSetId")}
                  onChange={(e) => patchProp("questSetId", "string", e.target.value)}
                  placeholder="storyline / pool id"
                />
                <label className="field-label">Quest IDs</label>
                <ContentIdMultiSelect
                  value={propString(npc.properties, "questIds")}
                  onChange={(next) => patchProp("questIds", "string", next)}
                  options={quests}
                  emptyHint="Seed quests with npm run seed:content"
                />
              </>
            )}

            {serviceRoles.includes("storage") && (
              <>
                <div className="map-editor-group-label">Storage</div>
                <ReadonlyId label="Storage ID" value={propString(npc.properties, "storageId") || uniqueId} />
                <label className="field-label">Storage type</label>
                <select
                  className="xiv-input"
                  value={propString(npc.properties, "storageType", "personal")}
                  onChange={(e) => patchProp("storageType", "string", e.target.value)}
                >
                  {STORAGE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            {serviceRoles.includes("auction_house") && (
              <>
                <div className="map-editor-group-label">Auction house</div>
                <ReadonlyId label="Auction house ID" value={propString(npc.properties, "auctionId") || uniqueId} />
              </>
            )}

            {serviceRoles.includes("job_master") && (
              <p className="dim map-editor-role-hint">Job Master opens the job change dialog on interact.</p>
            )}
          </>
        )}
      </>
    );
  }

  if (obj.type === "quest_trigger") {
    return (
      <>
        <div className="map-editor-group-label">Quest Trigger</div>
        <ReadonlyId value={propString(obj.properties, "id", obj.name)} />
        <label className="field-label">Display name</label>
        <input
          className="xiv-input"
          value={propString(obj.properties, "name")}
          onChange={(e) => patchProp("name", "string", e.target.value)}
        />
        <label className="field-label">Quest ID</label>
        <ContentIdSelect
          value={propString(obj.properties, "questId")}
          onChange={(next) => patchProp("questId", "string", next)}
          options={quests}
          emptyLabel="— select quest —"
        />
        <label className="field-label">Trigger mode</label>
        <select
          className="xiv-input"
          value={propString(obj.properties, "triggerMode", "interact")}
          onChange={(e) => patchProp("triggerMode", "string", e.target.value)}
        >
          {TRIGGER_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="map-editor-check">
          <input
            type="checkbox"
            checked={obj.properties.some((p) => p.name === "autoStart" && (p.value === true || p.value === "true"))}
            onChange={(e) => patchProp("autoStart", "bool", e.target.checked)}
          />
          Auto-start quest on trigger
        </label>
        <label className="field-label">Prompt / greeting</label>
        <textarea
          className="xiv-input map-editor-textarea"
          rows={3}
          value={propString(obj.properties, "greeting")}
          onChange={(e) => patchProp("greeting", "string", e.target.value)}
          placeholder="Optional text shown when triggered"
        />
      </>
    );
  }

  if (obj.type === "item") {
    return (
      <>
        <div className="map-editor-group-label">World Item</div>
        <ReadonlyId value={propString(obj.properties, "id", obj.name)} />
        <label className="field-label">Display name</label>
        <input
          className="xiv-input"
          value={propString(obj.properties, "name")}
          onChange={(e) => patchProp("name", "string", e.target.value)}
        />
        <label className="field-label">Item ID</label>
        <ContentIdSelect
          value={propString(obj.properties, "itemId")}
          onChange={(next) => patchProp("itemId", "string", next)}
          options={items}
          emptyLabel="— select item —"
        />
        <label className="field-label">Quantity</label>
        <input
          className="xiv-input"
          type="number"
          min={1}
          value={propNumber(obj.properties, "quantity", 1)}
          onChange={(e) => patchProp("quantity", "int", parseInt(e.target.value, 10) || 1)}
        />
        <label className="field-label">Pickup mode</label>
        <select
          className="xiv-input"
          value={propString(obj.properties, "pickupMode", "interact")}
          onChange={(e) => patchProp("pickupMode", "string", e.target.value)}
        >
          {PICKUP_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="field-label">Respawn (seconds)</label>
        <input
          className="xiv-input"
          type="number"
          min={0}
          value={propNumber(obj.properties, "respawnSec", 0)}
          onChange={(e) => patchProp("respawnSec", "int", parseInt(e.target.value, 10) || 0)}
        />
        <p className="dim map-editor-role-hint">0 = does not respawn after pickup.</p>
      </>
    );
  }

  return null;
}

export function usesEntityTypeInspector(obj: EditorObject): boolean {
  return isNpcEntity(obj) || obj.type === "quest_trigger" || obj.type === "item";
}
