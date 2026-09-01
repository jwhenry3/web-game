import Phaser from "phaser";
import { battleEvents, net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import {
  appearanceKey,
  H99_BATTLE_RING_RADIUS,
  H99_DISPLAY_HEIGHT,
  H99_NAME_LABEL_Y,
} from "../characters/types";
import type { ActionResult, BattleEntity } from "../types";
import { CharacterSprite } from "./CharacterSprite";
import { statusColor, statusLabel } from "../ui/statusDisplay";

interface Figure {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle | null;
  sprite: CharacterSprite | null;
  label: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBack: Phaser.GameObjects.Rectangle;
  gcdBar: Phaser.GameObjects.Rectangle;
  gcdBack: Phaser.GameObjects.Rectangle;
  statusText: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  homeX: number;
  appearanceKey: string;
}

const VIEW_W = 960;
const VIEW_H = 600;

export class BattleScene extends Phaser.Scene {
  private figures = new Map<string, Figure>();
  private onResult = (r: ActionResult) => this.animateResult(r);

  constructor() {
    super("battle");
  }

  create() {
    this.drawBackdrop();
    battleEvents.on("result", this.onResult);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      battleEvents.off("result", this.onResult);
    });
    this.events.on(Phaser.Scenes.Events.SLEEP, () => this.clearFigures());
  }

  private drawBackdrop() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x1a1030, 0x1a1030, 0x0a0f1e, 0x0a0f1e);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle(0x241a3d, 0.9);
    g.fillEllipse(VIEW_W / 2, VIEW_H - 60, VIEW_W * 1.1, 200);
    g.fillStyle(0x141a33);
    g.fillTriangle(80, 420, 320, 160, 540, 420);
    g.fillTriangle(420, 420, 700, 120, 940, 420);
  }

  private clearFigures() {
    for (const f of this.figures.values()) f.container.destroy();
    this.figures.clear();
  }

  private playerAppearance(e: BattleEntity) {
    const state = useGame.getState();
    const wp = state.players[e.id];
    return resolveCharacterAppearance({
      playerId: e.id,
      selfId: state.selfId,
      profile: state.profile,
      race: wp?.race,
      weapon: e.weapon,
      wire: wp?.appearance,
    });
  }

  private ensureFigure(e: BattleEntity, index: number, count: number): Figure {
    const app = e.is_player ? this.playerAppearance(e) : null;
    const appKey = app ? appearanceKey(app) : "";
    let f = this.figures.get(e.id);
    if (f) {
      if (e.is_player && f.sprite && app && f.appearanceKey !== appKey) {
        f.sprite.setAppearance(app);
        f.appearanceKey = appKey;
      }
      return f;
    }

    const spacing = Math.min(H99_DISPLAY_HEIGHT + 40, 360 / Math.max(count, 1));
    const y = 200 + index * spacing;
    const x = e.is_player ? 250 : 690;

    const container = this.add.container(x, y);
    let body: Phaser.GameObjects.Rectangle | null = null;
    let sprite: CharacterSprite | null = null;
    const h = e.is_player ? H99_DISPLAY_HEIGHT : 44;

    const ring = this.add.circle(0, 0, e.is_player ? H99_BATTLE_RING_RADIUS : 26, 0xffe9a8, 0).setVisible(false);

    if (e.is_player) {
      sprite = new CharacterSprite(this, 0, 0, app!);
      sprite.setInteractive(() => {
        const target = useGame.getState().battle?.entities.find((x) => x.id === e.id);
        if (target) net.clickEntity(target);
      });
      container.add([ring, sprite.container]);
    } else {
      const w = 44;
      body = this.add.rectangle(0, 0, w, h, 0x9e3a3a);
      body.setStrokeStyle(2, 0x000000);
      body.setInteractive({ useHandCursor: true });
      body.on("pointerdown", () => {
        const target = useGame.getState().battle?.entities.find((x) => x.id === e.id);
        if (target) net.clickEntity(target);
      });
      container.add([ring, body]);
    }

    const label = this.add
      .text(0, e.is_player ? H99_NAME_LABEL_Y : -h / 2 - 22, e.name, { fontSize: "12px", color: "#ffffff", fontFamily: "monospace" })
      .setOrigin(0.5)
      .setShadow(1, 1, "#000", 2);

    const hpBack = this.add.rectangle(0, e.is_player ? H99_NAME_LABEL_Y + 14 : -h / 2 - 10, 50, 5, 0x222222).setOrigin(0.5);
    const hpBar = this.add.rectangle(-25, e.is_player ? H99_NAME_LABEL_Y + 14 : -h / 2 - 10, 50, 5, 0x4ade80).setOrigin(0, 0.5);

    const gcdY = e.is_player ? 8 : h / 2 + 8;
    const gcdBack = this.add.rectangle(0, gcdY, 52, 7, 0x1a1610).setOrigin(0.5);
    gcdBack.setStrokeStyle(1, 0x6a5a2a);
    const gcdBar = this.add.rectangle(-25, gcdY, 0, 5, 0xfacc15).setOrigin(0, 0.5);

    const statusY = e.is_player ? H99_NAME_LABEL_Y + 22 : -h / 2 - 4;
    const statusText = this.add
      .text(0, statusY, "", { fontSize: "9px", color: "#ffffff", fontFamily: "monospace" })
      .setOrigin(0.5);

    container.add([label, hpBack, hpBar, statusText, gcdBack, gcdBar]);
    f = { container, body, sprite, label, hpBar, hpBack, gcdBar, gcdBack, statusText, ring, homeX: x, appearanceKey: appKey };
    this.figures.set(e.id, f);
    return f;
  }

  update(_time: number, delta: number) {
    const battle = useGame.getState().battle;
    if (!battle) return;

    const players = battle.entities.filter((e) => e.is_player);
    const enemies = battle.entities.filter((e) => !e.is_player);

    const present = new Set(battle.entities.map((e) => e.id));
    for (const [id, f] of this.figures) {
      if (!present.has(id)) {
        f.container.destroy();
        this.figures.delete(id);
      }
    }

    players.forEach((e, i) => this.syncFigure(e, i, players.length, delta));
    enemies.forEach((e, i) => this.syncFigure(e, i, enemies.length, delta));
  }

  private syncFigure(e: BattleEntity, index: number, count: number, delta: number) {
    const f = this.ensureFigure(e, index, count);
    const ratio = e.max_hp > 0 ? Phaser.Math.Clamp(e.hp / e.max_hp, 0, 1) : 0;
    f.hpBar.width = 50 * ratio;
    f.hpBar.fillColor = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfacc15 : 0xef4444;
    const gcd = Phaser.Math.Clamp((e.skill_atb ?? e.atb ?? 0) / 100, 0, 1);
    f.gcdBar.width = 50 * gcd;
    f.gcdBar.fillColor = gcd >= 1 ? 0xffe9a8 : 0xe8c96a;
    if (e.statuses?.length) {
      f.statusText.setText(e.statuses.map((s) => statusLabel(s.kind)).join(" "));
      f.statusText.setColor(statusColor(e.statuses[0].kind));
      f.statusText.setVisible(true);
    } else {
      f.statusText.setVisible(false);
    }
    f.gcdBack.setVisible(true);
    f.gcdBar.setVisible(e.alive);
    f.container.setAlpha(e.alive ? 1 : 0.25);
    if (!e.alive && f.body) f.body.fillColor = 0x555555;
    f.sprite?.update(delta);

    const state = useGame.getState();
    const sk = state.selectedAction;
    const self = state.selfId ? state.battle?.entities.find((x) => x.id === state.selfId) : undefined;
    const targeted = self?.target_id === e.id;
    const targetable = !!sk && e.alive && (sk.heals ? e.is_player : !e.is_player);
    if (targetable) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 150);
      f.ring.setVisible(true);
      f.ring.setFillStyle(0xffe9a8, 0.2 * pulse + 0.1);
      if (f.body) f.body.setStrokeStyle(3, Phaser.Display.Color.GetColor(255, 233, 168 * pulse + 40));
    } else if (targeted) {
      f.ring.setVisible(true);
      f.ring.setFillStyle(0xe8a13c, 0.35);
      if (f.body) f.body.setStrokeStyle(3, 0xe8a13c);
    } else {
      f.ring.setVisible(false);
      if (f.body) f.body.setStrokeStyle(2, 0x000000);
    }
  }

  private animateResult(r: ActionResult) {
    const actor = this.figures.get(r.actor_id);
    const target = this.figures.get(r.target_id);

    if (!r.success) {
      if (actor) this.floatText(actor.container.x, actor.container.y - 40, "fizzle", "#8899aa");
      return;
    }
    if (actor) {
      actor.sprite?.playAttack();
      const dir = actor.container.x < VIEW_W / 2 ? 1 : -1;
      this.tweens.add({
        targets: actor.container,
        x: actor.homeX + 30 * dir,
        duration: 110,
        yoyo: true,
        ease: "Power2",
      });
    }
    if (target) {
      if (r.damage) {
        this.floatText(target.container.x, target.container.y - 45, `${r.damage}`, "#ffffff");
        this.tweens.add({
          targets: target.container,
          alpha: 0.3,
          duration: 60,
          yoyo: true,
          repeat: 2,
        });
        this.cameras.main.shake(80, 0.003);
      } else if (r.heal) {
        this.floatText(target.container.x, target.container.y - 45, `+${r.heal}`, "#4ade80");
      }
    }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, {
        fontSize: "18px",
        color,
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(1, 1, "#000", 3);
    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 900,
      ease: "Power1",
      onComplete: () => t.destroy(),
    });
  }
}
