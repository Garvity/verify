import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { VerifyError } from "../../core/error.js";
import { runVerification } from "../../core/orchestrator.js";
import { runCommand } from "../../execution/command-runner.js";
import { assertModelAvailable } from "../gateway/models.js";
import { EMPTY_USAGE } from "../gateway/usage.js";
import { calculateCostUsd } from "./cost-calculator.js";
import { calculateMetrics } from "./metrics.js";
import { runModelTask } from "./model-adapter.js";
import { hashBenchmarkFixture } from "./task-loader.js";
import type { AgentRunResult } from "../agent/loop.js";
import type { EvaluationResult, EvaluationRun, LoadedBenchmark, LoadedBenchmarkTask, PriceBook } from "./types.js";

export interface RunEvaluationOptions {
  benchmark: LoadedBenchmark;
  models: string[];
  pricing?: PriceBook;
}

export interface EvaluationDependencies {
  modelAvailable?: (model: string) => Promise<void>;
  runModelTask?: (input: { task: LoadedBenchmarkTask; model: string; cwd: string }) => Promise<AgentRunResult>;
  verify?: typeof runVerification;
  now?: () => Date;
}

function redact(value: string): string {
  return value.replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED]").slice(0, 1000);
}

function runGit(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function createWorkspace(task: LoadedBenchmarkTask): Promise<{ parent: string; cwd: string; baseCommit: string }> {
  const parent = await mkdtemp(join(tmpdir(), "verify-eval-" + task.id + "-"));
  const cwd = join(parent, "workspace");
  try {
    await cp(task.fixturePath, cwd, { recursive: true, force: false, errorOnExist: true });
    runGit(["init", "-q"], cwd);
    runGit(["add", "-A"], cwd);
    runGit([
      "-c", "user.name=Verify Benchmark",
      "-c", "user.email=benchmark@example.invalid",
      "commit", "-q", "--allow-empty", "-m", "benchmark base: " + task.id
    ], cwd, {
      ...process.env,
      GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z"
    });
    return { parent, cwd, baseCommit: runGit(["rev-parse", "HEAD"], cwd) };
  } catch (error) {
    await rm(parent, { recursive: true, force: true });
    throw error;
  }
}

async function runHiddenTests(task: LoadedBenchmarkTask, cwd: string): Promise<{ passed: boolean | null; durationMs: number }> {
  if (task.hiddenTestPaths.length === 0) return { passed: null, durationMs: 0 };
  const result = await runCommand({
    command: process.execPath,
    args: ["--test", ...task.hiddenTestPaths],
    cwd,
    allowedCommands: [process.execPath],
    timeoutMs: task.testTimeoutMs,
    maxOutputBytes: 1024 * 1024
  });
  return {
    passed: result.exitCode === 0 && !result.timedOut,
    durationMs: result.durationMs
  };
}

function observationStrings(agent: AgentRunResult | undefined, key: "servedModel" | "provider"): string[] {
  const values = agent?.events.flatMap((event) => event.model?.[key] ? [event.model[key]!] : []) ?? [];
  return [...new Set(values)].sort();
}

function getRegressionCount(result: Awaited<ReturnType<typeof runVerification>> | undefined): number {
  if (!result?.baselineComparison) return 0;
  return result.baselineComparison.findings.introduced.length +
    (result.baselineComparison.checkFailures?.introduced.length ?? 0);
}

async function evaluatePair(
  task: LoadedBenchmarkTask,
  model: string,
  pricing: PriceBook | undefined,
  dependencies: Required<Pick<EvaluationDependencies, "runModelTask" | "verify">>
): Promise<EvaluationRun> {
  const started = performance.now();
  const workspace = await createWorkspace(task);
  let agent: AgentRunResult | undefined;
  let agentError: string | undefined;
  let finalVerification: Awaited<ReturnType<typeof runVerification>> | undefined;
  let hidden: { passed: boolean | null; durationMs: number } = { passed: task.hiddenTestPaths.length === 0 ? null : false, durationMs: 0 };
  try {
    const baseline = await dependencies.verify({ all: true, cwd: workspace.cwd });
    try {
      agent = await dependencies.runModelTask({ task, model, cwd: workspace.cwd });
    } catch (error) {
      agentError = redact(error instanceof Error ? error.message : String(error));
    }
    finalVerification = await dependencies.verify({
      all: true,
      baseline: { findings: baseline.findings },
      cwd: workspace.cwd
    });
    try {
      hidden = await runHiddenTests(task, workspace.cwd);
    } catch (error) {
      agentError ??= redact(error instanceof Error ? error.message : String(error));
    }

    const finalRuleIds = [...new Set(finalVerification.findings.map((finding) => finding.ruleId))].sort();
    const forbiddenFound = task.verification.forbiddenRuleIds.some((ruleId) => finalRuleIds.includes(ruleId));
    const verificationPassed = finalVerification.status === "passed" && !forbiddenFound;
    const status = agent?.status ?? "error";
    const taskCompleted = status === "verified" && hidden.passed !== false &&
      (!task.verification.requirePass || verificationPassed);
    const usage = agent?.usage ?? EMPTY_USAGE;
    const price = pricing?.[model];

    return {
      taskId: task.id,
      model,
      status,
      taskCompleted,
      verificationPassed,
      hiddenTestsPassed: hidden.passed,
      hiddenTestDurationMs: hidden.durationMs,
      securityViolationCount: finalVerification.findings.filter((finding) => finding.category === "security").length,
      regressionCount: getRegressionCount(finalVerification),
      findingRuleIds: finalRuleIds,
      retryCount: agent?.correctionAttempts ?? 0,
      verificationAttempts: agent?.verificationAttempts ?? 0,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      usage,
      costUsd: calculateCostUsd(usage, price),
      ...(price ? { pricingAssumption: price.assumption } : {}),
      servedModels: observationStrings(agent, "servedModel"),
      providers: observationStrings(agent, "provider"),
      baseCommit: workspace.baseCommit,
      ...(agentError ? { error: agentError } : {})
    };
  } catch (error) {
    return {
      taskId: task.id,
      model,
      status: "error",
      taskCompleted: false,
      verificationPassed: false,
      hiddenTestsPassed: hidden.passed,
      hiddenTestDurationMs: hidden.durationMs,
      securityViolationCount: 0,
      regressionCount: 0,
      findingRuleIds: [],
      retryCount: agent?.correctionAttempts ?? 0,
      verificationAttempts: agent?.verificationAttempts ?? 0,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      usage: agent?.usage ?? EMPTY_USAGE,
      costUsd: calculateCostUsd(agent?.usage ?? EMPTY_USAGE, pricing?.[model]),
      servedModels: observationStrings(agent, "servedModel"),
      providers: observationStrings(agent, "provider"),
      baseCommit: workspace.baseCommit,
      error: redact(error instanceof Error ? error.message : String(error))
    };
  } finally {
    await rm(workspace.parent, { recursive: true, force: true });
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

  const modelAvailable = dependencies.modelAvailable ?? assertModelAvailable;
  for (const model of models) await modelAvailable(model);

  const runModel = dependencies.runModelTask ?? runModelTask;
  const verify = dependencies.verify ?? runVerification;
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
        runs.push(await evaluatePair(snapshotTask, model, options.pricing, { runModelTask: runModel, verify }));
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
      fixtureSha256: task.fixtureSha256,
      hiddenTestSha256: task.hiddenTestSha256
    })),
    runs,
    metrics: calculateMetrics(runs, models)
  };
}
