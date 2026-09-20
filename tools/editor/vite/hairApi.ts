import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// This file lives in tools/editor/vite/ — repo root is three levels up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hairsDir = path.join(repoRoot, "tools", "hairs");
const VALID_ID = /^[a-zA-Z0-9_-]+$/;

const hairPath = (id: string) => path.join(hairsDir, `${id}.hair.json`);

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

/** Hair-doc API for the Hair workspace. Docs are
 * tools/hairs/<id>.hair.json; gen_paperdoll.py bakes them into the
 * paperdoll rig on Regenerate.
 *
 *   GET  /editor-api/hairs        -> { hairs: [{id, label, preset}] }
 *   GET  /editor-api/hair?id=<id> -> { hair: <doc> }
 *   POST /editor-api/hair/save    -> { hair: <doc> }  (writes <doc.id>)
 *   POST /editor-api/hair/delete  -> { id }
 */
export function hairApi(): Plugin {
  const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  return {
    name: "hair-api",
    configureServer(server) {
      server.middlewares.use("/editor-api", (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://x");
        const route = url.pathname;
        try {
          if (req.method === "GET" && route === "/hairs") {
            const hairs = existsSync(hairsDir)
              ? readdirSync(hairsDir)
                  .filter((f) => f.endsWith(".hair.json"))
                  .sort()
                  .map((f) => {
                    const doc = readJsonFile(hairPath(f.slice(0, -".hair.json".length))) as
                      | { id?: string; label?: string; preset?: boolean }
                      | undefined;
                    const id = doc?.id ?? f.slice(0, -".hair.json".length);
                    return { id, label: doc?.label ?? id, preset: doc?.preset === true };
                  })
              : [];
            json(res, 200, { hairs });
            return;
          }

          if (req.method === "GET" && route === "/hair") {
            const id = url.searchParams.get("id") ?? "";
            if (!VALID_ID.test(id)) return json(res, 400, { error: "bad hair id" });
            const doc = readJsonFile(hairPath(id));
            if (doc === undefined) return json(res, 404, { error: `no hair '${id}'` });
            json(res, 200, { hair: doc });
            return;
          }

          if (req.method === "POST" && route === "/hair/save") {
            void readBody(req).then((body) => {
              try {
                const data = JSON.parse(body) as { hair?: { id?: string } };
                const doc = data.hair;
                const id = doc?.id ?? "";
                if (!doc || !VALID_ID.test(id)) {
                  return json(res, 400, { error: "bad hair id" });
                }
                mkdirSync(hairsDir, { recursive: true });
                writeFileSync(hairPath(id), JSON.stringify(doc) + "\n");
                json(res, 200, { ok: true });
              } catch (err) {
                json(res, 500, { error: String(err) });
              }
            });
            return;
          }

          if (req.method === "POST" && route === "/hair/delete") {
            void readBody(req).then((body) => {
              const id = (JSON.parse(body || "{}") as { id?: string }).id ?? "";
              if (!VALID_ID.test(id)) return json(res, 400, { error: "bad hair id" });
              const p = hairPath(id);
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
