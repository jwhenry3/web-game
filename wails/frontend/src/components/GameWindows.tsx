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
  const onBackdrop = useBackdropDismiss(close);

  if (!open || !profile) return null;

  if (open === "house_storage") {
    return <HouseStorageWindows profile={profile} onClose={close} />;
  }

  return (
    <div className="cm-window-layer" onMouseDown={onBackdrop}>
      <DraggableWindowShell
        resetKey={open}
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
  const storage = house?.storage ?? [];
  const cap = house?.storage_capacity ?? 40;
  const self = house?.players.find((p) => p.name === profile.name);
  const tileSize = house?.tile_size ?? 32;
  const onBackdrop = useBackdropDismiss(onClose);

  if (!house?.is_owner) {
    return (
      <div className="cm-window-layer" onMouseDown={onBackdrop}>
        <DraggableWindowShell resetKey="house_storage_denied" title="House Storage" onClose={onClose}>
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
  const locked = useGame((s) => {
    const self = s.selfId ? s.players[s.selfId] : undefined;
    return self?.in_battle ?? s.screen === "battle";
  });
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
              locked={bag === "inventory" ? locked : false}
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
  const locked = useGame((s) => {
    const self = s.selfId ? s.players[s.selfId] : undefined;
    return self?.in_battle ?? s.screen === "battle";
  });
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
      {locked && <p className="hint">Gear cannot be changed while engaged.</p>}
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
              locked={locked}
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

type TreePos = { id: string; x: number; y: number };

const TREE_COL = 150;
const TREE_ROW = 108;

function layoutSkillTree(skills: SkillInfo[]): TreePos[] {
  const byParent = new Map<string, SkillInfo[]>();
  const roots: SkillInfo[] = [];
  for (const sk of skills) {
    if (!sk.prereq || !skills.some((s) => s.id === sk.prereq)) {
      roots.push(sk);
      continue;
    }
    const list = byParent.get(sk.prereq) ?? [];
    list.push(sk);
    byParent.set(sk.prereq, list);
  }

  const pos = new Map<string, TreePos>();
  let cursor = 0;
  const place = (sk: SkillInfo, depth: number): number => {
    const kids = byParent.get(sk.id) ?? [];
    if (kids.length === 0) {
      pos.set(sk.id, { id: sk.id, x: cursor, y: depth });
      cursor += 1;
      return pos.get(sk.id)!.x;
    }
    const xs = kids.map((k) => place(k, depth + 1));
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    pos.set(sk.id, { id: sk.id, x: mid, y: depth });
    return mid;
  };
  for (const root of roots) place(root, 0);
  return [...pos.values()];
}

function SkillsPane({ profile }: { profile: ProfileInfo }) {
  const locked = useGame((s) => {
    const self = s.selfId ? s.players[s.selfId] : undefined;
    return self?.in_battle ?? s.screen === "battle";
  });
  const [tab, setTab] = useState<ActionTab>("general");
  const [focusId, setFocusId] = useState<string | null>(null);
  const byId = new Map(profile.skills.map((s) => [s.id, s]));
  const tabs = jobTabs(profile);
  const activeJob = tab === "general" ? null : tab;
  const tree = activeJob
    ? profile.skills.filter((s) => s.job === activeJob)
    : profile.skills.filter((s) => s.id === "attack" || s.id === "capture" || s.world_only);
  const layout = useMemo(() => layoutSkillTree(tree), [tree]);
  const focus = (focusId && byId.get(focusId)) || tree[0];

  const maxX = layout.reduce((m, n) => Math.max(m, n.x), 0);
  const maxY = layout.reduce((m, n) => Math.max(m, n.y), 0);
  const width = Math.max(TREE_COL, (maxX + 1) * TREE_COL);
  const height = (maxY + 1) * TREE_ROW;

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
            onClick={() => {
              setTab(j.id);
              setFocusId(null);
            }}
          >
            {j.label}
          </button>
        ))}
      </div>
      <p className="hint">
        {tab === "general"
          ? "Attack and Capture are always available in battle. Return, Teleport, and Camp are used in the field. Drag skills onto the hotbar."
          : "Skills unlock as your jobs level up. Use them in battle to raise skill level."}
      </p>
      <div className="cm-tree" style={{ width, height }}>
        <svg className="cm-tree-links" width={width} height={height}>
          {tree.map((sk) => {
            if (!sk.prereq) return null;
            const a = layout.find((n) => n.id === sk.prereq);
            const b = layout.find((n) => n.id === sk.id);
            if (!a || !b) return null;
            const x1 = a.x * TREE_COL + 56;
            const y1 = a.y * TREE_ROW + 52;
            const x2 = b.x * TREE_COL + 56;
            const y2 = b.y * TREE_ROW + 8;
            return (
              <path
                key={`${sk.prereq}-${sk.id}`}
                d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                className={sk.unlocked ? "on" : ""}
              />
            );
          })}
        </svg>
        {layout.map((n) => {
          const sk = byId.get(n.id);
          if (!sk) return null;
          return (
            <SkillNode
              key={sk.id}
              sk={sk}
              byId={byId}
              selected={focus?.id === sk.id}
              style={{ left: n.x * TREE_COL, top: n.y * TREE_ROW }}
              onSelect={() => setFocusId(sk.id)}
            />
          );
        })}
      </div>
      {focus && <SkillDetail sk={focus} byId={byId} locked={locked} />}
    </div>
  );
}

