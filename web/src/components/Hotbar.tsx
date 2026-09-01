import { net } from "../net/socket";
import { useGame } from "../state/store";
import {
  HOTBAR_SLOTS,
  consumableCount,
  type HotbarBinding,
  type ProfileInfo,
} from "../types";
import { readHotbarDrag, writeHotbarDrag } from "../ui/hotbarDrag";
import { HoverTooltip } from "../ui/HoverTooltip";
import { hotbarTooltipContent } from "../ui/tooltipContent";

function labelFor(bind: HotbarBinding | undefined, profile: ProfileInfo): string {
  if (!bind) return "";
  if (bind.kind === "skill") {
    const sk = profile.skills.find((s) => s.id === bind.id);
    return sk?.name ?? bind.id;
  }
  const count = consumableCount(profile.inventory, bind.id);
  const sample = profile.inventory.find((i) => i.consumable === bind.id);
  return `${sample?.name ?? bind.id}${count ? ` ×${count}` : ""}`;
}

export function Hotbar() {
  const profile = useGame((s) => s.profile);
  const screen = useGame((s) => s.screen);
  const selected = useGame((s) => s.selectedAction);
  const battle = useGame((s) => s.battle);
  const selfId = useGame((s) => s.selfId);
  if (!profile) return null;

  const self = battle?.entities.find((e) => e.id === selfId);
  const gcd = self?.skill_atb ?? self?.atb ?? 0;
  const casting = !!self?.casting_skill_id;
  const inBattle = screen === "battle" && !!self && !battle?.end;

  return (
    <div className="hotbar">
      {HOTBAR_SLOTS.map((slot) => {
        const bind = profile.hotbar?.[slot];
        const isAttack = bind?.kind === "skill" && bind.id === "attack";
        const onGcd = inBattle && !isAttack && !!bind;
        const gcdLocked = onGcd && (gcd < 100 || casting);
        const active =
          (isAttack && self?.auto_attack) ||
          (selected &&
            ((bind?.kind === "skill" && selected.actionId === bind.id) ||
              (bind?.kind === "item" &&
                selected.itemId &&
                profile.inventory.find((i) => i.id === selected.itemId)?.consumable === bind.id)));
        return (
          <HoverTooltip key={slot} content={hotbarTooltipContent(bind, profile)}>
            <button
              className={`hotbar-slot ${active ? "selected" : ""} ${gcdLocked ? "gcd-locked" : ""}`}
            draggable={!!bind}
            onDragStart={(e) => {
              if (!bind) return;
              writeHotbarDrag(e, { kind: bind.kind as "skill" | "item", id: bind.id, slot });
            }}
            onDragEnd={(e) => {
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
              const drag = readHotbarDrag(e);
              if (!drag) return;
              if (drag.slot && drag.slot !== slot) {
                const dest = profile.hotbar?.[slot];
                if (dest) net.setHotbar(drag.slot, dest.kind, dest.id);
                else net.clearHotbar(drag.slot);
              }
              net.setHotbar(slot, drag.kind, drag.id);
            }}
            onClick={() => {
              if (inBattle) net.activateHotbar(slot);
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
            <span className="hotbar-key">{slot}</span>
            <span className="hotbar-label">{labelFor(bind, profile)}</span>
            {isAttack && <span className="hotbar-aa">{self?.auto_attack ? "AA" : "off"}</span>}
          </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}
