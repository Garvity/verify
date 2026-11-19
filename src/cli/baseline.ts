import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { VerifyError } from "../core/error.js";
import { parseBaselineSnapshot } from "../git/baseline.js";

export async function loadBaselineFile(path: string) {
  const baselinePath = resolve(process.cwd(), path);
  let contents: string;
  try {
    contents = await readFile(baselinePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new VerifyError("CONFIG_NOT_FOUND", `Baseline file not found: ${baselinePath}`, error);
    }
    throw new VerifyError("UNKNOWN_ERROR", `Unable to read baseline file: ${baselinePath}`, error);
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new VerifyError("CONFIG_PARSE_ERROR", `Invalid JSON in baseline file: ${baselinePath}`, error);
  }

  const baseline = parseBaselineSnapshot(value);
  if (!baseline) {
    throw new VerifyError(
      "CONFIG_INVALID",
      `Invalid baseline file: expected a verify JSON result with a findings array and optional checks array (${baselinePath}).`
    );
  }
  return baseline;
}
