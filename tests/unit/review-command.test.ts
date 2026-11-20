import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runVerification } = vi.hoisted(() => ({ runVerification: vi.fn() }));
vi.mock("../../src/core/orchestrator.js", () => ({ runVerification }));

import { reviewCommand } from "../../src/cli/commands/review.js";

const result = (status: "passed" | "failed") => ({
  id: "review-cli-result",
  status,
  findings: [],
  aiReview: { status: "unavailable", errorCode: "not_configured", durationMs: 0 },
  summary: { filesScanned: 0, checksRun: 4, totalFindings: 0, blockingFindings: 0 },
  durationMs: 1,
  timestamp: "2026-11-20T00:00:00.000Z"
});

let stdout = "";

beforeEach(() => {
  stdout = "";
  vi.clearAllMocks();
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write);
});

afterEach(() => vi.restoreAllMocks());

describe("reviewCommand", () => {
  it("documents the combined read-only workflow", async () => {
    await expect(reviewCommand(["--help"])).resolves.toBe(0);
    expect(stdout).toContain("read-only AI reviewer");
    expect(runVerification).not.toHaveBeenCalled();
  });

  it("requests deterministic verification plus AI review and preserves deterministic exit status", async () => {
    runVerification.mockResolvedValueOnce(result("passed"));
    await expect(reviewCommand(["--base", "main", "--checks", "--format", "json"]))
      .resolves.toBe(0);
    expect(runVerification).toHaveBeenCalledWith({ base: "main", runChecks: true, aiReview: true });
    expect(JSON.parse(stdout)).toMatchObject({
      status: "passed",
      aiReview: { status: "unavailable", errorCode: "not_configured" }
    });
  });

  it("returns a deterministic failure exit code when blocking findings exist", async () => {
    runVerification.mockResolvedValueOnce(result("failed"));
    await expect(reviewCommand([])).resolves.toBe(1);
  });

  it("rejects unsupported output formats", async () => {
    await expect(reviewCommand(["--format", "xml"]))
      .rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });
});
