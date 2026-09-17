import { useMemo, useState, type DragEvent } from "react";
import { CharacterPreviewAnimated } from "../characters/CharacterPreview";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import {
  equipSlotsForProfile,
  equippedSlotForItem,
  ARMOURY_TABS,
  type ArmouryTabId,
  jobColor,
  jobLabel,
  mainWeaponTypeFromProfile,
  type Item,
  type ProfileInfo,
  type SkillInfo,
  type WindowId,
} from "../types";
import { GameIcon } from "../ui/GameIcon";
import { ICONS } from "../ui/icons";
import { HoverTooltip } from "../ui/HoverTooltip";
import { SkillTooltipContent } from "../ui/tooltipContent";
import { writeHotbarDrag } from "../ui/hotbarDrag";
import {
  hasItemTransfer,
  readItemTransfer,
  type ItemBagId,
} from "../ui/itemTransfer";
import type { ItemActionContext } from "../ui/itemActions";
import { ITEM_BAG_TABS, filterItemsByBagTab, type ItemBagTab } from "../ui/itemBagTabs";
import { ItemListRow, ItemSlot } from "./ItemBits";
import { SocialPane } from "./SocialPane";
import { MainMenuTrigger } from "./MainMenu";
import { MapWindow } from "./WorldMap";
import { PetsPane } from "./PetsPane";
import { DraggableWindowShell } from "./DraggableWindow";
import { useBackdropDismiss } from "../ui/backdropDismiss";
import { uiScaleFactor, windowScaleKey } from "../ui/uiScale";

const TITLES: Record<WindowId, string> = {
  character: "Character",
  equipment: "Equipment",
  inventory: "Inventory",
  skills: "Actions & Traits",
  social: "Social",
  map: "Map",
  house_storage: "House Storage",
  pets: "Pets",
};

export function GameWindows() {
  const open = useGame((s) => s.openWindow);
  const close = useGame((s) => s.closeWindow);
  const profile = useGame((s) => s.profile);
  const screen = useGame((s) => s.screen);
  const uiScale = useGame((s) => s.options.uiScale);
  const onBackdrop = useBackdropDismiss(close);

  if (!open || !profile) return null;

  if (open === "house_storage") {
    return <HouseStorageWindows profile={profile} onClose={close} />;
  }

  return (
    <div className="cm-window-layer" onMouseDown={onBackdrop}>
      <DraggableWindowShell
        resetKey={open}
        scale={uiScaleFactor(uiScale, windowScaleKey(open))}
        className={`cm-window ${open === "map" ? "cm-window--map" : ""}`}
        title={TITLES[open]}
        onClose={close}
        bodyClassName={`cm-body ${open === "map" ? "cm-body--map" : ""}`}
      >
        {open === "character" && <CharacterPane profile={profile} />}
        {open === "equipment" && <EquipmentPane profile={profile} />}
        {open === "inventory" && (
          <BagPane
            profile={profile}
            bag="inventory"
            items={profile.inventory}
            transferEnabled={screen === "house"}
          />
        )}
        {open === "skills" && <SkillsPane profile={profile} />}
        {open === "social" && <SocialPane />}
        {open === "map" && <MapWindow />}
        {open === "pets" && <PetsPane profile={profile} />}
      </DraggableWindowShell>
    </div>
  );
}

