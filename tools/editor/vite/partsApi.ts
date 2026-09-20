import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// This file lives in tools/editor/vite/ — repo root is three levels up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const partsDir = path.join(repoRoot, "tools", "parts");
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

const partPath = (id: string) => path.join(partsDir, `${id}.part.json`);

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readJsonFile(p: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return undefined;
  }
}

/** Saved-parts library for the Parts dock. Docs are
 * tools/parts/<id>.part.json — attachment metadata + the part's atlas
 * pixels as a base64 PNG, mountable onto any character's slots.
 *
 *   GET  /editor-api/parts        -> { parts: [{id, label, layer, slot}] }
 *   GET  /editor-api/part?id=<id> -> { part: <doc> }
 *   POST /editor-api/part/save    -> { part: <doc> }  (writes <doc.id>)
 *   POST /editor-api/part/delete  -> { id }
 */
export function partsApi(): Plugin {
  const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  return {
    name: "parts-api",
    configureServer(server) {
      server.middlewares.use("/editor-api", (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x");
        const route = url.pathname;
        try {
          if (req.method === "GET" && route === "/parts") {
            const parts = existsSync(partsDir)
              ? readdirSync(partsDir)
                  .filter((f) => f.endsWith(".part.json"))
                  .sort()
                  .map((f) => {
                    const doc = readJsonFile(partPath(f.slice(0, -".part.json".length))) as
                      | { id?: string; label?: string; layer?: string; slot?: string }
                      | undefined;
                    const id = doc?.id ?? f.slice(0, -".part.json".length);
                    return {
                      id,
                      label: doc?.label ?? id,
                      layer: doc?.layer ?? "",
                      slot: doc?.slot ?? "",
                    };
                  })
              : [];
            json(res, 200, { parts });
            return;
          }

          if (req.method === "GET" && route === "/part") {
            const id = url.searchParams.get("id") ?? "";
            if (!VALID_ID.test(id)) return json(res, 400, { error: "bad part id" });
            const doc = readJsonFile(partPath(id));
            if (doc === undefined) return json(res, 404, { error: `no part '${id}'` });
            json(res, 200, { part: doc });
            return;
          }

          if (req.method === "POST" && route === "/part/save") {
            void readBody(req).then((body) => {
              try {
                const data = JSON.parse(body) as { part?: { id?: string } };
                const doc = data.part;
                const id = doc?.id ?? "";
                if (!doc || !VALID_ID.test(id)) {
                  return json(res, 400, { error: "bad part id" });
                }
                mkdirSync(partsDir, { recursive: true });
                writeFileSync(partPath(id), JSON.stringify(doc) + "\n");
                json(res, 200, { ok: true });
              } catch (err) {
                json(res, 500, { error: String(err) });
              }
            });
            return;
          }

          if (req.method === "POST" && route === "/part/delete") {
            void readBody(req).then((body) => {
              const id = (JSON.parse(body || "{}") as { id?: string }).id ?? "";
              if (!VALID_ID.test(id)) return json(res, 400, { error: "bad part id" });
              const p = partPath(id);
              if (existsSync(p)) rmSync(p);
              json(res, 200, { ok: true });
            });
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
