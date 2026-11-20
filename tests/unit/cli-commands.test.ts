import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runVerification, loadBaselineFile, loadProjectEnv, discoverModels } = vi.hoisted(() => ({
  runVerification: vi.fn(),
  loadBaselineFile: vi.fn(),
  loadProjectEnv: vi.fn(),
  discoverModels: vi.fn()
}));

vi.mock("../../src/core/orchestrator.js", () => ({ runVerification }));
vi.mock("../../src/cli/baseline.js", () => ({ loadBaselineFile }));
vi.mock("../../src/ai/gateway/env.js", () => ({ loadProjectEnv }));
vi.mock("../../src/ai/gateway/models.js", () => ({ discoverModels }));

import { checkCommand } from "../../src/cli/commands/check.js";
import { initCommand } from "../../src/cli/commands/init.js";
import { modelsCommand } from "../../src/cli/commands/models.js";
import { versionCommand } from "../../src/cli/commands/version.js";

const result = (status: "passed" | "failed" | "error") => ({
  id: "test-run",
  status,
  findings: [],
  checks: [],
  summary: { filesScanned: 0, checksRun: 0, totalFindings: 0, blockingFindings: 0 },
  durationMs: 1,
  timestamp: "2026-11-20T00:00:00.000Z"
});

let directory = "";
let originalCwd = "";
let stdout = "";

beforeEach(() => {
  originalCwd = process.cwd();
  stdout = "";
  vi.clearAllMocks();
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (process.cwd() !== originalCwd) process.chdir(originalCwd);
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

describe("checkCommand", () => {
  it("prints help and rejects conflicting, missing, or invalid options", async () => {
    await expect(checkCommand(["--help"])).resolves.toBe(0);
    expect(stdout).toContain("Run change analysis");
    await expect(checkCommand(["--all", "--base", "HEAD"])).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(checkCommand(["--format"])).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(checkCommand(["--format", "yaml"])).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    expect(runVerification).not.toHaveBeenCalled();
  });

  it("passes baseline and check options through and maps verification statuses to exit codes", async () => {
    loadBaselineFile.mockResolvedValue({ findings: [] });
    runVerification.mockResolvedValueOnce(result("passed"))
      .mockResolvedValueOnce(result("failed"))
      .mockResolvedValueOnce(result("error"));

    await expect(checkCommand(["--base", "HEAD^", "--baseline", "baseline.json", "--format", "json"]))
      .resolves.toBe(0);
    expect(loadBaselineFile).toHaveBeenCalledWith("baseline.json");
    expect(runVerification).toHaveBeenLastCalledWith({
      base: "HEAD^", all: false, runChecks: true, baseline: { findings: [] }
    });
    await expect(checkCommand(["--all", "--format", "json"])).resolves.toBe(1);
    await expect(checkCommand(["--format", "json"])).resolves.toBe(3);
  });
});

describe("initCommand", () => {
  it("prints help, creates a default config, and reports existing files", async () => {
    await expect(initCommand(["--help"])).resolves.toBe(0);
    expect(stdout).toContain("Create a default .verifyrc.json");

    directory = await mkdtemp(join(tmpdir(), "verify-init-test-"));
    process.chdir(directory);
    await expect(initCommand([])).resolves.toBe(0);
    const created = JSON.parse(await (await import("node:fs/promises")).readFile(join(directory, ".verifyrc.json"), "utf8"));
    expect(created.security.secrets).toBe(true);
    await expect(initCommand([])).rejects.toMatchObject({ code: "CONFIG_EXISTS" });
  });
});

describe("modelsCommand", () => {
  it("supports help, JSON, empty, and terminal model lists", async () => {
    await expect(modelsCommand(["--help"])).resolves.toBe(0);
    expect(stdout).toContain("List model IDs");
    await expect(modelsCommand(["--format", "invalid"])).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });

    discoverModels.mockResolvedValueOnce([{ id: "org/model", ownedBy: "org" }]);
    await expect(modelsCommand(["--format", "json"])).resolves.toBe(0);
    expect(stdout).toContain('"id": "org/model"');

    discoverModels.mockResolvedValueOnce([]);
    await expect(modelsCommand([])).resolves.toBe(0);
    expect(stdout).toContain("No models are available.");

    discoverModels.mockResolvedValueOnce([{ id: "model-without-owner" }, { id: "owned-model", ownedBy: "vendor" }]);
    await expect(modelsCommand([])).resolves.toBe(0);
    expect(stdout).toContain("model-without-owner");
    expect(stdout).toContain("owned-model\tvendor");
    expect(loadProjectEnv).toHaveBeenCalledTimes(3);
  });
});

describe("versionCommand", () => {
  it("prints help and supports text and JSON formats", async () => {
    await expect(versionCommand(["--help"])).resolves.toBe(0);
    expect(stdout).toContain("Usage: verify version");
    await expect(versionCommand(["--format", "invalid"])).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(versionCommand([])).resolves.toBe(0);
    expect(stdout).toMatch(/^verify \d+\.\d+\.\d+/m);
    await expect(versionCommand(["--format", "json"])).resolves.toBe(0);
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toMatchObject({ name: "verify" });
  });
});
