import { Fragment, type ReactNode } from "react";
import { RARITY_COLORS, armorClassLabel, itemQty, proficiencyLabel, type Item, type ProfileInfo, type SkillInfo } from "../types";
import { itemStats } from "./itemDisplay";
import { WeaponTypeIcon, weaponLabel } from "./JobIdentity";

type TTRow = { label: string; value: ReactNode; highlight?: boolean; span?: boolean };

function TooltipStatGrid({ rows }: { rows: (TTRow | null | undefined)[] }) {
  const visible = rows.filter((r): r is TTRow => !!r && r.value !== undefined && r.value !== null && r.value !== "");
  if (!visible.length) return null;
  return (
    <div className="cm-tt-grid">
      {visible.map((r, i) =>
        r.span ? (
          <div key={i} className={`cm-tt-value cm-tt-span${r.highlight ? " cm-tt-value--accent" : ""}`}>{r.value}</div>
        ) : (
          <Fragment key={i}>
            <span className="cm-tt-label">{r.label}</span>
            <span className={`cm-tt-value${r.highlight ? " cm-tt-value--accent" : ""}`}>{r.value}</span>
          </Fragment>
        ),
      )}
    </div>
  );
}

const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// Pretty-print a skill id when no catalog name is available: "hex_ignis_maius" → "Ignis Maius".
function skillIdLabel(id: string): string {
  const tail = id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;
  return tail.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function WeaponTypeIcons({ types }: { types: string[] }) {
  return (
    <span className="cm-tt-weapons">
      {types.map((t) => (
        <span key={t} className="cm-weapon-glyph" title={weaponLabel(t)}>
          <WeaponTypeIcon type={t} size={13} />
        </span>
      ))}
    </span>
  );
}

const EFFECT_LABELS: Record<string, string> = {
  damage: "Damage",
  heal: "Healing",
  shield: "Shield",
  status: "Applies",
  buff: "Buff",
  world: "Field effect",
};

function effectSummary(sk: SkillInfo): string {
  if (!sk.effects?.length) return "";
  return sk.effects
    .map((e) => {
      const label = EFFECT_LABELS[e.kind] ?? e.kind;
      const power = e.power ? ` ×${e.power}` : "";
      const stat = e.stat ? ` (${e.stat.toUpperCase()})` : "";
      const status = e.status ? ` ${e.status.kind}` : "";
      return `${label}${power}${stat}${status}`;
    })
    .join(" · ");
}

export function ItemTooltipContent({ item }: { item: Item }) {
  const consumable = item.kind === "consumable";
  const qty = itemQty(item);
  return (
    <div className="cm-tooltip-body">
      <div className="cm-tooltip-title" style={{ color: RARITY_COLORS[item.rarity] }}>
        {item.name}
        {consumable && qty > 1 ? ` ×${qty}` : ""}
      </div>
      <TooltipStatGrid
        rows={[
          { label: "Kind", value: consumable ? "Medicine" : item.slot ? item.slot[0].toUpperCase() + item.slot.slice(1).replace("_", " ") : "" },
          item.type
            ? item.slot === "weapon" || item.slot === "sub_weapon"
              ? { label: "Type", value: weaponLabel(item.type) }
              : { label: "Weight", value: armorClassLabel(item.type) }
            : null,
          { label: "iLvl", value: item.level },
          { label: "Rarity", value: item.rarity },
          itemStats(item) ? { label: "", value: itemStats(item), span: true } : null,
        ]}
      />
      {consumable && <div className="cm-tooltip-hint dim">Drag to hotbar or use from inventory.</div>}
    </div>
  );
}

export function EmptySlotTooltipContent({ label }: { label: string }) {
  return (
    <div className="cm-tooltip-body">
      <div className="cm-tooltip-title">{label}</div>
      <div className="cm-tooltip-hint dim">Empty equipment slot.</div>
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
  const isUtility = sk.id === "attack" || sk.id === "dodge";
  const profName = proficiencyLabel(sk.proficiency);
  const atMax = sk.proficiency !== undefined && sk.proficiency !== "" && sk.level >= sk.max_level;
  const kind = sk.passive ? "Passive" : sk.world_only ? "Field skill" : "Combat skill";

  const rows: (TTRow | null)[] = [
    { label: "Type", value: kind },
    isUtility
      ? { label: "Cost", value: "0 MP · uses GCD" }
      : sk.passive
        ? null
        : { label: "Cost", value: `${sk.mp_cost} MP` },
    !sk.passive && sk.cast_time_ms ? { label: "Cast", value: fmtSec(sk.cast_time_ms) } : null,
    !sk.passive && sk.cooldown_ms ? { label: "Cooldown", value: fmtSec(sk.cooldown_ms) } : null,
    sk.weapon_reqs?.length ? { label: "Weapon", value: <WeaponTypeIcons types={sk.weapon_reqs} /> } : null,
    sk.combo_length ? { label: "Combo", value: `${sk.combo_length} steps` } : null,
    !sk.passive && sk.target ? { label: "Target", value: sk.target } : null,
    effectSummary(sk) ? { label: "Effect", value: effectSummary(sk) } : null,
    !sk.unlocked ? { label: "Unlocks", value: `Job Lv ${sk.unlock_level}`, highlight: true } : null,
  ];

  return (
    <div className="cm-tooltip-body">
      <div className="cm-tooltip-title">{sk.name}</div>
      <TooltipStatGrid rows={rows} />
      {sk.description && <div className="cm-tooltip-desc dim">{sk.description}</div>}
      {!sk.unlocked && sk.prereq && (
        <div className="cm-tt-requires">Requires {prereq?.name ?? skillIdLabel(sk.prereq)}</div>
      )}
      {!sk.unlocked && (
        <div className="cm-tooltip-hint dim">{`Reach job Lv ${sk.unlock_level} to unlock.`}</div>
      )}
      {sk.world_only && sk.unlocked && (
        <div className="cm-tooltip-hint dim">Double-click to use, or drag onto the hotbar.</div>
      )}
      {sk.unlocked && sk.passive && <div className="cm-tooltip-hint dim">Always active.</div>}
      {sk.unlocked && !sk.world_only && !sk.passive && profName && !atMax && (
        <div className="cm-tooltip-hint dim">Use in battle to train {profName}.</div>
      )}
    </div>
  );
}

export function hotbarTooltipContent(bind: ProfileInfo["hotbar"][string] | undefined, profile: ProfileInfo): ReactNode {
  if (!bind) {
    return (
      <div className="cm-tooltip-body">
        <div className="cm-tooltip-hint dim">Drop a skill or item here.</div>
      </div>
    );
  }
  if (bind.kind === "skill") {
    const sk = profile.skills.find((s) => s.id === bind.id);
    if (sk) return <SkillTooltipContent sk={sk} byId={new Map(profile.skills.map((s) => [s.id, s]))} />;
    return (
      <div className="cm-tooltip-body">
        <div className="cm-tooltip-title">{bind.id}</div>
      </div>
    );
  }
  const item = profile.inventory.find((i) => i.consumable === bind.id);
  if (item) return <ItemTooltipContent item={item} />;
  return (
    <div className="cm-tooltip-body">
      <div className="cm-tooltip-title">{bind.id}</div>
    </div>
  );
}
