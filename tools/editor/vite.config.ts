import react from "@vitejs/plugin-react";
import { effectsApi } from "./vite/effectsApi.ts";
import { rigsApi } from "./vite/rigsApi.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const editorDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(editorDir, "../..");

export default defineConfig({
  plugins: [react(), effectsApi(), rigsApi()],
  // Serve the game's public assets so /assets/* resolves to the same files
  // the game loads.
  publicDir: path.join(repoRoot, "wails/frontend/public"),
  // The Scene workspace imports the game's Three.js terrain/prefab modules
  // from wails/frontend/src/three so the editor renders exactly what the
  // client does. dedupe keeps a single `three` instance across both trees.
  resolve: { dedupe: ["three"] },
  server: {
    port: 35215,
    strictPort: true,
    fs: { allow: [repoRoot] },
    // Map snapshots (terrain cells) come from the running game server, like world3d.html.
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
});
