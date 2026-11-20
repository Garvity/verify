import type { Finding, FindingCategory, FindingSeverity } from "../../core/finding.js";
import type { AIReviewSummary } from "../../core/result.js";
import type { TokenUsageSummary } from "../gateway/usage.js";

/** Ground-truth labels used to score a review against a benchmark fixture. */
export interface ExpectedFinding {
  filePath: string;
  line: number;
  category: FindingCategory;
  severity: FindingSeverity;
}

export interface BenchmarkTask {
  id: string;
  description: string;
  fixture: string;
  expectedFindings: ExpectedFinding[];
  /** A review can point to a nearby line while still identifying the labelled issue. */
  lineTolerance: number;
}

export interface LoadedBenchmarkTask extends BenchmarkTask {
  definitionPath: string;
  fixturePath: string;
  definitionSha256: string;
  fixtureSha256: string;
}

export interface LoadedBenchmark {
  root: string;
  tasks: LoadedBenchmarkTask[];
}

export interface ModelPrice {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  assumption: string;
}

export type PriceBook = Record<string, ModelPrice>;

export interface EvaluationRun {
  taskId: string;
  /** Requested model ID (kept as `model` for concise report tables). */
  model: string;
  reviewStatus: AIReviewSummary["status"];
  review: AIReviewSummary;
  findings: Finding[];
  expectedFindingCount: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  severityMismatchCount: number;
  precision: number;
  recall: number;
  f1: number;
  latencyMs: number;
  usage: TokenUsageSummary;
  costUsd: number | null;
  pricingAssumption?: string;
  requestedModel: string;
  servedModel?: string;
  provider?: string;
  failureReason?: string;
}

export interface ModelMetrics {
  /** Requested model ID. */
  model: string;
  runs: number;
  successfulReviews: number;
  reviewSuccessRate: number;
  expectedFindingCount: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  severityMismatchCount: number;
  precision: number;
  recall: number;
  f1: number;
  averageLatencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export interface EvaluationResult {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  benchmarkRoot: string;
  requestedModels: string[];
  environment: {
    node: string;
    platform: string;
    architecture: string;
  };
  taskInputs: Array<{
    taskId: string;
    definitionSha256: string;
    fixtureSha256: string;
  }>;
  runs: EvaluationRun[];
  metrics: ModelMetrics[];
}
