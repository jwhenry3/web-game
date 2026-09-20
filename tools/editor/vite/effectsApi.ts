import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// vite/ sits one level below editorDir — three hops up reach the repo root.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const profilesPath = path.join(
  repoRoot,
  "wails/frontend/public/assets/vfx/profiles.json",
);

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

/**
 * Dev-only API backing the Effects workspace. Reads and writes the shared
 * battle-VFX overlay at wails/frontend/public/assets/vfx/profiles.json —
 * the same file the game fetches at boot.
 *
 *   GET  /editor-api/effects       -> { colors, profiles } (404 if absent)
 *   POST /editor-api/effects/save  -> body { colors, profiles }
 */
export function effectsApi(): Plugin {
  const json = (
    res: import("node:http").ServerResponse,
    code: number,
    body: unknown,
  ) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };

  return {
    name: "effects-api",
    configureServer(server) {
      server.middlewares.use("/editor-api/effects", (req, res) => {
        const url = new URL(req.url ?? "/", "http://x");
        const route = url.pathname;

        if (req.method === "GET" && (route === "/" || route === "")) {
          if (!existsSync(profilesPath)) return json(res, 404, { error: "no profiles.json" });
          try {
            json(res, 200, JSON.parse(readFileSync(profilesPath, "utf-8")));
          } catch {
            json(res, 404, { error: "profiles.json is not valid JSON" });
          }
          return;
        }

        if (req.method === "POST" && route === "/save") {
          void readBody(req).then((body) => {
            try {
              const data = JSON.parse(body) as {
                profiles?: unknown;
                colors?: unknown;
              };
              // Loose shape check: two object maps keyed by category name.
              // colors values must be numbers; profile values must be objects.
              if (!isRecord(data.profiles)) {
                return json(res, 400, { error: "profiles must be an object map" });
              }
              if (data.colors !== undefined && !isRecord(data.colors)) {
                return json(res, 400, { error: "colors must be an object map" });
              }
              for (const [key, value] of Object.entries(data.profiles)) {
                if (!isRecord(value)) {
                  return json(res, 400, { error: `profile '${key}' must be an object` });
                }
              }
              if (isRecord(data.colors)) {
                for (const [key, value] of Object.entries(data.colors)) {
                  if (typeof value !== "number" || !Number.isFinite(value)) {
                    return json(res, 400, { error: `color '${key}' must be a number` });
                  }
                }
              }
              mkdirSync(path.dirname(profilesPath), { recursive: true });
              writeFileSync(
                profilesPath,
                JSON.stringify({ colors: data.colors ?? {}, profiles: data.profiles }, null, 2) + "\n",
              );
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
