// Entity overlay projection for the presentation ECS world.
//
// Reads replicated entity state and ECS-owned actor visuals, then emits the
// React HUD marks for nameplates, cast bars, HP bars, statuses, and target
// arrows. Camera culling and world→stage projection are injected so this stays
// independent of Phaser scene/camera internals.
import { H99_NAME_LABEL_Y } from "../../characters/types";
import {
  ActorVisual,
  PET_FOLLOW_SCALE,
  type ActorVisualRole,
} from "./actorVisuals";
import {
  AppearanceState,
  CombatState,
  NetworkSnapshot,
  Removed,
  Self,
  Vitals,
} from "../../ecs/components";
import type { EntityWorld } from "../../ecs/world";
import type { WorldEntity } from "../../types";
import { isAllyEntity } from "../../types";
import type { EntityOverlayMark } from "../../world/entityOverlayBridge";

const CAST_BAR_Y = 10;
const ROLE_ORDER: readonly ActorVisualRole[] = ["player", "npc", "combat-extra", "pet"];

export interface EntityOverlayOptions {
  /** Current wall clock for immunity/cast-end calculations. */
  now: number;
  /** Camera-proximity predicate (WorldScene.isNearCamera semantics). */
  isNear(x: number, y: number): boolean;
  /** World point → game-stage CSS pixels. */
  projectPoint(worldX: number, worldY: number): { x: number; y: number };
  /** Foot-local offset → game-stage CSS pixels. */
  projectOffset(localX: number, localY: number): { x: number; y: number };
}

function castPct(entity: WorldEntity, combat: CombatState | undefined, now: number): number | undefined {
  if (!entity.casting_skill_id) return undefined;
  // Prefer the wall-clock deadline: the server projects cast_ends_at for both
  // combat casts and field casts, so this animates locally even when the
  // caster is in the combat set — where cast_progress only ticks for combat
  // casts (field casts have no server-side progress at all).
  const castTimeMs = combat?.castTimeMs ?? entity.cast_time_ms ?? 0;
  const endsAt = combat?.castEndsAt ?? entity.cast_ends_at ?? 0;
  if (castTimeMs > 0 && endsAt > 0) {
    return Math.max(0, Math.min(1, 1 - (endsAt - now) / castTimeMs));
  }
  if (combat?.inCombat) return Math.max(0, Math.min(1, (combat.castProgress ?? 0) / 100));
  return undefined;
}

function hpMark(entity: WorldEntity, vitals: Vitals | undefined) {
  if (!vitals?.alive) return undefined;
  if (entity.engaged || vitals.hp < vitals.maxHp) {
    return { value: vitals.hp, max: vitals.maxHp };
  }
  return undefined;
}

function labelFor(
  role: ActorVisualRole,
  entity: WorldEntity,
  combat: CombatState | undefined,
  now: number,
): { label: string; variant: EntityOverlayMark["variant"] } {
  if (role === "player") {
    const immune = !entity.engaged && (entity.immune_until ?? 0) > now;
    return {
      label: `${entity.name} Lv${entity.level ?? 0}${entity.engaged ? " ⚔" : ""}${immune ? " 🛡" : ""}`,
      variant: "player",
    };
  }
  if (role === "npc") {
    const engaged = !!entity.engaged || combat?.inCombat === true;
    return { label: `${entity.name} Lv${entity.level ?? 0}${engaged ? " ⚔" : ""}`, variant: "enemy" };
  }
  return {
    label: `${entity.name}${entity.level ? ` Lv${entity.level}` : ""}`,
    variant: isAllyEntity(entity) ? "player" : "enemy",
  };
}

/** Build React overlay marks from ECS-owned actor visuals and replicated state. */
export function collectEntityOverlayMarks(
  world: EntityWorld,
  opts: EntityOverlayOptions,
): EntityOverlayMark[] {
  const byRole = new Map<ActorVisualRole, EntityOverlayMark[]>();
  for (const role of ROLE_ORDER) byRole.set(role, []);

  let focusedId: string | undefined;
  for (const e of world.queryExcluding([Self, CombatState], [Removed])) {
    focusedId = world.get(CombatState, e)?.targetId ?? focusedId;
  }

  for (const e of world.queryExcluding(
    [ActorVisual, NetworkSnapshot, AppearanceState, CombatState, Vitals],
    [Removed],
  )) {
    const visual = world.get(ActorVisual, e);
    const entity = world.get(NetworkSnapshot, e)?.entity;
    const combat = world.get(CombatState, e);
    const vitals = world.get(Vitals, e);
    if (!visual || !entity || !combat || !vitals) continue;
    if (visual.role === "player" && !visual.character) continue;

    const isSelf = world.get(Self, e) != null;
    const x = visual.wrapper.x;
    const y = visual.wrapper.y;
    if (!isSelf && !opts.isNear(x, y)) continue;

    const { label, variant } = labelFor(visual.role, entity, combat, opts.now);
    const nameLocalY =
      visual.role === "pet" ? Math.round(H99_NAME_LABEL_Y * PET_FOLLOW_SCALE) - 2 : H99_NAME_LABEL_Y;
    const feet = opts.projectPoint(x, y);
    const nameOff = opts.projectOffset(0, nameLocalY);
    const castOff = opts.projectOffset(0, CAST_BAR_Y);
    byRole.get(visual.role)?.push({
      id: entity.id,
      label,
      variant: visual.role === "player" && isSelf ? "self" : variant,
      screenX: feet.x,
      screenY: feet.y,
      nameX: feet.x + nameOff.x,
      nameY: feet.y + nameOff.y,
      castX: feet.x + castOff.x,
      castY: feet.y + castOff.y,
      castPct: castPct(entity, combat, opts.now),
      hp: hpMark(entity, vitals),
      statuses: combat.inCombat ? entity.statuses : undefined,
      targeted: focusedId === entity.id,
    });
  }

  return ROLE_ORDER.flatMap((role) => byRole.get(role) ?? []);
}
