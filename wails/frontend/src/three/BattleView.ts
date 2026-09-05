import * as THREE from "three";
import { net } from "../net/socket";
import { useGame } from "../state/store";
import { pluginHost } from "../core/plugins/pluginHost";
import { enemyKindFromName } from "../characters/enemies";
import { createBattleArenaMesh, createCharacterMesh, createEnemyMesh } from "./geometries";
import { setMapPosition } from "./coords";
import { ensureKeyboard, readMoveAxes } from "./input";
import type { Css2dLabelSpec } from "./Css2dLabels";
import { pushLabel, worldEntityLabel, type ThreeStageContext } from "./stage";

const ARENA_W = 720;
const ARENA_D = 480;
const SPEED = 220;
const SEND_MS = 80;

type Ent = { root: THREE.Group; isPlayer: boolean };

/**
 * Placeholder 3D battle arena. Reads ATB (`battle`) or realtime (`rtBattle`) store
 * and uses custom geometries until real models/VFX land.
 */
export class BattleView {
  readonly scene = new THREE.Scene();
  private entities = new Map<string, Ent>();
  private arena: THREE.Object3D | null = null;
  private selfPos = { x: ARENA_W / 2, y: ARENA_D / 2 };
  private lastSent = 0;
  private lightsReady = false;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.scene.background = new THREE.Color(0x0a1420);
  }

  private ensureLights() {
    if (this.lightsReady) return;
    this.lightsReady = true;
    this.scene.add(new THREE.HemisphereLight(0x88aacc, 0x1a1020, 0.9));
    const sun = new THREE.DirectionalLight(0xffe0c0, 1);
    sun.position.set(100, 200, 80);
    this.scene.add(sun);
  }

  activate() {
    ensureKeyboard();
    this.ensureLights();
    if (!this.arena) {
      this.arena = createBattleArenaMesh(ARENA_W, ARENA_D);
      this.arena.position.set(ARENA_W / 2, 0, ARENA_D / 2);
      this.scene.add(this.arena);
    }
  }

  deactivate() {}

  dispose() {
    this.deactivate();
    for (const e of this.entities.values()) this.scene.remove(e.root);
    this.entities.clear();
    if (this.arena) {
      this.scene.remove(this.arena);
      this.arena = null;
    }
  }

  update(_dt: number, timeMs: number, _stage: ThreeStageContext): Css2dLabelSpec[] {
    const state = useGame.getState();
    const combat = pluginHost.getCombatPlugin();
    if (state.screen !== combat.battleScreen) {
      return [];
    }

    const labels: Css2dLabelSpec[] = [];
    const seen = new Set<string>();

    const rt = state.rtBattle;
    if (rt?.entities?.length) {
      for (const ent of rt.entities) {
        seen.add(ent.id);
        const isPlayer = !!ent.is_player || ent.id === state.selfId;
        let rec = this.entities.get(ent.id);
        if (!rec) {
          const root = isPlayer
            ? createCharacterMesh({ self: ent.id === state.selfId })
            : createEnemyMesh(enemyKindFromName(ent.name, ent.kind));
          this.scene.add(root);
          rec = { root, isPlayer };
          this.entities.set(ent.id, rec);
        }
        let x = ent.x ?? ARENA_W / 2;
        let y = ent.y ?? ARENA_D / 2;
        if (ent.id === state.selfId) {
          x = this.selfPos.x;
          y = this.selfPos.y;
        } else {
          x = THREE.MathUtils.lerp(rec.root.position.x || x, x, 0.25);
          y = THREE.MathUtils.lerp(rec.root.position.z || y, y, 0.25);
        }
        setMapPosition(rec.root, x, y, 0);
        pushLabel(
          labels,
          worldEntityLabel(
            ent.id,
            ent.name,
            isPlayer ? (ent.id === state.selfId ? "self" : "player") : "enemy",
            x,
            y,
          ),
        );
      }
      this.moveRtSelf(_dt, timeMs, state.selfId);
    } else if (state.battle?.entities?.length) {
      const list = state.battle.entities;
      const allies = list.filter((e) => e.is_player || e.is_ally);
      const foes = list.filter((e) => !e.is_player && !e.is_ally);
      allies.forEach((a, i) => {
        seen.add(a.id);
        const x = 160;
        const y = 120 + i * 70;
        let rec = this.entities.get(a.id);
        if (!rec) {
          const root = createCharacterMesh({ self: a.id === state.selfId });
          this.scene.add(root);
          rec = { root, isPlayer: true };
          this.entities.set(a.id, rec);
        }
        setMapPosition(rec.root, x, y, 0);
        pushLabel(
          labels,
          worldEntityLabel(a.id, a.name, a.id === state.selfId ? "self" : "player", x, y),
        );
      });
      foes.forEach((f, i) => {
        seen.add(f.id);
        const x = 520;
        const y = 120 + i * 70;
        let rec = this.entities.get(f.id);
        if (!rec) {
          const root = createEnemyMesh(enemyKindFromName(f.name, f.kind));
          this.scene.add(root);
          rec = { root, isPlayer: false };
          this.entities.set(f.id, rec);
        }
        setMapPosition(rec.root, x, y, 0);
        pushLabel(labels, worldEntityLabel(f.id, f.name, "enemy", x, y));
      });
    }

    for (const [id, e] of this.entities) {
      if (!seen.has(id)) {
        this.scene.remove(e.root);
        this.entities.delete(id);
      }
    }

    this.camera.position.set(ARENA_W / 2, 320, ARENA_D / 2 + 280);
    this.camera.lookAt(ARENA_W / 2, 0, ARENA_D / 2);
    return labels;
  }

  private moveRtSelf(dt: number, timeMs: number, selfId: string | null) {
    if (!selfId) return;
    const { dx, dy } = readMoveAxes(useGame.getState().profile?.keybinds);
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      this.selfPos.x = Math.min(ARENA_W - 16, Math.max(16, this.selfPos.x + (dx / len) * SPEED * dt));
      this.selfPos.y = Math.min(ARENA_D - 16, Math.max(16, this.selfPos.y + (dy / len) * SPEED * dt));
      const rec = this.entities.get(selfId);
      if (rec) setMapPosition(rec.root, this.selfPos.x, this.selfPos.y, 0);
    }
    if (timeMs - this.lastSent >= SEND_MS) {
      this.lastSent = timeMs;
      net.rtMove(this.selfPos.x, this.selfPos.y);
    }
  }
}
