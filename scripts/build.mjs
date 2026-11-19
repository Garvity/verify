import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist");
const compiler = resolve(root, "node_modules/typescript/bin/tsc");

await rm(output, { recursive: true, force: true });

const result = spawnSync(process.execPath, [compiler], {
  cwd: root,
  stdio: "inherit"
});

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
