import { parseArgs, type ParseArgsConfig } from "node:util";
import { VerifyError } from "../core/error.js";

export function parseCommandArgs(
  args: string[],
  options: ParseArgsConfig["options"]
) {
  try {
    const parsed = parseArgs({
      args,
      options: { ...options, help: { type: "boolean", short: "h" } },
      strict: true,
      allowPositionals: false
    });
    return {
      values: parsed.values as Record<string, string | boolean | undefined>,
      positionals: parsed.positionals
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new VerifyError("INVALID_ARGUMENTS", message, error);
  }
}

export function requireStringOption(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new VerifyError("INVALID_ARGUMENTS", `--${name} requires a non-empty value.`);
  }
  return value;
}
