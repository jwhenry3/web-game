#!/usr/bin/env node
/**
 * Stop the game server listening on a TCP port (default 8080).
 * Usage: node scripts/stop-server.mjs [port]
 */
import { execSync } from "node:child_process";
import { platform } from "node:os";

const port = process.argv[2] || process.env.SERVER_PORT || "8080";

function killPortWin(targetPort) {
  let out = "";
  try {
    out = execSync(`netstat -ano | findstr :${targetPort}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    console.log(`No listener on port ${targetPort}`);
    return;
  }

  const pids = new Set();
  for (const line of out.split("\n")) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== "0") pids.add(pid);
  }

  if (pids.size === 0) {
    console.log(`No listener on port ${targetPort}`);
    return;
  }

  for (const pid of pids) {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    console.log(`Stopped process ${pid} on port ${targetPort}`);
  }
}

function killPortUnix(targetPort) {
  let pids = "";
  try {
    pids = execSync(`lsof -ti tcp:${targetPort}`, { encoding: "utf8" }).trim();
  } catch {
    console.log(`No listener on port ${targetPort}`);
    return;
  }

  if (!pids) {
    console.log(`No listener on port ${targetPort}`);
    return;
  }

  for (const pid of pids.split("\n")) {
    if (!pid) continue;
    execSync(`kill ${pid}`);
    console.log(`Stopped process ${pid} on port ${targetPort}`);
  }
}

if (platform() === "win32") killPortWin(port);
else killPortUnix(port);
