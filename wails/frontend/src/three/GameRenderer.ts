import * as THREE from "three";
import { useGame } from "../state/store";
import { pluginHost } from "../core/plugins/pluginHost";
import { WorldView } from "./WorldView";
import { HouseView } from "./HouseView";
import { BattleView } from "./BattleView";
import { Css2dLabelLayer, type Css2dLabelSpec } from "./Css2dLabels";
import type { ThreeStageContext } from "./stage";

export type ViewMode = "world" | "house" | "battle" | "none";

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly labels: Css2dLabelLayer;
  private world: WorldView;
  private house: HouseView;
  private battle: BattleView;
  private mode: ViewMode = "none";
  private raf = 0;
  private last = 0;
  private host: HTMLElement;
  private stageEl: HTMLElement;
  private running = false;

  constructor(host: HTMLElement) {
    this.host = host;
    this.stageEl = host.parentElement ?? host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.labels = new Css2dLabelLayer(host);

    // Link's Awakening–like toy perspective (moderate FOV, face-readable pitch).
    this.camera = new THREE.PerspectiveCamera(38, 1, 2, 4500);
    this.world = new WorldView(this.camera);
    this.house = new HouseView(this.camera);
    this.battle = new BattleView(this.camera);

    this.resize();
    window.addEventListener("resize", this.onResize);
  }

  private onResize = () => this.resize();

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.labels.resize(w, h);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt, now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this.onResize);
    this.world.dispose();
    this.house.dispose();
    this.battle.dispose();
    this.labels.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private stageCtx(): ThreeStageContext {
    return {
      camera: this.camera,
      canvas: this.renderer.domElement,
      stageEl: this.stageEl,
    };
  }

  private syncMode() {
    const state = useGame.getState();
    const combat = pluginHost.getCombatPlugin();
    let next: ViewMode = "none";
    if (state.screen === combat.battleScreen) next = "battle";
    else if (state.screen === "house") next = "house";
    else if (state.screen === "world") next = "world";

    if (next === this.mode) return;
    if (this.mode === "world") this.world.deactivate();
    if (this.mode === "house") this.house.deactivate();
    if (this.mode === "battle") this.battle.deactivate();
    this.mode = next;
    this.labels.clear();
    if (next === "world") this.world.activate(this.renderer.domElement);
    if (next === "house") this.house.activate(this.renderer.domElement);
    if (next === "battle") this.battle.activate();
  }

  private frame(dt: number, timeMs: number) {
    this.syncMode();
    const stage = this.stageCtx();
    let scene: THREE.Scene | null = null;
    let labelSpecs: Css2dLabelSpec[] = [];
    if (this.mode === "world") {
      labelSpecs = this.world.update(dt, timeMs, stage);
      scene = this.world.scene;
    } else if (this.mode === "house") {
      labelSpecs = this.house.update(dt, stage);
      scene = this.house.scene;
    } else if (this.mode === "battle") {
      labelSpecs = this.battle.update(dt, timeMs, stage);
      scene = this.battle.scene;
    }
    if (scene) {
      this.renderer.render(scene, this.camera);
      this.labels.sync(scene, this.camera, labelSpecs);
    } else {
      this.labels.clear();
    }
  }
}
