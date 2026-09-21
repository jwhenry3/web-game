import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// vite/ sits one level below editorDir — three hops up reach the repo root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const rigsDir = path.join(repoRoot, "wails/frontend/public/assets/rigs3d");
const modelsDir = path.join(repoRoot, "wails/frontend/public/assets/models");
const VALID_ID = /^[a-zA-Z0-9_-]+$/;
const rigPath = (id: string) => path.join(rigsDir, `${id}.rig3d.json`);
const indexPath = path.join(rigsDir, "index.json");

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function listRigFiles(): { id: string; label: string }[] {
  if (!existsSync(rigsDir)) return [];
  return readdirSync(rigsDir)
    .filter(f => f.endsWith(".rig3d.json"))
    .map(f => {
      const id = f.slice(0, -".rig3d.json".length);
      let label = id;
      try {
        const doc = JSON.parse(readFileSync(rigPath(id), "utf-8"));
        if (isRecord(doc) && typeof doc.label === "string" && doc.label) label = doc.label;
      } catch { /* unreadable file — list the id anyway */ }
      return { id, label };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Keep index.json in sync — the game loads authored rigs through it. */
function writeIndex() {
  const rigs = listRigFiles().map(r => r.id);
  writeFileSync(indexPath, JSON.stringify({ rigs }, null, 2) + "\n");
}

function listModels(): { name: string; url: string }[] {
  if (!existsSync(modelsDir)) return [];
  const out: { name: string; url: string }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name), rel = prefix ? `${prefix}/${f.name}` : f.name;
      if (f.isDirectory()) walk(p, rel);
      else if (/\.(glb|gltf)$/i.test(f.name)) out.push({ name: rel, url: `/assets/models/${rel}` });
    }
  };
  walk(modelsDir, "");
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Dev-only API backing the Scene workspace's Characters mode. Reads and
 * writes 3D rig documents at wails/frontend/public/assets/rigs3d/ — the same
 * files loadRigLibrary() fetches at runtime.
 *
 *   GET  /editor-api/rigs3d         -> { rigs: [{id, label}] }   (saved files)
 *   GET  /editor-api/rigs3d/rig?id= -> rig doc JSON (404 if absent)
 *   POST /editor-api/rigs3d/save    -> body { id, doc }
 *   POST /editor-api/rigs3d/delete  -> body { id }
 *   GET  /editor-api/rigs3d/models  -> { models: [{name, url}] } (glTF files)
 */
export function rigsApi(): Plugin {
  const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };

  return {
    name: "rigs3d-api",
    configureServer(server) {
      server.middlewares.use("/editor-api/rigs3d", (req, res) => {
        const url = new URL(req.url ?? "/", "http://x");
        const route = url.pathname;

        if (req.method === "GET" && (route === "/" || route === "")) {
          json(res, 200, { rigs: listRigFiles() });
          return;
        }

        if (req.method === "GET" && route === "/models") {
          json(res, 200, { models: listModels() });
          return;
        }

        if (req.method === "GET" && route === "/rig") {
          const id = url.searchParams.get("id") ?? "";
          if (!VALID_ID.test(id)) return json(res, 400, { error: "bad rig id" });
          if (!existsSync(rigPath(id))) return json(res, 404, { error: "no saved rig" });
          try {
            json(res, 200, JSON.parse(readFileSync(rigPath(id), "utf-8")));
          } catch {
            json(res, 500, { error: "rig file is not valid JSON" });
          }
          return;
        }

        if (req.method === "POST" && route === "/save") {
          void readBody(req).then(body => {
            try {
              const data = JSON.parse(body) as { id?: string; doc?: unknown };
              const id = data.id ?? "";
              if (!VALID_ID.test(id)) return json(res, 400, { error: "bad rig id" });
              if (!isRecord(data.doc)) return json(res, 400, { error: "doc must be an object" });
              mkdirSync(rigsDir, { recursive: true });
              writeFileSync(rigPath(id), JSON.stringify(data.doc, null, 2) + "\n");
              writeIndex();
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
          });
          return;
        }

        if (req.method === "POST" && route === "/delete") {
          void readBody(req).then(body => {
            const id = (JSON.parse(body || "{}") as { id?: string }).id ?? "";
            if (!VALID_ID.test(id)) return json(res, 400, { error: "bad rig id" });
            try {
              if (existsSync(rigPath(id))) rmSync(rigPath(id));
              writeIndex();
              json(res, 200, { ok: true });
            } catch (err) {
              json(res, 500, { error: String(err) });
            }
          });
          return;
        }

        json(res, 404, { error: "unknown endpoint" });
      });
    },
  };
}
