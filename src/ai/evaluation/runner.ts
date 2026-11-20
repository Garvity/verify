import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import type { AIReviewSummary } from "../../core/result.js";
import { readWorkingTreeFiles } from "../../git/full-scan-reader.js";
import { VerifyError } from "../../core/error.js";
import { reviewChanges, type ReviewChangesResult } from "../review/reviewer.js";
import { EMPTY_USAGE } from "../gateway/usage.js";
import { calculateCostUsd } from "./cost-calculator.js";
import { calculateMetrics, scoreFindings } from "./metrics.js";
import { hashBenchmarkFixture } from "./task-loader.js";
import type { EvaluationResult, EvaluationRun, LoadedBenchmark, LoadedBenchmarkTask, PriceBook } from "./types.js";

export interface RunEvaluationOptions {
  benchmark: LoadedBenchmark;
  models: string[];
  pricing?: PriceBook;
}

export interface EvaluationDependencies {
  reviewChanges?: typeof reviewChanges;
  now?: () => Date;
}

function runGit(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function createWorkspace(task: LoadedBenchmarkTask): Promise<{ parent: string; cwd: string }> {
  const parent = await mkdtemp(join(tmpdir(), "verify-eval-" + task.id + "-"));
  const cwd = join(parent, "workspace");
  try {
    await cp(task.fixturePath, cwd, { recursive: true, force: false, errorOnExist: true });
    runGit(["init", "-q"], cwd);
    runGit(["add", "-A"], cwd);
    return { parent, cwd };
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

function emptyReview(model: string, durationMs: number, status: AIReviewSummary["status"] = "failed"): AIReviewSummary {
  return { status, model, durationMs };
}

function evaluationErrorRun(
  task: LoadedBenchmarkTask,
  model: string,
  review: AIReviewSummary,
  pricing: PriceBook | undefined,
  failureReason: string
): EvaluationRun {
  const score = scoreFindings(task.expectedFindings, [], task.lineTolerance);
  const usage = EMPTY_USAGE;
  const price = pricing?.[model];
  return {
    taskId: task.id,
    model,
    reviewStatus: review.status,
    review,
    findings: [],
    expectedFindingCount: task.expectedFindings.length,
    ...score,
    latencyMs: review.durationMs,
    usage,
    costUsd: calculateCostUsd(usage, price),
    ...(price ? { pricingAssumption: price.assumption } : {}),
    requestedModel: model,
    ...(review.servedModel ? { servedModel: review.servedModel } : {}),
    ...(review.provider ? { provider: review.provider } : {}),
    failureReason
  };
}

async function evaluatePair(
  task: LoadedBenchmarkTask,
  model: string,
  pricing: PriceBook | undefined,
  review: EvaluationDependencies["reviewChanges"]
): Promise<EvaluationRun> {
  const started = performance.now();
  let workspace: { parent: string; cwd: string } | undefined;
  try {
    workspace = await createWorkspace(task);
    const beforeHash = await hashBenchmarkFixture(workspace.cwd);
    const files = await readWorkingTreeFiles(workspace.cwd);
    if (files.length === 0) {
      throw new VerifyError("CONFIG_INVALID", `Benchmark task '${task.id}' has no reviewable files.`);
    }

    let response: ReviewChangesResult;
    try {
      response = await (review ?? reviewChanges)(files, { cwd: workspace.cwd, model });
    } finally {
      const afterHash = await hashBenchmarkFixture(workspace.cwd);
      if (afterHash !== beforeHash) {
        throw new Error("Reviewer modified the immutable benchmark fixture.");
      }
    }

    const reviewSummary = response.review;
    const isSuccessful = reviewSummary.status === "completed";
    const findings = isSuccessful ? response.findings : [];
    const score = scoreFindings(task.expectedFindings, findings, task.lineTolerance);
    const usage = isSuccessful ? response.usage : EMPTY_USAGE;
    const price = pricing?.[model];
    const latencyMs = reviewSummary.durationMs || Math.max(0, Math.round(performance.now() - started));

    return {
      taskId: task.id,
      model,
      reviewStatus: reviewSummary.status,
      review: reviewSummary,
      findings,
      expectedFindingCount: task.expectedFindings.length,
      ...score,
      latencyMs,
      usage,
      costUsd: calculateCostUsd(usage, price),
      ...(price ? { pricingAssumption: price.assumption } : {}),
      requestedModel: model,
      ...(reviewSummary.servedModel ? { servedModel: reviewSummary.servedModel } : {}),
      ...(reviewSummary.provider ? { provider: reviewSummary.provider } : {}),
      ...(!isSuccessful ? { failureReason: reviewSummary.errorCode ?? reviewSummary.status } : {})
    };
  } catch (error) {
    const elapsed = Math.max(0, Math.round(performance.now() - started));
    const reviewSummary = emptyReview(model, elapsed, "failed");
    return evaluationErrorRun(
      task,
      model,
      reviewSummary,
      pricing,
      error instanceof Error && error.message.includes("modified the immutable")
        ? "fixture_modified"
        : "review_error"
    );
  } finally {
    if (workspace) await rm(workspace.parent, { recursive: true, force: true });
  }
}

export async function runEvaluation(
  options: RunEvaluationOptions,
  dependencies: EvaluationDependencies = {}
): Promise<EvaluationResult> {
  const models = [...new Set(options.models.map((model) => model.trim()).filter(Boolean))];
  if (models.length < 2) throw new VerifyError("INVALID_ARGUMENTS", "Evaluation requires at least two explicit, distinct model IDs.");
  if (models.length > 3) throw new VerifyError("INVALID_ARGUMENTS", "Evaluation supports at most three models per run.");
  if (options.benchmark.tasks.length === 0) throw new VerifyError("CONFIG_INVALID", "Evaluation benchmark has no tasks.");

  const runs: EvaluationRun[] = [];
  for (const task of options.benchmark.tasks) {
    const snapshotParent = await mkdtemp(join(tmpdir(), "verify-eval-fixture-" + task.id + "-"));
    const snapshotPath = join(snapshotParent, "fixture");
    try {
      await cp(task.fixturePath, snapshotPath, { recursive: true, force: false, errorOnExist: true });
      if (await hashBenchmarkFixture(snapshotPath) !== task.fixtureSha256) {
        throw new VerifyError("CONFIG_INVALID", `Benchmark fixture '${task.id}' changed after it was loaded.`);
      }
      const snapshotTask = { ...task, fixturePath: snapshotPath };
      for (const model of models) {
        runs.push(await evaluatePair(snapshotTask, model, options.pricing, dependencies.reviewChanges));
      }
    } finally {
      await rm(snapshotParent, { recursive: true, force: true });
    }
  }

  const now = dependencies.now ?? (() => new Date());
  const createdAt = now().toISOString();
  return {
    schemaVersion: 1,
    id: randomUUID(),
    createdAt,
    benchmarkRoot: options.benchmark.root,
    requestedModels: models,
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch
    },
    taskInputs: options.benchmark.tasks.map((task) => ({
      taskId: task.id,
      definitionSha256: task.definitionSha256,
      fixtureSha256: task.fixtureSha256
    })),
    runs,
    metrics: calculateMetrics(runs, models)
  };
}
