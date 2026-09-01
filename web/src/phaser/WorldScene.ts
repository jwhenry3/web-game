import Phaser from "phaser";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { resolveCharacterAppearance } from "../characters/resolveAppearance";
import { appearanceKey, H99_NAME_LABEL_Y, H99_WORLD_RING_RADIUS } from "../characters/types";
import type { OverworldMap, WorldNPC, CharacterAppearanceWire } from "../types";
import { FILL, H99_COLLISION_HALF_H, H99_COLLISION_HALF_W, slideMovePlayer, tileAt } from "../world/overworld";
import { CharacterSprite } from "./CharacterSprite";
import { EnemySprite } from "./EnemySprite";
import { enemyKindFromName } from "../characters/enemies";

const WORLD_W = 1600;
const WORLD_H = 1200;
const SPEED = 240;
const SEND_INTERVAL = 100;

interface Avatar {
  wrapper: Phaser.GameObjects.Container;
  sprite: CharacterSprite;
  label: Phaser.GameObjects.Text;
  ring?: Phaser.GameObjects.Arc;
  appearanceKey: string;
}

interface FoeAvatar {
  wrapper: Phaser.GameObjects.Container;
  enemy: EnemySprite;
  label: Phaser.GameObjects.Text;
  lastX: number;
  lastY: number;
}

export class WorldScene extends Phaser.Scene {
  private avatars = new Map<string, Avatar>();
  private foes = new Map<string, FoeAvatar>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private lastSent = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  private selfSpawned = false;
  private terrain?: Phaser.GameObjects.Graphics;
  private terrainKey = "";

  constructor() {
    super("world");
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.syncTerrain(useGame.getState().overworld);

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    kb.disableGlobalCapture();
  }

  private resolveAppearance(
    playerId: string,
    race?: string,
    weapon?: string,
    wire?: CharacterAppearanceWire,
  ) {
    const state = useGame.getState();
    return resolveCharacterAppearance({
      playerId,
      selfId: state.selfId,
      profile: state.profile,
      race,
      weapon,
      wire,
    });
  }

