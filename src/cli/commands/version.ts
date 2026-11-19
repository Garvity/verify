import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VerifyError } from "../../core/error.js";
import { parseCommandArgs } from "../arguments.js";

const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../package.json");

export async function versionCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, { format: { type: "string" } });
  if (values.help) {
    process.stdout.write("Usage: verify version [--format <text|json>]\n");
    return 0;
  }
  const format = values.format ?? "text";
  if (format !== "text" && format !== "json") {
    throw new VerifyError("INVALID_ARGUMENTS", "--format must be text or json.");
  }
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { name?: string; version?: string };
  if (!packageJson.version) throw new VerifyError("UNKNOWN_ERROR", "Package version is missing.");
  process.stdout.write(format === "json"
    ? JSON.stringify({ name: packageJson.name ?? "verify", version: packageJson.version }) + "\n"
    : "verify " + packageJson.version + "\n");
  return 0;
}
