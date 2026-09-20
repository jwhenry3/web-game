import react from "@vitejs/plugin-react";
import { effectsApi } from "./vite/effectsApi.ts";
import { hairApi } from "./vite/hairApi.ts";
import { mapsApi } from "./vite/mapsApi.ts";
import { partsApi } from "./vite/partsApi.ts";
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const editorDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(editorDir, "../..");
const spineDir = path.join(repoRoot, "wails/frontend/public/assets/spine");
const specDir = path.join(repoRoot, "tools");

const specPath = (id: string) => path.join(specDir, `${id}.spec.json`);
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

/** Retired rigs — kept on disk for the runtime but unlisted in the editor. */
const EDITOR_HIDDEN_CHARS = new Set(["h99doll"]);

/** 1x1 transparent PNG for blank rigs. */
const BLANK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function readJson(p: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return undefined;
  }
}

interface SpecMeta {
  generator?: string;
  source?: { dir?: string };
  output?: { name?: string };
}

function specOf(id: string): SpecMeta | undefined {
  const s = readJson(specPath(id));
  return s && typeof s === "object" ? (s as SpecMeta) : undefined;
}

const regenerable = (s: SpecMeta | undefined) =>
  !!(s?.generator && s.source?.dir);

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/** Dev-only file API: list/load/save characters, create new ones, and run
 * the generator. A "character" is an <id>.{json,atlas,png} triple in the
 * spine assets dir plus an optional editable spec at tools/<id>.spec.json. */
