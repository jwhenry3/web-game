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
import type { DropPoolDef, ItemDef, QuestDef } from "../editor/contentStore";
import {
  defaultDropPoolIdForKind,
  defaultEncounterEnemy,
  normalizeEncounter,
  parseEncounter,
  serializeEncounter,
  type EncounterConfig,
  type EncounterEnemy,
} from "../editor/encounterConfig";
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
  drops?: DropPoolDef[];
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

function DropPoolPreview({
  poolId,
  drops,
  items,
}: {
  poolId: string;
  drops: DropPoolDef[];
  items: ItemDef[];
}) {
  if (!poolId) return null;
  const pool = drops.find((d) => d.id === poolId);
  if (!pool) {
    return <p className="dim map-editor-role-hint">Drop pool “{poolId}” not in catalog.</p>;
  }
  if (!pool.entries?.length) {
    return <p className="dim map-editor-role-hint">Pool has no entries.</p>;
  }
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  return (
    <ul className="map-editor-drop-preview">
      {pool.entries.map((e, i) => (
        <li key={`${e.item_id}-${i}`}>
          {itemName(e.item_id)} — {e.chance}%
        </li>
      ))}
    </ul>
  );
}

export function EntityTypeInspector({
  obj,
  onUpdate,
  templateMode,
  items = [],
  quests = [],
  drops = [],
}: Props) {
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
    const npcLevel = propNumber(npc.properties, "level", 1);
    const encounter = parseEncounter(propString(npc.properties, "encounter"), enemyKind, npcLevel);

    const writeEncounter = (next: EncounterConfig) => {
      const normalized = normalizeEncounter(next, enemyKind, npcLevel);
      patchProp("encounter", "string", serializeEncounter(normalized));
    };

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
      const enc = parseEncounter(propString(props, "encounter"), kind, propNumber(props, "level", 1));
      if (enc.enemies[0] && (enc.enemies[0].kind === prevKind || enc.enemies.length === 1)) {
        enc.enemies[0] = {
          ...enc.enemies[0],
          kind,
          dropPoolId: enc.enemies[0].dropPoolId || defaultDropPoolIdForKind(kind),
        };
        props = setProp(props, "encounter", "string", serializeEncounter(enc));
      }
      onUpdate(normalizeNpcObject({ ...npc, properties: props }));
    };

    const patchSpawnEnemy = (index: number, patchEnemy: Partial<EncounterEnemy>) => {
      const enemies = encounter.enemies.map((e, i) => (i === index ? { ...e, ...patchEnemy } : e));
      writeEncounter({ ...encounter, enemies });
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
            <label className="field-label">Overworld sprite</label>
            <EnemySpritePicker value={enemyKind} onChange={selectEnemySprite} />
            <label className="field-label">Base level</label>
            <input
              className="xiv-input"
              type="number"
              min={1}
              value={npcLevel}
              onChange={(e) => {
                const level = parseInt(e.target.value, 10) || 1;
                let props = setProp(npc.properties, "level", "int", level);
                const enc = parseEncounter(propString(props, "encounter"), enemyKind, level);
                if (enc.enemies.length === 1) {
                  enc.enemies[0] = { ...enc.enemies[0], levelMin: level, levelMax: level };
                  props = setProp(props, "encounter", "string", serializeEncounter(enc));
                }
                onUpdate(normalizeNpcObject({ ...npc, properties: props }));
              }}
            />

            <div className="map-editor-group-label">Encounter</div>
            <div className="map-editor-encounter-counts">
              <div>
                <label className="field-label">Min enemies</label>
                <input
                  className="xiv-input"
                  type="number"
                  min={1}
                  max={8}
                  value={encounter.minEnemies}
                  onChange={(e) =>
                    writeEncounter({
                      ...encounter,
                      minEnemies: parseInt(e.target.value, 10) || 1,
                    })
                  }
                />
              </div>
              <div>
                <label className="field-label">Max enemies</label>
                <input
                  className="xiv-input"
                  type="number"
                  min={1}
                  max={8}
                  value={encounter.maxEnemies}
                  onChange={(e) =>
                    writeEncounter({
                      ...encounter,
                      maxEnemies: parseInt(e.target.value, 10) || 1,
                    })
                  }
                />
              </div>
            </div>

            <label className="field-label">Spawn pool</label>
            <div className="map-editor-encounter-list">
              {encounter.enemies.map((row, i) => {
                const kind = ENEMY_KINDS.includes(row.kind as EnemyKind)
                  ? (row.kind as EnemyKind)
                  : "goblin";
                return (
                  <div key={i} className="map-editor-encounter-row">
                    <label className="field-label">Enemy type</label>
                    <select
                      className="xiv-input"
                      value={kind}
                      onChange={(e) => {
                        const nextKind = e.target.value as EnemyKind;
                        patchSpawnEnemy(i, {
                          kind: nextKind,
                          dropPoolId: row.dropPoolId || defaultDropPoolIdForKind(nextKind),
                        });
                      }}
                    >
                      {ENEMY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {ENEMY_KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <div className="map-editor-encounter-counts">
                      <div>
                        <label className="field-label">Lv min</label>
                        <input
                          className="xiv-input"
                          type="number"
                          min={1}
                          value={row.levelMin}
                          onChange={(e) =>
                            patchSpawnEnemy(i, { levelMin: parseInt(e.target.value, 10) || 1 })
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">Lv max</label>
                        <input
                          className="xiv-input"
                          type="number"
                          min={1}
                          value={row.levelMax}
                          onChange={(e) =>
                            patchSpawnEnemy(i, { levelMax: parseInt(e.target.value, 10) || 1 })
                          }
                        />
                      </div>
                    </div>
                    <label className="field-label">Drop pool</label>
                    <ContentIdSelect
                      value={row.dropPoolId}
                      onChange={(dropPoolId) => patchSpawnEnemy(i, { dropPoolId })}
                      options={drops}
                      emptyLabel="— none (procedural) —"
                    />
                    <DropPoolPreview poolId={row.dropPoolId} drops={drops} items={items} />
                    {encounter.enemies.length > 1 && (
                      <button
                        type="button"
                        className="xiv-btn"
                        onClick={() =>
                          writeEncounter({
                            ...encounter,
                            enemies: encounter.enemies.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Remove type
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="xiv-btn"
                onClick={() =>
                  writeEncounter({
                    ...encounter,
                    enemies: [
                      ...encounter.enemies,
                      defaultEncounterEnemy(enemyKind, npcLevel, defaultDropPoolIdForKind(enemyKind)),
                    ],
                  })
                }
              >
                Add enemy type
              </button>
            </div>

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
