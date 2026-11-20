import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { Finding } from "./finding.js";
import type { AIReviewSummary, VerificationCheck, VerificationResult } from "./result.js";

import { loadConfig } from "../config/loader.js";
import { readGitDiff } from "../git/diff-reader.js";
import { parseGitDiff } from "../git/diff-parser.js";
import { readWorkingTreeFiles } from "../git/full-scan-reader.js";
import { compareBaseline, type BaselineSnapshot } from "../git/baseline.js";

import { detectSecrets } from "../analyzers/security/secrets.js";
import { detectSensitiveFiles } from "../analyzers/security/sensitive-files.js";
import { detectDangerousPatterns } from "../analyzers/security/dangerous-patterns.js";
import { detectDeletedTests } from "../analyzers/quality/deleted-tests.js";
import { runQualityCheck } from "../analyzers/quality/command-check.js";
import { detectDependencyChanges } from "../analyzers/structural/dependency-changes.js";
import { detectConfigChanges } from "../analyzers/structural/config-changes.js";

import { evaluatePolicies } from "../policies/engine.js";
import { reviewChanges } from "../ai/review/reviewer.js";

export interface RunVerificationOptions {
  base?: string;
  all?: boolean;
  runChecks?: boolean;
  aiReview?: boolean;
  baseline?: BaselineSnapshot;
  cwd?: string;
}

export async function runVerification(
  options: RunVerificationOptions = {}
): Promise<VerificationResult> {
  const startedAt = performance.now();
  const cwd = options.cwd ?? process.cwd();

  // 1. Load and validate project configuration.
  const config = await loadConfig(resolve(cwd, ".verifyrc.json"));

  // 2. Retrieve the Git diff.
  const changedFiles = options.all
    ? await readWorkingTreeFiles(cwd)
    : parseGitDiff(await readGitDiff({ base: options.base, cwd }));

  // Run only the analyzers enabled by configuration.
  const analyzers: Array<(typeof detectSecrets)> = [];
  if (config.security.secrets) analyzers.push(detectSecrets);
  if (config.security.sensitiveFiles) analyzers.push(detectSensitiveFiles);
  if (config.security.dangerousPatterns) analyzers.push(detectDangerousPatterns);

  const deterministicRawFindings: Finding[] = [
    ...analyzers.flatMap((analyze) => analyze(changedFiles)),
    ...detectDeletedTests(changedFiles),
    ...detectDependencyChanges(changedFiles),
    ...detectConfigChanges(changedFiles)
  ];

  const checks: VerificationCheck[] = [];
  if (options.runChecks) {
    const qualityChecks = [
      ["tests", config.quality.tests],
      ["lint", config.quality.lint],
      ["typecheck", config.quality.typecheck]
    ] as const;

    for (const [id, checkConfig] of qualityChecks) {
      if (!checkConfig.enabled) continue;
      checks.push(await runQualityCheck(id, checkConfig.command, config, cwd));
    }

    for (const check of checks) {
      if (check.passed) continue;
      deterministicRawFindings.push({
        id: `QUALITY_CHECK_FAILED:${check.id}`,
        ruleId: "QUALITY_CHECK_FAILED",
        severity: "high",
        category: "quality",
        message: `${check.id} check failed${check.timedOut ? " because it timed out" : ""}`,
        blocking: true,
        remediation: `Run ${check.command.join(" ")} and resolve the reported failures.`
      });
    }
  }

  // 5. Apply verification policies.
  const policyResult = evaluatePolicies(
    deterministicRawFindings,
    options.all ? [] : changedFiles,
    config
  );

  const currentSnapshot: BaselineSnapshot = {
    findings: policyResult.findings,
    ...(options.runChecks ? { checks } : {})
  };
  const rawBaselineComparison = options.baseline
    ? compareBaseline(currentSnapshot, {
      ...options.baseline,
      findings: options.baseline.findings.filter((finding) => finding.source !== "ai")
    })
    : undefined;
  const markDeterministic = (finding: Finding) => ({ ...finding, source: "deterministic" as const });
  const baselineComparison = rawBaselineComparison
    ? {
      ...rawBaselineComparison,
      findings: {
        introduced: rawBaselineComparison.findings.introduced.map(markDeterministic),
        persistent: rawBaselineComparison.findings.persistent.map(markDeterministic),
        resolved: rawBaselineComparison.findings.resolved.map(markDeterministic)
      }
    }
    : undefined;

  const deterministicFindings = policyResult.findings.map(markDeterministic);
  let aiReview: AIReviewSummary | undefined;
  let aiFindings: Finding[] = [];
  if (options.aiReview && options.all) {
    aiReview = {
      status: "skipped",
      errorCode: "full_scan_not_supported",
      durationMs: 0
    };
  } else if (options.aiReview) {
    const reviewStartedAt = performance.now();
    try {
      const result = await reviewChanges(changedFiles, { cwd });
      aiReview = result.review;
      aiFindings = result.findings;
    } catch {
      // AI failures must not change the deterministic result or expose provider details.
      aiReview = {
        status: "failed",
        errorCode: "provider_error",
        durationMs: Math.round(performance.now() - reviewStartedAt)
      };
    }
  }
  const findings = [...deterministicFindings, ...aiFindings];

  // 6. Return the common verification result.
  return {
    id: randomUUID(),
    status: policyResult.blocked ? "failed" : "passed",
    findings,
    ...(options.runChecks ? { checks } : {}),
    ...(baselineComparison ? { baselineComparison } : {}),
    ...(aiReview ? { aiReview } : {}),
    summary: {
      filesScanned: changedFiles.length,
      checksRun: analyzers.length + 3 + checks.length + (options.aiReview ? 1 : 0),
      totalFindings: findings.length,
      blockingFindings: findings.filter(
        (finding) => finding.blocking
      ).length
    },
    durationMs: Math.round(performance.now() - startedAt),
    timestamp: new Date().toISOString()
  };
}
