import type { EvaluationResult, ModelMetrics } from "./types.js";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function number(value: number | null): string {
  return value === null ? "n/a" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function dollars(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(6)}`;
}

function modelRows(metrics: ModelMetrics[]): string[] {
  return metrics.map((metric) => `| ${[
    metric.model,
    `${metric.successfulReviews}/${metric.runs} (${percent(metric.reviewSuccessRate)})`,
    percent(metric.precision),
    percent(metric.recall),
    percent(metric.f1),
    metric.falsePositiveCount,
    metric.falseNegativeCount,
    number(metric.averageLatencyMs) + " ms",
    number(metric.inputTokens) + "/" + number(metric.outputTokens),
    dollars(metric.costUsd)
  ].join(" | ")} |`);
}

function runRow(run: EvaluationResult["runs"][number]): string {
  const served = run.servedModel ?? "not reported";
  return `| ${[
    run.taskId,
    run.model,
    run.reviewStatus,
    `${run.truePositiveCount}/${run.expectedFindingCount}`,
    run.falsePositiveCount,
    run.falseNegativeCount,
    percent(run.precision),
    percent(run.recall),
    percent(run.f1),
    `${run.latencyMs} ms`,
    `${run.requestedModel} → ${served}`,
    dollars(run.costUsd)
  ].join(" | ")} |`;
}

export function renderEvaluationMarkdown(result: EvaluationResult): string {
  return [
    "# Verify AI review benchmark",
    "",
    `- Run ID: \`${result.id}\``,
    `- Created: ${result.createdAt}`,
    `- Node: ${result.environment.node} (${result.environment.platform}/${result.environment.architecture})`,
    `- Requested models: ${result.requestedModels.map((model) => `\`${model}\``).join(", ")}`,
    `- Tasks: ${result.taskInputs.map((task) => `\`${task.taskId}\``).join(", ")}`,
    "",
    "## Model comparison",
    "",
    "| Requested model | Successful reviews | Precision | Recall | F1 | False positives | Missed findings | Avg latency | Tokens in/out | Total cost |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...modelRows(result.metrics),
    "",
    "## Per-task results",
    "",
    "| Task | Requested model | Review status | Matched / expected | False positives | Missed findings | Precision | Recall | F1 | Latency | Requested → served | Cost |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...result.runs.map(runRow),
    "",
    "## Finding scoring",
    "",
    "A finding matches a label when the file path and category match and its line is within the task's configured tolerance. Each label and model finding can match at most once. Severity differences are counted separately. Unmatched model findings are false positives; unmatched labels are missed findings. Failed reviews receive no matched findings.",
    "",
    "Precision and recall are micro-averaged across each model's runs. When labels exist but a model returns no findings, precision and recall are zero; when there are no labels and no findings, both are one.",
    "",
    "## Reproducibility",
    "",
    "Every task/model run uses its own isolated copy of the fingerprinted fixture. The evaluator verifies the workspace did not change during review. Task definitions and fixture trees are SHA-256 fingerprinted; the JSON result records the requested and served model, provider, latency, token usage, and cost when explicit prices are configured.",
    "",
    `Result JSON: \`${result.id}.json\``
  ].join("\n");
}

export function metricsAsMarkdownTable(metrics: ModelMetrics[]): string {
  return [
    "| Model | Reviews passed | Precision | Recall | F1 | False positives | Missed | Avg latency | Cost |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...metrics.map((metric) => `| ${[
      metric.model,
      `${metric.successfulReviews}/${metric.runs}`,
      percent(metric.precision),
      percent(metric.recall),
      percent(metric.f1),
      metric.falsePositiveCount,
      metric.falseNegativeCount,
      `${number(metric.averageLatencyMs)} ms`,
      dollars(metric.costUsd)
    ].join(" | ")} |`)
  ].join("\n");
}
