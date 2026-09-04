import Phaser from "phaser";

/** Floating interact hint shown above interactable targets when the player is in range. */
export class InteractPromptBadge {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private showing = false;

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, anchorY: number) {
    this.container = scene.add.container(0, anchorY).setDepth(30);
    this.bg = scene.add.rectangle(0, 0, 40, 16, 0x1a1406, 0.92).setOrigin(0.5);
    this.bg.setStrokeStyle(1, 0xe8c96a);
    this.label = scene.add
      .text(0, 0, "", {
        fontSize: "9px",
        color: "#e8c96a",
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.container.add([this.bg, this.label]);
    this.container.setVisible(false);
    parent.add(this.container);
  }

  sync(show: boolean, label: string) {
    if (show) {
      if (this.label.text !== label) {
        this.label.setText(label);
        this.bg.width = Math.max(28, this.label.width + 10);
      }
      if (!this.showing) this.container.setVisible(true);
      this.showing = true;
      return;
    }
    if (this.showing) {
      this.container.setVisible(false);
      this.showing = false;
    }
  }

  destroy() {
    this.container.destroy();
  }
}
