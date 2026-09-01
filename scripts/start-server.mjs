#!/usr/bin/env node
/**
 * Run the compiled game server binary.
 * Usage: node scripts/start-server.mjs [server flags...]
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = ["bin/server.exe", "bin/server"];
const bin = candidates.map((rel) => join(root, rel)).find(existsSync);

if (!bin) {
  console.error("Server binary not found. Run: npm run server:build");
  process.exit(1);
}

const { status } = spawnSync(bin, process.argv.slice(2), {
  cwd: root,
  stdio: "inherit",
});
process.exit(status ?? 1);
