import { WorldHeightmap, WORLD_SCALE } from "./heightmap.ts";
import { moveOnMap, movementYaw, MovementKeys } from "./motion.ts";
import type { OverworldMap } from "../types";
import { TerrainWorld } from "./terrain.ts";
import { WorldEffects } from "./actors.ts";
import { JUMP_VELOCITY, newBody3D, overworldPhysics3D, reconcileBody3D, sceneColliders3D } from "./physics3d.ts";
import { emptyScene, IDENTITY_TRANSFORM, type Scene3DDoc } from "./scene3d.ts";
import * as THREE from "three";

function check(ok: boolean, message: string) { if (!ok) throw new Error(message); }
function grid(cell: string): OverworldMap { return { cols: 16, rows: 16, tile: 32, cells: cell.repeat(256) }; }

check(Math.abs(movementYaw(0, -1)) < 1e-8, "Moving north must send zero yaw in the server convention");
check(Math.abs(movementYaw(1, 0) + Math.PI / 2) < 1e-8, "Moving east must send negative pi/2 yaw");
const input = new MovementKeys();
const bindings = { move_up: "w", move_down: "s", move_left: "a", move_right: "d" };
input.down("w"); input.up("w");
check(input.read(bindings).y === -1, "A quick key tap between animation frames must still move the player");
check(input.read(bindings).y === 0, "A completed key tap must not keep moving");
input.down("D");
check(input.read(bindings).x === 1 && input.read(bindings).x === 1, "A held movement key must persist across frames");
input.clear();
check(input.read(bindings).x === 0, "Losing focus must release all movement input");

const water = new WorldHeightmap(grid("~"));
const grass = new WorldHeightmap(grid("."));
const mountain = new WorldHeightmap(grid("#"));
check(water.height(240, 240) < 0, "Water beds must lie below sea level");
check(grass.height(240, 240) > 0, "Grass must lie above sea level");
check(mountain.height(240, 240) > grass.height(240, 240) + 1, "Rock regions must form raised ridges");
for (const cell of ["H", "R"]) {
  const field = new WorldHeightmap(grid(cell));
  check(field.height(90, 110) === field.height(320, 350), "Settlements and roads need level foundations");
}
const mixed = grid(".");
mixed.cells = mixed.cells.slice(0, 100) + "#~HDRIST" + mixed.cells.slice(108);
const first = new WorldHeightmap(mixed), second = new WorldHeightmap(mixed);
for (let r = 0; r <= mixed.rows; r++) for (let c = 0; c <= mixed.cols; c++) {
  check(first.vertex(c, r) === second.vertex(c, r), "Chunk vertices must be deterministic across rebuilds");
  check(Number.isFinite(first.height(c * 32, r * 32)), "Map edges must have finite heights");
}
const a = first.vertex(5, 6), b = first.vertex(6, 6), d = first.vertex(5, 7);
check(Math.abs(first.height(5.2 * 32, 6.3 * 32) - (a * .5 + b * .2 + d * .3)) < 1e-6,
  "Feet must follow the rendered triangle, not a bilinear surface");

const open = grid(".");
const straight = moveOnMap(open, 128, 128, 1, 0, .05);
const diagonal = moveOnMap(open, 128, 128, 1, 1, .05);
check(Math.abs(straight.x - 137) < .001, "Walking must retain the server's 180px/s speed");
check(Math.abs(Math.hypot(diagonal.x - 128, diagonal.y - 128) - 9) < .001, "Diagonal movement must not be faster");
const wall = { ...open, cells: Array.from({ length: 256 }, (_, i) => i % 16 === 5 ? "#" : ".").join("") };
const dash = moveOnMap(wall, 128, 128, 1, 0, .05, 2000);
check(dash.x < 160, "Fast movement must not tunnel through a blocked tile");
const paused = moveOnMap(open, 128, 128, 1, 0, 5);
check(paused.x <= 137, "A resumed frame must not teleport the player");
const diagonalWall = moveOnMap(wall, 143, 128, 1, 1, .05);
check(diagonalWall.y > 128 && diagonalWall.x < 160, "Movement must slide along walls");
const edge = moveOnMap(open, 16, 16, -1, -1, .05, 2000);
check(edge.x > 0 && edge.y > 0, "Movement must remain inside map boundaries");

const treeMap = grid("#");
const forest = new WorldHeightmap(treeMap, { ground: Array(256).fill(593), collision: Array(256).fill(1) });
check(forest.height(240, 240) < mountain.height(240, 240) - 1, "Blocked tree trunks must not generate mountain spikes");

