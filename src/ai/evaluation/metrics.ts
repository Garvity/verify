import type { Finding } from "../../core/finding.js";
import type { ExpectedFinding, EvaluationRun, ModelMetrics } from "./types.js";

export interface FindingScore {
  truePositiveCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  severityMismatchCount: number;
  precision: number;
  recall: number;
  f1: number;
}

function findingPath(finding: Finding): string | undefined {
  return finding.filePath ?? finding.evidence?.[0]?.filePath;
}

function findingLine(finding: Finding): number | undefined {
  return finding.line ?? finding.evidence?.[0]?.line;
}

function pathMatches(left: string, right: string): boolean {
  return left.replace(/\\/g, "/").replace(/^\.\//, "") ===
    right.replace(/\\/g, "/").replace(/^\.\//, "");
}

function ratio(numerator: number, denominator: number, emptyValue: number): number {
  return denominator === 0 ? emptyValue : numerator / denominator;
}

/**
 * Match labels one-to-one by path, category, and nearby line. Severity is
 * measured separately so a correct issue with an imperfect severity still
 * counts as detected while remaining visible in the evaluation.
 */
export function scoreFindings(
  expected: ExpectedFinding[],
  actual: Finding[],
  lineTolerance = 2
): FindingScore {
  const unmatched = new Set(actual.map((_finding, index) => index));
  let truePositiveCount = 0;
  let severityMismatchCount = 0;
  let falseNegativeCount = 0;

  for (const label of expected) {
    const candidates = [...unmatched]
      .filter((index) => {
        const finding = actual[index]!;
        const path = findingPath(finding);
        const line = findingLine(finding);
        return path !== undefined && line !== undefined &&
          pathMatches(path, label.filePath) &&
          finding.category === label.category &&
          Math.abs(line - label.line) <= lineTolerance;
      })
      .sort((left, right) => {
        const a = actual[left]!;
        const b = actual[right]!;
        const lineDistance = Math.abs(findingLine(a)! - label.line) - Math.abs(findingLine(b)! - label.line);
        if (lineDistance !== 0) return lineDistance;
        return Number(b.severity === label.severity) - Number(a.severity === label.severity);
      });

    const matchIndex = candidates[0];
    if (matchIndex === undefined) {
      falseNegativeCount++;
      continue;
    }

    unmatched.delete(matchIndex);
    truePositiveCount++;
    if (actual[matchIndex]!.severity !== label.severity) severityMismatchCount++;
  }

  const falsePositiveCount = unmatched.size;
  const precision = ratio(
    truePositiveCount,
    truePositiveCount + falsePositiveCount,
    expected.length === 0 ? 1 : 0
  );
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount, 1);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    truePositiveCount,
    falsePositiveCount,
    falseNegativeCount,
    severityMismatchCount,
    precision,
    recall,
    f1
  };
}

function sumKnown(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function calculateMetrics(runs: EvaluationRun[], modelOrder: string[]): ModelMetrics[] {
  return modelOrder.map((model) => {
    const selected = runs.filter((run) => run.model === model);
    const successfulReviews = selected.filter((run) => run.reviewStatus === "completed").length;
    const truePositiveCount = selected.reduce((sum, run) => sum + run.truePositiveCount, 0);
    const falsePositiveCount = selected.reduce((sum, run) => sum + run.falsePositiveCount, 0);
    const falseNegativeCount = selected.reduce((sum, run) => sum + run.falseNegativeCount, 0);
    const precision = ratio(
      truePositiveCount,
      truePositiveCount + falsePositiveCount,
      selected.length === 0 ? 0 : falseNegativeCount === 0 ? 1 : 0
    );
    const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount, 1);
    const sum = (key: "expectedFindingCount" | "severityMismatchCount") =>
      selected.reduce((total, run) => total + run[key], 0);

    return {
      model,
      runs: selected.length,
      successfulReviews,
      reviewSuccessRate: ratio(successfulReviews, selected.length, 0),
      expectedFindingCount: sum("expectedFindingCount"),
      truePositiveCount,
      falsePositiveCount,
      falseNegativeCount,
      severityMismatchCount: sum("severityMismatchCount"),
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      averageLatencyMs: selected.length === 0
        ? 0
        : selected.reduce((total, run) => total + run.latencyMs, 0) / selected.length,
      inputTokens: sumKnown(selected.map((run) => run.usage.inputTokens)),
      outputTokens: sumKnown(selected.map((run) => run.usage.outputTokens)),
      costUsd: sumKnown(selected.map((run) => run.costUsd))
    };
  });
}
