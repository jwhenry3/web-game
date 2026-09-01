import { useState } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { equipSlotsForProfile, equippedSlotForItem, jobColor, jobLabel, type Item, type ProfileInfo, type SkillInfo, type WindowId } from "../types";
import { GameIcon } from "../ui/GameIcon";
import { ICONS } from "../ui/icons";
import { HoverTooltip } from "../ui/HoverTooltip";
import { SkillTooltipContent } from "../ui/tooltipContent";
import { writeHotbarDrag } from "../ui/hotbarDrag";
import { ItemDetail, ItemSlot } from "./ItemBits";
import { SocialPane } from "./SocialPane";
import { MainMenuTrigger } from "./MainMenu";

const TITLES: Record<WindowId, string> = {
  character: "Character",
  equipment: "Equipment",
  inventory: "Inventory",
  skills: "Actions & Traits",
  social: "Social",
};

export function GameWindows() {
  const open = useGame((s) => s.openWindow);
  const close = useGame((s) => s.closeWindow);
  const profile = useGame((s) => s.profile);
  if (!open || !profile) return null;

  return (
    <div className="xiv-window-layer" onMouseDown={close}>
      <div className="xiv-window" onMouseDown={(e) => e.stopPropagation()}>
        <div className="xiv-titlebar">
          <span className="xiv-title">{TITLES[open]}</span>
          <button className="xiv-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <div className="xiv-body">
          {open === "character" && <CharacterPane profile={profile} />}
          {open === "equipment" && <EquipmentPane profile={profile} />}
          {open === "inventory" && <InventoryPane profile={profile} />}
          {open === "skills" && <SkillsPane profile={profile} />}
          {open === "social" && <SocialPane />}
        </div>
      </div>
    </div>
  );
}

function CharacterPane({ profile }: { profile: ProfileInfo }) {
  const locked = useGame((s) => {
    const self = s.selfId ? s.players[s.selfId] : undefined;
    return self?.in_battle ?? s.screen === "battle";
  });
  const stats = profile.stats ?? { hp: 0, mp: 0, str: 0, mag: 0, agi: 0 };
  const xpPct = Math.min(100, (profile.xp / Math.max(profile.max_xp, 1)) * 100);
  const canSub = profile.level >= profile.subjob_unlock_level;
  const sortedJobs = [...(profile.jobs ?? [])].sort((a, b) => a.abbr.localeCompare(b.abbr));

  return (
    <div className="xiv-char">
      <div className="xiv-char-head">
        <div>
          <div className="xiv-char-name">{profile.name}</div>
          <div className="dim">
            {profile.race ? `${profile.race} · ` : ""}
            {profile.main_job}
            {profile.sub_job ? ` / ${profile.sub_job}` : ""} · Lv {profile.level}
          </div>
        </div>
        <div className="xiv-xp">
          <div className="ff-gauge-track">
            <div className="ff-gauge-fill xp" style={{ width: `${xpPct}%` }} />
            <span className="ff-gauge-text">
              EXP {profile.xp} / {profile.max_xp}
            </span>
          </div>
        </div>
      </div>

      <div className="xiv-section-label">Job Combo</div>
      <p className="hint">Equipment, skills, and hotbar are saved per main/sub combo.</p>
      <div className="xiv-job-row">
        <label className="field-label">Main</label>
        <select
          className="xiv-input"
          value={profile.main_job}
          disabled={locked}
          onChange={(e) => {
            const next = e.target.value;
            const sub = profile.sub_job === next ? "" : profile.sub_job;
            net.setJobs(next, sub);
          }}
        >
          {sortedJobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.abbr} Lv{j.level}
            </option>
          ))}
        </select>
      </div>
      <div className="xiv-job-row">
        <label className="field-label">Sub</label>
        <select
          className="xiv-input"
          value={profile.sub_job}
          disabled={locked || !canSub}
          onChange={(e) => net.setJobs(profile.main_job, e.target.value)}
        >
          <option value="">None</option>
          {sortedJobs
            .filter((j) => j.id !== profile.main_job)
            .map((j) => (
              <option key={j.id} value={j.id}>
                {j.abbr} Lv{j.level}
              </option>
            ))}
        </select>
      </div>
      {!canSub && <p className="hint">Sub job unlocks at main job level {profile.subjob_unlock_level}.</p>}

      <div className="xiv-params">
        <Param label="HP" value={stats.hp} />
        <Param label="MP" value={stats.mp} />
        <Param label="STR" value={stats.str} />
        <Param label="MAG" value={stats.mag} />
        <Param label="AGI" value={stats.agi} />
      </div>
      <div className="xiv-section-label">Job Levels</div>
      {sortedJobs
        .filter((j) => j.level > 1 || j.id === profile.main_job || j.id === profile.sub_job)
        .map((j) => (
          <div key={j.id} className="xiv-spec-row">
            <span style={{ color: jobColor(j.id) }}>{j.abbr}</span>
            <span>Lv {j.level}</span>
            <span className="dim">
              {j.xp}/{j.max_xp} EXP
            </span>
          </div>
        ))}
    </div>
  );
}