function editorApi(): Plugin {
  const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  const runGenerator = (id: string, res: import("node:http").ServerResponse) => {
    const spec = specOf(id);
    if (!spec?.generator) {
      json(res, 400, { error: `character '${id}' has no generator in its spec` });
      return;
    }
    execFile(
      "python",
      [path.join(repoRoot, spec.generator), specPath(id)],
      { cwd: repoRoot },
      (err, stdout, stderr) => {
        if (err) json(res, 500, { error: stderr || String(err) });
        else json(res, 200, { output: stdout });
      },
    );
  };
  return {
    name: "editor-api",
    configureServer(server) {
      server.middlewares.use("/editor-api", (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x");
        const route = url.pathname;

        if (req.method === "GET" && route === "/characters") {
          const ids = new Set<string>();
          for (const f of readdirSync(spineDir)) {
            if (f.endsWith(".atlas")) ids.add(f.slice(0, -".atlas".length));
          }
          for (const f of readdirSync(specDir)) {
            if (f.endsWith(".spec.json")) ids.add(f.slice(0, -".spec.json".length));
          }
          const characters = [...ids]
            .filter((id) => !EDITOR_HIDDEN_CHARS.has(id))
            .sort()
            .map((id) => {
            const spec = specOf(id);
            // Preset specs share another rig's assets via output.name.
            const assetId =
              spec?.output?.name && VALID_ID.test(spec.output.name)
                ? spec.output.name
                : id;
            return {
              id,
              hasSpec: existsSync(specPath(id)),
              hasAssets:
                existsSync(path.join(spineDir, `${assetId}.json`)) &&
                existsSync(path.join(spineDir, `${assetId}.atlas`)) &&
                existsSync(path.join(spineDir, `${assetId}.png`)),
              regenerable: regenerable(spec),
            };
          });
          json(res, 200, { characters });
          return;
        }

        if (req.method === "GET" && route === "/spec") {
          const id = url.searchParams.get("char") ?? "";
          if (!VALID_ID.test(id)) return json(res, 400, { error: "bad char id" });
          const spec = readJson(specPath(id));
          if (spec === undefined) return json(res, 404, { error: "no spec" });
          json(res, 200, { spec });
          return;
        }

        if (req.method === "POST" && route === "/save") {
          void readBody(req).then((body) => {
            try {
              const data = JSON.parse(body) as {
                char?: string;
                spec?: unknown;
                skeleton?: unknown;
                atlas?: string;
                pngBase64?: string;
                assets?: string;
              };
              const id = data.char ?? "";
              if (!VALID_ID.test(id)) return json(res, 400, { error: "bad char id" });
              // Preset specs (e.g. paperdoll_imp) share another rig's assets —
              // write spec under the char id but rig files under the resolved stem.
              const assetId =
                typeof data.assets === "string" && VALID_ID.test(data.assets)
                  ? data.assets
                  : id;
              if (data.spec)
                writeFileSync(specPath(id), JSON.stringify(data.spec, null, 2) + "\n");
              if (data.skeleton)
                writeFileSync(
                  path.join(spineDir, `${assetId}.json`),
                  JSON.stringify(data.skeleton),
                );
              if (data.atlas)
                writeFileSync(path.join(spineDir, `${assetId}.atlas`), data.atlas);
              if (data.pngBase64)
                writeFileSync(
                  path.join(spineDir, `${assetId}.png`),
                  Buffer.from(data.pngBase64, "base64"),
                );
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
          });
          return;
        }

        // Create a character: inline spec/skeleton/atlas/png (duplicate mode),
        // or a minimal blank rig when no assets are supplied.
        if (req.method === "POST" && route === "/new") {
          void readBody(req).then((body) => {
            try {
              const data = JSON.parse(body) as {
                id?: string;
                spec?: Record<string, unknown>;
                skeleton?: unknown;
                atlas?: string;
                pngBase64?: string;
              };
              const id = data.id ?? "";
              if (!VALID_ID.test(id)) return json(res, 400, { error: "bad char id" });
              if (existsSync(specPath(id)) || existsSync(path.join(spineDir, `${id}.json`))) {
                return json(res, 409, { error: `character '${id}' already exists` });
              }
              if (data.spec) {
                writeFileSync(specPath(id), JSON.stringify(data.spec, null, 2) + "\n");
              }
              if (data.skeleton && data.atlas && data.pngBase64) {
                writeFileSync(
                  path.join(spineDir, `${id}.json`),
                  JSON.stringify(data.skeleton),
                );
                writeFileSync(path.join(spineDir, `${id}.atlas`), data.atlas);
                writeFileSync(
                  path.join(spineDir, `${id}.png`),
                  Buffer.from(data.pngBase64, "base64"),
                );
                return json(res, 200, { ok: true, id });
              }
              // Blank rig: single root bone, empty atlas + transparent pixel.
              writeFileSync(
                path.join(spineDir, `${id}.json`),
                JSON.stringify({
                  skeleton: { spine: "4.3.0", hash: id, width: 0, height: 0, fps: 30 },
                  bones: [{ name: "root" }],
                  slots: [],
                  skins: [{ name: "default", attachments: {} }],
                  animations: {},
                }),
              );
              writeFileSync(
                path.join(spineDir, `${id}.atlas`),
                `${id}.png\nsize: 1,1\nformat: RGBA8888\nfilter: Nearest,Nearest\nrepeat: none\n`,
              );
              writeFileSync(path.join(spineDir, `${id}.png`), Buffer.from(BLANK_PNG, "base64"));
              if (!data.spec) {
                writeFileSync(
                  specPath(id),
                  JSON.stringify(
                    {
                      output: { dir: "wails/frontend/public/assets/spine", name: id },
                      source: { dir: "", frame: 0, footX: 0, footY: 0, pad: 1, overlap: 0, atlasWidth: 256 },
                      partOrder: [],
                      partRules: [],
                      layers: [],
                      bones: [{ name: "root", parent: null, x: 0, y: 0 }],
                      animations: {},
                    },
                    null,
                    2,
                  ) + "\n",
                );
              }
              json(res, 200, { ok: true, id });
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
          });
          return;
        }

        if (req.method === "POST" && route === "/delete") {
          void readBody(req).then((body) => {
            const id = (JSON.parse(body || "{}") as { char?: string }).char ?? "";
            if (!VALID_ID.test(id)) return json(res, 400, { error: "bad char id" });
            // Preset specs point at a shared rig via output.name — deleting one
            // removes only its spec, never the shared assets.
            const bound = specOf(id)?.output?.name;
            const assetId = bound && VALID_ID.test(bound) ? bound : id;
            const paths = [specPath(id)];
            if (assetId === id) {
              paths.push(
                path.join(spineDir, `${id}.json`),
                path.join(spineDir, `${id}.atlas`),
                path.join(spineDir, `${id}.png`),
              );
            }
            for (const p of paths) {
              if (existsSync(p)) rmSync(p);
            }
            json(res, 200, { ok: true });
          });
          return;
        }

        if (req.method === "POST" && route === "/regenerate") {
          void readBody(req).then((body) => {
            const id = (JSON.parse(body || "{}") as { char?: string }).char ?? "";
            if (!VALID_ID.test(id)) return json(res, 400, { error: "bad char id" });
            runGenerator(id, res);
          });
          return;
        }

        // Unknown route — yield to the sibling API plugins (maps, effects).
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), editorApi(), hairApi(), mapsApi(), effectsApi(), partsApi()],
  // Serve the game's public assets so /assets/spine/* and /assets/heroes99/*
  // resolve to the same files the game loads.
  publicDir: path.join(repoRoot, "wails/frontend/public"),
  server: { port: 35215, strictPort: true },
});
