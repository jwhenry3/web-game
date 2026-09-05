import * as THREE from "three";

/**
 * Follow-orbit camera: stays locked on a ground target while the player
 * orbits (RMB / MMB drag), pitches (vertical drag), and zooms (wheel).
 * Yaw 0 = camera south of target (Link’s Awakening default).
 */
export class FollowOrbitCamera {
  /** Azimuth around Y; 0 = south (+Z). */
  yaw = 0;
  /** Angle from vertical (0 = top-down, π/2 = horizon). */
  polar = Math.PI / 4;
  /** Distance from look target to camera. */
  radius = Math.hypot(300, 300);
  minRadius = 140;
  maxRadius = 1100;
  minPolar = 0.22;
  maxPolar = Math.PI / 2.15;
  lookY = 18;
  followLerp = 0.14;

  private target = new THREE.Vector3();
  private hasTarget = false;
  private dragging = false;
  private button = -1;
  private lastX = 0;
  private lastY = 0;
  private el: HTMLElement | null = null;

  reset(opts?: { lookY?: number; radius?: number; polar?: number; yaw?: number }) {
    this.yaw = opts?.yaw ?? 0;
    this.polar = opts?.polar ?? Math.PI / 4;
    this.radius = opts?.radius ?? Math.hypot(300, 300);
    this.lookY = opts?.lookY ?? 18;
    this.target.set(0, 0, 0);
    this.hasTarget = false;
  }

  attach(el: HTMLElement) {
    if (this.el === el) return;
    this.detach();
    this.el = el;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointercancel", this.onPointerUp);
    el.addEventListener("lostpointercapture", this.onPointerUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", this.onContextMenu);
  }

  detach() {
    const el = this.el;
    if (!el) return;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointercancel", this.onPointerUp);
    el.removeEventListener("lostpointercapture", this.onPointerUp);
    el.removeEventListener("wheel", this.onWheel);
    el.removeEventListener("contextmenu", this.onContextMenu);
    this.el = null;
    this.dragging = false;
  }

  /** Soft-follow a map position (x, z=mapY). */
  follow(mapX: number, mapY: number) {
    if (!this.hasTarget) {
      this.snap(mapX, mapY);
      return;
    }
    this.target.x = THREE.MathUtils.lerp(this.target.x, mapX, this.followLerp);
    this.target.z = THREE.MathUtils.lerp(this.target.z, mapY, this.followLerp);
  }

  /** Snap follow target (on enter / teleports). */
  snap(mapX: number, mapY: number) {
    this.target.set(mapX, 0, mapY);
    this.hasTarget = true;
  }

  apply(camera: THREE.PerspectiveCamera) {
    const sinP = Math.sin(this.polar);
    const cosP = Math.cos(this.polar);
    const ox = Math.sin(this.yaw) * sinP * this.radius;
    const oy = cosP * this.radius;
    const oz = Math.cos(this.yaw) * sinP * this.radius;
    camera.position.set(this.target.x + ox, oy, this.target.z + oz);
    camera.lookAt(this.target.x, this.lookY, this.target.z);
  }

  /**
   * Rotate keyboard intent into map space (+x right, +y down).
   * W stays “away from camera” on the ground plane.
   */
  transformAxes(dx: number, dy: number): { dx: number; dy: number } {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return {
      dx: dx * c + dy * s,
      dy: -dx * s + dy * c,
    };
  }

  private onPointerDown = (e: PointerEvent) => {
    // RMB / MMB orbit; LMB left free for UI / house pick.
    if (e.button !== 1 && e.button !== 2) return;
    this.dragging = true;
    this.button = e.button;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    try {
      this.el?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.yaw -= dx * 0.005;
    this.polar = THREE.MathUtils.clamp(this.polar - dy * 0.004, this.minPolar, this.maxPolar);
    e.preventDefault();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    if (e.button !== undefined && e.button !== this.button && e.type === "pointerup") return;
    this.dragging = false;
    this.button = -1;
    try {
      this.el?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0012);
    this.radius = THREE.MathUtils.clamp(this.radius * factor, this.minRadius, this.maxRadius);
  };

  private onContextMenu = (e: Event) => {
    e.preventDefault();
  };
}
