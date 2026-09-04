import Phaser from "phaser";
import { battleEvents, net } from "../../net/socket";
import { useGame } from "../../state/store";
import { resolveCharacterAppearance } from "../../characters/resolveAppearance";
import { H99_NAME_LABEL_Y } from "../../characters/types";
import type { ActionResult, RTBattleEntity, RTBattleEventPayload } from "../../types";
import { CharacterSprite } from "../../phaser/CharacterSprite";
import { EnemySprite } from "../../phaser/EnemySprite";
import { enemyKindFromName } from "../../characters/enemies";
import { ensureEnemyTextures } from "../../characters/enemyAssets";
import { isJumpAction, playBattleVfx, playCastStartVfx, playFizzleVfx, playJumpCrash } from "../../phaser/battleVfx";
import { battleDuration, DEFAULT_BATTLE_SPEED } from "../../phaser/battleAnim";
import { bindingToPhaserKeyCode, mergeKeybinds } from "../../input/keybinds";

const ARENA_W = 720;
const ARENA_H = 480;
const SPEED = 220;

interface Fighter {
  wrapper: Phaser.GameObjects.Container;
  sprite: CharacterSprite | EnemySprite;
  label: Phaser.GameObjects.Text;
  castBack: Phaser.GameObjects.Rectangle;
  castBar: Phaser.GameObjects.Rectangle;
  isPlayer: boolean;
}

const CAST_BAR_Y = 12;
const CAST_BAR_W = 48;

export class RTBattleScene extends Phaser.Scene {
  private fighters = new Map<string, Fighter>();
  private moveKeys: Partial<Record<"move_up" | "move_down" | "move_left" | "move_right", Phaser.Input.Keyboard.Key>> = {};
  private moveKeysSig = "";
  private lastMoveSent = 0;
  private lastSentX = 0;
  private lastSentY = 0;
  private lastPos = new Map<string, { x: number; y: number }>();
  private jumping = new Set<string>();
  private createGen = 0;
  private onRtEvent = (p: RTBattleEventPayload) => this.animateEvent(p);
  private onBattleShutdown = () => {
    battleEvents.off("rt_event", this.onRtEvent);
    this.createGen++;
    this.moveKeysSig = "";
    this.moveKeys = {};
  };

  constructor() {
    super("battle");
  }

