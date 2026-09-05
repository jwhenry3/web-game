import * as THREE from "three";

/** Map 2D pixel → Three XZ plane (Y up). Server map stays 2D. */
export function mapToThree(x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3(x, height, y);
}

export function setMapPosition(obj: THREE.Object3D, x: number, y: number, height = 0): void {
  obj.position.set(x, height, y);
}

export { facingYaw, type FacingYaw, type WorldFacing } from "./facing";