function SkillNode({
  sk,
  byId,
  selected,
  style,
  onSelect,
}: {
  sk: SkillInfo;
  byId: Map<string, SkillInfo>;
  selected: boolean;
  style: { left: number; top: number };
  onSelect: () => void;
}) {
  const prereqMet = !sk.prereq || !!byId.get(sk.prereq)?.unlocked;
  const node = (
    <button
      type="button"
      className={`cm-tree-node ${sk.unlocked ? "learned" : ""} ${selected ? "selected" : ""} ${!prereqMet ? "locked" : ""}`}
      style={style}
      draggable={sk.unlocked}
      onDragStart={(e) => {
        if (!sk.unlocked) return;
        writeHotbarDrag(e, { kind: "skill", id: sk.id });
      }}
      onClick={onSelect}
    >
      <span className={`cm-slot ${sk.unlocked ? "equipped" : "empty"}`}>
        <span className="cm-slot-glyph">
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
            size={16}
          />
        </span>
      </span>
      <span className="cm-tree-name">
        {sk.name}
        {sk.unlocked && sk.level > 0 ? ` Lv${sk.level}` : ""}
      </span>
    </button>
  );
  return (
    <HoverTooltip content={<SkillTooltipContent sk={sk} byId={byId} />}>
      {node}
    </HoverTooltip>
  );
}

function SkillDetail({
  sk,
  byId,
  locked,
}: {
  sk: SkillInfo;
  byId: Map<string, SkillInfo>;
  locked: boolean;
}) {
  const prereq = sk.prereq ? byId.get(sk.prereq) : undefined;
  const atMax = sk.unlocked && sk.level >= sk.max_level;
  const usage = sk.usage ?? 0;
  const toNext = sk.usage_to_next ?? 0;
  return (
    <div className="cm-detail cm-tree-detail">
      <div className="cm-detail-name">{sk.name}</div>
      <div className="cm-detail-meta">
        {sk.world_only
          ? "Field skill · 0 MP"
          : sk.id === "attack"
            ? "0 MP · uses GCD"
            : `${sk.mp_cost} MP${sk.weapon_req ? ` · ${sk.weapon_req}` : ""}`}
        {!sk.world_only && sk.id !== "attack" && (
          <>
            {" "}
            · Lv {sk.unlocked ? sk.level : 0}/{sk.max_level}
            {!sk.unlocked ? ` · unlocks at job Lv ${sk.unlock_level}` : ""}
          </>
        )}
        {!sk.unlocked && sk.prereq ? ` · requires ${prereq?.name ?? sk.prereq}` : ""}
        {sk.unlocked && !sk.world_only && !atMax && toNext > 0 ? ` · ${usage} / ${toNext} uses` : ""}
        {sk.unlocked && !sk.world_only && usage > 0 && atMax ? ` · ${usage} uses` : ""}
      </div>
      <div className="dim">{sk.description}</div>
      <div className="cm-detail-actions">
        {sk.world_only && sk.unlocked ? (
          <>
            <span className="dim">Drag onto the hotbar or use now in the field.</span>
            <button
              type="button"
              className="cm-btn gold"
              disabled={locked}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (sk.id === "return" || sk.id === "port") {
                  useGame.getState().openWorldSkillDialog(sk.id);
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                net.activateWorldSkill(sk.id);
              }}
            >
              Use
            </button>
          </>
        ) : !sk.unlocked ? (
          <span className="dim">Level your job to unlock this action.</span>
        ) : atMax ? (
          <span className="dim">Max level. Drag onto the hotbar.</span>
        ) : (
          <span className="dim">{locked ? "Train through battle use." : "Use in battle to level up."}</span>
        )}
      </div>
    </div>
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