  private syncTerrain(map: OverworldMap | null) {
    if (!map || map.cells === this.terrainKey) return;
    this.terrainKey = map.cells;
    this.terrain?.destroy();
    const g = this.add.graphics().setDepth(0);
    const t = map.tile;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const ch = tileAt(map, c, r);
        g.fillStyle(FILL[ch] ?? 0x14331e);
        g.fillRect(c * t, r * t, t, t);
        if (ch === "T") {
          g.fillStyle(0x2c6b38);
          g.fillCircle(c * t + t / 2, r * t + t / 2, t * 0.38);
        } else if (ch === "#") {
          g.fillStyle(0x2a2a30);
          g.fillRect(c * t + 4, r * t + 4, t - 8, t - 8);
        }
      }
    }
    g.lineStyle(1, 0x0c140e, 0.25);
    for (let x = 0; x <= WORLD_W; x += t) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += t) g.lineBetween(0, y, WORLD_W, y);
    this.terrain = g;
  }

  private ensureAvatar(id: string, race?: string, weapon?: string, wire?: CharacterAppearanceWire): Avatar {
    const appearance = this.resolveAppearance(id, race, weapon, wire);
    const key = appearanceKey(appearance);
    let av = this.avatars.get(id);
    if (av) {
      if (av.appearanceKey !== key) {
        av.sprite.setAppearance(appearance);
        av.appearanceKey = key;
      }
      return av;
    }

    const wrapper = this.add.container(0, 0).setDepth(10);
    const ring = this.add.circle(0, 3, H99_WORLD_RING_RADIUS, 0xffe9a8, 0).setVisible(false);
    const sprite = new CharacterSprite(this, 0, 0, appearance);
    const label = this.add
      .text(0, H99_NAME_LABEL_Y, "", { fontSize: "11px", color: "#ffffff", fontFamily: "monospace" })
      .setOrigin(0.5, 0.5)
      .setShadow(1, 1, "#000000", 2);
    wrapper.add([ring, sprite.container, label]);

    sprite.setInteractive(() => this.tryJoinBattleOf(id));

    av = { wrapper, sprite, label, ring, appearanceKey: key };
    this.avatars.set(id, av);
    return av;
  }

  private ensureFoe(npc: WorldNPC): FoeAvatar {
    let av = this.foes.get(npc.id);
    if (av) return av;
    const kind = enemyKindFromName(npc.name, npc.kind);
    const wrapper = this.add.container(npc.x, npc.y).setDepth(9);
    const enemy = new EnemySprite(this, 0, 0, kind);
    const label = this.add
      .text(0, H99_NAME_LABEL_Y, "", { fontSize: "11px", color: "#e6d4b0", fontFamily: "Noto Sans, sans-serif" })
      .setOrigin(0.5, 0.5)
      .setShadow(1, 1, "#000000", 2);
    wrapper.add([enemy.container, label]);
    enemy.setInteractive(() => this.tryJoinBattleOfNPC(npc.id));
    av = { wrapper, enemy, label, lastX: npc.x, lastY: npc.y };
    this.foes.set(npc.id, av);
    return av;
  }

  private tryJoinBattleOfNPC(id: string) {
    const state = useGame.getState();
    const npc = state.npcs[id];
    const selfWp = state.selfId ? state.players[state.selfId] : undefined;
    if (!npc?.in_battle || !npc.battle_id || selfWp?.in_battle) return;
    const info = state.battles.find((b) => b.battle_id === npc.battle_id);
    if (info && info.participants >= info.max_players) return;
    net.joinBattle(npc.battle_id);
  }

  private tryJoinBattleOf(id: string) {
    const state = useGame.getState();
    if (id === state.selfId) return;
    const target = state.players[id];
    const selfWp = state.selfId ? state.players[state.selfId] : undefined;
    if (!target?.in_battle || !target.battle_id || selfWp?.in_battle) return;
    const info = state.battles.find((b) => b.battle_id === target.battle_id);
    if (info && info.participants >= info.max_players) return;
    net.joinBattle(target.battle_id);
  }

  update(time: number, delta: number) {
    const state = useGame.getState();
    this.syncTerrain(state.overworld);
    const selfId = state.selfId;
    if (!selfId) return;

    for (const [id, av] of this.avatars) {
      if (!state.players[id]) {
        av.wrapper.destroy();
        this.avatars.delete(id);
        if (id === selfId) this.selfSpawned = false;
      }
    }

    const selfLocked = state.players[selfId]?.in_battle ?? false;
    for (const wp of Object.values(state.players)) {
      const av = this.ensureAvatar(wp.id, wp.race, wp.weapon, wp.appearance);
      const locked = wp.in_battle;
      const immune = !locked && (wp.immune_until ?? 0) > Date.now();
      av.wrapper.setAlpha(locked ? 0.45 : 1);
      const joinable = locked && wp.id !== selfId && !selfLocked;
      av.label.setText(
        `${wp.name} Lv${wp.level}${locked ? " ⚔" : ""}${joinable ? " (join)" : ""}${immune ? " 🛡" : ""}`,
      );
      if (av.ring) {
        av.ring.setVisible(joinable || immune);
        if (joinable) av.ring.setFillStyle(0xffe9a8, 0.25);
        else if (immune) {
          const pulse = 0.15 + 0.15 * Math.sin(this.time.now / 180);
          av.ring.setFillStyle(0xb4dcff, pulse);
        }
      }

      const isSelf = wp.id === selfId;
      if (!isSelf) {
        av.sprite.setMoving(false);
      }

      av.sprite.update(delta);

      if (isSelf) {
        if (!this.selfSpawned) {
          av.wrapper.setPosition(wp.x, wp.y);
          this.cameras.main.startFollow(av.wrapper, true, 0.15, 0.15);
          this.selfSpawned = true;
        }
      } else {
        av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, wp.x, 0.25);
        av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, wp.y, 0.25);
      }
    }

    this.syncFoes(state.npcs, selfLocked, delta);
    this.moveSelf(time, selfId);
  }

  private syncFoes(npcs: Record<string, WorldNPC>, selfLocked: boolean, delta: number) {
    for (const [id, av] of this.foes) {
      if (!npcs[id]) {
        av.wrapper.destroy();
        this.foes.delete(id);
      }
    }
    for (const npc of Object.values(npcs)) {
      const av = this.ensureFoe(npc);
      const kind = enemyKindFromName(npc.name, npc.kind);
      av.enemy.setKind(kind);
      av.wrapper.setAlpha(npc.in_battle ? 0.45 : 1);
      const joinable = npc.in_battle && !selfLocked;
      av.label.setText(`${npc.name} Lv${npc.level}${npc.in_battle ? " ⚔" : ""}${joinable ? " (join)" : ""}`);
      const prevX = av.lastX;
      const prevY = av.lastY;
      av.wrapper.x = Phaser.Math.Linear(av.wrapper.x, npc.x, 0.2);
      av.wrapper.y = Phaser.Math.Linear(av.wrapper.y, npc.y, 0.2);
      const dx = av.wrapper.x - prevX;
      const dy = av.wrapper.y - prevY;
      av.enemy.setMoving(Math.hypot(dx, dy) > 0.3, dx, dy);
      av.enemy.update(delta);
      av.lastX = av.wrapper.x;
      av.lastY = av.wrapper.y;
    }
  }

  private moveSelf(time: number, selfId: string) {
    const av = this.avatars.get(selfId);
    const wp = useGame.getState().players[selfId];
    if (!av || !wp || wp.in_battle) return;

    const active = document.activeElement?.tagName;
    if (active === "INPUT" || active === "TEXTAREA") {
      av.sprite.setMoving(false);
      return;
    }

    const dt = this.game.loop.delta / 1000;
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;

    if (dx === 0 && dy === 0) {
      av.sprite.setMoving(false);
      return;
    }

    av.sprite.setMoving(true, dx, dy);

    const len = Math.hypot(dx, dy);
    const nx = Phaser.Math.Clamp(
      av.wrapper.x + (dx / len) * SPEED * dt,
      H99_COLLISION_HALF_W,
      WORLD_W - H99_COLLISION_HALF_W,
    );
    const ny = Phaser.Math.Clamp(
      av.wrapper.y + (dy / len) * SPEED * dt,
      H99_COLLISION_HALF_H,
      WORLD_H,
    );
    const slid = slideMovePlayer(useGame.getState().overworld, av.wrapper.x, av.wrapper.y, nx, ny);
    av.wrapper.x = slid.x;
    av.wrapper.y = slid.y;

    if (time - this.lastSent > SEND_INTERVAL) {
      const x = Math.round(av.wrapper.x);
      const y = Math.round(av.wrapper.y);
      if (x !== this.lastSentX || y !== this.lastSentY) {
        net.move(x, y);
        this.lastSent = time;
        this.lastSentX = x;
        this.lastSentY = y;
      }
    }
  }
}
