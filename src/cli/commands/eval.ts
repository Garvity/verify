import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

import { VerifyError } from "../../core/error.js";
import { loadPriceBook } from "../../ai/evaluation/cost-calculator.js";
import { runEvaluation } from "../../ai/evaluation/runner.js";
import { loadBenchmarkTasks } from "../../ai/evaluation/task-loader.js";
import { renderEvaluationMarkdown, metricsAsMarkdownTable } from "../../ai/evaluation/report.js";
import { loadProjectEnv } from "../../ai/gateway/env.js";
import { parseCommandArgs, requireStringOption } from "../arguments.js";

const HELP =
  "Usage: verify eval --benchmark <tasks-dir|task.json> --models <model-a,model-b[,model-c]> [--pricing <prices.json>] [--output <path>]\n\n" +
  "Compare two or three explicit AI reviewers against labeled code-change fixtures.\n" +
  "Each model/task pair receives an isolated, immutable fixture copy.";

function defaultOutputPath(root: string, createdAt: string): string {
  const safeDate = createdAt.replace(/[:.]/g, "-");
  return resolve(root, "results", "run-" + safeDate);
}

export async function evalCommand(args: string[]): Promise<number> {
  const { values } = parseCommandArgs(args, {
    benchmark: { type: "string" },
    models: { type: "string" },
    pricing: { type: "string" },
    output: { type: "string" }
  });
  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const benchmarkPath = requireStringOption(values.benchmark, "benchmark");
  const modelsValue = requireStringOption(values.models, "models");
  if (!benchmarkPath) throw new VerifyError("INVALID_ARGUMENTS", "--benchmark is required.");
  if (!modelsValue) throw new VerifyError("INVALID_ARGUMENTS", "--models must list at least two model IDs.");
  const models = modelsValue.split(",").map((model) => model.trim()).filter(Boolean);
  const benchmark = await loadBenchmarkTasks(benchmarkPath);
  const pricingPath = requireStringOption(values.pricing, "pricing");
  const pricing = pricingPath ? await loadPriceBook(resolve(pricingPath)) : undefined;
  loadProjectEnv();

  const requestedOutput = requireStringOption(values.output, "output");
  let requestedOutputBase: string | undefined;
  if (requestedOutput) {
    requestedOutputBase = resolve(requestedOutput);
    const extension = extname(requestedOutputBase).toLowerCase();
    if (extension === ".json" || extension === ".md") requestedOutputBase = requestedOutputBase.slice(0, -extension.length);
    else if (extension) throw new VerifyError("INVALID_ARGUMENTS", "--output must be a path without an extension, or end in .json or .md.");
  }

  const result = await runEvaluation({ benchmark, models, pricing });
  const outputBase = requestedOutputBase ?? defaultOutputPath(benchmark.root, result.createdAt);

  const jsonPath = outputBase + ".json";
  const markdownPath = outputBase + ".md";
  await mkdir(dirname(outputBase), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  await writeFile(markdownPath, renderEvaluationMarkdown(result) + "\n", "utf8");

  process.stdout.write("EVALUATION " + result.id + "\n\n");
  process.stdout.write(metricsAsMarkdownTable(result.metrics) + "\n\n");
  process.stdout.write("JSON: " + jsonPath + "\nMarkdown: " + markdownPath + "\n");
  return result.metrics.every((metric) => metric.runs > 0 && metric.successfulReviews === metric.runs) ? 0 : 3;
}
