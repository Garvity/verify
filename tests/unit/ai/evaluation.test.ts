import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { calculateCostUsd } from "../../../src/ai/evaluation/cost-calculator.js";
import { calculateMetrics, scoreFindings } from "../../../src/ai/evaluation/metrics.js";
import { metricsAsMarkdownTable, renderEvaluationMarkdown } from "../../../src/ai/evaluation/report.js";
import { runEvaluation } from "../../../src/ai/evaluation/runner.js";
import { hashBenchmarkFixture, loadBenchmarkTasks } from "../../../src/ai/evaluation/task-loader.js";
import type { AIReviewFinding } from "../../../src/ai/review/reviewer.js";
import type { EvaluationResult, EvaluationRun, ExpectedFinding } from "../../../src/ai/evaluation/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function reviewFinding(
  filePath: string,
  line: number,
  category: AIReviewFinding["category"] = "quality",
  severity: AIReviewFinding["severity"] = "medium",
  id = "finding"
): AIReviewFinding {
  return {
    id,
    ruleId: "AI_REVIEW_ISSUE",
    severity,
    category,
    message: "The changed implementation has an issue.",
    filePath,
    line,
    blocking: false,
    source: "ai",
    confidence: 0.9,
    evidence: [{ filePath, line, snippet: "return value > min && value < max;", explanation: "The strict comparison excludes the bounds." }]
  };
}

