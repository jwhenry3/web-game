// Pure POI overlay projection for the presentation ECS world.
//
// Reads replicated POI components (save points, job changers, camps — skipping
// Removed-tagged entities) and produces the React HUD marks WorldScene used to
// build imperatively: POI name labels and proximity interact prompts. The
// function is Phaser-free — camera culling and world→stage projection are
// injected so the projection math stays identical to WorldScene semantics.

import type { EntityWorld } from "../../ecs/world";
import {
  CampState,
  JobChangerState,
  Removed,
  SavePointState,
} from "../../ecs/components";
import type {
  InteractPromptMark,
  PoiLabelMark,
} from "../../world/entityOverlayBridge";
import {
  INTERACT_RANGE,
  JOB_CHANGER_RANGE,
  SAVE_POINT_RANGE,
} from "../../world/interact";

/** Foot-local Y (world units) for save/job labels — matches WorldScene. */
const POI_LABEL_Y = -28;
/** Camp labels sit higher to clear the camp sprite. */
const CAMP_LABEL_Y = -32;
/** Interact prompts float above the POI label. */
const POI_INTERACT_PROMPT_Y = -36;

export interface PoiOverlayOptions {
  /** Self position in world units — drives interact range checks. */
  selfX: number;
  selfY: number;
  /** Keybind display string (e.g. "Space") stamped on every prompt. */
  keyLabel: string;
  /** Master gate for interact prompts (canShowWorldInteractPrompts result). */
  showPrompts: boolean;
  /** Camera-proximity predicate (WorldScene.isNearCamera semantics). */
  isNear(x: number, y: number): boolean;
  /** World point + foot-local Y offset → game-stage CSS pixels. */
  project(worldX: number, worldY: number, localY: number): { x: number; y: number };
}

export interface PoiOverlayResult {
  pois: PoiLabelMark[];
  interacts: InteractPromptMark[];
}

/**
 * Build POI label and interact-prompt marks from the ECS world.
 *
 * Marks are emitted in ECS query order, grouped save points → job changers →
 * camps for both `pois` and `interacts`, matching WorldScene ordering.
 * Labels are culled by `isNear`; prompts only require `showPrompts` and the
 * per-POI interact range.
 */
export function collectPoiOverlayMarks(
  world: EntityWorld,
  opts: PoiOverlayOptions,
): PoiOverlayResult {
  const { selfX, selfY, keyLabel, showPrompts, isNear, project } = opts;
  const pois: PoiLabelMark[] = [];
  const interacts: InteractPromptMark[] = [];

  const poiLabel = (
    id: string,
    label: string,
    variant: PoiLabelMark["variant"],
    x: number,
    y: number,
    localY: number,
  ): void => {
    const p = project(x, y, localY);
    pois.push({ id, label, variant, x: p.x, y: p.y });
  };

  const maybeInteract = (id: string, x: number, y: number, range: number): void => {
    if (!showPrompts) return;
    if (Math.hypot(selfX - x, selfY - y) > range) return;
    const p = project(x, y, POI_INTERACT_PROMPT_Y);
    interacts.push({ id, keyLabel, x: p.x, y: p.y });
  };

  for (const e of world.queryExcluding([SavePointState], [Removed])) {
    const sp = world.get(SavePointState, e);
    if (!sp) continue;
    if (isNear(sp.x, sp.y)) {
      poiLabel(
        `save:${sp.id}`,
        sp.name,
        sp.active ? "save-active" : "save",
        sp.x,
        sp.y,
        POI_LABEL_Y,
      );
    }
    maybeInteract(`ix-save:${sp.id}`, sp.x, sp.y, SAVE_POINT_RANGE);
  }

  for (const e of world.queryExcluding([JobChangerState], [Removed])) {
    const jc = world.get(JobChangerState, e);
    if (!jc) continue;
    if (isNear(jc.x, jc.y)) {
      poiLabel(`job:${jc.id}`, jc.name, "job", jc.x, jc.y, POI_LABEL_Y);
    }
    maybeInteract(`ix-job:${jc.id}`, jc.x, jc.y, JOB_CHANGER_RANGE);
  }

  for (const e of world.queryExcluding([CampState], [Removed])) {
    const camp = world.get(CampState, e);
    if (!camp) continue;
    if (isNear(camp.x, camp.y)) {
      poiLabel(
        `camp:${camp.ownerName}`,
        `${camp.ownerName}'s Camp`,
        "camp",
        camp.x,
        camp.y,
        CAMP_LABEL_Y,
      );
    }
    maybeInteract(`ix-camp:${camp.ownerName}`, camp.x, camp.y, INTERACT_RANGE);
  }

  return { pois, interacts };
}
