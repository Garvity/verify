import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { reportCommand } from "../../src/cli/commands/report.js";

let directory = "";

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

describe("report CLI input validation", () => {
  it("rejects malformed nested evaluation data before rendering", async () => {
    directory = await mkdtemp(join(tmpdir(), "verify-report-test-"));
    const input = join(directory, "report.json");
    await writeFile(input, JSON.stringify({
      schemaVersion: 1,
      id: "report",
      createdAt: "2026-11-20T00:00:00.000Z",
      benchmarkRoot: "/tmp/benchmark",
      requestedModels: ["model-a"],
      environment: { node: "v22", platform: "darwin", architecture: "arm64" },
      taskInputs: [null],
      runs: [null],
      metrics: [{ model: "model-a", taskCompletionRate: 1 }]
    }));

    await expect(reportCommand(["--input", input, "--format", "markdown"]))
      .rejects.toThrow("Input is not a recognized verification or evaluation result.");
  });
});
