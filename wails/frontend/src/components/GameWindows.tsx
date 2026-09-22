import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { CharacterPreview3D } from "../characters/CharacterPreview3D";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import {
  equipSlotsForProfile,
  equippedArmorClassFromProfile,
  equippedSlotForItem,
  ARMOR_SLOTS,
  ALL_JOBS,
  ARMOURY_TABS,
  ARMOR_CLASSES,
  armorClassLabel,
  WEAPONS,
  type ArmouryTabId,
  jobColor,
  jobLabel,
  mainWeaponTypeFromProfile,
  PROFICIENCY_GROUPS,
  PROF_MAX_LEVEL,
  JOB_MAX_LEVEL,
  proficiencyLabel,
  type Item,
  type ProfileInfo,
  type SkillInfo,
  type WindowId,
} from "../types";
import { GameIcon } from "../ui/GameIcon";
import { JobIdentityBadges, ROLE_COLORS, WeaponTypeIcon, roleLabel, weaponLabel } from "../ui/JobIdentity";
import { skillIconSrc } from "../ui/itemDisplay";
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
  equipment: "Character",
  inventory: "Character",
  skills: "Character",
  social: "Social",
  map: "Map",
  house_storage: "House Storage",
  pets: "Character",
};

// The single Character window: every tab is a WindowId so the existing
// hotkeys (C/K/E/I/P) and toggleWindow semantics switch tabs for free.
const CHAR_TABS: { id: WindowId; label: string; key: string; icon: string }[] = [
  { id: "character", label: "About", key: "C", icon: ICONS.menuCharacter },
  { id: "skills", label: "Actions", key: "K", icon: ICONS.menuSkills },
  { id: "equipment", label: "Equipment", key: "E", icon: ICONS.menuEquipment },
  { id: "inventory", label: "Inventory", key: "I", icon: ICONS.menuInventory },
  { id: "pets", label: "Pets", key: "P", icon: "/assets/enemies/dire_wolf_icon.png" },
];

const CHAR_TAB_IDS = CHAR_TABS.map((t) => t.id);

export function isCharWindowTab(open: WindowId | null): boolean {
  return open !== null && CHAR_TAB_IDS.includes(open);
}

export function GameWindows() {
  const open = useGame((s) => s.openWindow);
  const close = useGame((s) => s.closeWindow);
  const select = useGame((s) => s.selectWindow);
  const profile = useGame((s) => s.profile);
  const screen = useGame((s) => s.screen);
  const uiScale = useGame((s) => s.options.uiScale);
  const onBackdrop = useBackdropDismiss(close);

  if (!open || !profile) return null;

  if (open === "house_storage") {
    return <HouseStorageWindows profile={profile} onClose={close} />;
  }

  if (isCharWindowTab(open)) {
    return (
      <div className="cm-window-layer" onMouseDown={onBackdrop}>
        <DraggableWindowShell
          resetKey="character"
          scale={uiScaleFactor(uiScale, windowScaleKey("character"))}
          className="cm-window cm-window--charwin"
          title="Character"
          onClose={close}
          bodyClassName="cm-body cm-body--charwin"
        >
          <div className="cm-charwin">
            <nav className="cm-charwin-tabs">
              {CHAR_TABS.map((t) => (
                <HoverTooltip key={t.id} content={`${t.label} [${t.key}]`}>
                  <button
                    type="button"
                    className={`cm-charwin-tab ${open === t.id ? "on" : ""}`}
                    onClick={() => select(t.id)}
                    aria-label={t.label}
                  >
                    <GameIcon src={t.icon} alt="" size={22} />
                    <span className="cm-charwin-tab-label">{t.label}</span>
                  </button>
                </HoverTooltip>
              ))}
            </nav>
            <div className="cm-charwin-content">
              {open === "character" && <CharacterPane profile={profile} />}
              {open === "skills" && <SkillsPane profile={profile} />}
              {open === "equipment" && <EquipmentPane profile={profile} />}
              {open === "inventory" && (
                <BagPane
                  profile={profile}
                  bag="inventory"
                  items={profile.inventory}
                  transferEnabled={screen === "house"}
                />
              )}
              {open === "pets" && <PetsPane profile={profile} />}
            </div>
          </div>
        </DraggableWindowShell>
      </div>
    );
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
        {open === "social" && <SocialPane />}
        {open === "map" && <MapWindow />}
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
        <div className="cm-prof-list cm-prof-cols">
          {filtered.map((item) => (
            <ItemListRow
              key={item.id}
              item={item}
              profile={profile}
              bag={bag}
              transferEnabled={transferEnabled}
              actionCtx={ctx}
              equipped={bag === "inventory" ? !!equippedSlotForItem(profile.equipped, item.id) : false}
              equippedSlot={bag === "inventory" ? equippedSlotForItem(profile.equipped, item.id) : undefined}
              selected={focus?.id === item.id}
              onClick={() => setFocus(item)}
            />
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <div key={`empty-${i}`} className="cm-item-empty" aria-hidden="true" />
          ))}
        </div>
      </div>
    </div>
  );
}

