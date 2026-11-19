import type { EvaluationResult, ModelMetrics } from "./types.js";

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function number(value: number | null): string {
  return value === null ? "n/a" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function dollars(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(6)}`;
}

export function renderEvaluationMarkdown(result: EvaluationResult): string {
  const rows = result.metrics.map((metric) => [
    metric.model,
    `${metric.completedTasks}/${metric.runs} (${percent(metric.taskCompletionRate)})`,
    metric.hiddenTestsRun === 0 ? "n/a" : `${metric.hiddenTestsPassed}/${metric.hiddenTestsRun} (${percent(metric.hiddenTestPassRate)})`,
    percent(metric.verificationPassRate),
    `${metric.securityViolationCount} (${percent(metric.securityViolationRate)})`,
    `${metric.regressionCount} (${percent(metric.regressionRate)})`,
    number(metric.averageRetries),
    `${number(metric.averageLatencyMs)} ms`,
    dollars(metric.costPerPassingTaskUsd)
  ]);

  return [
    "# Verify benchmark comparison",
    "",
    `- Run ID: \`${result.id}\``,
    `- Created: ${result.createdAt}`,
    `- Node: ${result.environment.node} (${result.environment.platform}/${result.environment.architecture})`,
    `- Requested models: ${result.requestedModels.map((model) => `\`${model}\``).join(", ")}`,
    `- Tasks: ${result.taskInputs.map((task) => `\`${task.taskId}\``).join(", ")}`,
    "",
    "| Model | Task completion | Hidden tests | Verification pass | Security violations | Regressions | Avg retries | Avg latency | Cost per passing task |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
    "",
    "## Per-task results",
    "",
    "| Task | Model | Agent status | Completed | Verification | Hidden tests | Security violations | Regressions | Retries | Latency | Tokens in/out | Cost |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...result.runs.map((run) => `| ${run.taskId} | ${run.model} | ${run.status} | ${run.taskCompleted ? "yes" : "no"} | ${run.verificationPassed ? "pass" : "fail"} | ${run.hiddenTestsPassed === null ? "n/a" : run.hiddenTestsPassed ? "pass" : "fail"} | ${run.securityViolationCount} | ${run.regressionCount} | ${run.retryCount} | ${run.latencyMs} ms | ${number(run.usage.inputTokens)}/${number(run.usage.outputTokens)} | ${dollars(run.costUsd)} |`),
    "",
    "## Routing metadata",
    "",
    ...result.runs.map((run) => "- " + run.taskId + " / " + run.model + ": served " + (run.servedModels.join(", ") || "not reported") + "; provider " + (run.providers.join(", ") || "not reported")),
    "",
    "## Reproducibility",
    "",
    "Task definitions, fixtures and hidden test files are SHA-256 fingerprinted in the JSON result. Each model/task pair ran in a fresh temporary Git repository from the same fixture snapshot. Pricing is reported only when an explicit pricing file supplied rates.",
    "",
    `Result JSON: \`${result.id}.json\``
  ].join("\n");
}

export function metricsAsMarkdownTable(metrics: ModelMetrics[]): string {
  return metrics.map((metric) => `${metric.model}: ${percent(metric.taskCompletionRate)} completion, ${percent(metric.verificationPassRate)} verification, ${dollars(metric.costPerPassingTaskUsd)} per passing task`).join("\n");
}
