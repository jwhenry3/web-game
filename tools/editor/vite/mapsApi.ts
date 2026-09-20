import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// This file lives in tools/editor/vite/ — repo root is three levels up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const mapsDir = path.join(repoRoot, "data", "maps");
const overridesDir = path.join(mapsDir, "overrides");
const publicDir = path.join(repoRoot, "wails", "frontend", "public");
const bakedDir = path.join(publicDir, "assets", "baked");
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

type JsonObject = Record<string, unknown>;

/** Sparse map override file — mirrors game.MapTileOverrides
 * (internal/game/map_override.go). */
interface MapOverrideFile {
  map_id?: string;
  /** layer name -> { tile index as string: gid }. Sparse per-index patch. */
  layers?: Record<string, Record<string, number>>;
  /** When non-empty, replaces the base map's objects list wholesale
   * (LoadOverworldFromMapConfig: `ow.Objects = override.Objects`). */
  objects?: unknown[];
  updated_at?: string;
}

function readJsonFile(p: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return undefined;
  }
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/** Raw binary request body (paint-mask PNG uploads). */
function readRawBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// --- Tree collision normalization -------------------------------------------
// Port of normalizeTreeCollision (internal/game/tiled_load.go): a complete
// 2×2 tree stamp renders as a single billboard anchored at the bottom-left
// cell, so the bottom-right mate's collision is cleared. Applied here so the
// served collision matches what the server effectively loads (see
// MapConfigBase — "terrain is normalized like the runtime load path").

type TreeStamp = [number, number, number, number]; // TL, TR, BL, BR locals

const BASE_CHIP_FIRSTGID = 577;
const MUNDI_FIRSTGID = 6000;

/** Top-left GID -> { firstgid, stamp } for every known 2×2 tree stamp
 * (PipoyaTreeStamps + PipoyaBigTreeStamps on BaseChip, MundiTreeStamps). */
const TREE_STAMP_BY_TL = (() => {
  const m = new Map<number, { firstgid: number; stamp: TreeStamp }>();
  const add = (stamps: TreeStamp[], firstgid: number) => {
    for (const s of stamps) m.set(firstgid + s[0], { firstgid, stamp: s });
  };
  add(
    [
      [8, 9, 16, 17],
      [10, 11, 18, 19],
      [12, 13, 20, 21],
      [14, 15, 22, 23],
      [24, 25, 32, 33],
      [26, 27, 34, 35],
      [28, 29, 36, 37],
      [30, 31, 38, 39],
    ],
    BASE_CHIP_FIRSTGID,
  );
  add(
    [
      [8, 9, 16, 17],
      [10, 11, 18, 19],
      [12, 13, 20, 21],
      [14, 15, 22, 23],
    ],
    MUNDI_FIRSTGID,
  );
  return m;
})();

const tiledGID = (raw: number) => raw & 0x1fffffff;

function normalizeTreeCollision(
  collision: number[],
  ground: number[],
  cols: number,
  rows: number,
): void {
  if (collision.length !== cols * rows || ground.length !== cols * rows) return;
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const i = r * cols + c;
      const ts = TREE_STAMP_BY_TL.get(tiledGID(ground[i]));
      if (!ts) continue;
      const fg = ts.firstgid;
      if (
        tiledGID(ground[i + 1]) !== fg + ts.stamp[1] ||
        tiledGID(ground[i + cols]) !== fg + ts.stamp[2] ||
        tiledGID(ground[i + cols + 1]) !== fg + ts.stamp[3]
      ) {
        continue;
      }
      collision[i + cols + 1] = 0;
    }
  }
}

/** Merge an override file onto a base map config, mirroring
 * LoadOverworldFromMapConfig (internal/game/map_config.go):
 *  - terrain.ground / terrain.collision get sparse per-index patches
 *    (ApplyMapOverride — only the "ground" and "collision" layers exist in
 *    the runtime layer map, other layer names are ignored);
 *  - collision is then normalized for one-tile tree footprints;
 *  - a non-empty override.objects replaces map.objects wholesale
 *    (there is no per-object merge).
 * All other base fields (regions, save_points, npcs, borders, exits) pass
 * through unchanged — the runtime derives the effective sets from them and
 * the merged objects. */