describe("AI review evaluation", () => {
  it("loads reviewer labels and fingerprints task definitions and fixture inputs", async () => {
    const benchmark = await loadBenchmarkTasks(resolve("benchmarks/tasks"));
    expect(benchmark.tasks.map((task) => task.id)).toEqual([
      "benign-profile-formatting",
      "inclusive-range",
      "truncate-text",
      "go-role-check",
      "js-command-injection",
      "js-cross-site-scripting",
      "js-path-traversal",
      "python-sql-injection",
      "python-weak-password-hash",
      "admin-only-delete"
    ]);
    for (const task of benchmark.tasks) {
      if (task.id === "benign-profile-formatting") expect(task.expectedFindings).toEqual([]);
      else expect(task.expectedFindings.length).toBeGreaterThan(0);
      expect(task.fixtureSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(task.definitionSha256).toMatch(/^[a-f0-9]{64}$/);
      for (const label of task.expectedFindings) {
        expect(label.filePath).not.toContain("..");
        expect(label.line).toBeGreaterThan(0);
      }
    }
  });

  it("rejects task fixture traversal outside fixtures/", async () => {
    const root = await mkdtemp(join(tmpdir(), "verify-benchmark-loader-test-"));
    temporaryDirectories.push(root);
    const taskDirectory = join(root, "tasks");
    await mkdir(taskDirectory);
    await writeFile(join(taskDirectory, "unsafe.json"), JSON.stringify({
      id: "unsafe-path",
      description: "Review a code change.",
      fixture: "fixtures/../tasks",
      expectedFindings: []
    }));
    await expect(loadBenchmarkTasks(taskDirectory)).rejects.toThrow("must stay under 'fixtures/'");
  });

  it("rejects fixtures that enable project quality commands", async () => {
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
    await writeFile(join(fixtureDirectory, "src.mjs"), "export const value = 1;\n");
    await writeFile(join(taskDirectory, "command-enabled.json"), JSON.stringify({
      id: "command-enabled",
      description: "Review a fixture.",
      fixture: "fixtures/command-enabled",
      expectedFindings: []
    }));
    await expect(loadBenchmarkTasks(taskDirectory)).rejects.toThrow("must disable project quality commands");
  });

  it("reviews each model against a fresh immutable copy of the same fixture", async () => {
    const benchmark = await loadBenchmarkTasks(resolve("benchmarks/tasks"));
    const task = benchmark.tasks.find((entry) => entry.id === "inclusive-range")!;
    const fixtureRoot = await mkdtemp(join(tmpdir(), "verify-benchmark-snapshot-test-"));
    temporaryDirectories.push(fixtureRoot);
    const fixturePath = join(fixtureRoot, "fixture");
    await cp(task.fixturePath, fixturePath, { recursive: true });
    const originalFixtureSource = await readFile(join(fixturePath, "src/range.mjs"), "utf8");
    const snapshotTask = { ...task, fixturePath, fixtureSha256: await hashBenchmarkFixture(fixturePath) };
    const workspaces: string[] = [];
    const reviewedSources: string[] = [];
    const reviewedModels: string[] = [];
    const result = await runEvaluation({
      benchmark: { ...benchmark, tasks: [snapshotTask] },
      models: ["test/model-a", "test/model-b"]
    }, {
      reviewChanges: async (files, { cwd, model }) => {
        workspaces.push(cwd);
        reviewedModels.push(model);
        reviewedSources.push(files.find((file) => file.newPath === "src/range.mjs")!.addedLines.map((line) => line.content).join("\n"));
        return {
          findings: model === "test/model-a"
            ? [reviewFinding("src/range.mjs", 2)]
            : [reviewFinding("src/range.mjs", 1, "security", "high", "false-positive")],
          review: { status: "completed", model, servedModel: model, provider: "test", durationMs: 4 },
          usage: {
            inputTokens: 10,
            outputTokens: 2,
            totalTokens: 12,
            cachedInputTokens: 0,
            reasoningTokens: 0
          }
        };
      }
    });

    expect(reviewedModels).toEqual(["test/model-a", "test/model-b"]);
    expect(new Set(workspaces).size).toBe(2);
    expect(reviewedSources).toEqual([originalFixtureSource.trimEnd(), originalFixtureSource.trimEnd()]);
    expect(await readFile(join(fixturePath, "src/range.mjs"), "utf8")).toBe(originalFixtureSource);
    expect(result.runs.map((run) => run.reviewStatus)).toEqual(["completed", "completed"]);
    expect(result.runs.map((run) => [run.truePositiveCount, run.falsePositiveCount, run.falseNegativeCount])).toEqual([
      [1, 0, 0],
      [0, 1, 1]
    ]);
    expect(result.runs.map((run) => run.servedModel)).toEqual(["test/model-a", "test/model-b"]);
    expect(result.metrics.map((metric) => metric.f1)).toEqual([1, 0]);
  });

  it("marks provider failure and a mutated fixture as failed review runs", async () => {
    const benchmark = await loadBenchmarkTasks(resolve("benchmarks/tasks"));
    const task = benchmark.tasks.find((entry) => entry.id === "inclusive-range")!;
    const providerFailure = await runEvaluation({ benchmark: { ...benchmark, tasks: [task] }, models: ["a", "b"] }, {
      reviewChanges: async () => { throw new Error("provider unavailable"); }
    });
    expect(providerFailure.runs[0]).toMatchObject({
      reviewStatus: "failed",
      failureReason: "review_error",
      truePositiveCount: 0,
      falseNegativeCount: 1
    });

    const mutation = await runEvaluation({ benchmark: { ...benchmark, tasks: [task] }, models: ["a", "b"] }, {
      reviewChanges: async (_files, { cwd }) => {
        await writeFile(join(cwd, "src/range.mjs"), "modified by reviewer\n");
        return {
          findings: [],
          review: { status: "completed", model: "a", durationMs: 1 },
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedInputTokens: 0, reasoningTokens: 0 }
        };
      }
    });
    expect(mutation.runs[0]).toMatchObject({ reviewStatus: "failed", failureReason: "fixture_modified" });
    expect(mutation.runs[0]!.falseNegativeCount).toBe(1);
  });

  it("calculates token cost only when usage and explicit prices are available", () => {
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

  it("matches labels once and calculates precision, recall, F1, and severity disagreements", () => {
    const labels: ExpectedFinding[] = [
      { filePath: "src/a.ts", line: 10, category: "security", severity: "high" },
      { filePath: "src/b.ts", line: 20, category: "quality", severity: "medium" }
    ];
    const score = scoreFindings(labels, [
      reviewFinding("src/a.ts", 11, "security", "medium", "a"),
      reviewFinding("src/a.ts", 10, "security", "medium", "duplicate"),
      reviewFinding("src/unexpected.ts", 1, "quality", "low", "extra")
    ]);
    expect(score).toEqual({
      truePositiveCount: 1,
      falsePositiveCount: 2,
      falseNegativeCount: 1,
      severityMismatchCount: 1,
      precision: 1 / 3,
      recall: 0.5,
      f1: 0.4
    });
  });

  it("aggregates reviewer metrics and renders a model-comparison report", () => {
    const runs: EvaluationRun[] = [
      {
        taskId: "task-a",
        model: "model-a",
        reviewStatus: "completed",
        review: { status: "completed", model: "model-a", servedModel: "served-a", durationMs: 100 },
        findings: [],
        expectedFindingCount: 1,
        truePositiveCount: 1,
        falsePositiveCount: 1,
        falseNegativeCount: 0,
        severityMismatchCount: 0,
        precision: 0.5,
        recall: 1,
        f1: 2 / 3,
        latencyMs: 100,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 0, reasoningTokens: 0 },
        costUsd: 0.001,
        requestedModel: "model-a",
        servedModel: "served-a",
        provider: "provider-a"
      },
      {
        taskId: "task-a",
        model: "model-b",
        reviewStatus: "failed",
        review: { status: "failed", model: "model-b", errorCode: "provider_error", durationMs: 200 },
        findings: [],
        expectedFindingCount: 1,
        truePositiveCount: 0,
        falsePositiveCount: 0,
        falseNegativeCount: 1,
        severityMismatchCount: 0,
        precision: 0,
        recall: 0,
        f1: 0,
        latencyMs: 200,
        usage: { inputTokens: null, outputTokens: null, totalTokens: null, cachedInputTokens: null, reasoningTokens: null },
        costUsd: null,
        requestedModel: "model-b"
      }
    ];
    const metrics = calculateMetrics(runs, ["model-a", "model-b"]);
    expect(metrics[0]).toMatchObject({
      reviewSuccessRate: 1,
      precision: 0.5,
      recall: 1,
      f1: 2 / 3,
      falsePositiveCount: 1,
      costUsd: 0.001
    });
    expect(metrics[1]).toMatchObject({ reviewSuccessRate: 0, precision: 0, recall: 0, costUsd: null });

    const result = {
      schemaVersion: 1,
      id: "eval-test",
      createdAt: "2026-11-20T00:00:00.000Z",
      benchmarkRoot: "/tmp/benchmarks",
      requestedModels: ["model-a", "model-b"],
      environment: { node: "v22", platform: "darwin", architecture: "arm64" },
      taskInputs: [{ taskId: "task-a", definitionSha256: "a", fixtureSha256: "b" }],
      runs,
      metrics
    } satisfies EvaluationResult;
    const markdown = renderEvaluationMarkdown(result);
    expect(markdown).toContain("Precision");
    expect(markdown).toContain("False positives");
    expect(markdown).toContain("Finding scoring");
    expect(markdown).toContain("workspace did not change");
    expect(metricsAsMarkdownTable(metrics)).toContain("False positives");
  });
});
