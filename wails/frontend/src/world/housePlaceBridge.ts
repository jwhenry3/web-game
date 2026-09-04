/** Live house decoration placement preview (toolbar ↔ HouseScene). */

export type HousePlaceHover = {
  col: number;
  row: number;
  valid: boolean;
};

export type HousePlaceState = {
  /** Inventory item id armed for placement (click or drag). */
  itemId: string | null;
  itemName: string;
  /** Pick-up mode: next furniture click returns it to inventory. */
  pickMode: boolean;
  hover: HousePlaceHover | null;
};

type Listener = () => void;

let state: HousePlaceState = {
  itemId: null,
  itemName: "",
  pickMode: false,
  hover: null,
};

const listeners = new Set<Listener>();

/** Latest house camera transform for mapping pointer → world. */
let transform: {
  scaleX: number;
  scaleY: number;
  originX: number;
  originY: number;
  zoom: number;
  viewX: number;
  viewY: number;
  tileSize: number;
  walkOriginCol: number;
  walkOriginRow: number;
  walkCols: number;
  walkRows: number;
} | null = null;

export function getHousePlaceState(): HousePlaceState {
  return state;
}

export function subscribeHousePlace(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const l of listeners) l();
}

export function setHousePlaceItem(itemId: string | null, itemName = "") {
  state = {
    ...state,
    itemId,
    itemName: itemId ? itemName : "",
    pickMode: itemId ? false : state.pickMode,
  };
  if (!itemId) state = { ...state, hover: null };
  emit();
}

export function setHousePickMode(on: boolean) {
  state = {
    ...state,
    pickMode: on,
    itemId: on ? null : state.itemId,
    itemName: on ? "" : state.itemName,
    hover: on ? null : state.hover,
  };
  emit();
}

export function setHousePlaceHover(hover: HousePlaceHover | null) {
  const prev = state.hover;
  if (
    (prev === null && hover === null) ||
    (prev && hover && prev.col === hover.col && prev.row === hover.row && prev.valid === hover.valid)
  ) {
    return;
  }
  state = { ...state, hover };
  emit();
}

export function clearHousePlace() {
  state = { itemId: null, itemName: "", pickMode: false, hover: null };
  emit();
}

export function setHousePlaceTransform(next: NonNullable<typeof transform>) {
  transform = next;
}

export function getHousePlaceTransform() {
  return transform;
}

/** Convert game-stage-relative CSS pixels → world coords. */
export function stagePointToWorld(stageX: number, stageY: number): { x: number; y: number } | null {
  if (!transform) return null;
  const gx = (stageX - transform.originX) / Math.max(1e-6, transform.scaleX) / Math.max(1e-6, transform.zoom);
  const gy = (stageY - transform.originY) / Math.max(1e-6, transform.scaleY) / Math.max(1e-6, transform.zoom);
  return { x: transform.viewX + gx, y: transform.viewY + gy };
}

export function worldToHouseTile(x: number, y: number): { col: number; row: number } | null {
  if (!transform) return null;
  const t = transform.tileSize;
  return { col: Math.floor(x / t), row: Math.floor(y / t) };
}

export function houseTileWalkable(col: number, row: number): boolean {
  if (!transform) return false;
  return (
    col >= transform.walkOriginCol &&
    col < transform.walkOriginCol + transform.walkCols &&
    row >= transform.walkOriginRow &&
    row < transform.walkOriginRow + transform.walkRows
  );
}
