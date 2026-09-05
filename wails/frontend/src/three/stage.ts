import * as THREE from "three";
import type { EntityOverlayVariant, PoiLabelVariant } from "../world/entityOverlayBridge";
import type { Css2dEntityLabel, Css2dInteractLabel, Css2dLabelSpec, Css2dPoiLabel } from "./Css2dLabels";

const _n = new THREE.Vector3();

export type ThreeStageContext = {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  /** Overlay root (.game-stage). */
  stageEl: HTMLElement;
};

/** Approx nameplate height in world units (placeholder models ~36 tall). */
export const NAME_HEIGHT = 42;
export const CAST_HEIGHT = 4;
export const POI_LABEL_HEIGHT = 36;
export const CAMP_LABEL_HEIGHT = 40;

export function worldEntityLabel(
  id: string,
  label: string,
  variant: EntityOverlayVariant,
  mapX: number,
  mapY: number,
  castPct?: number,
  height = NAME_HEIGHT,
): Css2dEntityLabel {
  return { id, kind: "entity", mapX, mapY, height, label, variant, castPct };
}

export function worldPoiLabel(
  id: string,
  label: string,
  variant: PoiLabelVariant,
  mapX: number,
  mapY: number,
  height = POI_LABEL_HEIGHT,
): Css2dPoiLabel {
  return { id, kind: "poi", mapX, mapY, height, label, variant };
}

export function worldInteractLabel(
  id: string,
  keyLabel: string,
  mapX: number,
  mapY: number,
  height = POI_LABEL_HEIGHT + 8,
): Css2dInteractLabel {
  return { id, kind: "interact", mapX, mapY, height, keyLabel };
}

export function pushLabel(arr: Css2dLabelSpec[], item: Css2dLabelSpec | null | undefined): void {
  if (item) arr.push(item);
}

/** Pointer CSS → map XZ via raycast against y=0 plane. */
export function pointerToMap(
  ctx: ThreeStageContext,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = ctx.canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), ctx.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  if (!ray.ray.intersectPlane(plane, _n)) return null;
  return { x: _n.x, y: _n.z };
}
