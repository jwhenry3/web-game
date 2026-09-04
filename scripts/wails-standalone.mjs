import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wailsDir = path.join(root, "wails");
const isBuild = process.argv.includes("--build");
const baseName = "clara-mundi";
const outName = process.platform === "win32" ? `${baseName}.exe` : baseName;

const env = {
  ...process.env,
  FANTASY_STANDALONE: "1",
};

function goBin() {
  const r = spawnSync("go", ["env", "GOPATH"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return path.join(r.stdout.trim(), "bin");
}

function resolveWails() {
  const bin = process.platform === "win32" ? "wails.exe" : "wails";
  const fromGo = goBin();
  if (fromGo) {
    const p = path.join(fromGo, bin);
    if (existsSync(p)) return p;
  }
  return bin;
}

/** Wails `-o` without .exe writes a PE that Windows Explorer will not launch. */
function normalizeBuiltBinary() {
  const binDir = path.join(wailsDir, "build", "bin");
  const withExt = path.join(binDir, outName);
  const withoutExt = path.join(binDir, baseName);
  if (process.platform === "win32" && existsSync(withoutExt) && !existsSync(withExt)) {
    renameSync(withoutExt, withExt);
  }
  return [
    withExt,
    withoutExt,
    path.join(binDir, "clara-mundi-client.exe"),
    path.join(binDir, "clara-mundi-client"),
  ].find((p) => existsSync(p));
}

const wailsBin = resolveWails();
// Pass .exe explicitly — Wails does not always append it for custom -o names.
const args = isBuild
  ? ["build", "-tags", "standalone", "-o", outName]
  : ["dev"];

const child = spawn(wailsBin, args, {
  cwd: wailsDir,
  env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("error", (err) => {
  console.error(
    `Failed to start Wails CLI (${wailsBin}).\n` +
      `Install with: go install github.com/wailsapp/wails/v2/cmd/wails@v2.10.2\n` +
      `Then ensure %GOPATH%\\bin is on your PATH.\n`,
    err.message,
  );
  process.exit(1);
});

child.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
    return;
  }
  if (!isBuild) {
    process.exit(0);
    return;
  }

  const built = normalizeBuiltBinary();
  if (!built) {
    console.error(`Standalone build finished but no binary was found under ${path.join(wailsDir, "build", "bin")}.`);
    process.exit(1);
  }

  const destDir = path.join(root, "bin");
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, outName);
  copyFileSync(built, dest);

  // Ensure the wails output itself is double-clickable on Windows.
  if (process.platform === "win32" && path.extname(built).toLowerCase() !== ".exe") {
    const fixed = path.join(path.dirname(built), outName);
    copyFileSync(built, fixed);
  }

  console.log(`\nStandalone client ready (embedded server):\n  ${dest}\n`);
  process.exit(0);
});
