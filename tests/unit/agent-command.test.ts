import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  assertModelAvailable: vi.fn(),
  loadConfig: vi.fn()
}));

vi.mock("../../src/ai/agent/loop.js", () => ({ runAgent: mocks.runAgent }));
vi.mock("../../src/ai/gateway/models.js", () => ({ assertModelAvailable: mocks.assertModelAvailable }));
vi.mock("../../src/config/loader.js", () => ({ loadConfig: mocks.loadConfig }));

import { agentCommand } from "../../src/cli/commands/agent.js";

describe("agent CLI environment loading", () => {
  let originalCwd: string;
  let originalModel: string | undefined;
  let originalCodingModel: string | undefined;
  let tempDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalModel = process.env.VERIFY_MODEL;
    originalCodingModel = process.env.VERIFY_MODEL_CODING;
    delete process.env.VERIFY_MODEL;
    delete process.env.VERIFY_MODEL_CODING;
    tempDir = await mkdtemp(join(tmpdir(), "verify-agent-env-"));
    await writeFile(join(tempDir, ".env"), "VERIFY_MODEL=auto\n", "utf8");
    process.chdir(tempDir);

    mocks.assertModelAvailable.mockResolvedValue(undefined);
    mocks.loadConfig.mockResolvedValue({ agent: { maxRetries: 2 }, protectedPaths: [] });
    mocks.runAgent.mockResolvedValue({
      status: "verified",
      model: "auto",
      finalMessage: "Verification passed.",
      correctionAttempts: 0,
      verificationAttempts: 1,
      verification: {
        id: "test-run",
        status: "passed",
        findings: [],
        summary: { filesScanned: 0, checksRun: 0, totalFindings: 0, blockingFindings: 0 },
        durationMs: 1,
        timestamp: "2026-11-20T00:00:00.000Z"
      },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: null, reasoningTokens: null },
      events: []
    });
    vi.spyOn(process.stdout, "write").mockImplementation((() => true) as typeof process.stdout.write);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalModel === undefined) delete process.env.VERIFY_MODEL;
    else process.env.VERIFY_MODEL = originalModel;
    if (originalCodingModel === undefined) delete process.env.VERIFY_MODEL_CODING;
    else process.env.VERIFY_MODEL_CODING = originalCodingModel;
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("loads VERIFY_MODEL from .env before choosing the default task route", async () => {
    await expect(agentCommand(["--task", "read-only smoke", "--format", "json"])).resolves.toBe(0);
    expect(mocks.assertModelAvailable).toHaveBeenCalledWith("auto");
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ model: "auto" }));
  });
});
