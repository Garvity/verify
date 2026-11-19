import type { EvaluationRun, ModelMetrics } from "./types.js";

function sumKnown(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

export function calculateMetrics(runs: EvaluationRun[], modelOrder: string[]): ModelMetrics[] {
  return modelOrder.map((model) => {
    const selected = runs.filter((run) => run.model === model);
    const passedRuns = selected.filter((run) => run.taskCompleted);
    const hiddenRuns = selected.filter((run) => run.hiddenTestsPassed !== null);
    const hiddenPassed = hiddenRuns.filter((run) => run.hiddenTestsPassed === true).length;
    const costs = sumKnown(selected.map((run) => run.costUsd));
    const passingCosts = sumKnown(passedRuns.map((run) => run.costUsd));
    const inputTokens = sumKnown(selected.map((run) => run.usage.inputTokens));
    const outputTokens = sumKnown(selected.map((run) => run.usage.outputTokens));
    const securityViolationCount = selected.reduce((sum, run) => sum + run.securityViolationCount, 0);
    const regressionCount = selected.reduce((sum, run) => sum + run.regressionCount, 0);
    const average = (value: (run: EvaluationRun) => number): number =>
      selected.length === 0 ? 0 : selected.reduce((sum, run) => sum + value(run), 0) / selected.length;

    return {
      model,
      runs: selected.length,
      completedTasks: passedRuns.length,
      taskCompletionRate: rate(passedRuns.length, selected.length),
      hiddenTestsRun: hiddenRuns.length,
      hiddenTestsPassed: hiddenPassed,
      hiddenTestPassRate: hiddenRuns.length === 0 ? null : rate(hiddenPassed, hiddenRuns.length),
      verificationPassRate: rate(selected.filter((run) => run.verificationPassed).length, selected.length),
      securityViolationRate: rate(selected.filter((run) => run.securityViolationCount > 0).length, selected.length),
      securityViolationCount,
      regressionRate: rate(selected.filter((run) => run.regressionCount > 0).length, selected.length),
      regressionCount,
      averageRetries: average((run) => run.retryCount),
      averageLatencyMs: average((run) => run.latencyMs),
      inputTokens,
      outputTokens,
      costUsd: costs,
      costPerPassingTaskUsd: passedRuns.length === 0 || passingCosts === null ? null : passingCosts / passedRuns.length
    };
  });
}
