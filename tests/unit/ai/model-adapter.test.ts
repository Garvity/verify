import { readFile, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { runEvaluation } from "../../../src/ai/evaluation/runner.js";
import { loadBenchmarkTasks } from "../../../src/ai/evaluation/task-loader.js";

const workspaceDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(workspaceDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("read-only evaluation reviewer adapter", () => {
  it("passes isolated parsed fixture files and the requested model to the reviewer", async () => {
    const benchmark = await loadBenchmarkTasks("benchmarks/tasks/bug-fix.json");
    const sourcePath = `${benchmark.tasks[0]!.fixturePath}/src/range.mjs`;
    const sourceBefore = await readFile(sourcePath, "utf8");
    const calls: Array<{ cwd: string; model: string; paths: string[]; content: string }> = [];

    const result = await runEvaluation({ benchmark, models: ["vendor/model-a", "vendor/model-b"] }, {
      reviewChanges: async (files, { cwd, model }) => {
        workspaceDirectories.push(cwd.replace(/\/workspace$/, ""));
        const sourceFile = files.find((file) => file.newPath === "src/range.mjs");
        expect(sourceFile).toBeDefined();
        calls.push({
          cwd,
          model,
          paths: files.map((file) => file.newPath ?? file.oldPath ?? ""),
          content: sourceFile!.addedLines.map((line) => line.content).join("\n")
        });
        return {
          findings: [],
          review: { status: "completed", model, servedModel: model, provider: "test", durationMs: 3 },
          usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10, cachedInputTokens: 0, reasoningTokens: 0 }
        };
      }
    });

    expect(calls.map((call) => call.model)).toEqual(["vendor/model-a", "vendor/model-b"]);
    expect(new Set(calls.map((call) => call.cwd)).size).toBe(2);
    expect(calls.every((call) => call.paths.includes("src/range.mjs"))).toBe(true);
    expect(calls.every((call) => call.content === sourceBefore.trimEnd())).toBe(true);
    expect(result.runs.every((run) => run.reviewStatus === "completed")).toBe(true);
    expect(result.runs.every((run) => run.falseNegativeCount === 1)).toBe(true);
    expect(await readFile(sourcePath, "utf8")).toBe(sourceBefore);
  });
});
