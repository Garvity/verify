import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { VerifyError } from "../../src/core/error.js";
import { runQualityCheck } from "../../src/analyzers/quality/command-check.js";

describe("runQualityCheck", () => {
  const config = (timeoutMs = 2_000) => ({
    ...DEFAULT_CONFIG,
    execution: {
      ...DEFAULT_CONFIG.execution,
      timeoutMs,
      allowedCommands: [[process.execPath]]
    }
  });

  it("runs an allowlisted command and returns its result", async () => {
    const result = await runQualityCheck(
      "tests",
      [process.execPath, "-e", "process.stdout.write('ok')"],
      config(),
      process.cwd()
    );

    expect(result).toMatchObject({ id: "tests", passed: true, exitCode: 0, timedOut: false });
  });

  it("rejects empty and non-allowlisted commands", async () => {
    await expect(runQualityCheck("tests", [], config(), process.cwd()))
      .rejects.toMatchObject({ code: "CONFIG_INVALID" });
    await expect(runQualityCheck("tests", ["sh", "-c", "true"], config(), process.cwd()))
      .rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("reports failing and timed out commands without treating them as passed", async () => {
    const failed = await runQualityCheck(
      "lint",
      [process.execPath, "-e", "process.exit(7)"],
      config(),
      process.cwd()
    );
    expect(failed).toMatchObject({ id: "lint", passed: false, exitCode: 7, timedOut: false });

    const timedOut = await runQualityCheck(
      "typecheck",
      [process.execPath, "-e", "setTimeout(() => {}, 5000)"],
      config(30),
      process.cwd()
    );
    expect(timedOut).toMatchObject({ id: "typecheck", passed: false, timedOut: true });
  });

  it("wraps process launch errors as verification failures", async () => {
    try {
      await runQualityCheck(
        "tests",
        [process.execPath, "-e", ""],
        config(),
        "/path/that/does/not/exist"
      );
      throw new Error("Expected the command runner to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(VerifyError);
      expect(error).toMatchObject({ code: "VERIFICATION_FAILED" });
    }
  });
});