function CharacterPane({ profile }: { profile: ProfileInfo }) {
  const [tab, setTab] = useState<"overview" | "jobs" | "profs">("overview");
  const stats = profile.stats ?? { hp: 0, mp: 0, str: 0, mag: 0, agi: 0 };
  const xpPct = Math.min(100, (profile.xp / Math.max(profile.max_xp, 1)) * 100);
  const canSub = profile.level >= profile.subjob_unlock_level;
  const sortedJobs = [...(profile.jobs ?? [])].sort((a, b) => a.abbr.localeCompare(b.abbr));
  const subJobProgress = profile.jobs?.find((j) => j.id === profile.sub_job);
  // Classes grouped by role (tank → healer → support → dps); jobs whose role
  // isn't in ALL_JOBS land in a trailing "other" group.
  const jobRoleGroups = (() => {
    const ROLE_ORDER = ["tank", "healer", "support", "dps"];
    const byRole = new Map<string, typeof sortedJobs>();
    for (const j of sortedJobs) {
      const role = ALL_JOBS.find((x) => x.id === j.id)?.role ?? "other";
      const g = byRole.get(role);
      if (g) g.push(j);
      else byRole.set(role, [j]);
    }
    const rank = (r: string) => {
      const i = ROLE_ORDER.indexOf(r);
      return i === -1 ? ROLE_ORDER.length : i;
    };
    return [...byRole.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  })();

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
        <button type="button" className={`cm-tab ${tab === "profs" ? "on" : ""}`} onClick={() => setTab("profs")}>
          Proficiencies
        </button>
      </div>

      {tab === "overview" && (
        <>
          <div className="cm-char-jobs">
            <div className="cm-char-job">
              <span className="field-label">Main</span>
              <span className="cm-job-readout">
                {jobLabel(profile.main_job)} Lv{profile.level}
                <JobIdentityBadges jobId={profile.main_job} />
              </span>
            </div>
            <div className="cm-char-job">
              <span className="field-label">Sub</span>
              <span className="cm-job-readout">
                {profile.sub_job
                  ? `${jobLabel(profile.sub_job)} Lv${subJobProgress?.level ?? 1}`
                  : "None"}
                {profile.sub_job && <JobIdentityBadges jobId={profile.sub_job} />}
              </span>
            </div>
          </div>
          {!canSub && <p className="hint">Sub job unlocks at main job level {profile.subjob_unlock_level}.</p>}
          <p className="hint">Visit a Class Master in the world to change classes.</p>

          <div className="cm-params">
            <Param label="HP" value={stats.hp} />
            <Param label="MP" value={stats.mp} />
            <Param label="STR" value={stats.str} />
            <Param label="DEX" value={stats.dex} />
            <Param label="VIT" value={stats.vit} />
            <Param label="INT" value={stats.int} />
            <Param label="MD" value={stats.md} />
          </div>
        </>
      )}

      {tab === "jobs" && (
        <div className="cm-char-job-groups">
          {jobRoleGroups.map(([role, jobs]) => (
            <div key={role} className="cm-armoury-group">
              <div className="cm-armoury-group-head">
                <span className="cm-job-role-dot" style={{ background: ROLE_COLORS[role] }} />
                {roleLabel(role)}
              </div>
              <div className="cm-prof-list cm-job-list">
                {jobs.map((j) => {
                  const isMain = j.id === profile.main_job;
                  const isSub = j.id === profile.sub_job;
                  const unlocked = (profile.unlocked_jobs ?? []).includes(j.id);
                  const maxed = j.level >= JOB_MAX_LEVEL;
                  const pct = !unlocked
                    ? 0
                    : maxed
                      ? 100
                      : Math.min(100, (j.xp / Math.max(j.max_xp, 1)) * 100);
                  return (
                    <div
                      key={j.id}
                      className={`cm-prof-row cm-job-row${isMain || isSub ? " selected" : ""}${unlocked ? "" : " untrained"}`}
                      title={
                        !unlocked
                          ? `${j.name} — locked`
                          : maxed
                            ? `${j.name} — max level`
                            : `${j.name} ${j.xp} / ${j.max_xp} EXP`
                      }
                    >
                      <JobIdentityBadges jobId={j.id} iconOnly />
                      <span className="cm-prof-name cm-job-name">
                        {j.name}
                        {isMain ? " (Main)" : isSub ? " (Sub)" : ""}
                      </span>
                      <span className="cm-prof-bar">
                        <span className="cm-prof-fill" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="cm-prof-level">
                        {!unlocked ? "Locked" : maxed ? "MAX" : `Lv${j.level}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "profs" && (
        <div className="cm-char-prof-groups">
          {PROFICIENCY_GROUPS.map((g) => (
            <div key={g.label} className="cm-armoury-group">
              <div className="cm-armoury-group-head">{g.label}</div>
              <div className="cm-prof-list">
                {g.profs.map((pid) => <ProfRow key={pid} pid={pid} profile={profile} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One proficiency row — name, growth bar, level. Shared by the character
 *  window's Proficiencies tab and the Actions window's class summary. */
function ProfRow({ pid, profile }: { pid: string; profile: ProfileInfo }) {
  const lvl = profile.prof_levels?.[pid] ?? 0;
  const maxed = lvl >= PROF_MAX_LEVEL;
  const pct = maxed
    ? 100
    : Math.min(100, ((profile.prof_exp?.[pid] ?? 0) / ((lvl + 1) * 100)) * 100);
  return (
    <div
      className={`cm-prof-row${lvl === 0 ? " untrained" : ""}`}
      title={maxed ? `${proficiencyLabel(pid)} — max level` : `${proficiencyLabel(pid)} ${(profile.prof_exp?.[pid] ?? 0) / 100} / ${lvl + 1} growth`}
    >
      <span className="cm-prof-name">{proficiencyLabel(pid)}</span>
      <span className="cm-prof-bar">
        <span className="cm-prof-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="cm-prof-level">{maxed ? "MAX" : `Lv${lvl}`}</span>
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

function previewArmorClassForEquipment(profile: ProfileInfo, focus: Item | null): string {
  // "" = unarmored (base tunic); mirroring previewWeaponForEquipment.
  const equipped = equippedArmorClassFromProfile(profile) ?? "";
  if (!focus || focus.kind !== "equipment") return equipped;
  const slot = equippedSlotForItem(profile.equipped, focus.id) ?? focus.slot;
  if (slot && (ARMOR_SLOTS as readonly string[]).includes(slot) && focus.type) return focus.type;
  return equipped;
}

function previewWeaponForEquipment(profile: ProfileInfo, focus: Item | null): string {
  // "" = unarmed (bare hands); undefined would fall back to the base
  // appearance's weapon in resolveCharacterAppearance.
  const equipped = mainWeaponTypeFromProfile(profile) ?? "";
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
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  // Unequipping the focused item drops the preview back to the live loadout —
  // otherwise focus.slot keeps rendering the just-removed gear.
  const prevEquippedRef = useRef(profile.equipped);
  useEffect(() => {
    const prev = prevEquippedRef.current;
    prevEquippedRef.current = profile.equipped;
    if (focus && equippedSlotForItem(prev, focus.id) && !equippedSlotForItem(profile.equipped, focus.id)) {
      setFocus(null);
    }
  }, [profile.equipped, focus]);

  const slots = equipSlotsForProfile(profile.sub_job);
  const previewWeapon = previewWeaponForEquipment(profile, focus);
  const previewArmorClass = previewArmorClassForEquipment(profile, focus);
  const previewAppearance = useMemo(
    () =>
      resolveCharacterAppearance({
        playerId: selfId ?? "",
        selfId,
        profile,
        race: profile.race,
        wire: profile.appearance,
        weapon: previewWeapon,
        armorClass: previewArmorClass,
      }),
    [selfId, profile, previewWeapon, previewArmorClass],
  );
  const previewingWeapon =
    !!focus && previewWeapon !== (mainWeaponTypeFromProfile(profile) ?? "");
  const armouryItems = profile.inventory.filter(
    (i) => i.kind !== "consumable" && i.slot === armouryTab,
  );
  const armouryTabLabel = ARMOURY_TABS.find((t) => t.id === armouryTab)?.label ?? armouryTab;

  // Every tab splits into type groups: weapons by weapon type, armor by
  // weight class. Items keep inventory order within a group and groups
  // follow the canonical WEAPONS / ARMOR_CLASSES ordering (unknowns last).
  const armouryGroups = (() => {
    const order: string[] = armouryTab === "weapon" ? WEAPONS.map((w) => w.id) : ARMOR_CLASSES.map((c) => c.id);
    const byType = new Map<string, Item[]>();
    for (const i of armouryItems) {
      const t = i.type ?? "";
      const list = byType.get(t);
      if (list) list.push(i);
      else byType.set(t, [i]);
    }
    const rank = (t: string) => {
      const idx = order.indexOf(t);
      return idx === -1 ? order.length : idx;
    };
    return [...byType.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([type, items]) => ({ type, items }));
  })();

  const renderArmouryRow = (item: Item) => (
    <ItemListRow
      key={item.id}
      item={item}
      profile={profile}
      equipped={!!equippedSlotForItem(profile.equipped, item.id)}
      equippedSlot={equippedSlotForItem(profile.equipped, item.id)}
      selected={focus?.id === item.id}
      actionCtx={{ activeSlot: activeSlot ?? undefined }}
      onClick={() => setFocus(item)}
    />
  );

  const dollSlot = (slotId: string, label: string) => {
    const enabled = slots.some((s) => s.id === slotId);
    const item = profile.equipped[slotId] ? byId.get(profile.equipped[slotId]) : undefined;
    // The armoury chest has no sub_weapon tab — sub weapons live under Weapon.
    const tabId = (slotId === "sub_weapon" ? "weapon" : slotId) as ArmouryTabId;
    return (
      <div
        key={slotId}
        className={`cm-doll-cell doll-${slotId} ${activeSlot === slotId ? "active" : ""}`}
      >
        <span className="cm-doll-label">{label}</span>
        <ItemSlot
          item={item}
          empty={slotId}
          emptyLabel={label}
          equipped={!!item}
          selected={focus?.id === item?.id}
          onClick={
            enabled
              ? () => {
                  setArmouryTab(tabId);
                  setActiveSlot((cur) => (cur === slotId ? null : slotId));
                  if (item) setFocus(item);
                  else if (focus && focus.slot !== tabId) setFocus(null);
                }
              : undefined
          }
        />
      </div>
    );
  };

  return (
    <div className="cm-equip">
      <div className="cm-doll">
        <div className="cm-equip-preview">
          <CharacterPreview3D appearance={previewAppearance} width={150} height={170} walking={false} />
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
        <div className="cm-prof-list cm-prof-scroll">
          {armouryGroups.map((g) => (
            <div key={g.type} className="cm-armoury-group">
              <div className="cm-armoury-group-head">
                {armouryTab === "weapon" ? (
                  <>
                    <WeaponTypeIcon type={g.type} size={13} />
                    {weaponLabel(g.type)}
                  </>
                ) : (
                  armorClassLabel(g.type)
                )}
              </div>
              {g.items.map(renderArmouryRow)}
            </div>
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
  const activeJobLevel = activeJob
    ? (profile.jobs?.find((j) => j.id === activeJob)?.level ?? 1)
    : undefined;
  // Proficiencies this class trains — shown as their own summary under the
  // skill lists so action rows can show unlock levels instead.
  const classProfs = activeJob
    ? [...new Set(skills.map((s) => s.proficiency).filter((p): p is string => !!p))].sort(
        (a, b) =>
          (PROFICIENCY_GROUPS.flatMap((g) => g.profs).indexOf(a) + 100) -
            (PROFICIENCY_GROUPS.flatMap((g) => g.profs).indexOf(b) + 100) ||
          a.localeCompare(b),
      )
    : [];

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
          <div className="cm-prof-list cm-prof-cols">
            {section.skills.map((sk) => (
              <SkillRow key={sk.id} sk={sk} byId={byId} engaged={engaged} jobLevel={activeJobLevel} />
            ))}
            {section.skills.length === 0 && (
              <p className="hint cm-item-list-empty">No {section.title.toLowerCase()} available.</p>
            )}
          </div>
        </section>
      ))}
      {activeJob && classProfs.length > 0 && (
        <section>
          <h3 className="cm-section-label">Proficiencies</h3>
          <div className="cm-prof-list cm-prof-cols">
            {classProfs.map((pid) => (
              <ProfRow key={pid} pid={pid} profile={profile} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Inventory-style row for a skill — details live in the hover tooltip.
 *  Locked rows stay interactive (no `disabled` attr) so tooltips still work. */
function SkillRow({
  sk,
  byId,
  engaged,
  jobLevel,
}: {
  sk: SkillInfo;
  byId: Map<string, SkillInfo>;
  engaged: boolean;
  /** Set on class tabs — rows then show the job level the action unlocks at
   *  instead of the action's own proficiency level. */
  jobLevel?: number;
}) {
  const onClassTab = jobLevel !== undefined;
  const levelText = onClassTab
    ? `Lv${sk.unlock_level}`
    : !sk.unlocked
      ? `Lv${sk.unlock_level}`
      : sk.level >= sk.max_level
        ? "MAX"
        : `Lv${sk.level}`;
  const row = (
    <div className={`cm-item-row-wrap ${sk.unlocked ? "learned" : "locked"}`}>
      <button
        type="button"
        className="cm-item-row cm-prof-row"
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
          <GameIcon src={skillIconSrc(sk.id, sk.unlocked)} alt="" size={20} />
        </span>
        <span className="cm-prof-name">{sk.name}</span>
        <span className={`cm-prof-level${sk.unlocked ? "" : " locked"}`}>
          {levelText}
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
    { id: "social", label: "Social", key: "O", icon: ICONS.menuSocial },
    { id: "map", label: "Map", key: "M", icon: "" },
  ];
  return (
    <div className="cm-mainmenu">
      {keys.map((b) => (
        <HoverTooltip key={b.id} content={`${b.label} [${b.key}]`}>
          <button
            type="button"
            className={`cm-menu-btn ${
              (b.id === "character" && (isCharWindowTab(open) || open === "house_storage")) || open === b.id ? "on" : ""
            }`}
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
