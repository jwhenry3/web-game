#!/usr/bin/env node
/**
 * Generate Go protobuf code from proto/fantasy/v1 into internal/protocol/pb.
 * Requires protoc + protoc-gen-go on PATH (or PROTOC env).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(root, "internal", "protocol", "pb"), { recursive: true });

const goPath = spawnSync("go", ["env", "GOPATH"], { encoding: "utf8" }).stdout.trim();
const pathSep = process.platform === "win32" ? ";" : ":";
const extra = [
  path.join(process.env.LOCALAPPDATA || "", "protoc", "bin"),
  path.join(goPath, "bin"),
].filter(Boolean);

const env = {
  ...process.env,
  PATH: [...extra, process.env.PATH || ""].join(pathSep),
};

const protoc = process.env.PROTOC || "protoc";
const args = [
  `-I${path.join(root, "proto")}`,
  `--go_out=${root}`,
  `--go_opt=module=clara-mundi`,
  "fantasy/v1/common.proto",
  "fantasy/v1/messages.proto",
];

const r = spawnSync(protoc, args, { cwd: root, stdio: "inherit", env });
if (r.error) {
  console.error(r.error.message);
  process.exit(1);
}
if (r.status !== 0) {
  console.error(
    "protoc failed.\n" +
      "Install protoc: https://github.com/protocolbuffers/protobuf/releases\n" +
      "Install plugin: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest",
  );
  process.exit(r.status ?? 1);
}
console.log("ok: generated internal/protocol/pb");