function mergeMapConfig(base: JsonObject, override: MapOverrideFile | undefined): JsonObject {
  const merged = JSON.parse(JSON.stringify(base)) as JsonObject;
  const terrain = (merged.terrain ?? {}) as JsonObject;
  merged.terrain = terrain;

  const layers = override?.layers;
  if (layers) {
    for (const layerName of ["ground", "collision"]) {
      const data = terrain[layerName];
      const patches = layers[layerName];
      if (!Array.isArray(data) || data.length === 0 || !patches) continue;
      for (const [idxStr, gid] of Object.entries(patches)) {
        const idx = Number.parseInt(idxStr, 10);
        if (!Number.isInteger(idx) || idx < 0 || idx >= data.length) continue;
        if (typeof gid !== "number" || !Number.isFinite(gid)) continue;
        data[idx] = gid;
      }
    }
  }

  const cols = Number(merged.cols) || 0;
  const rows = Number(merged.rows) || 0;
  const ground = Array.isArray(terrain.ground) ? (terrain.ground as number[]) : [];
  const collision = Array.isArray(terrain.collision) ? (terrain.collision as number[]) : [];
  normalizeTreeCollision(collision, ground, cols, rows);

  if (Array.isArray(override?.objects) && override.objects.length > 0) {
    merged.objects = override.objects;
  }
  return merged;
}

// --- terrain bake staleness -------------------------------------------------
// The bake (tools/bake_terrain.py) reads the RAW data/maps/<id>.map.json and
// <id>.stamps.json, so staleness is computed against those same inputs —
// editor overrides are intentionally not part of the comparison.

/** Standard CRC-32 (poly 0xEDB88320) — matches zlib.crc32, including the
 * chaining form crc32(data, prev). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array, prev = 0): number {
  let c = (prev ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Mirrors terrain_hash() in tools/bake_terrain.py (sampled imul-31 hash).
 * Ground only — the server normalizes collision at load, so the client's
 * hash never covers it either. */
function terrainHash(ground: number[]): number {
  let h = ground.length >>> 0;
  for (let i = 0; i < ground.length; i += 97)
    h = (Math.imul(h, 31) + (ground[i] >>> 0)) >>> 0;
  return h >>> 0;
}

interface FeatureEntry {
  category?: string;
  image?: string;
  w?: number;
  h?: number;
}

/** Mirrors stamps_hash() in tools/bake_terrain.py: crc32 over the raw
 * stamps-doc bytes (canonical `{"stamps":[]}` when absent), folding in one
 * sorted record per referenced feature id. */
function stampsHash(mapId: string): number {
  const stampsPath = path.join(mapsDir, `${mapId}.stamps.json`);
  const docBytes = existsSync(stampsPath)
    ? readFileSync(stampsPath)
    : Buffer.from('{"stamps":[]}', "utf-8");
  const doc = readJsonFile(stampsPath) as { stamps?: unknown[] } | undefined;
  const ids = new Set<string>();
  for (const s of doc?.stamps ?? []) {
    const f = (s as { feature?: unknown })?.feature;
    if (typeof f === "string" && f) ids.add(f);
  }
  const catalog = (readJsonFile(
    path.join(publicDir, "assets", "map-features", "catalog.json"),
  ) as { features?: FeatureEntry[] } | undefined)?.features ?? [];
  const byId = new Map(catalog.map((f) => [(f as { id?: string }).id ?? "", f]));
  let h = crc32(docBytes);
  for (const fid of [...ids].sort()) {
    const f = byId.get(fid);
    let entry: string;
    if (!f) {
      entry = `${fid}|unknown`;
    } else {
      const rel = String(f.image ?? "").replace(/^\/+/, "");
      const png = path.join(publicDir, ...rel.split("/"));
      entry =
        rel && existsSync(png)
          ? `${fid}|${f.category}|${f.w}x${f.h}|${crc32(readFileSync(png)).toString(16).padStart(8, "0")}`
          : `${fid}|no-image`;
    }
    h = crc32(Buffer.from(entry, "utf-8"), h);
  }
  return h >>> 0;
}

