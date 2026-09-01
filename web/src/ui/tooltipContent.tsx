import type { ReactNode } from "react";
import { RARITY_COLORS, itemQty, type Item, type ProfileInfo, type SkillInfo } from "../types";
import { itemStats } from "./itemDisplay";

export function ItemTooltipContent({ item }: { item: Item }) {
  const consumable = item.kind === "consumable";
  const qty = itemQty(item);
  return (
    <div className="xiv-tooltip-body">
      <div className="xiv-tooltip-title" style={{ color: RARITY_COLORS[item.rarity] }}>
        {item.name}
        {consumable && qty > 1 ? ` ×${qty}` : ""}
      </div>
      <div className="xiv-tooltip-meta">
        {consumable ? "Medicine" : item.slot?.replace("_", " ")}
        {item.type ? ` · ${item.type}` : ""} · iLvl {item.level} · {item.rarity}
      </div>
      {itemStats(item) && <div className="xiv-tooltip-stats">{itemStats(item)}</div>}
      {consumable && <div className="xiv-tooltip-hint dim">Drag to hotbar or use from inventory.</div>}
    </div>
  );
}

export function EmptySlotTooltipContent({ label }: { label: string }) {
  return (
    <div className="xiv-tooltip-body">
      <div className="xiv-tooltip-title">{label}</div>
      <div className="xiv-tooltip-hint dim">Empty equipment slot.</div>
    </div>
  );
}

export function SkillTooltipContent({
  sk,
  byId,
}: {
  sk: SkillInfo;
  byId?: Map<string, SkillInfo>;
}) {
  const prereq = sk.prereq && byId ? byId.get(sk.prereq) : undefined;
  const atMax = sk.unlocked && sk.level >= sk.max_level;
  const usage = sk.usage ?? 0;
  const toNext = sk.usage_to_next ?? 0;

  return (
    <div className="xiv-tooltip-body">
      <div className="xiv-tooltip-title">{sk.name}</div>
      <div className="xiv-tooltip-meta">
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
      {sk.description && <div className="xiv-tooltip-desc dim">{sk.description}</div>}
      {!sk.unlocked && <div className="xiv-tooltip-hint dim">Level your job to unlock.</div>}
      {sk.unlocked && !atMax && <div className="xiv-tooltip-hint dim">Use in battle to level up.</div>}
      {sk.unlocked && atMax && <div className="xiv-tooltip-hint dim">Max level.</div>}
    </div>
  );
}

export function hotbarTooltipContent(bind: ProfileInfo["hotbar"][string] | undefined, profile: ProfileInfo): ReactNode {
  if (!bind) {
    return (
      <div className="xiv-tooltip-body">
        <div className="xiv-tooltip-hint dim">Drop a skill or item here.</div>
      </div>
    );
  }
  if (bind.kind === "skill") {
    const sk = profile.skills.find((s) => s.id === bind.id);
    if (sk) return <SkillTooltipContent sk={sk} />;
    return (
      <div className="xiv-tooltip-body">
        <div className="xiv-tooltip-title">{bind.id}</div>
      </div>
    );
  }
  const item = profile.inventory.find((i) => i.consumable === bind.id);
  if (item) return <ItemTooltipContent item={item} />;
  return (
    <div className="xiv-tooltip-body">
      <div className="xiv-tooltip-title">{bind.id}</div>
    </div>
  );
}
