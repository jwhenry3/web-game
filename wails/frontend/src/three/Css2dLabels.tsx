import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import type { EntityOverlayVariant, PoiLabelVariant } from "../world/entityOverlayBridge";

export type Css2dEntityLabel = {
  id: string;
  kind: "entity";
  mapX: number;
  mapY: number;
  height: number;
  label: string;
  variant: EntityOverlayVariant;
  castPct?: number;
};

export type Css2dPoiLabel = {
  id: string;
  kind: "poi";
  mapX: number;
  mapY: number;
  height: number;
  label: string;
  variant: PoiLabelVariant;
};

export type Css2dInteractLabel = {
  id: string;
  kind: "interact";
  mapX: number;
  mapY: number;
  height: number;
  keyLabel: string;
};

export type Css2dLabelSpec = Css2dEntityLabel | Css2dPoiLabel | Css2dInteractLabel;

type Slot = {
  obj: CSS2DObject;
  root: Root;
  contentKey: string;
  kind: Css2dLabelSpec["kind"];
};

function entityContentKey(s: Css2dEntityLabel): string {
  const cast = s.castPct == null ? "" : s.castPct.toFixed(2);
  return `e|${s.variant}|${s.label}|${cast}`;
}

function poiContentKey(s: Css2dPoiLabel): string {
  return `p|${s.variant}|${s.label}`;
}

function interactContentKey(s: Css2dInteractLabel): string {
  return `i|${s.keyLabel}`;
}

function contentKey(spec: Css2dLabelSpec): string {
  if (spec.kind === "entity") return entityContentKey(spec);
  if (spec.kind === "poi") return poiContentKey(spec);
  return interactContentKey(spec);
}

function EntityBillboard(props: { label: string; variant: EntityOverlayVariant; castPct?: number }) {
  const cast =
    props.castPct == null ? null : (
      <div className="cm-entity-cast cm-entity-cast--billboard">
        <div className="cm-entity-cast-track">
          <div
            className={`cm-entity-cast-fill${props.castPct >= 1 ? " is-ready" : ""}`}
            style={{ width: `${Math.max(0, Math.min(1, props.castPct)) * 100}%` }}
          />
        </div>
      </div>
    );
  return (
    <div className="cm-billboard">
      <div className={`cm-nameplate cm-nameplate--${props.variant}`}>{props.label}</div>
      {cast}
    </div>
  );
}

function PoiBillboard(props: { label: string; variant: PoiLabelVariant }) {
  return (
    <div className="cm-billboard">
      <div className={`cm-poi-label cm-poi-label--${props.variant}`}>{props.label}</div>
    </div>
  );
}

function InteractBillboard(props: { keyLabel: string }) {
  return (
    <div className="cm-billboard">
      <div className="cm-interact-prompt">{props.keyLabel}</div>
    </div>
  );
}

function renderSpec(spec: Css2dLabelSpec): ReactNode {
  if (spec.kind === "entity") {
    return createElement(EntityBillboard, {
      label: spec.label,
      variant: spec.variant,
      castPct: spec.castPct,
    });
  }
  if (spec.kind === "poi") {
    return createElement(PoiBillboard, { label: spec.label, variant: spec.variant });
  }
  return createElement(InteractBillboard, { keyLabel: spec.keyLabel });
}

/**
 * Screen-aligned DOM labels (Three CSS2D) with React content.
 * CSS2DRenderer culls labels behind the camera automatically.
 */
export class Css2dLabelLayer {
  readonly renderer: CSS2DRenderer;
  private slots = new Map<string, Slot>();
  private attachedScene: THREE.Scene | null = null;

  constructor(host: HTMLElement) {
    this.renderer = new CSS2DRenderer();
    this.renderer.domElement.className = "cm-css2d-layer";
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.pointerEvents = "none";
    this.renderer.domElement.style.overflow = "hidden";
    host.appendChild(this.renderer.domElement);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height);
  }

  /** Sync world-space labels onto `scene` and render CSS2D for this camera. */
  sync(scene: THREE.Scene, camera: THREE.Camera, specs: readonly Css2dLabelSpec[]) {
    if (this.attachedScene && this.attachedScene !== scene) {
      this.detachAll();
    }
    this.attachedScene = scene;

    const seen = new Set<string>();
    for (const spec of specs) {
      seen.add(spec.id);
      let slot = this.slots.get(spec.id);
      const key = contentKey(spec);
      if (!slot) {
        const el = document.createElement("div");
        el.className = "cm-css2d-object";
        const obj = new CSS2DObject(el);
        obj.center.set(0.5, 0.5);
        scene.add(obj);
        const root = createRoot(el);
        root.render(renderSpec(spec));
        slot = { obj, root, contentKey: key, kind: spec.kind };
        this.slots.set(spec.id, slot);
      } else {
        if (slot.obj.parent !== scene) {
          this.attachedScene?.remove(slot.obj);
          scene.add(slot.obj);
        }
        if (slot.contentKey !== key) {
          slot.contentKey = key;
          slot.kind = spec.kind;
          slot.root.render(renderSpec(spec));
        }
      }
      slot.obj.position.set(spec.mapX, spec.height, spec.mapY);
      slot.obj.visible = true;
    }

    for (const [id, slot] of this.slots) {
      if (seen.has(id)) continue;
      scene.remove(slot.obj);
      slot.root.unmount();
      this.slots.delete(id);
    }

    this.renderer.render(scene, camera);
  }

  clear() {
    this.detachAll();
  }

  private detachAll() {
    for (const slot of this.slots.values()) {
      slot.obj.parent?.remove(slot.obj);
      slot.root.unmount();
    }
    this.slots.clear();
    this.attachedScene = null;
  }

  dispose() {
    this.detachAll();
    this.renderer.domElement.remove();
  }
}
