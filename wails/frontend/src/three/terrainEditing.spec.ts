import { WorldHeightmap, WORLD_SCALE } from "./heightmap";
import { applyTerrainBrush, emptyTerrain, normalizeTerrain, terrainChangeBounds, type TerrainBrush } from "./terrainEditing";
import { TerrainWorld } from "./terrain";

function check(ok: boolean, message: string) { if (!ok) throw new Error(message); }
function eq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const map = { cols: 40, rows: 40, tile: 32, cells: ".".repeat(1600) };
const terrain = { version: 1 as const, heights: { "16,16": 128 }, cells: { "4,4": "#" } };
const field = new WorldHeightmap(map, undefined, terrain);
check(field.vertex(16, 16) === 128 * WORLD_SCALE, "Authored vertex heights must use absolute map pixels");
check(field.cell(4, 4) === "#", "Authored biome must override base geography");
const brush: TerrainBrush = { mode: "raise", radius: 64, strength: 32, height: 80, cell: "~" };
const original = emptyTerrain();
const base = new WorldHeightmap(map);
const raised = applyTerrainBrush(base, original, 512, 512, brush, 1);
check(raised.heights["16,16"] === base.vertex(16, 16) / WORLD_SCALE + 32, "Raise must use time-scaled map-pixel strength");
check(eq(original, emptyTerrain()), "Brush must not mutate undo snapshots");
check(raised.heights["0,0"] === undefined, "Brush must only touch nearby vertices");
const lowered = applyTerrainBrush(base, original, 512, 512, { ...brush, mode: "lower" }, 1);
check(lowered.heights["16,16"] === base.vertex(16, 16) / WORLD_SCALE - 32, "Lower must subtract time-scaled strength");
const flattened = applyTerrainBrush(base, original, 512, 512, { ...brush, mode: "flatten", strength: 256 }, 1);
check(flattened.heights["16,16"] === 80, "Flatten must converge to the explicit elevation without overshoot");
const spike = { ...emptyTerrain(), heights: { "16,16": 1000 } };
const smooth = applyTerrainBrush(base, spike, 512, 512, { ...brush, mode: "smooth" }, 1);
check(smooth.heights["16,16"] < 1000 && smooth.heights["16,16"] > 0, "Smooth must reduce peaks from an immutable neighborhood");
check(eq(smooth, applyTerrainBrush(base, spike, 512, 512, { ...brush, mode: "smooth" }, 1)), "Smooth must be deterministic");
const painted = applyTerrainBrush(base, original, 528, 528, { ...brush, mode: "paint", radius: 20 }, 1);
check(painted.cells["16,16"] === "~", "Paint must write the brush biome cell");
check(eq(painted.heights, {}), "Painting biome does not write elevation overrides");
check(new WorldHeightmap(map, undefined, painted).collisionCell(16, 16) === "~", "Authored water must block collision");
const edge = applyTerrainBrush(base, original, 0, 0, brush, 1);
check(Object.keys(edge.heights).every(key => key.split(",").every(n => Number(n) >= 0)), "Edge brush never authors negative coordinates");
check(applyTerrainBrush(base, original, NaN, 0, brush, 1) === original, "Invalid brush coordinates must be ignored");
check(eq(normalizeTerrain({ heights: { "0,0": 999999, "-1,0": 1, "40,40": 2, "41,0": 1, "1,1": NaN }, cells: { "39,39": "~", "40,0": "#", "1,1": "bad" } }, 40, 40),
  { version: 1, heights: { "0,0": 16384, "40,40": 2 }, cells: { "39,39": "~" } }), "normalizeTerrain must clamp heights and drop out-of-bounds or invalid entries");
const streamed = new TerrainWorld(base);
streamed.update(512, 512, 0);
const oldGround = [...streamed.ground];
base.setTerrain(raised);
streamed.invalidate(terrainChangeBounds(original, raised)!);
check(streamed.ground.some(mesh => oldGround.includes(mesh)), "Brush must preserve loaded chunks outside its footprint");
check(oldGround.some(mesh => !streamed.ground.includes(mesh)), "Brush must rebuild affected chunk geometry for raycasting");
for (const mesh of streamed.ground) {
  const pos = mesh.geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) check(Math.abs(pos.getY(i) - base.vertex(Math.round(pos.getX(i) / (32 * WORLD_SCALE)), Math.round(pos.getZ(i) / (32 * WORLD_SCALE)))) < .00001, "Adjacent chunks must share authored seam elevations");
  check((mesh.geometry.getAttribute("normal").array as Float32Array).every(Number.isFinite), "Edited terrain must have finite surface normals");
}
streamed.dispose();
console.log("Terrain authoring checks passed");
