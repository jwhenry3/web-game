import Phaser from "phaser";
import { battleEvents, net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { enemyKindFromName } from "../characters/enemies";
import { ensureEnemyTextures } from "../characters/enemyAssets";
import {
  appearanceKey,
  H99_BATTLE_RING_RADIUS,
  H99_DISPLAY_HEIGHT,
  H99_NAME_LABEL_Y,
} from "../characters/types";
import type { ActionResult, BattleEntity } from "../types";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
import { isJumpAction, playBattleVfx, playCastStartVfx, playFizzleVfx, playJumpCrash } from "./battleVfx";
import { battleDelta, battleDuration, DEFAULT_BATTLE_SPEED } from "./battleAnim";
import { statusColor, statusLabel } from "../ui/statusDisplay";

interface Figure {
  container: Phaser.GameObjects.Container;
  sprite: CharacterSprite | null;
  enemy: EnemySprite | null;
  label: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBack: Phaser.GameObjects.Rectangle;
  castBar: Phaser.GameObjects.Rectangle;
  castBack: Phaser.GameObjects.Rectangle;
  statusText: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Arc;
  homeX: number;
  appearanceKey: string;
  enemyKind: string;
}

const VIEW_W = 960;
const VIEW_H = 600;

export class BattleScene extends Phaser.Scene {
  private figures = new Map<string, Figure>();
  private onResult = (r: ActionResult) => this.animateResult(r);

  constructor() {
    super("battle");
  }

  async create() {
    this.drawBackdrop();
    await ensureEnemyTextures(this);
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
    const kind = enemyKindFromName(e.name, e.kind);
    let f = this.figures.get(e.id);
    if (f) {
      if (e.is_player && f.sprite && app && f.appearanceKey !== appKey) {
        f.sprite.setAppearance(app);
        f.appearanceKey = appKey;
      }
      if (!e.is_player && f.enemy && f.enemyKind !== kind) {
        f.enemy.setKind(kind);
        f.enemyKind = kind;
      }
      return f;
    }

    const spacing = Math.min(H99_DISPLAY_HEIGHT + 40, 360 / Math.max(count, 1));
    const y = 200 + index * spacing;
    const x = e.is_player ? 250 : 690;

    const container = this.add.container(x, y);
    let sprite: CharacterSprite | null = null;
    let enemy: EnemySprite | null = null;

    const ring = this.add.circle(0, 0, e.is_player ? H99_BATTLE_RING_RADIUS : H99_BATTLE_RING_RADIUS * 0.85, 0xffe9a8, 0).setVisible(false);

    const clickTarget = () => {
      const target = useGame.getState().battle?.entities.find((x) => x.id === e.id);
      if (target) net.clickEntity(target);
    };

    if (e.is_player) {
      sprite = new CharacterSprite(this, 0, 0, app!);
      sprite.setInteractive(clickTarget);
      container.add([ring, sprite.container]);
    } else {
      enemy = new EnemySprite(this, 0, 0, kind);
      enemy.setFacing("left");
      enemy.setInteractive(clickTarget);
      container.add([ring, enemy.container]);
    }

    const label = this.add
      .text(0, H99_NAME_LABEL_Y, e.name, { fontSize: "12px", color: "#ffffff", fontFamily: "monospace" })
      .setOrigin(0.5)
      .setShadow(1, 1, "#000", 2);

    const hpBack = this.add.rectangle(0, H99_NAME_LABEL_Y + 14, 50, 5, 0x222222).setOrigin(0.5);
    const hpBar = this.add.rectangle(-25, H99_NAME_LABEL_Y + 14, 50, 5, 0x4ade80).setOrigin(0, 0.5);

    const castY = 8;
    const castBack = this.add.rectangle(0, castY, 52, 7, 0x1a1028).setOrigin(0.5);
    castBack.setStrokeStyle(1, 0x6a4a8a);
    const castBar = this.add.rectangle(-25, castY, 0, 5, 0xa78bfa).setOrigin(0, 0.5);
    castBack.setVisible(false);
    castBar.setVisible(false);

    const statusText = this.add
      .text(0, H99_NAME_LABEL_Y + 22, "", { fontSize: "9px", color: "#ffffff", fontFamily: "monospace" })
      .setOrigin(0.5);

    container.add([label, hpBack, hpBar, statusText, castBack, castBar]);
    f = {
      container,
      sprite,
      enemy,
      label,
      hpBar,
      hpBack,
      castBar,
      castBack,
      statusText,
      ring,
      homeX: x,
      appearanceKey: appKey,
      enemyKind: kind,
    };
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
    const battleSpeed = useGame.getState().battle?.battleSpeed ?? DEFAULT_BATTLE_SPEED;
    const animDelta = battleDelta(delta, battleSpeed);
    const ratio = e.max_hp > 0 ? Phaser.Math.Clamp(e.hp / e.max_hp, 0, 1) : 0;
    f.hpBar.width = 50 * ratio;
    f.hpBar.fillColor = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfacc15 : 0xef4444;
    if (e.statuses?.length) {
      f.statusText.setText(e.statuses.map((s) => statusLabel(s.kind)).join(" "));
      f.statusText.setColor(statusColor(e.statuses[0].kind));
      f.statusText.setVisible(true);
    } else {
      f.statusText.setVisible(false);
    }

    const casting = !!e.casting_skill_id;
    f.sprite?.setCasting(casting);
    f.enemy?.setCasting(casting);
    if (casting) {
      const castPct = Phaser.Math.Clamp((e.cast_progress ?? 0) / 100, 0, 1);
      f.castBack.setVisible(true);
      f.castBar.setVisible(e.alive);
      f.castBar.width = 50 * castPct;
      f.castBar.fillColor = castPct >= 1 ? 0xc4b5fd : 0xa78bfa;
    } else {
      f.castBack.setVisible(false);
      f.castBar.setVisible(false);
    }

    f.container.setAlpha(e.alive ? 1 : 0.25);
    f.sprite?.update(animDelta);
    f.enemy?.update(animDelta);

    const state = useGame.getState();
    const sk = state.selectedAction;
    const self = state.selfId ? state.battle?.entities.find((x) => x.id === state.selfId) : undefined;
    const targeted = self?.target_id === e.id;
    const targetable = !!sk && e.alive && (sk.heals ? e.is_player : !e.is_player);
    const gcdReady =
      e.is_player && e.alive && !casting && (e.skill_atb ?? e.atb ?? 0) >= 100;
    const isSelf = e.id === state.selfId;

    f.ring.isStroked = false;
    if (targetable) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 150);
      f.ring.setVisible(true);
      f.ring.setFillStyle(0xffe9a8, 0.2 * pulse + 0.1);
    } else if (targeted) {
      f.ring.setVisible(true);
      f.ring.setFillStyle(0xe8a13c, 0.35);
    } else if (gcdReady) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 220);
      f.ring.setVisible(true);
      f.ring.setFillStyle(0xfacc15, (isSelf ? 0.28 : 0.16) * pulse + (isSelf ? 0.22 : 0.1));
      if (isSelf) {
        f.ring.isStroked = true;
        f.ring.setStrokeStyle(2, 0xffe9a8, 0.45 * pulse + 0.35);
      }
      f.sprite?.setGcdReady(isSelf);
    } else {
      f.ring.setVisible(false);
      f.sprite?.setGcdReady(false);
    }
  }

  private animateResult(r: ActionResult) {
    const actor = this.figures.get(r.actor_id);
    const target = this.figures.get(r.target_id);
    const battleSpeed = useGame.getState().battle?.battleSpeed ?? DEFAULT_BATTLE_SPEED;

    if (!r.success) {
      if (actor) playFizzleVfx(this, actor.container.x, actor.container.y - 40, battleSpeed);
      return;
    }

    if (r.cast_started) {
      if (actor) {
        actor.sprite?.setCasting(true);
        actor.enemy?.setCasting(true);
        playCastStartVfx(this, actor.container.x, actor.container.y - 20, r.action_id, battleSpeed);
      }
      return;
    }

    const actorPos = actor ? { x: actor.container.x, y: actor.container.y } : undefined;
    const targetPos = target ? { x: target.container.x, y: target.container.y } : undefined;

    const showHit = () => {
      if (!target) return;
      if (r.damage) {
        this.floatText(target.container.x, target.container.y - 45, `${r.damage}`, "#ffffff", battleSpeed);
        target.enemy?.playHit(battleSpeed);
        this.tweens.add({
          targets: target.container,
          alpha: 0.3,
          duration: battleDuration(60, battleSpeed),
          yoyo: true,
          repeat: 2,
        });
        this.cameras.main.shake(battleDuration(80, battleSpeed), 0.003);
      } else if (r.heal) {
        this.floatText(target.container.x, target.container.y - 45, `+${r.heal}`, "#4ade80", battleSpeed);
      }
    };

    if (actor && target && isJumpAction(r.action_id)) {
      actor.sprite?.playAttack();
      actor.enemy?.playAttack();
      playJumpCrash(
        this,
        actor.container,
        target.container,
        battleSpeed,
        () => {
          playBattleVfx(this, r, { x: target.container.x, y: target.container.y }, targetPos, battleSpeed);
          showHit();
        },
        () => {
          actor.container.x = actor.homeX;
        },
      );
      return;
    }

    playBattleVfx(this, r, actorPos, targetPos, battleSpeed);

    if (actor) {
      actor.sprite?.playAttack();
      actor.enemy?.playAttack();
      let lungeX = actor.homeX + (actor.homeX < VIEW_W / 2 ? 30 : -30);
      if (target) {
        const dx = target.container.x - actor.container.x;
        if (Math.abs(dx) > 4) {
          lungeX = actor.container.x + Math.sign(dx) * 30;
        }
      }
      this.tweens.add({
        targets: actor.container,
        x: lungeX,
        duration: battleDuration(110, battleSpeed),
        yoyo: true,
        ease: "Power2",
        onComplete: () => {
          actor.container.x = actor.homeX;
        },
      });
    }
    showHit();
  }

  private floatText(x: number, y: number, text: string, color: string, battleSpeed: number) {
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
      duration: battleDuration(900, battleSpeed),
      ease: "Power1",
      onComplete: () => t.destroy(),
    });
  }
}