function HouseStorageWindows({ profile, onClose }: { profile: ProfileInfo; onClose: () => void }) {
  const house = useGame((s) => s.house);
  const uiScale = useGame((s) => s.options.uiScale);
  const winScale = uiScaleFactor(uiScale, windowScaleKey("house_storage"));
  const storage = house?.storage ?? [];
  const cap = house?.storage_capacity ?? 40;
  const self = house?.players.find((p) => p.name === profile.name);
  const tileSize = house?.tile_size ?? 32;
  const onBackdrop = useBackdropDismiss(onClose);

  if (!house?.is_owner) {
    return (
      <div className="cm-window-layer" onMouseDown={onBackdrop}>
        <DraggableWindowShell resetKey="house_storage_denied" scale={winScale} title="House Storage" onClose={onClose}>
          <p className="hint">House storage is only available to the owner while inside the house.</p>
        </DraggableWindowShell>
      </div>
    );
  }

  function placeFurniture(item: Item) {
    if (!self) return;
    if (equippedSlotForItem(profile.equipped, item.id)) return;
    const col = Math.floor(self.x / tileSize);
    const row = Math.floor(self.y / tileSize);
    net.housePlaceFurniture(item.id, col, row);
  }

  const invCtx: ItemActionContext = {
    bag: "inventory",
    houseStorageOpen: true,
    onPlaceFurniture: placeFurniture,
  };
  const storageCtx: ItemActionContext = { bag: "house_storage", houseStorageOpen: true };

  return (
    <div className="cm-window-layer" onMouseDown={onBackdrop}>
      <DraggableWindowShell
        resetKey="house_storage"
        scale={winScale}
        className="cm-window cm-window--house-storage"
        title={`House Storage (${storage.length}/${cap})`}
        onClose={onClose}
        bodyClassName="cm-body cm-body--house-storage"
      >
        <div className="cm-house-storage-stack">
          <section className="cm-house-storage-section">
            <div className="cm-house-storage-section-head">Storage</div>
            <BagPane
              profile={profile}
              bag="house_storage"
              items={storage}
              actionCtx={storageCtx}
              transferEnabled
              acceptFrom="inventory"
              compact
            />
          </section>
          <section className="cm-house-storage-section">
            <div className="cm-house-storage-section-head">Inventory</div>
            <BagPane
              profile={profile}
              bag="inventory"
              items={profile.inventory}
              actionCtx={invCtx}
              transferEnabled
              acceptFrom="house_storage"
              compact
            />
          </section>
          {house.furniture.length > 0 ? (
            <div className="cm-bag-furniture">
              <span className="dim">Placed</span>
              {house.furniture.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="cm-btn"
                  title="Pick up"
                  onClick={() => net.housePickFurniture(f.id)}
                >
                  {f.item.name} ✕
                </button>
              ))}
            </div>
          ) : (
            <p className="hint cm-bag-hint">Drag items between storage and inventory · double-click to transfer</p>
          )}
        </div>
      </DraggableWindowShell>
    </div>
  );
}

function applyItemTransfer(target: ItemBagId, e: DragEvent) {
  const drag = readItemTransfer(e);
  if (!drag || drag.source === target) return;
  if (drag.source === "inventory" && target === "house_storage") {
    const profile = useGame.getState().profile;
    if (profile && equippedSlotForItem(profile.equipped, drag.itemId)) return;
    net.houseStorageDeposit(drag.itemId, drag.qty);
  } else if (drag.source === "house_storage" && target === "inventory") {
    net.houseStorageWithdraw(drag.itemId, drag.qty);
  }
}

