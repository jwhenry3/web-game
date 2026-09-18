// Focus-target ring presentation. The replicated target id remains in the
// network snapshot; this owns only the Phaser ellipse and its pulse styling.
import Phaser from "phaser";
import { H99_WORLD_RING_Y } from "../../characters/heroes99";
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
    const alive = input.focusInFight ? (input.focusEntity?.alive ?? false) : input.visual != null;
    if (!input.focusId || !input.visual || !alive) {
      this.hide();
      return;
    }
    if (!this.ring) {
      this.ring = scene.add
        .ellipse(0, 0, 60, 24)
        .setDepth(11)
        .setStrokeStyle(2.5, 0xe05545, 0.9);
    }
    this.ring.setVisible(true);
    this.ring.setPosition(input.visual.wrapper.x, input.visual.wrapper.y + H99_WORLD_RING_Y);
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
