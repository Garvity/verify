import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type { Finding } from "./finding.js";
import type { VerificationCheck, VerificationResult } from "./result.js";

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

export interface RunVerificationOptions {
  base?: string;
  all?: boolean;
  runChecks?: boolean;
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

  const findings: Finding[] = [
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
      findings.push({
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
    findings,
    options.all ? [] : changedFiles,
    config
  );

  const currentSnapshot: BaselineSnapshot = {
    findings: policyResult.findings,
    ...(options.runChecks ? { checks } : {})
  };
  const baselineComparison = options.baseline
    ? compareBaseline(currentSnapshot, options.baseline)
    : undefined;

  // 6. Return the common verification result.
  return {
    id: randomUUID(),
    status: policyResult.blocked ? "failed" : "passed",
    findings: policyResult.findings,
    ...(options.runChecks ? { checks } : {}),
    ...(baselineComparison ? { baselineComparison } : {}),
    summary: {
      filesScanned: changedFiles.length,
      checksRun: analyzers.length + 3 + checks.length,
      totalFindings: policyResult.findings.length,
      blockingFindings: policyResult.findings.filter(
        (finding) => finding.blocking
      ).length
    },
    durationMs: Math.round(performance.now() - startedAt),
    timestamp: new Date().toISOString()
  };
}
