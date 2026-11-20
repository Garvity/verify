import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadPriceBook: vi.fn(),
  runEvaluation: vi.fn(),
  loadBenchmarkTasks: vi.fn(),
  loadProjectEnv: vi.fn(),
  renderEvaluationMarkdown: vi.fn(),
  metricsAsMarkdownTable: vi.fn()
}));

vi.mock("../../src/ai/evaluation/cost-calculator.js", () => ({ loadPriceBook: mocks.loadPriceBook }));
vi.mock("../../src/ai/evaluation/runner.js", () => ({ runEvaluation: mocks.runEvaluation }));
vi.mock("../../src/ai/evaluation/task-loader.js", () => ({ loadBenchmarkTasks: mocks.loadBenchmarkTasks }));
vi.mock("../../src/ai/gateway/env.js", () => ({ loadProjectEnv: mocks.loadProjectEnv }));
vi.mock("../../src/ai/evaluation/report.js", () => ({
  renderEvaluationMarkdown: mocks.renderEvaluationMarkdown,
  metricsAsMarkdownTable: mocks.metricsAsMarkdownTable
}));

import { evalCommand } from "../../src/cli/commands/eval.js";

describe("evaluation CLI validation", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("rejects unsupported output extensions before starting model evaluation", async () => {
    mocks.loadBenchmarkTasks.mockResolvedValue({ root: "/tmp/benchmark", tasks: [] });
    mocks.runEvaluation.mockReset();

    await expect(evalCommand([
      "--benchmark", "/tmp/benchmark/tasks",
      "--models", "model-a,model-b",
      "--output", "/tmp/results.csv"
    ])).rejects.toThrow("--output must be a path");

    expect(mocks.runEvaluation).not.toHaveBeenCalled();
  });

  it("runs model reviews and saves the combined precision/recall report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "verify-eval-command-test-"));
    try {
      const benchmark = { root: directory, tasks: [{ id: "review-task" }] };
      const result = {
        schemaVersion: 1,
        id: "run-123",
        createdAt: "2026-11-20T00:00:00.000Z",
        benchmarkRoot: directory,
        requestedModels: ["model-a", "model-b"],
        environment: { node: "v22", platform: "darwin", architecture: "arm64" },
        taskInputs: [],
        runs: [],
        metrics: [{ model: "model-a", runs: 1 }, { model: "model-b", runs: 1 }]
      };
      mocks.loadBenchmarkTasks.mockResolvedValue(benchmark);
      mocks.runEvaluation.mockResolvedValue(result);
      mocks.renderEvaluationMarkdown.mockReturnValue("# Precision and recall details");
      mocks.metricsAsMarkdownTable.mockReturnValue("| Model | Precision | Recall | F1 |");
      const stdout = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as typeof process.stdout.write);
      const outputBase = join(directory, "review-run.json");

      await expect(evalCommand([
        "--benchmark", join(directory, "tasks"),
        "--models", "model-a,model-b",
        "--output", outputBase
      ])).resolves.toBe(0);

      expect(mocks.runEvaluation).toHaveBeenCalledWith({ benchmark, models: ["model-a", "model-b"], pricing: undefined });
      expect(mocks.metricsAsMarkdownTable).toHaveBeenCalledWith(result.metrics);
      expect(stdout).toHaveBeenCalledWith(expect.stringContaining("| Model | Precision | Recall | F1 |"));
      await expect(readFile(join(directory, "review-run.json"), "utf8")).resolves.toContain('"requestedModels"');
      await expect(readFile(join(directory, "review-run.md"), "utf8")).resolves.toContain("Precision and recall details");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
