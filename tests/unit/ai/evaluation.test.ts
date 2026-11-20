import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { calculateCostUsd } from "../../../src/ai/evaluation/cost-calculator.js";
import { calculateMetrics } from "../../../src/ai/evaluation/metrics.js";
import { renderEvaluationMarkdown } from "../../../src/ai/evaluation/report.js";
import { runEvaluation } from "../../../src/ai/evaluation/runner.js";
import { hashBenchmarkFixture, loadBenchmarkTasks } from "../../../src/ai/evaluation/task-loader.js";
import type { EvaluationResult, EvaluationRun } from "../../../src/ai/evaluation/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("benchmark evaluation", () => {
  it("loads the bundled task definitions and fingerprints private inputs", async () => {
    const benchmark = await loadBenchmarkTasks(resolve("benchmarks/tasks"));
    expect(benchmark.tasks.map((task) => task.id)).toEqual([
      "inclusive-range",
      "truncate-text",
      "admin-only-delete"
    ]);
    for (const task of benchmark.tasks) {
      expect(task.fixtureSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(task.definitionSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(task.hiddenTestSha256).toHaveProperty(task.hiddenTests[0]!);
      expect(task.hiddenTestPaths[0]).not.toContain(task.fixturePath);
    }
  });

  it("rejects task fixture traversal outside fixtures/", async () => {
    const root = await mkdtemp(join(tmpdir(), "verify-benchmark-loader-test-"));
    temporaryDirectories.push(root);
    const taskDirectory = join(root, "tasks");
    await mkdir(taskDirectory);
    await writeFile(join(taskDirectory, "unsafe.json"), JSON.stringify({
      id: "unsafe-path",
      description: "test",
      expectedOutcome: "test",
      fixture: "fixtures/../tasks",
      hiddenTests: []
    }));
    await expect(loadBenchmarkTasks(taskDirectory)).rejects.toThrow("must stay under 'fixtures/'");
  });

  it("rejects fixtures that enable arbitrary project quality commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "verify-benchmark-command-test-"));
    temporaryDirectories.push(root);
    const taskDirectory = join(root, "tasks");
    const fixtureDirectory = join(root, "fixtures", "command-enabled");
    await mkdir(taskDirectory, { recursive: true });
    await mkdir(fixtureDirectory, { recursive: true });
    await writeFile(join(fixtureDirectory, ".verifyrc.json"), JSON.stringify({
      security: { secrets: true, sensitiveFiles: true, dangerousPatterns: true },
      quality: { tests: { enabled: true } }
    }));
    await writeFile(join(taskDirectory, "command-enabled.json"), JSON.stringify({
      id: "command-enabled",
      description: "test",
      expectedOutcome: "test",
      fixture: "fixtures/command-enabled",
      hiddenTests: []
    }));
    await expect(loadBenchmarkTasks(taskDirectory)).rejects.toThrow("must disable project commands");
  });

  it("runs each model in a fresh workspace from the same fixture commit", async () => {
    const benchmark = await loadBenchmarkTasks(resolve("benchmarks/tasks"));
    const task = benchmark.tasks.find((entry) => entry.id === "inclusive-range")!;
    const fixtureRoot = await mkdtemp(join(tmpdir(), "verify-benchmark-snapshot-test-"));
    temporaryDirectories.push(fixtureRoot);
    const fixturePath = join(fixtureRoot, "fixture");
    await cp(task.fixturePath, fixturePath, { recursive: true });
    const snapshotTask = { ...task, fixturePath, fixtureSha256: await hashBenchmarkFixture(fixturePath) };
    const originalFixtureSource = await readFile(join(fixturePath, "src/range.mjs"), "utf8");
    const workspaces: string[] = [];
    const verificationModels: string[] = [];
    const result = await runEvaluation({
      benchmark: { ...benchmark, tasks: [snapshotTask] },
      models: ["test/model-a", "test/model-b"]
    }, {
      modelAvailable: async (model) => { verificationModels.push(model); },
      runModelTask: async ({ cwd, model }) => {
        workspaces.push(cwd);
        if (model === "test/model-a") {
          await writeFile(join(fixturePath, "src/range.mjs"), "tampered after snapshot\n");
        } else {
          await expect(readFile(join(cwd, "src/range.mjs"), "utf8")).resolves.toBe(originalFixtureSource);
        }
        await writeFile(join(cwd, "src/range.mjs"), "export function isInRange(value, min, max) { return value >= min && value <= max; }\n");
        return {
          status: "verified",
          model,
          finalMessage: "completed",
          correctionAttempts: 0,
          verificationAttempts: 1,
          usage: {
            inputTokens: 10,
            outputTokens: 2,
            totalTokens: 12,
            cachedInputTokens: 0,
            reasoningTokens: 0
          },
          events: [{
            at: new Date().toISOString(),
            type: "model_response",
            model: { requestedModel: model, servedModel: model, provider: "test" }
          }]
        };
      }
    });

    expect(verificationModels).toEqual(["test/model-a", "test/model-b"]);
    expect(new Set(workspaces).size).toBe(2);
    expect(result.runs.map((run) => run.baseCommit)).toEqual([
      result.runs[0]!.baseCommit,
      result.runs[0]!.baseCommit
    ]);
    expect(result.runs.every((run) => run.taskCompleted && run.hiddenTestsPassed)).toBe(true);
    expect(result.metrics.map((metric) => metric.taskCompletionRate)).toEqual([1, 1]);
    expect(result.runs.map((run) => run.servedModels)).toEqual([["test/model-a"], ["test/model-b"]]);
  });

  it("calculates costs only when both usage and an explicit price are available", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      totalTokens: 1_500_000,
      cachedInputTokens: 0,
      reasoningTokens: 0
    };
    expect(calculateCostUsd(usage, {
      inputPerMillionUsd: 1,
      outputPerMillionUsd: 2,
      assumption: "test rates"
    })).toBe(2);
    expect(calculateCostUsd({ ...usage, outputTokens: null }, {
      inputPerMillionUsd: 1,
      outputPerMillionUsd: 2,
      assumption: "test rates"
    })).toBeNull();
  });

  it("reports task completion, hidden-test, verification, security and regression metrics", () => {
    const runs: EvaluationRun[] = [
      {
        taskId: "task-a",
        model: "model-a",
        status: "verified",
        taskCompleted: true,
        verificationPassed: true,
        hiddenTestsPassed: true,
        hiddenTestDurationMs: 4,
        securityViolationCount: 0,
        regressionCount: 0,
        findingRuleIds: [],
        retryCount: 1,
        verificationAttempts: 2,
        latencyMs: 100,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 0, reasoningTokens: 0 },
        costUsd: 0.001,
        servedModels: ["actual/model-a"],
        providers: ["provider-a"],
        baseCommit: "abc"
      },
      {
        taskId: "task-a",
        model: "model-b",
        status: "failed",
        taskCompleted: false,
        verificationPassed: false,
        hiddenTestsPassed: false,
        hiddenTestDurationMs: 5,
        securityViolationCount: 1,
        regressionCount: 2,
        findingRuleIds: ["DANGEROUS_EVAL"],
        retryCount: 2,
        verificationAttempts: 3,
        latencyMs: 200,
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, cachedInputTokens: 0, reasoningTokens: 0 },
        costUsd: 0.002,
        servedModels: ["actual/model-b"],
        providers: ["provider-b"],
        baseCommit: "abc"
      }
    ];
    const metrics = calculateMetrics(runs, ["model-a", "model-b"]);
    expect(metrics[0]).toMatchObject({
      taskCompletionRate: 1,
      hiddenTestPassRate: 1,
      verificationPassRate: 1,
      securityViolationRate: 0,
      regressionRate: 0,
      costPerPassingTaskUsd: 0.001
    });
    expect(metrics[1]).toMatchObject({
      taskCompletionRate: 0,
      hiddenTestPassRate: 0,
      verificationPassRate: 0,
      securityViolationRate: 1,
      regressionRate: 1,
      securityViolationCount: 1,
      regressionCount: 2,
      costPerPassingTaskUsd: null
    });
  });

  it("renders comparison and per-task results as Markdown", () => {
    const result = {
      schemaVersion: 1,
      id: "eval-test",
      createdAt: "2026-11-19T00:00:00.000Z",
      benchmarkRoot: "/tmp/benchmarks",
      requestedModels: ["model-a", "model-b"],
      environment: { node: "v22", platform: "darwin", architecture: "arm64" },
      taskInputs: [{ taskId: "task-a", definitionSha256: "a", fixtureSha256: "b", hiddenTestSha256: {} }],
      runs: [],
      metrics: calculateMetrics([], ["model-a", "model-b"])
    } satisfies EvaluationResult;
    const markdown = renderEvaluationMarkdown(result);
    expect(markdown).toContain("Task completion");
    expect(markdown).toContain("Per-task results");
    expect(markdown).toContain("fresh temporary Git repository");
  });
});
