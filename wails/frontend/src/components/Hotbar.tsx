import { useMemo, useRef } from "react";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import {
  consumableCount,
  isEnemyEntity,
  type HotbarBinding,
  type ProfileInfo,
} from "../types";
import { HOTBAR_ROWS, hotbarKeyLabel, mergeKeybinds } from "../input/keybinds";
import { readHotbarDrag, setHotbarDragImage, writeHotbarDrag } from "../ui/hotbarDrag";
import { GameIcon } from "../ui/GameIcon";
import { ICONS } from "../ui/icons";
import { hotbarIconSrc, skillIconSrc } from "../ui/itemDisplay";
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
  const entities = useGame((s) => s.entities);
  const selfId = useGame((s) => s.selfId);
  const selfCombat = useGame((s) =>
    s.selfId && s.combatIds[s.selfId] ? s.entities[s.selfId] : undefined,
  );
  const drag = useGame((s) => s.hotbarDrag);
  const barRef = useRef<HTMLDivElement>(null);
  const keybinds = useMemo(() => mergeKeybinds(profile?.keybinds), [profile?.keybinds]);
  if (!profile) return null;

  const bindings = profile.hotbar ?? {};
  const inCombat = !!selfCombat?.alive;
  const gcd = selfCombat?.skill_atb ?? 0;
  const casting = !!selfCombat?.casting_skill_id;

  // The active pet gets command slots parked beside the bar.
  const actives = (profile.pets ?? []).filter((p) => p.id === profile.battle_pet_id);
  const self = selfId ? entities[selfId] : undefined;
  const focus = self?.target_id ? entities[self.target_id] : undefined;
  const canPetAttack = !!focus && isEnemyEntity(focus) && focus.alive;

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
          onDragStart={(e) => {
            if (!bind) return;
            writeHotbarDrag(e, { kind: bind.kind as "skill" | "item", id: bind.id, slot });
            if (iconSrc) {
              setHotbarDragImage(e, iconSrc, bind.kind === "item" && itemCount > 1 ? itemCount : undefined);
            }
          }}
          onDragEnd={(e) => {
            useGame.setState({ hotbarDrag: null });
            e.currentTarget.blur();
            if (!bind || e.dataTransfer.dropEffect !== "none") return;
            // dropEffect "none" means no drop target accepted — either released
            // off the bar or the drag was cancelled. Unbind only when the
            // pointer is verifiably outside the bar (coords are 0 in engines
            // that don't report drop position — treat those as cancels).
            const r = barRef.current?.getBoundingClientRect();
            const inside =
              !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside && (e.clientX !== 0 || e.clientY !== 0)) net.clearHotbar(slot);
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
          onClick={(e) => {
            net.activateHotbar(slot);
            e.currentTarget.blur();
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
      ref={barRef}
      className={`hotbar ${drag ? "hotbar--drop-target" : ""}`}
      onDragOver={(e) => {
        // Absorb drops that land on the bar's gaps between slots: they cancel
        // the drag rather than count as a drop-off, which would unbind the
        // source slot via dragend's dropEffect check.
        if (!drag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = drag.slot ? "move" : "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        useGame.setState({ hotbarDrag: null });
      }}
      onKeyDown={(e) => {
        if (e.key.startsWith("Arrow")) e.preventDefault();
      }}
    >
      {HOTBAR_ROWS.map((row) => (
        <div key={row.id} className="hotbar-row">
          {row.slots.map((slot) => renderSlot(slot))}
        </div>
      ))}
      {actives.length > 0 && (
        <div className="pet-cmds">
          <button
            type="button"
            tabIndex={-1}
            className="hotbar-slot pet-cmd"
            disabled={!canPetAttack}
            title={
              canPetAttack
                ? `Pet command: send pets at ${focus!.name}`
                : "Pet command: target an enemy first"
            }
            onClick={() => net.petCommand("attack")}
          >
            <span className="hotbar-icon">
              <GameIcon src={skillIconSrc("attack")} alt="" size={34} />
            </span>
            <span className="hotbar-label">Atk</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="hotbar-slot pet-cmd"
            title="Pet command: call pets back to follow"
            onClick={() => net.petCommand("heel")}
          >
            <span className="hotbar-icon">
              <GameIcon src={ICONS.feet} alt="" size={34} />
            </span>
            <span className="hotbar-label">Heel</span>
          </button>
        </div>
      )}
    </div>
  );
}