function Param({ label, value }: { label: string; value: number }) {
  return (
    <div className="xiv-param">
      <span className="dim">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EquipmentPane({ profile }: { profile: ProfileInfo }) {
  const locked = useGame((s) => {
    const self = s.selfId ? s.players[s.selfId] : undefined;
    return self?.in_battle ?? s.screen === "battle";
  });
  const byId = new Map(profile.inventory.map((i) => [i.id, i]));
  const [focus, setFocus] = useState<Item | null>(null);

  const slots = equipSlotsForProfile(profile.sub_job);

  return (
    <div className="xiv-equip">
      {locked && <p className="hint">Gear cannot be changed while engaged.</p>}
      <div className="xiv-doll">
        {slots.map((slot) => {
          const item = profile.equipped[slot.id] ? byId.get(profile.equipped[slot.id]) : undefined;
          const label = slot.id === "sub_weapon" ? "Sub" : slot.id === "weapon" ? "Main" : slot.label;
          return (
            <div key={slot.id} className={`xiv-doll-cell doll-${slot.id}`}>
              <span className="xiv-doll-label">{label}</span>
              <ItemSlot
                item={item}
                empty={slot.id}
                emptyLabel={label}
                equipped={!!item}
                selected={focus?.id === item?.id}
                onClick={() => item && setFocus(item)}
              />
            </div>
          );
        })}
      </div>
      <div className="xiv-equip-side">
        {focus ? (
          <ItemDetail
            item={focus}
            profile={profile}
            equippedSlot={equippedSlotForItem(profile.equipped, focus.id)}
            locked={locked}
          />
        ) : (
          <p className="hint">Select a slot to inspect gear.</p>
        )}
        <div className="xiv-section-label">Armoury Chest</div>
        <div className="xiv-slot-grid">
          {profile.inventory
            .filter((i) => i.kind !== "consumable" && i.slot && !equippedSlotForItem(profile.equipped, i.id))
            .map((item) => (
              <ItemSlot
                key={item.id}
                item={item}
                selected={focus?.id === item.id}
                onClick={() => setFocus(item)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function InventoryPane({ profile }: { profile: ProfileInfo }) {
  const locked = useGame((s) => {
    const self = s.selfId ? s.players[s.selfId] : undefined;
    return self?.in_battle ?? s.screen === "battle";
  });
  const [tab, setTab] = useState<"all" | "gear" | "items">("all");
  const [focus, setFocus] = useState<Item | null>(profile.inventory[0] ?? null);
  const items = profile.inventory.filter((i) => {
    if (tab === "gear") return i.kind !== "consumable";
    if (tab === "items") return i.kind === "consumable";
    return true;
  });

  return (
    <div className="xiv-inv">
      <div className="xiv-tabs">
        {(["all", "gear", "items"] as const).map((t) => (
          <button key={t} className={`xiv-tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "all" ? "All" : t === "gear" ? "Gear" : "Items"}
          </button>
        ))}
      </div>
      <div className="xiv-inv-split">
        <div className="xiv-slot-grid">
          {items.map((item) => (
            <ItemSlot
              key={item.id}
              item={item}
              equipped={!!equippedSlotForItem(profile.equipped, item.id)}
              selected={focus?.id === item.id}
              onClick={() => setFocus(item)}
            />
          ))}
          {items.length === 0 && <p className="hint">No items in this tab.</p>}
        </div>
        {focus && (
          <ItemDetail
            item={focus}
            profile={profile}
            equippedSlot={equippedSlotForItem(profile.equipped, focus.id)}
            locked={locked}
          />
        )}
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
    : profile.skills.filter((s) => s.id === "attack");
  const layout = layoutSkillTree(tree);
  const focus = (focusId && byId.get(focusId)) || tree[0];

  const maxX = layout.reduce((m, n) => Math.max(m, n.x), 0);
  const maxY = layout.reduce((m, n) => Math.max(m, n.y), 0);
  const width = Math.max(TREE_COL, (maxX + 1) * TREE_COL);
  const height = (maxY + 1) * TREE_ROW;

  return (
    <div className="xiv-actions">
      <div className="xiv-tabs">
        <button className={`xiv-tab ${tab === "general" ? "on" : ""}`} onClick={() => setTab("general")}>
          General
        </button>
        {tabs.map((j) => (
          <button
            key={j.id}
            className={`xiv-tab ${tab === j.id ? "on" : ""}`}
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
          ? "Auto-attack swings on its own timer and does not spend the GCD. Drag it onto the hotbar."
          : "Skills unlock as your jobs level up. Use them in battle to raise skill level."}
      </p>
      <div className="xiv-tree" style={{ width, height }}>
        <svg className="xiv-tree-links" width={width} height={height}>
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
      className={`xiv-tree-node ${sk.unlocked ? "learned" : ""} ${selected ? "selected" : ""} ${!prereqMet ? "locked" : ""}`}
      style={style}
      draggable={sk.unlocked}
      onDragStart={(e) => {
        if (!sk.unlocked) return;
        writeHotbarDrag(e, { kind: "skill", id: sk.id });
      }}
      onClick={onSelect}
    >
      <span className={`xiv-slot ${sk.unlocked ? "equipped" : "empty"}`}>
        <span className="xiv-slot-glyph">
          <GameIcon
            src={
              sk.id === "attack"
                ? ICONS.attack
                : sk.unlocked
                  ? ICONS.skillUnlocked
                  : ICONS.skillLockedNode
            }
            alt=""
            size={16}
          />
        </span>
      </span>
      <span className="xiv-tree-name">
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
    <div className="xiv-detail xiv-tree-detail">
      <div className="xiv-detail-name">{sk.name}</div>
      <div className="xiv-detail-meta">
        {sk.id === "attack"
          ? "Toggle · own timer"
          : `${sk.mp_cost} MP${sk.weapon_req ? ` · ${sk.weapon_req}` : ""}`}
        {sk.id !== "attack" && (
          <>
            {" "}
            · Lv {sk.unlocked ? sk.level : 0}/{sk.max_level}
            {!sk.unlocked ? ` · unlocks at job Lv ${sk.unlock_level}` : ""}
          </>
        )}
        {!sk.unlocked && sk.prereq ? ` · requires ${prereq?.name ?? sk.prereq}` : ""}
        {sk.unlocked && !atMax && toNext > 0 ? ` · ${usage} / ${toNext} uses` : ""}
        {sk.unlocked && usage > 0 && atMax ? ` · ${usage} uses` : ""}
      </div>
      <div className="dim">{sk.description}</div>
      <div className="xiv-detail-actions">
        {!sk.unlocked ? (
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

export function WindowBar() {
  const toggle = useGame((s) => s.toggleWindow);
  const open = useGame((s) => s.openWindow);
  const keys: { id: WindowId; label: string; key: string; icon: string }[] = [
    { id: "character", label: "Character", key: "C", icon: ICONS.menuCharacter },
    { id: "equipment", label: "Equipment", key: "E", icon: ICONS.menuEquipment },
    { id: "inventory", label: "Inventory", key: "I", icon: ICONS.menuInventory },
    { id: "skills", label: "Actions", key: "K", icon: ICONS.menuSkills },
    { id: "social", label: "Social", key: "O", icon: ICONS.menuSocial },
  ];
  return (
    <div className="xiv-mainmenu">
      {keys.map((b) => (
        <HoverTooltip key={b.id} content={`${b.label} [${b.key}]`}>
          <button
            type="button"
            className={`xiv-menu-btn ${open === b.id ? "on" : ""}`}
            onClick={() => toggle(b.id)}
            aria-label={b.label}
          >
            <span className="xiv-menu-icon">
              <GameIcon src={b.icon} alt="" size={32} />
            </span>
          </button>
        </HoverTooltip>
      ))}
      <MainMenuTrigger />
    </div>
  );
}