/** True when the baked manifest is missing or its hashes don't match what a
 * bake of the current map+stamps inputs would produce. */
function bakeStale(mapId: string): boolean {
  const manifest = readJsonFile(
    path.join(bakedDir, mapId, "manifest.json"),
  ) as { terrain_hash?: number; stamps_hash?: number; paint_hash?: number } | undefined;
  if (!manifest) return true;
  const map = readJsonFile(path.join(mapsDir, `${mapId}.map.json`)) as
    | JsonObject
    | undefined;
  const terrain = (map?.terrain ?? {}) as JsonObject;
  const ground = Array.isArray(terrain.ground) ? (terrain.ground as number[]) : [];
  if (terrainHash(ground) !== manifest.terrain_hash) return true;
  if (stampsHash(mapId) !== manifest.stamps_hash) return true;
  // paint_hash mirrors bake_terrain.py: crc32 of the mask file, 0 when absent.
  const paintPath = path.join(mapsDir, `${mapId}.paint.png`);
  const paintHash = existsSync(paintPath) ? crc32(readFileSync(paintPath)) : 0;
  return (manifest.paint_hash ?? 0) !== paintHash;
}

type BakeJobStatus = "running" | "ok" | "error";

/** In-flight / last bake result per map id. */
const bakeJobs = new Map<string, { status: BakeJobStatus; detail?: string }>();

/** Read-only map API for the Map workspace.
 *
 * IMPORTANT: register this plugin BEFORE editorApi() in vite.config.ts —
 * editorApi's middleware answers 404 for any /editor-api route it doesn't
 * recognize without calling next(), so it would shadow these endpoints if
 * mounted first.
 *
 *   GET /editor-api/maps       -> { maps: [{ id, hasOverride }] }
 *   GET /editor-api/map?id=<id> -> { map: <merged MapConfig>, override: <raw | null> }
 *   GET /editor-api/stamps?map=<id> -> { stamps: [...] }  (map-feature stamps)
 *   POST /editor-api/stamps/save    -> writes data/maps/<id>.stamps.json
 *   GET  /editor-api/paint?map=<id> -> image/png paint mask (404 when absent)
 *   POST /editor-api/paint/save?map=<id> -> raw PNG body -> data/maps/<id>.paint.png
 *   POST /editor-api/bake           -> {map} spawns tools/bake_terrain.py
 *   GET  /editor-api/bake/status?map=<id> -> {status, detail?, stale}
 */
