import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadPriceBook: vi.fn(),
  runEvaluation: vi.fn(),
  loadBenchmarkTasks: vi.fn(),
  loadProjectEnv: vi.fn()
}));

vi.mock("../../src/ai/evaluation/cost-calculator.js", () => ({ loadPriceBook: mocks.loadPriceBook }));
vi.mock("../../src/ai/evaluation/runner.js", () => ({ runEvaluation: mocks.runEvaluation }));
vi.mock("../../src/ai/evaluation/task-loader.js", () => ({ loadBenchmarkTasks: mocks.loadBenchmarkTasks }));
vi.mock("../../src/ai/gateway/env.js", () => ({ loadProjectEnv: mocks.loadProjectEnv }));
vi.mock("../../src/ai/evaluation/report.js", () => ({
  renderEvaluationMarkdown: vi.fn(),
  metricsAsMarkdownTable: vi.fn()
}));

import { evalCommand } from "../../src/cli/commands/eval.js";

describe("evaluation CLI validation", () => {
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
});
