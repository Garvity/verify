
import { describe, it, expect } from "vitest";

// Node.js type declarations are not available in the test type-checking environment.
// @ts-ignore
import {
  mkdtemp,
  writeFile,
  rm
} from "node:fs/promises";

// @ts-ignore
import { tmpdir } from "node:os";
// @ts-ignore
import { join } from "node:path";

import { loadConfig } from "../../src/config/loader.js";
import { VerifyError } from "../../src/core/error.js";

describe("loadConfig", () => {
  it("should load a valid configuration file", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "verify-test-")
    );

    try {
      const configPath = join(directory, ".verifyrc.json");

      await writeFile(
        configPath,
        JSON.stringify({
          agent: {
            maxRetries: 5
          }
        })
      );

      const config = await loadConfig(configPath);

      expect(config.agent.maxRetries).toBe(5);
      expect(config.security.secrets).toBe(true);
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("should reject invalid JSON", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "verify-test-")
    );

    try {
      const configPath = join(directory, ".verifyrc.json");

      await writeFile(configPath, "{ invalid json }");

      await expect(
        loadConfig(configPath)
      ).rejects.toMatchObject({
        code: "CONFIG_PARSE_ERROR"
      });
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("should reject an invalid configuration", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "verify-test-")
    );

    try {
      const configPath = join(directory, ".verifyrc.json");

      await writeFile(
        configPath,
        JSON.stringify({
          agent: {
            maxRetries: 50
          }
        })
      );

      await expect(
        loadConfig(configPath)
      ).rejects.toBeInstanceOf(VerifyError);
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  it("should report a missing configuration file", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "verify-test-")
    );

    try {
      const configPath = join(directory, "missing.json");

      await expect(
        loadConfig(configPath)
      ).rejects.toMatchObject({
        code: "CONFIG_NOT_FOUND"
      });
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
