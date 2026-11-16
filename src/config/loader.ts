
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  VerifyConfigSchema,
  type VerifyConfig
} from "./schema.js";

import { VerifyError, ConfigValidationError } from "../core/error.js";

export async function loadConfig(
  configPath = resolve(process.cwd(), ".verifyrc.json")
): Promise<VerifyConfig> {
  let fileContents: string;

  try {
    fileContents = await readFile(configPath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new VerifyError(
        "CONFIG_NOT_FOUND",
        `Configuration file not found: ${configPath}`,
        error
      );
    }

    throw new VerifyError(
      "UNKNOWN_ERROR",
      `Unable to read configuration file: ${configPath}`,
      error
    );
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(fileContents);
  } catch (error) {
    throw new VerifyError(
      "CONFIG_PARSE_ERROR",
      `Invalid JSON in configuration file: ${configPath}`,
      error
    );
  }

  const validation = VerifyConfigSchema.safeParse(parsedJson);

  if (!validation.success) {
    const details = validation.error.issues
      .map((issue) => {
        const field = issue.path.join(".") || "root";

        return `${field}: ${issue.message}`;
      })
      .join("\n");

    throw new ConfigValidationError(
      `Invalid configuration:\n${details}`,
      validation.error
    );
  }

  return validation.data;
}