  async create() {
    const gen = ++this.createGen;
    this.fighters.clear();
    this.lastPos.clear();
    this.jumping.clear();
    // Scene instances are reused across stop→start; clear stale Key refs up front.
    this.moveKeysSig = "";
    this.moveKeys = {};
    this.lastMoveSent = 0;
    this.lastSentX = 0;
    this.lastSentY = 0;
    this.cameras.main.setBackgroundColor(0x0a1420);
    const g = this.add.graphics();
    g.fillStyle(0x1a2838, 1);
    g.fillRect(0, 0, ARENA_W, ARENA_H);
    g.lineStyle(2, 0x3a5068, 1);
    g.strokeRect(0, 0, ARENA_W, ARENA_H);

    await ensureEnemyTextures(this);
    if (gen !== this.createGen || !this.sys.isActive()) return;

    // Rebind after await — previous battle's Key objects are invalid on restart.
    this.moveKeysSig = "";
    this.moveKeys = {};
    this.syncMoveKeys(true);
    this.input.keyboard?.disableGlobalCapture();

    battleEvents.off("rt_event", this.onRtEvent);
    battleEvents.on("rt_event", this.onRtEvent);
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onBattleShutdown);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.onBattleShutdown);
  }

  /** Rebind WASD. Never mark the signature until keys are actually attached. */
  private syncMoveKeys(force = false) {
    const binds = mergeKeybinds(useGame.getState().profile?.keybinds);
    const sig = `${binds.move_up}|${binds.move_down}|${binds.move_left}|${binds.move_right}`;
    const missing = !this.moveKeys.move_up || !this.moveKeys.move_down || !this.moveKeys.move_left || !this.moveKeys.move_right;
    if (!force && !missing && sig === this.moveKeysSig) return;
    const kb = this.input.keyboard;
    if (!kb) {
      // Don't latch sig — keyboard may appear on the next frame after scene restart.
      this.moveKeysSig = "";
      return;
    }
    const bindKey = (action: "move_up" | "move_down" | "move_left" | "move_right") => {
      const code = bindingToPhaserKeyCode(binds[action] ?? "");
      this.moveKeys[action] = code != null ? kb.addKey(code) : undefined;
    };
    bindKey("move_up");
    bindKey("move_down");
    bindKey("move_left");
    bindKey("move_right");
    this.moveKeysSig = sig;
  }

  private isMoveDown(action: "move_up" | "move_down" | "move_left" | "move_right"): boolean {
    return !!this.moveKeys[action]?.isDown;
  }

  private ensureEntity(ent: RTBattleEntity) {
    let f = this.fighters.get(ent.id);
    if (f) {
      const selfId = useGame.getState().selfId;
      if (ent.id !== selfId && !this.jumping.has(ent.id)) {
        f.wrapper.setPosition(ent.x, ent.y);
      }
      f.wrapper.setAlpha(ent.alive ? 1 : 0.35);
      return f;
    }
    const wrapper = this.add.container(ent.x, ent.y).setDepth(10);
    let sprite: CharacterSprite | EnemySprite;
    if (ent.is_player) {
      const state = useGame.getState();
      const wp = state.players[ent.id];
      const appearance = resolveCharacterAppearance({
        playerId: ent.id,
        selfId: state.selfId,
        profile: state.profile,
        race: wp?.race,
        weapon: wp?.weapon,
      });
      sprite = new CharacterSprite(this, 0, 0, appearance);
    } else {
      const kind = enemyKindFromName(ent.name, ent.kind);
      sprite = new EnemySprite(this, 0, 0, kind);
    }
    const label = this.add
      .text(0, H99_NAME_LABEL_Y, `${ent.name}`, { fontSize: "10px", color: "#fff", fontFamily: "monospace" })
      .setOrigin(0.5);
    const castBack = this.add.rectangle(0, CAST_BAR_Y, CAST_BAR_W + 2, 7, 0x1a1028).setOrigin(0.5);
    castBack.setStrokeStyle(1, 0x6a4a8a);
    const castBar = this.add.rectangle(-CAST_BAR_W / 2, CAST_BAR_Y, 0, 5, 0xa78bfa).setOrigin(0, 0.5);
    castBack.setVisible(false);
    castBar.setVisible(false);
    wrapper.add([sprite.container, label, castBack, castBar]);
    wrapper.setSize(48, 48);
    wrapper.setInteractive({ useHandCursor: true });
    wrapper.on("pointerdown", () => {
      net.clickEntity({
        id: ent.id,
        alive: ent.alive,
        is_player: ent.is_player,
        is_ally: ent.is_ally,
      });
    });
    f = { wrapper, sprite, label, castBack, castBar, isPlayer: ent.is_player };
    this.fighters.set(ent.id, f);
    this.lastPos.set(ent.id, { x: ent.x, y: ent.y });
    return f;
  }

  private animateEvent(p: RTBattleEventPayload) {
    const actor = this.fighters.get(p.attacker_id);
    const target = p.target_id ? this.fighters.get(p.target_id) : undefined;
    const speed = DEFAULT_BATTLE_SPEED;
    const result: ActionResult = {
      actor_id: p.attacker_id,
      action_id: p.action_id ?? "attack",
      action_name: p.action_name ?? "",
      target_id: p.target_id ?? "",
      success: p.success ?? p.hit,
      damage: p.damage,
      heal: p.heal,
      mp_restored: p.mp_restored,
      message: p.message,
      cast_started: p.cast_started,
    };

    if (p.cast_cancelled) {
      if (actor) {
        actor.sprite.setCasting(false);
        this.hideCastBar(actor);
        playFizzleVfx(this, actor.wrapper.x, actor.wrapper.y - 36, speed);
      }
      return;
    }

    if (!result.success) {
      if (actor) playFizzleVfx(this, actor.wrapper.x, actor.wrapper.y - 36, speed);
      if (result.action_id === "attack") actor?.sprite.playAttack();
      return;
    }

    if (result.cast_started) {
      if (actor) {
        actor.sprite.setCasting(true);
        playCastStartVfx(this, actor.wrapper.x, actor.wrapper.y - 20, result.action_id, speed);
      }
      return;
    }

    actor?.sprite.setCasting(false);
    if (actor) this.hideCastBar(actor);
    actor?.sprite.playAttack();

    const actorPos = actor ? { x: actor.wrapper.x, y: actor.wrapper.y } : undefined;
    const targetPos = target ? { x: target.wrapper.x, y: target.wrapper.y } : undefined;

    const showHit = () => {
      if (!target) return;
      if (result.damage) {
        this.floatText(target.wrapper.x, target.wrapper.y - 42, `${result.damage}`, "#ffffff", speed);
        target.sprite.playHit(speed);
        this.cameras.main.shake(battleDuration(70, speed), 0.003);
      } else if (result.heal) {
        this.floatText(target.wrapper.x, target.wrapper.y - 42, `+${result.heal}`, "#4ade80", speed);
      } else if (result.mp_restored) {
        this.floatText(target.wrapper.x, target.wrapper.y - 42, `+${result.mp_restored} MP`, "#4aa3e8", speed);
      }
    };

    if (actor && target && isJumpAction(result.action_id)) {
      this.jumping.add(p.attacker_id);
      const inner = actor.sprite.container;
      this.tweens.killTweensOf(inner);
      inner.x = 0;
      inner.y = 0;
      playJumpCrash(
        this,
        actor.wrapper,
        target.wrapper,
        speed,
        () => {
          playBattleVfx(this, result, { x: target.wrapper.x, y: target.wrapper.y }, targetPos, speed);
          showHit();
        },
        () => {
          this.jumping.delete(p.attacker_id);
        },
      );
      return;
    }

    playBattleVfx(this, result, actorPos, targetPos, speed);

    if (actor && target) {
      const dx = target.wrapper.x - actor.wrapper.x;
      const dy = target.wrapper.y - actor.wrapper.y;
      const mag = Math.hypot(dx, dy) || 1;
      const inner = actor.sprite.container;
      this.tweens.killTweensOf(inner);
      this.tweens.add({
        targets: inner,
        x: (dx / mag) * 22,
        y: (dy / mag) * 22,
        duration: battleDuration(110, speed),
        yoyo: true,
        ease: "Power2",
        onComplete: () => {
          inner.x = 0;
          inner.y = 0;
        },
      });
    }

    showHit();
  }

  private hideCastBar(f: Fighter) {
    f.castBack.setVisible(false);
    f.castBar.setVisible(false);
    f.castBar.width = 0;
  }

  private syncCastBar(f: Fighter, ent: RTBattleEntity, casting: boolean) {
    if (!casting || !ent.alive) {
      this.hideCastBar(f);
      return;
    }
    const pct = Phaser.Math.Clamp((ent.cast_progress ?? 0) / 100, 0, 1);
    f.castBack.setVisible(true);
    f.castBar.setVisible(true);
    f.castBar.width = CAST_BAR_W * pct;
    f.castBar.fillColor = pct >= 1 ? 0xc4b5fd : 0xa78bfa;
  }

  private floatText(x: number, y: number, text: string, color: string, battleSpeed: number) {
    const t = this.add
      .text(x, y, text, {
        fontSize: "16px",
        color,
        fontFamily: "monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(80)
      .setShadow(1, 1, "#000", 3);
    this.tweens.add({
      targets: t,
      y: y - 36,
      alpha: 0,
      duration: battleDuration(900, battleSpeed),
      ease: "Power1",
      onComplete: () => t.destroy(),
    });
  }

  update() {
    this.syncMoveKeys();
    const rt = useGame.getState().rtBattle;
    if (!rt) return;
    for (const ent of rt.entities) {
      this.ensureEntity(ent);
    }
    for (const [id, f] of this.fighters) {
      if (!rt.entities.find((e) => e.id === id)) {
        f.wrapper.destroy();
        this.fighters.delete(id);
        this.lastPos.delete(id);
        this.jumping.delete(id);
      }
    }

    const selfId = useGame.getState().selfId;
    const self = selfId ? this.fighters.get(selfId) : undefined;
    let moveX = 0;
    let moveY = 0;
    const selfJumping = !!(selfId && this.jumping.has(selfId));
    if (self && !selfJumping && !rt.end) {
      if (this.isMoveDown("move_left")) moveX -= 1;
      if (this.isMoveDown("move_right")) moveX += 1;
      if (this.isMoveDown("move_up")) moveY -= 1;
      if (this.isMoveDown("move_down")) moveY += 1;
    }
    const selfMoving = moveX !== 0 || moveY !== 0;

    for (const ent of rt.entities) {
      const f = this.fighters.get(ent.id);
      if (!f) continue;
      const prev = this.lastPos.get(ent.id);
      const dx = ent.x - (prev?.x ?? ent.x);
      const dy = ent.y - (prev?.y ?? ent.y);
      this.lastPos.set(ent.id, { x: ent.x, y: ent.y });
      if (ent.id !== selfId && !this.jumping.has(ent.id)) {
        f.sprite.setMoving(Math.hypot(dx, dy) > 0.6, dx, dy);
      }
      const casting = !!ent.casting_skill_id && !(ent.id === selfId && selfMoving);
      f.sprite.setCasting(casting);
      this.syncCastBar(f, ent, casting);
      f.sprite.update(this.game.loop.delta);
    }

    if (!selfId || rt.end || !self) return;

    const dt = this.game.loop.delta / 1000;
    if (!selfMoving) {
      (self.sprite as CharacterSprite).setMoving(false);
      return;
    }
    const len = Math.hypot(moveX, moveY);
    const nx = Phaser.Math.Clamp(self.wrapper.x + (moveX / len) * SPEED * dt, 18, ARENA_W - 18);
    const ny = Phaser.Math.Clamp(self.wrapper.y + (moveY / len) * SPEED * dt, 18, ARENA_H - 18);
    self.wrapper.setPosition(nx, ny);
    (self.sprite as CharacterSprite).setMoving(true, moveX, moveY);
    const now = this.game.loop.now;
    const moved = Math.hypot(nx - this.lastSentX, ny - this.lastSentY) > 2;
    if (moved && now - this.lastMoveSent >= 50) {
      this.lastMoveSent = now;
      this.lastSentX = nx;
      this.lastSentY = ny;
      const selfEnt = rt.entities.find((e) => e.id === selfId);
      if (selfEnt?.casting_skill_id) {
        useGame.setState((s) => {
          if (!s.rtBattle || !selfId) return s;
          return {
            rtBattle: {
              ...s.rtBattle,
              entities: s.rtBattle.entities.map((e) =>
                e.id === selfId
                  ? {
                      ...e,
                      casting_skill_id: undefined,
                      cast_target_id: undefined,
                      cast_progress: undefined,
                      cast_time_ms: undefined,
                    }
                  : e,
              ),
            },
          };
        });
      }
      net.rtMove(nx, ny);
    }
  }
}
