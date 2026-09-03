export type EditorTool =
  | "select"
  | "terrain_grass"
  | "terrain_dirt"
  | "terrain_cliff"
  | "terrain_cobble"
  | "terrain_water"
  | "terrain_erase"
  | "collision_block"
  | "collision_walk"
  | "npc"
  | "interactable_npc"
  | "job_changer"
  | "save_point"
  | "portal"
  | "region"
  | "sanctuary"
  | "quest_trigger"
  | "item";

export type EditorToolGroup = "general" | "terrain" | "collision" | "entities" | "world";

export interface EditorProp {
  name: string;
  type: string;
  value: string | number | boolean;
}

export interface EditorPoint {
  x: number;
  y: number;
}

export interface EditorObject {
  id?: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  /** Absolute world-pixel vertices for region/sanctuary polygons. */
  polygon?: EditorPoint[];
  properties: EditorProp[];
}

export const TILE_PX = 32;

export function propString(props: EditorProp[], name: string, fallback = ""): string {
  const p = props.find((x) => x.name === name);
  if (!p) return fallback;
  return String(p.value);
}

export function propBool(props: EditorProp[], name: string, fallback = false): boolean {
  const p = props.find((x) => x.name === name);
  if (!p) return fallback;
  return p.value === true || p.value === "true";
}

export function propNumber(props: EditorProp[], name: string, fallback = 0): number {
  const p = props.find((x) => x.name === name);
  if (!p) return fallback;
  const n = Number(p.value);
  return Number.isFinite(n) ? n : fallback;
}

export function setProp(props: EditorProp[], name: string, type: string, value: string | number | boolean): EditorProp[] {
  const next = props.filter((p) => p.name !== name);
  next.push({ name, type, value });
  return next;
}

export function newObjectId(): number {
  return Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000);
}
