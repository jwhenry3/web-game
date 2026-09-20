// Focus-target ring presentation. The replicated target id remains in the
// network snapshot; this owns only the Phaser ellipse and its pulse styling.
import Phaser from "phaser";
import { H99_WORLD_RING_Y } from "../../characters/heroes99";
import { applyIsoCounter, isoParent, sortDepth } from "../../world/iso";
import { isAllyEntity, type SelectedAction, type WorldEntity } from "../../types";

export interface TargetRingVisual {
  wrapper: Phaser.GameObjects.Container;
}

export interface TargetRingInput {
  focusId?: string;
  focusEntity?: WorldEntity;
  focusInFight: boolean;
  visual?: TargetRingVisual;
  selectedAction: SelectedAction | null;
}

export class TargetRing {
  private ring?: Phaser.GameObjects.Ellipse;

  update(scene: Phaser.Scene, input: TargetRingInput) {
    // Wire `alive` is authoritative whenever the focus record exists — a
    // dead target never shows a ring, in or out of combat scope.
    const alive = input.focusEntity ? input.focusEntity.alive : input.visual != null;
    if (!input.focusId || !input.visual || !alive) {
      this.hide();
      return;
    }
    if (!this.ring) {
      this.ring = scene.add
        .ellipse(0, 0, 60, 24)
        .setDepth(11)
        .setStrokeStyle(2.5, 0xe05545, 0.9);
      // Iso scenes: the ring is a screen-space selection marker, not a
      // ground decal — counter-transform it like the actor billboards so it
      // stays upright. Staying inside the layer keeps its depth sorting it
      // under the marked actor.
      if (isoParent(scene, this.ring)) {
        applyIsoCounter(this.ring);
      }
    }
    this.ring.setVisible(true);
    const iso = !!this.ring.parentContainer;
    // Screen-down under iso is (+d,+d) in world terms.
    const rx = input.visual.wrapper.x + (iso ? H99_WORLD_RING_Y : 0);
    const ry = input.visual.wrapper.y + H99_WORLD_RING_Y;
    this.ring.setPosition(rx, ry);
    this.ring.setDepth(sortDepth(scene, rx, ry) - 1); // under the actor it marks
    this.ring.setAlpha(0.65 + 0.3 * Math.sin(scene.time.now / 160));
    const friendly =
      input.focusEntity != null &&
      (isAllyEntity(input.focusEntity) || input.focusEntity.kind === "pet");
    this.ring.setStrokeStyle(
      2.5,
      input.selectedAction && input.selectedAction.heals === friendly ? 0xffe9a8 : 0xe05545,
      0.9,
    );
  }

  hide() {
    this.ring?.setVisible(false);
  }

  destroy() {
    this.ring?.destroy();
    this.ring = undefined;
  }
}
