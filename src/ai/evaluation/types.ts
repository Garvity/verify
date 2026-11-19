import type { AgentRunResult } from "../agent/loop.js";
import type { TokenUsageSummary } from "../gateway/usage.js";

export interface BenchmarkTask {
  id: string;
  description: string;
  expectedOutcome: string;
  fixture: string;
  hiddenTests: string[];
  maxRetries: number;
  testTimeoutMs: number;
  verification: {
    requirePass: boolean;
    forbiddenRuleIds: string[];
  };
}

export interface LoadedBenchmarkTask extends BenchmarkTask {
  definitionPath: string;
  fixturePath: string;
  hiddenTestPaths: string[];
  definitionSha256: string;
  fixtureSha256: string;
  hiddenTestSha256: Record<string, string>;
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
  model: string;
  status: AgentRunResult["status"] | "error";
  taskCompleted: boolean;
  verificationPassed: boolean;
  hiddenTestsPassed: boolean | null;
  hiddenTestDurationMs: number;
  securityViolationCount: number;
  regressionCount: number;
  findingRuleIds: string[];
  retryCount: number;
  verificationAttempts: number;
  latencyMs: number;
  usage: TokenUsageSummary;
  costUsd: number | null;
  pricingAssumption?: string;
  servedModels: string[];
  providers: string[];
  baseCommit: string;
  error?: string;
}

export interface ModelMetrics {
  model: string;
  runs: number;
  completedTasks: number;
  taskCompletionRate: number;
  hiddenTestsRun: number;
  hiddenTestsPassed: number;
  hiddenTestPassRate: number | null;
  verificationPassRate: number;
  securityViolationRate: number;
  securityViolationCount: number;
  regressionRate: number;
  regressionCount: number;
  averageRetries: number;
  averageLatencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  costPerPassingTaskUsd: number | null;
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
    hiddenTestSha256: Record<string, string>;
  }>;
  runs: EvaluationRun[];
  metrics: ModelMetrics[];
}