function BagPane({
  profile,
  bag,
  items,
  actionCtx,
  transferEnabled = false,
  acceptFrom,
  compact = false,
}: {
  profile: ProfileInfo;
  bag: ItemBagId;
  items: Item[];
  actionCtx?: ItemActionContext;
  transferEnabled?: boolean;
  acceptFrom?: ItemBagId;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<ItemBagTab>("all");
  const [focus, setFocus] = useState<Item | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const filtered = filterItemsByBagTab(items, tab);

  const ctx: ItemActionContext = { bag, ...actionCtx };
  const bagSlots = compact ? 24 : 32;
  const emptySlots = Math.max(0, bagSlots - filtered.length);

  function onDragOver(e: DragEvent) {
    if (!acceptFrom || !hasItemTransfer(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent) {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDragOver(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!acceptFrom) return;
    const drag = readItemTransfer(e);
    if (!drag || drag.source !== acceptFrom) return;
    applyItemTransfer(bag, e);
  }

  return (
    <div className={`cm-inv ${compact ? "cm-inv--compact" : ""}`}>
      <div className="cm-tabs cm-tabs--bag">
        {ITEM_BAG_TABS.map((t) => (
          <button key={t.id} type="button" className={`cm-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div
        className={`cm-inv-list ${dragOver ? "cm-inv-list--drop" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="cm-item-list cm-item-list--grid-3">
          {filtered.map((item) => (
            <ItemListRow
              key={item.id}
              item={item}
              profile={profile}
              bag={bag}
              showLevel={false}
              transferEnabled={transferEnabled}
              actionCtx={ctx}
              equipped={bag === "inventory" ? !!equippedSlotForItem(profile.equipped, item.id) : false}
              equippedSlot={bag === "inventory" ? equippedSlotForItem(profile.equipped, item.id) : undefined}
              selected={focus?.id === item.id}
              onClick={() => setFocus(item)}
            />
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <div key={`empty-${i}`} className="cm-item-slot-empty" aria-hidden="true" />
          ))}
        </div>
      </div>
    </div>
  );
}

function CharacterPane({ profile }: { profile: ProfileInfo }) {
  const [tab, setTab] = useState<"overview" | "jobs">("overview");
  const stats = profile.stats ?? { hp: 0, mp: 0, str: 0, mag: 0, agi: 0 };
  const xpPct = Math.min(100, (profile.xp / Math.max(profile.max_xp, 1)) * 100);
  const canSub = profile.level >= profile.subjob_unlock_level;
  const sortedJobs = [...(profile.jobs ?? [])].sort((a, b) => a.abbr.localeCompare(b.abbr));
  const subJobProgress = profile.jobs?.find((j) => j.id === profile.sub_job);

  return (
    <div className="cm-char">
      <div className="cm-char-head">
        <div>
          <div className="cm-char-name">{profile.name}</div>
          <div className="dim">
            {profile.race ? `${profile.race} · ` : ""}
            Lv {profile.level}
          </div>
        </div>
        <div className="cm-xp">
          <div className="ff-gauge-track">
            <div className="ff-gauge-fill xp" style={{ width: `${xpPct}%` }} />
            <span className="ff-gauge-text">
              EXP {profile.xp} / {profile.max_xp}
            </span>
          </div>
        </div>
      </div>

      <div className="cm-tabs">
        <button type="button" className={`cm-tab ${tab === "overview" ? "on" : ""}`} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button type="button" className={`cm-tab ${tab === "jobs" ? "on" : ""}`} onClick={() => setTab("jobs")}>
          Job Levels
        </button>
      </div>

      {tab === "overview" && (
        <>
          <div className="cm-char-jobs">
            <div className="cm-char-job">
              <span className="field-label">Main</span>
              <span className="cm-job-readout">{jobLabel(profile.main_job)} Lv{profile.level}</span>
            </div>
            <div className="cm-char-job">
              <span className="field-label">Sub</span>
              <span className="cm-job-readout">
                {profile.sub_job
                  ? `${jobLabel(profile.sub_job)} Lv${subJobProgress?.level ?? 1}`
                  : "None"}
              </span>
            </div>
          </div>
          {!canSub && <p className="hint">Sub job unlocks at main job level {profile.subjob_unlock_level}.</p>}
          <p className="hint">Visit a Class Master in the world to change classes.</p>

          <div className="cm-params">
            <Param label="HP" value={stats.hp} />
            <Param label="MP" value={stats.mp} />
            <Param label="STR" value={stats.str} />
            <Param label="MAG" value={stats.mag} />
            <Param label="AGI" value={stats.agi} />
          </div>
        </>
      )}

      {tab === "jobs" && (
        <div className="job-grid job-grid-compact cm-char-job-grid">
          {sortedJobs.map((j) => {
            const isMain = j.id === profile.main_job;
            const isSub = j.id === profile.sub_job;
            const unlocked = (profile.unlocked_jobs ?? []).includes(j.id);
            return (
              <div
                key={j.id}
                className={`job-card job-card--inline job-card--readout ${isMain || isSub ? "selected" : ""} ${!unlocked ? "locked" : ""}`}
              >
                <span className="job-swatch" style={{ background: jobColor(j.id) }} />
                <div className="job-card-body">
                  <span className="job-name" style={{ color: unlocked ? jobColor(j.id) : undefined }}>
                    {j.name}
                    {isMain ? " (Main)" : isSub ? " (Sub)" : ""}
                  </span>
                  <span className="job-level-meta dim">
                    {unlocked ? `Lv ${j.level} · ${j.xp}/${j.max_xp} EXP` : "Not unlocked"}
                  </span>
                </div>
                {!unlocked && <span className="job-lock dim">Locked</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Param({ label, value }: { label: string; value: number }) {
  return (
    <div className="cm-param">
      <span className="dim">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function previewWeaponForEquipment(profile: ProfileInfo, focus: Item | null): string | undefined {
  const equipped = mainWeaponTypeFromProfile(profile);
  if (!focus || focus.kind !== "equipment") return equipped;
  const slot = equippedSlotForItem(profile.equipped, focus.id) ?? focus.slot;
  if (slot === "weapon" && focus.type) return focus.type;
  return equipped;
}

function EquipmentPane({ profile }: { profile: ProfileInfo }) {
  const selfId = useGame((s) => s.selfId);
  const byId = new Map(profile.inventory.map((i) => [i.id, i]));
  const [focus, setFocus] = useState<Item | null>(null);
  const [armouryTab, setArmouryTab] = useState<ArmouryTabId>("weapon");

  const slots = equipSlotsForProfile(profile.sub_job);
  const previewWeapon = previewWeaponForEquipment(profile, focus);
  const previewAppearance = useMemo(
    () =>
      resolveCharacterAppearance({
        playerId: selfId ?? "",
        selfId,
        profile,
        race: profile.race,
        wire: profile.appearance,
        weapon: previewWeapon,
      }),
    [selfId, profile, previewWeapon],
  );
  const previewingWeapon = !!focus && previewWeapon !== mainWeaponTypeFromProfile(profile);
  const armouryItems = profile.inventory.filter(
    (i) => i.kind !== "consumable" && i.slot === armouryTab,
  );
  const armouryTabLabel = ARMOURY_TABS.find((t) => t.id === armouryTab)?.label ?? armouryTab;

  const dollSlot = (slotId: string, label: string) => {
    const enabled = slots.some((s) => s.id === slotId);
    const item = profile.equipped[slotId] ? byId.get(profile.equipped[slotId]) : undefined;
    return (
      <div key={slotId} className={`cm-doll-cell doll-${slotId}`}>
        <span className="cm-doll-label">{label}</span>
        <ItemSlot
          item={item}
          empty={slotId}
          emptyLabel={label}
          equipped={!!item}
          selected={focus?.id === item?.id}
          onClick={enabled && item ? () => setFocus(item) : undefined}
        />
      </div>
    );
  };

  return (
    <div className="cm-equip">
      <div className="cm-doll">
        <div className="cm-equip-preview">
          <CharacterPreviewAnimated appearance={previewAppearance} scale={1.25} />
          {previewingWeapon && <span className="cm-equip-preview-label">Preview</span>}
        </div>
        {dollSlot("weapon", "Main")}
        {dollSlot("sub_weapon", "Sub")}
        {dollSlot("head", "Head")}
        {dollSlot("back", "Back")}
        {dollSlot("chest", "Chest")}
        {dollSlot("legs", "Legs")}
        {dollSlot("hands", "Hands")}
        {dollSlot("feet", "Feet")}
      </div>
      <div className="cm-equip-side">
        <div className="cm-section-label">Armoury Chest</div>
        <div className="cm-tabs cm-equip-tabs">
          {ARMOURY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cm-tab ${armouryTab === t.id ? "on" : ""}`}
              onClick={() => {
                setArmouryTab(t.id);
                if (focus && focus.slot !== t.id) setFocus(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="cm-item-list">
          {armouryItems.map((item) => (
            <ItemListRow
              key={item.id}
              item={item}
              profile={profile}
              equipped={!!equippedSlotForItem(profile.equipped, item.id)}
              equippedSlot={equippedSlotForItem(profile.equipped, item.id)}
              selected={focus?.id === item.id}
              onClick={() => setFocus(item)}
            />
          ))}
          {armouryItems.length === 0 && (
            <p className="hint cm-item-list-empty">No {armouryTabLabel.toLowerCase()} gear in the armoury chest.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type ActionTab = "general" | string;

function jobTabs(profile: ProfileInfo): { id: string; label: string; color: string }[] {
  const tabs: { id: string; label: string; color: string }[] = [];
  if (profile.main_job) {
    tabs.push({ id: profile.main_job, label: `${jobLabel(profile.main_job)} (Main)`, color: jobColor(profile.main_job) });
  }
  if (profile.sub_job) {
    tabs.push({ id: profile.sub_job, label: `${jobLabel(profile.sub_job)} (Sub)`, color: jobColor(profile.sub_job) });
  }
  return tabs;
}

function SkillsPane({ profile }: { profile: ProfileInfo }) {
  const engaged = useGame((s) => {
    const self = s.selfId ? s.entities[s.selfId] : undefined;
    return self?.engaged ?? false;
  });
  const [tab, setTab] = useState<ActionTab>("general");
  const byId = new Map(profile.skills.map((s) => [s.id, s]));
  const tabs = jobTabs(profile);
  const activeJob = tab === "general" ? null : tab;
  const skills = activeJob
    ? profile.skills.filter((s) => s.job === activeJob)
    : profile.skills.filter((s) => s.id === "attack" || s.id === "capture" || s.id === "dodge" || s.world_only);
  const sections = activeJob
    ? [
        { title: "Battle Skills", skills: skills.filter((s) => !s.passive) },
        { title: "Passive Skills", skills: skills.filter((s) => s.passive) },
      ]
    : [
        { title: "Battle Skills", skills: skills.filter((s) => !s.world_only) },
        { title: "Field Skills", skills: skills.filter((s) => s.world_only) },
      ];

  return (
    <div className="cm-actions">
      <div className="cm-tabs">
        <button className={`cm-tab ${tab === "general" ? "on" : ""}`} onClick={() => setTab("general")}>
          General
        </button>
        {tabs.map((j) => (
          <button
            key={j.id}
            className={`cm-tab ${tab === j.id ? "on" : ""}`}
            style={tab === j.id ? { color: j.color, borderColor: j.color } : undefined}
            onClick={() => setTab(j.id)}
          >
            {j.label}
          </button>
        ))}
      </div>
      <p className="hint">
        {tab === "general"
          ? "Drag a skill onto the hotbar — drag a slot off the bar (or right-click it) to remove it. Double-click a field skill to use it. Dodge is bound to Shift while moving, not a hotbar slot."
          : "Skills unlock as your jobs level up. Drag them onto the hotbar — use them in combat to raise skill level."}
      </p>
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="cm-section-label">{section.title}</h3>
          <div className="cm-item-list cm-item-list--grid-3">
            {section.skills.map((sk) => (
              <SkillRow key={sk.id} sk={sk} byId={byId} engaged={engaged} />
            ))}
            {section.skills.length === 0 && (
              <p className="hint cm-item-list-empty">No {section.title.toLowerCase()} available.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Inventory-style row for a skill — details live in the hover tooltip.
 *  Locked rows stay interactive (no `disabled` attr) so tooltips still work. */
function SkillRow({
  sk,
  byId,
  engaged,
}: {
  sk: SkillInfo;
  byId: Map<string, SkillInfo>;
  engaged: boolean;
}) {
  const row = (
    <div className={`cm-item-row-wrap ${sk.unlocked ? "learned" : "locked"}`}>
      <button
        type="button"
        className="cm-item-row"
        aria-disabled={!sk.unlocked}
        draggable={sk.unlocked && !sk.passive}
        onDragStart={(e) => {
          if (!sk.unlocked || sk.passive) return;
          writeHotbarDrag(e, { kind: "skill", id: sk.id });
        }}
        onDoubleClick={() => {
          // Field skills fire straight from the list (return/port open their
          // picker dialogs inside activateWorldSkill); still combat-gated.
          if (sk.unlocked && sk.world_only && !sk.passive && !engaged) net.activateWorldSkill(sk.id);
        }}
      >
        <span className="cm-item-row-icon">
          <GameIcon
            src={
              sk.id === "attack"
                ? ICONS.attack
                : sk.id === "return" || sk.id === "port" || sk.id === "camp"
                  ? ICONS.skillUnlocked
                  : sk.unlocked
                    ? ICONS.skillUnlocked
                    : ICONS.skillLockedNode
            }
            alt=""
            size={20}
          />
        </span>
        <span className="cm-item-row-name">
          {sk.name}
          {sk.unlocked && sk.level > 0 ? ` Lv${sk.level}` : ""}
        </span>
        <span className={`cm-tree-tag ${sk.passive ? "passive" : sk.world_only ? "field" : "battle"}`}>
          {sk.passive ? "Passive" : sk.world_only ? "Field" : "Battle"}
        </span>
      </button>
    </div>
  );
  return (
    <HoverTooltip content={<SkillTooltipContent sk={sk} byId={byId} />}>
      {row}
    </HoverTooltip>
  );
}

function MapMenuGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden>
      <path
        fill="currentColor"
        d="M5 6.5 13 4l6 2.2L27 4v21.5L19 28l-6-2.2L5 28V6.5zm8 1.2v16.6l6 2V9.7l-6-2z"
      />
      <circle cx="16" cy="14" r="2.4" fill="#e8c96a" />
    </svg>
  );
}

export function WindowBar() {
  const toggle = useGame((s) => s.toggleWindow);
  const open = useGame((s) => s.openWindow);
  const keys: { id: WindowId; label: string; key: string; icon: string }[] = [
    { id: "character", label: "Character", key: "C", icon: ICONS.menuCharacter },
    { id: "equipment", label: "Equipment", key: "E", icon: ICONS.menuEquipment },
    { id: "inventory", label: "Inventory", key: "I", icon: ICONS.menuInventory },
    { id: "skills", label: "Actions", key: "K", icon: ICONS.menuSkills },
    { id: "social", label: "Social", key: "O", icon: ICONS.menuSocial },
    { id: "pets", label: "Pets", key: "P", icon: ICONS.menuInventory },
    { id: "map", label: "Map", key: "M", icon: "" },
  ];
  return (
    <div className="cm-mainmenu">
      {keys.map((b) => (
        <HoverTooltip key={b.id} content={`${b.label} [${b.key}]`}>
          <button
            type="button"
            className={`cm-menu-btn ${open === b.id || (open === "house_storage" && b.id === "inventory") ? "on" : ""}`}
            tabIndex={-1}
            onClick={() => toggle(b.id)}
            aria-label={b.label}
          >
            <span className="cm-menu-icon">
              {b.id === "map" ? <MapMenuGlyph /> : <GameIcon src={b.icon} alt="" size={32} />}
            </span>
          </button>
        </HoverTooltip>
      ))}
      <MainMenuTrigger />
    </div>
  );
}
