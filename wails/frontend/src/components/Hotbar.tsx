import { useMemo } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { activeBattleView } from "../battle/activeBattle";
import {
  consumableCount,
  type HotbarBar as HotbarBarId,
  type HotbarBinding,
  type ProfileInfo,
} from "../types";
import { HOTBAR_ROWS, hotbarKeyLabel, mergeKeybinds } from "../input/keybinds";
import {
  hotbarBarEnabled,
  hotbarBarForDrag,
  readHotbarDrag,
  writeHotbarDrag,
} from "../ui/hotbarDrag";
import { GameIcon } from "../ui/GameIcon";
import { hotbarIconSrc } from "../ui/itemDisplay";
import { HoverTooltip } from "../ui/HoverTooltip";
import { hotbarTooltipContent } from "../ui/tooltipContent";

function labelFor(bind: HotbarBinding | undefined, profile: ProfileInfo): string {
  if (!bind) return "";
  if (bind.kind === "skill") {
    const sk = profile.skills.find((s) => s.id === bind.id);
    return sk?.name ?? bind.id;
  }
  const count = consumableCount(profile.inventory, bind.id);
  if (count > 1) return `×${count}`;
  return "";
}

function bindingsForBar(profile: ProfileInfo, bar: HotbarBarId): Record<string, HotbarBinding> {
  return (bar === "world" ? profile.world_hotbar : profile.hotbar) ?? {};
}

/** HUD hotbar — the world bar in the overworld, the battle bar in combat. */
export function Hotbar() {
  const screen = useGame((s) => s.screen);
  const profile = useGame((s) => s.profile);
  const battleRaw = useGame((s) => s.battle);
  const rtBattle = useGame((s) => s.rtBattle);
  const selfId = useGame((s) => s.selfId);
  const battle = useMemo(() => activeBattleView(battleRaw, rtBattle), [battleRaw, rtBattle]);
  if (!profile || screen === "house") return null;

  const self = battle?.entities.find((e) => e.id === selfId);
  const inBattle = screen === "battle" && !!battle && !!self && !battle?.end;
  return <HotbarBar bar={inBattle ? "battle" : "world"} />;
}

export function HotbarBar({ bar, embedded = false }: { bar: HotbarBarId; embedded?: boolean }) {
  const profile = useGame((s) => s.profile);
  const screen = useGame((s) => s.screen);
  const selected = useGame((s) => s.selectedAction);
  const battleRaw = useGame((s) => s.battle);
  const rtBattle = useGame((s) => s.rtBattle);
  const battle = useMemo(() => activeBattleView(battleRaw, rtBattle), [battleRaw, rtBattle]);
  const selfId = useGame((s) => s.selfId);
  const drag = useGame((s) => s.hotbarDrag);
  const keybinds = useMemo(() => mergeKeybinds(profile?.keybinds), [profile?.keybinds]);
  if (!profile) return null;

  const bindings = bindingsForBar(profile, bar);
  const barEnabled = hotbarBarEnabled(bar, drag, profile);
  const self = battle?.entities.find((e) => e.id === selfId);
  const gcd = self?.skill_atb ?? self?.atb ?? 0;
  const casting = !!self?.casting_skill_id;
  const inBattle =
    !embedded && bar === "battle" && screen === "battle" && !!battle && !!self && !battle?.end;

  const renderSlot = (slot: string) => {
    const bind = bindings[slot];
    const iconSrc = hotbarIconSrc(bind, profile);
    const itemCount = bind?.kind === "item" ? consumableCount(profile.inventory, bind.id) : 0;
    const caption = labelFor(bind, profile);
    const onGcd = inBattle && !!bind;
    const gcdLocked = onGcd && (gcd < 100 || casting);
    const active =
      !embedded &&
      selected &&
      ((bind?.kind === "skill" && selected.actionId === bind.id) ||
        (bind?.kind === "item" &&
          selected.itemId &&
          profile.inventory.find((i) => i.id === selected.itemId)?.consumable === bind.id));
    return (
      <HoverTooltip key={slot} content={hotbarTooltipContent(bind, profile)}>
        <button
          type="button"
          tabIndex={-1}
          className={`hotbar-slot ${active ? "selected" : ""} ${gcdLocked ? "gcd-locked" : ""}`}
          draggable={!!bind}
          onMouseDown={(e) => e.preventDefault()}
          onDragStart={(e) => {
            if (!bind) return;
            writeHotbarDrag(e, { kind: bind.kind as "skill" | "item", id: bind.id, slot, bar });
          }}
          onDragEnd={(e) => {
            useGame.setState({ hotbarDrag: null });
            if (!bind) return;
            if (e.dataTransfer.dropEffect === "none") net.clearHotbar(bar, slot);
          }}
          onDragOver={(e) => {
            if (!barEnabled) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const payload = readHotbarDrag(e);
            useGame.setState({ hotbarDrag: null });
            // Re-check at drop time — the tracker may be stale if the drag
            // crossed through a disabled bar.
            if (!payload || hotbarBarForDrag(payload, profile) !== bar) return;
            if (payload.slot && payload.bar === bar && payload.slot !== slot) {
              const dest = bindings[slot];
              if (dest) net.setHotbar(bar, payload.slot, dest.kind, dest.id);
              else net.clearHotbar(bar, payload.slot);
            }
            net.setHotbar(bar, slot, payload.kind, payload.id);
          }}
          onClick={() => {
            if (!embedded) net.activateHotbar(slot);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            net.clearHotbar(bar, slot);
          }}
        >
          {onGcd && (
            <span
              className="gcd-overlay"
              style={{ height: `${Math.max(0, casting ? 100 : 100 - gcd)}%` }}
            />
          )}
          <span className="hotbar-key">{hotbarKeyLabel(slot, keybinds)}</span>
          {iconSrc && (
            <span className="hotbar-icon">
              <GameIcon src={iconSrc} alt="" size={embedded ? 24 : 34} />
            </span>
          )}
          {bind?.kind === "item" && itemCount > 1 && (
            <span className="hotbar-qty">×{itemCount}</span>
          )}
          {caption && !embedded && <span className="hotbar-label">{caption}</span>}
        </button>
      </HoverTooltip>
    );
  };

  return (
    <div
      className={`hotbar ${embedded ? "hotbar--embedded" : ""} ${drag && !barEnabled ? "hotbar--disabled" : ""} ${drag && barEnabled ? "hotbar--drop-target" : ""}`}
      onKeyDown={(e) => {
        if (e.key.startsWith("Arrow")) e.preventDefault();
      }}
    >
      {HOTBAR_ROWS.map((row) => (
        <div key={row.id} className="hotbar-row">
          {row.slots.map((slot) => renderSlot(slot))}
        </div>
      ))}
    </div>
  );
}
