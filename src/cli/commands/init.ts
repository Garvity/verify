import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { VerifyError } from "../../core/error.js";
import { parseCommandArgs } from "../arguments.js";

const HELP = `Usage: verify init

Create a default .verifyrc.json in the current directory. Existing files are preserved.`;

export async function initCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, {});
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const configPath = resolve(process.cwd(), ".verifyrc.json");
  try {
    await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new VerifyError("CONFIG_EXISTS", `Configuration already exists: ${configPath}`, error);
    }
    throw new VerifyError("UNKNOWN_ERROR", `Unable to create configuration: ${configPath}`, error);
  }

  process.stdout.write(`Created ${configPath}\n`);
  return 0;
}