// 3D prediction solver — mirrors internal/game/physics3d.go.
const flatField = new WorldHeightmap(grid("."));
const phys = overworldPhysics3D(flatField);
const walker = newBody3D(128, 128, flatField.height(128, 128) / WORLD_SCALE);
const walked = phys.move(walker, 137, 128, .05);
check(Math.abs(walked.pos.x - 137) < .001 && walked.grounded, "Grounded prediction must keep the server's 180px/s pace");
check(Math.abs(walked.pos.z - flatField.height(walked.pos.x, 128) / WORLD_SCALE) < 1, "Grounded prediction must ride the heightmap");
const dropper = newBody3D(128, 128, flatField.height(128, 128) / WORLD_SCALE + 60);
dropper.grounded = false;
for (let i = 0; i < 60; i++) phys.move(dropper, 128, 128, 1 / 60);
check(dropper.grounded && Math.abs(dropper.pos.z - flatField.height(128, 128) / WORLD_SCALE) < .01, "Airborne bodies must land on the terrain");
const jumper = newBody3D(128, 128, flatField.height(128, 128) / WORLD_SCALE);
jumper.velZ = JUMP_VELOCITY; jumper.grounded = false;
let apex = 0;
for (let i = 0; i < 120; i++) { phys.move(jumper, 128, 128, 1 / 60); apex = Math.max(apex, jumper.pos.z); }
const apexPx = apex - flatField.height(128, 128) / WORLD_SCALE;
check(apexPx > 30 && apexPx < 42, "The jump impulse must peak near one body height (~36px apex)");
check(jumper.grounded, "A jump must end grounded on the terrain");
const wallPhys = overworldPhysics3D(new WorldHeightmap(wall));
const rammer = newBody3D(128, 128, wallPhys.heightAt(128, 128));
const rammed = wallPhys.move(rammer, 256, 128, .05);
check(rammed.pos.x < 160, "Unwalkable tiles must block the 3D solver too");
// Authored collider: a raised platform the body can stand on, blocked to walk through.
const doc: Scene3DDoc = emptyScene("spec");
doc.objects.push({
  id: "plat", name: "platform", prefab: "cube", visible: true, props: {},
  transform: { ...IDENTITY_TRANSFORM, position: [192 * WORLD_SCALE, 4, 128 * WORLD_SCALE] },
  components: { collider: { enabled: true, shape: "box", size: [4, 8, 4], offset: [0, 0, 0], isTrigger: false } },
});
const colliders = sceneColliders3D(doc);
check(colliders.length === 1, "Enabled non-trigger colliders must produce physics boxes");
check(Math.abs(colliders[0].min.x - 160) < .01 && Math.abs(colliders[0].max.x - 224) < .01
  && Math.abs(colliders[0].min.y - 96) < .01 && Math.abs(colliders[0].max.y - 160) < .01
  && Math.abs(colliders[0].min.z) < .01 && Math.abs(colliders[0].max.z - 128) < .01,
  "Collider transforms must convert world units to map pixels with the Y/Z axis swap");
const platPhys = overworldPhysics3D(flatField, doc);
const climber = newBody3D(96, 128, flatField.height(96, 128) / WORLD_SCALE);
const atop = platPhys.move(climber, 192, 128, .05);
check(atop.pos.x < 150, "A tall collider wall must block planar movement");
// Reconciliation: big divergence snaps, small grounded drift absorbs, descents land.
const pred = newBody3D(100, 100, 10);
check(reconcileBody3D(pred, { x: 400, y: 100, z: 20, grounded: true }) === "snap" && pred.pos.x === 400 && pred.pos.z === 20, "Large planar divergence must snap to authority");
check(reconcileBody3D(pred, { x: 400.5, y: 100, z: 22, grounded: true }) === "adjust" && pred.pos.z === 22, "Grounded z drift must absorb the authoritative height");
pred.grounded = false; pred.velZ = -50; pred.pos.z = 23;
check(reconcileBody3D(pred, { x: 400.5, y: 100, z: 22, grounded: true }) === "adjust" && pred.grounded, "A descending body must land when the server reports grounded");
pred.grounded = false; pred.velZ = 100; pred.pos.z = 22;
check(reconcileBody3D(pred, { x: 400.5, y: 100, z: 22, grounded: false }) === "ok" && !pred.grounded, "A rising body must keep its predicted arc");

const streamedMap = { tile: 32, cols: 128, rows: 96, cells: ".".repeat(128 * 96) };
const streamed = new TerrainWorld(new WorldHeightmap(streamedMap));
streamed.update(64 * 32, 48 * 32, 0);
check(streamed.group.children.length === 25, "Streaming must bound loaded terrain to the nearby 25 chunks");
let released = 0;
for (const mesh of streamed.ground) mesh.geometry.addEventListener("dispose", () => released++);
streamed.update(0, 0, 1);
check(released > 0 && streamed.group.children.length <= 25, "Leaving a region must release old chunk geometry");
const terrainMesh = streamed.ground[0];
const pos = terrainMesh.geometry.getAttribute("position");
for (let i = 0; i < pos.count; i++) {
  check(Math.abs(pos.getY(i) - streamed.field.height(pos.getX(i) / WORLD_SCALE, pos.getZ(i) / WORLD_SCALE)) < .00001,
    "Rendered mesh and collision-grounded actor heights must agree");
}
streamed.dispose();
check(streamed.ground.length === 0, "Disposal must clear raycast targets");
const effects = new WorldEffects();
effects.burst(new THREE.Vector3(0, 0, 0));
check(effects.group.children.length > 0, "Combat events must produce visible effect geometry");
effects.update(1);
check(effects.group.children.length === 0, "Expired combat effects must release scene objects");
effects.dispose();
console.log("3D world checks passed: geography, seams, triangle grounding, movement speed, swept collision, chunk streaming, disposal and effect lifetime");
