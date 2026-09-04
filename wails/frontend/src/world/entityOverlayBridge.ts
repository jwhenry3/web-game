/** Screen-space overlays published by Phaser for React HUD rendering. */

export type EntityOverlayVariant = "self" | "player" | "enemy";

export type PoiLabelVariant =
  | "save"
  | "save-active"
  | "job"
  | "camp"
  | "house-poi"
  | "furniture";

export interface EntityOverlayMark {
  id: string;
  /** Full nameplate text (name, level, status suffixes). */
  label: string;
  variant: EntityOverlayVariant;
  /** Feet position in game-stage CSS pixels. */
  screenX: number;
  screenY: number;
  /** Nameplate anchor (above head) in game-stage CSS pixels. */
  nameX: number;
  nameY: number;
  /** Cast bar anchor (near feet) in game-stage CSS pixels. */
  castX: number;
  castY: number;
  /** 0–1 while casting; omit when idle. */
  castPct?: number;
}

export interface PoiLabelMark {
  id: string;
  label: string;
  variant: PoiLabelVariant;
  x: number;
  y: number;
}

export interface InteractPromptMark {
  id: string;
  /** Keybind display string, e.g. "Space". */
  keyLabel: string;
  x: number;
  y: number;
}

export interface WorldOverlayFrame {
  entities: readonly EntityOverlayMark[];
  pois: readonly PoiLabelMark[];
  interacts: readonly InteractPromptMark[];
}

const EMPTY_FRAME: WorldOverlayFrame = { entities: [], pois: [], interacts: [] };

type Listener = () => void;

let frame: WorldOverlayFrame = EMPTY_FRAME;
const listeners = new Set<Listener>();

export function getWorldOverlays(): WorldOverlayFrame {
  return frame;
}

/** @deprecated Prefer getWorldOverlays().entities */
export function getEntityOverlays(): readonly EntityOverlayMark[] {
  return frame.entities;
}

export function setWorldOverlays(next: WorldOverlayFrame): void {
  frame = next;
  for (const listener of listeners) listener();
}

/** @deprecated Prefer setWorldOverlays */
export function setEntityOverlays(entities: readonly EntityOverlayMark[]): void {
  setWorldOverlays({ entities, pois: [], interacts: [] });
}

export function clearEntityOverlays(): void {
  if (
    frame.entities.length === 0 &&
    frame.pois.length === 0 &&
    frame.interacts.length === 0
  ) {
    return;
  }
  frame = EMPTY_FRAME;
  for (const listener of listeners) listener();
}

export function subscribeEntityOverlays(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type OverlayScene = {
  cameras: {
    main: {
      worldView: { x: number; y: number };
      zoom: number;
      width: number;
      height: number;
    };
  };
  game: { canvas: HTMLCanvasElement };
};

export type StageTransform = {
  /** Game-pixel → CSS-pixel scale on the displayed canvas. */
  scaleX: number;
  scaleY: number;
  /** Canvas top-left relative to game-stage (overlay root). */
  originX: number;
  originY: number;
  zoom: number;
  viewX: number;
  viewY: number;
};

/** Snapshot camera + FIT letterbox so world points and local offsets share one transform. */
export function getStageTransform(scene: OverlayScene): StageTransform {
  const cam = scene.cameras.main;
  const canvas = scene.game.canvas;
  // Overlays mount on .game-stage; canvas lives in .phaser-host inside it.
  const stage = canvas.parentElement?.parentElement ?? canvas.parentElement;
  const canvasRect = canvas.getBoundingClientRect();
  const stageRect = stage?.getBoundingClientRect();
  const originX = canvasRect.left - (stageRect?.left ?? 0);
  const originY = canvasRect.top - (stageRect?.top ?? 0);
  return {
    scaleX: canvas.clientWidth / Math.max(1, cam.width),
    scaleY: canvas.clientHeight / Math.max(1, cam.height),
    originX,
    originY,
    zoom: cam.zoom,
    viewX: cam.worldView.x,
    viewY: cam.worldView.y,
  };
}

/** World → game-stage CSS pixels (accounts for camera scroll/zoom + Scale.FIT letterbox). */
export function worldToStagePoint(
  scene: OverlayScene,
  worldX: number,
  worldY: number,
  transform: StageTransform = getStageTransform(scene),
): { x: number; y: number } {
  const gx = (worldX - transform.viewX) * transform.zoom;
  const gy = (worldY - transform.viewY) * transform.zoom;
  return {
    x: transform.originX + gx * transform.scaleX,
    y: transform.originY + gy * transform.scaleY,
  };
}

/** Foot-local offset (Phaser world units) → CSS pixels on the stage. */
export function localOffsetToStage(
  localX: number,
  localY: number,
  transform: StageTransform,
): { x: number; y: number } {
  return {
    x: localX * transform.zoom * transform.scaleX,
    y: localY * transform.zoom * transform.scaleY,
  };
}

/** World point + local offset → stage CSS pixels. */
export function worldLocalToStage(
  scene: OverlayScene,
  worldX: number,
  worldY: number,
  localX: number,
  localY: number,
  transform: StageTransform = getStageTransform(scene),
): { x: number; y: number } {
  const feet = worldToStagePoint(scene, worldX, worldY, transform);
  const off = localOffsetToStage(localX, localY, transform);
  return { x: feet.x + off.x, y: feet.y + off.y };
}