export function mapsApi(): Plugin {
  const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  return {
    name: "maps-api",
    configureServer(server) {
      server.middlewares.use("/editor-api", (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x");
        const route = url.pathname;
        try {
          if (req.method === "GET" && route === "/maps") {
            // Only the unified continent map is editable now: clara_mundi is
            // generated by cmd/gencontinent; the other ~18 zone maps in
            // data/maps are legacy and intentionally filtered out.
            const ids = existsSync(mapsDir)
              ? readdirSync(mapsDir)
                  .filter((f) => f.endsWith(".map.json"))
                  .map((f) => f.slice(0, -".map.json".length))
                  .filter((id) => id === "clara_mundi")
                  .sort()
              : [];
            const maps = ids.map((id) => ({
              id,
              hasOverride: existsSync(path.join(overridesDir, `${id}.json`)),
            }));
            json(res, 200, { maps });
            return;
          }

          if (req.method === "GET" && route === "/map") {
            const id = url.searchParams.get("id") ?? "";
            if (!VALID_ID.test(id)) {
              json(res, 400, { error: "bad map id" });
              return;
            }
            const base = readJsonFile(path.join(mapsDir, `${id}.map.json`));
            if (base === undefined) {
              json(res, 404, { error: `no map '${id}'` });
              return;
            }
            const override = readJsonFile(path.join(overridesDir, `${id}.json`)) as
              | MapOverrideFile
              | undefined;
            json(res, 200, {
              map: mergeMapConfig(base as JsonObject, override),
              override: override ?? null,
            });
            return;
          }

          // --- map-feature stamps (data/maps/<id>.stamps.json) -------------

          if (req.method === "GET" && route === "/stamps") {
            const id = url.searchParams.get("map") ?? "";
            if (!VALID_ID.test(id)) {
              json(res, 400, { error: "bad map id" });
              return;
            }
            if (!existsSync(path.join(mapsDir, `${id}.map.json`))) {
              json(res, 404, { error: `no map '${id}'` });
              return;
            }
            const p = path.join(mapsDir, `${id}.stamps.json`);
            if (!existsSync(p)) {
              json(res, 200, { stamps: [] });
              return;
            }
            const doc = readJsonFile(p) as JsonObject | undefined;
            if (doc === undefined) {
              json(res, 500, { error: `corrupt stamps file for '${id}'` });
              return;
            }
            json(res, 200, {
              stamps: Array.isArray(doc.stamps) ? doc.stamps : [],
            });
            return;
          }

          if (req.method === "POST" && route === "/stamps/save") {
            void readBody(req).then((body) => {
              try {
                const data = JSON.parse(body) as {
                  map?: string;
                  stamps?: unknown;
                };
                const id = data.map ?? "";
                if (!VALID_ID.test(id)) {
                  json(res, 400, { error: "bad map id" });
                  return;
                }
                if (!Array.isArray(data.stamps)) {
                  json(res, 400, { error: "stamps must be an array" });
                  return;
                }
                // Loose per-stamp validation: a feature id + finite world
                // coords; the rest normalizes to defaults and optional
                // fields pass through only when well-shaped.
                const stamps: JsonObject[] = [];
                for (const s of data.stamps) {
                  if (!s || typeof s !== "object") {
                    json(res, 400, { error: "stamp must be an object" });
                    return;
                  }
                  const st = s as JsonObject;
                  const fin = (v: unknown, dflt: number) =>
                    typeof v === "number" && Number.isFinite(v) ? v : dflt;
                  if (typeof st.feature !== "string" || !st.feature) {
                    json(res, 400, { error: "stamp.feature must be a string" });
                    return;
                  }
                  if (
                    typeof st.x !== "number" ||
                    !Number.isFinite(st.x) ||
                    typeof st.y !== "number" ||
                    !Number.isFinite(st.y)
                  ) {
                    json(res, 400, { error: "stamp x/y must be finite numbers" });
                    return;
                  }
                  const clean: JsonObject = {
                    feature: st.feature,
                    x: st.x,
                    y: st.y,
                    rotation: fin(st.rotation, 0),
                    scale: fin(st.scale, 1),
                    flipX: st.flipX === true,
                  };
                  if (Array.isArray(st.collision)) clean.collision = st.collision;
                  stamps.push(clean);
                }
                const doc = JSON.stringify({ stamps }, null, 2) + "\n";
                writeFileSync(path.join(mapsDir, `${id}.stamps.json`), doc);
                // Mirror for the Wails client — it fetches stamps as a
                // static asset (same pattern as the pipoya tileset mirror).
                const pubDir = path.join(
                  repoRoot,
                  "wails",
                  "frontend",
                  "public",
                  "assets",
                  "maps",
                );
                mkdirSync(pubDir, { recursive: true });
                writeFileSync(path.join(pubDir, `${id}.stamps.json`), doc);
                json(res, 200, { ok: true, count: stamps.length });
              } catch (err) {
                json(res, 500, { error: String(err) });
              }
            });
            return;
          }

          // --- terrain paint mask (data/maps/<id>.paint.png) -----------------
          // RGBA PNG at world_px/8 — one mask pixel covers 8×8 world px, so
          // dims are (cols*tile_size/8) × (rows*tile_size/8). Category colors
          // are exact RGB at alpha 255 (see bake_terrain.py).

          if (req.method === "GET" && route === "/paint") {
            const id = url.searchParams.get("map") ?? "";
            if (!VALID_ID.test(id)) {
              json(res, 400, { error: "bad map id" });
              return;
            }
            if (!existsSync(path.join(mapsDir, `${id}.map.json`))) {
              json(res, 404, { error: `no map '${id}'` });
              return;
            }
            const p = path.join(mapsDir, `${id}.paint.png`);
            if (!existsSync(p)) {
              json(res, 404, { error: `no paint mask for '${id}'` });
              return;
            }
            res.statusCode = 200;
            res.setHeader("content-type", "image/png");
            res.end(readFileSync(p));
            return;
          }

          if (req.method === "POST" && route === "/paint/save") {
            const id = url.searchParams.get("map") ?? "";
            if (!VALID_ID.test(id)) {
              json(res, 400, { error: "bad map id" });
              return;
            }
            const map = readJsonFile(path.join(mapsDir, `${id}.map.json`)) as
              | JsonObject
              | undefined;
            if (map === undefined) {
              json(res, 404, { error: `no map '${id}'` });
              return;
            }
            void readRawBody(req).then((body) => {
              try {
                // PNG magic: \x89PNG\r\n\x1a\n, then IHDR width/height at
                // bytes 16-24 big-endian (no full decode needed).
                const PNG_MAGIC = Buffer.from([
                  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                ]);
                if (body.length < 24 || !body.subarray(0, 8).equals(PNG_MAGIC)) {
                  json(res, 400, { error: "body must be a PNG image" });
                  return;
                }
                const ts = Number(map.tile_size) || 32;
                const ew = Math.round(((Number(map.cols) || 0) * ts) / 8);
                const eh = Math.round(((Number(map.rows) || 0) * ts) / 8);
                const w = body.readUInt32BE(16);
                const h = body.readUInt32BE(20);
                if (w !== ew || h !== eh) {
                  json(res, 400, {
                    error: `paint mask must be ${ew}x${eh} px (got ${w}x${h})`,
                  });
                  return;
                }
                writeFileSync(path.join(mapsDir, `${id}.paint.png`), body);
                json(res, 200, { ok: true });
              } catch (err) {
                json(res, 500, { error: String(err) });
              }
            });
            return;
          }

          // --- terrain bake (tools/bake_terrain.py) -------------------------

          if (req.method === "POST" && route === "/bake") {
            void readBody(req).then((body) => {
              try {
                const data = JSON.parse(body || "{}") as { map?: string };
                const id = data.map ?? "";
                if (!VALID_ID.test(id)) {
                  json(res, 400, { error: "bad map id" });
                  return;
                }
                const mapPath = path.join(mapsDir, `${id}.map.json`);
                if (!existsSync(mapPath)) {
                  json(res, 404, { error: `no map '${id}'` });
                  return;
                }
                if (bakeJobs.get(id)?.status === "running") {
                  json(res, 200, { ok: true, status: "busy" });
                  return;
                }
                const job: { status: BakeJobStatus; detail?: string } = {
                  status: "running",
                };
                bakeJobs.set(id, job);
                const child = spawn(
                  "python",
                  [path.join(repoRoot, "tools", "bake_terrain.py"), "--map", mapPath],
                  { cwd: repoRoot },
                );
                let out = "";
                child.stdout.on("data", (d: Buffer) => {
                  out += d;
                });
                child.stderr.on("data", (d: Buffer) => {
                  out += d;
                });
                child.on("error", (err) => {
                  job.status = "error";
                  job.detail = String(err);
                });
                child.on("close", (code) => {
                  if (job.status === "running") {
                    job.status = code === 0 ? "ok" : "error";
                    job.detail = out.trim().slice(-4000) || undefined;
                  }
                });
                json(res, 200, { ok: true, status: "running" });
              } catch (err) {
                json(res, 500, { error: String(err) });
              }
            });
            return;
          }

          if (req.method === "GET" && route === "/bake/status") {
            const id = url.searchParams.get("map") ?? "";
            if (!VALID_ID.test(id)) {
              json(res, 400, { error: "bad map id" });
              return;
            }
            if (!existsSync(path.join(mapsDir, `${id}.map.json`))) {
              json(res, 404, { error: `no map '${id}'` });
              return;
            }
            const job = bakeJobs.get(id);
            const body: JsonObject = {
              status: job?.status ?? "idle",
              stale: bakeStale(id),
            };
            if (job?.detail) body.detail = job.detail;
            json(res, 200, body);
            return;
          }
        } catch (err) {
          json(res, 500, { error: String(err) });
          return;
        }
        next();
      });
    },
  };
}
