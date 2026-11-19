import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

/** Load a project .env file for explicit AI commands without making CLI import depend on it. */
export function loadProjectEnv(cwd = process.cwd()): void {
  try {
    loadEnvFile(resolve(cwd, ".env"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}
