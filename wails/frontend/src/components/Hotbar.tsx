import { useMemo } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import {
  consumableCount,
  type HotbarBinding,
  type ProfileInfo,
} from "../types";
import { HOTBAR_ROWS, hotbarKeyLabel, mergeKeybinds } from "../input/keybinds";
import { readHotbarDrag, writeHotbarDrag } from "../ui/hotbarDrag";
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

/** HUD hotbar — the single 24-slot bar shown in the overworld. */
export function Hotbar() {
  const profile = useGame((s) => s.profile);
  const selected = useGame((s) => s.selectedAction);
  const selfCombat = useGame((s) => (s.selfId ? s.combatEntities[s.selfId] : undefined));
  const drag = useGame((s) => s.hotbarDrag);
  const keybinds = useMemo(() => mergeKeybinds(profile?.keybinds), [profile?.keybinds]);
  if (!profile) return null;

  const bindings = profile.hotbar ?? {};
  const inCombat = !!selfCombat?.alive;
  const gcd = selfCombat?.skill_atb ?? 0;
  const casting = !!selfCombat?.casting_skill_id;

  const renderSlot = (slot: string) => {
    const bind = bindings[slot];
    const iconSrc = hotbarIconSrc(bind, profile);
    const itemCount = bind?.kind === "item" ? consumableCount(profile.inventory, bind.id) : 0;
    const caption = labelFor(bind, profile);
    const onGcd = inCombat && !!bind;
    const gcdLocked = onGcd && (gcd < 100 || casting);
    const active =
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
            writeHotbarDrag(e, { kind: bind.kind as "skill" | "item", id: bind.id, slot });
          }}
          onDragEnd={(e) => {
            useGame.setState({ hotbarDrag: null });
            if (!bind) return;
            if (e.dataTransfer.dropEffect === "none") net.clearHotbar(slot);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const payload = readHotbarDrag(e);
            useGame.setState({ hotbarDrag: null });
            if (!payload) return;
            if (payload.slot && payload.slot !== slot) {
              const dest = bindings[slot];
              if (dest) net.setHotbar(payload.slot, dest.kind, dest.id);
              else net.clearHotbar(payload.slot);
            }
            net.setHotbar(slot, payload.kind, payload.id);
          }}
          onClick={() => {
            net.activateHotbar(slot);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            net.clearHotbar(slot);
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
              <GameIcon src={iconSrc} alt="" size={34} />
            </span>
          )}
          {bind?.kind === "item" && itemCount > 1 && (
            <span className="hotbar-qty">×{itemCount}</span>
          )}
          {caption && <span className="hotbar-label">{caption}</span>}
        </button>
      </HoverTooltip>
    );
  };

  return (
    <div
      className={`hotbar ${drag ? "hotbar--drop-target" : ""}`}
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
