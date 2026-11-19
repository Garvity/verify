import type { Finding } from "../core/finding.js";
import type {
  BaselineComparison,
  BaselineGroup,
  VerificationCheck,
  VerificationResult
} from "../core/result.js";

export type BaselineSnapshot = Pick<VerificationResult, "findings" | "checks">;

function findingKey(finding: Finding): string {
  // Ignore the line number so harmless edits above an existing finding do not
  // turn it into a new regression. Multiplicity is preserved by compareItems.
  return JSON.stringify([
    finding.ruleId,
    finding.category,
    finding.severity,
    finding.blocking,
    finding.filePath ?? null,
    finding.message
  ]);
}

function checkKey(check: VerificationCheck): string {
  return JSON.stringify([check.id, check.command]);
}

function compareItems<T>(
  current: T[],
  baseline: T[],
  keyOf: (item: T) => string
): BaselineGroup<T> {
  const baselineCounts = new Map<string, number>();
  for (const item of baseline) {
    const key = keyOf(item);
    baselineCounts.set(key, (baselineCounts.get(key) ?? 0) + 1);
  }

  const introduced: T[] = [];
  const persistent: T[] = [];
  for (const item of current) {
    const key = keyOf(item);
    const count = baselineCounts.get(key) ?? 0;
    if (count > 0) {
      persistent.push(item);
      baselineCounts.set(key, count - 1);
    } else {
      introduced.push(item);
    }
  }

  const currentCounts = new Map<string, number>();
  for (const item of current) {
    const key = keyOf(item);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }

  const resolved: T[] = [];
  for (const item of baseline) {
    const key = keyOf(item);
    const count = currentCounts.get(key) ?? 0;
    if (count > 0) {
      currentCounts.set(key, count - 1);
    } else {
      resolved.push(item);
    }
  }

  return { introduced, persistent, resolved };
}

export function compareBaseline(
  current: BaselineSnapshot,
  baseline: BaselineSnapshot
): BaselineComparison {
  const comparison: BaselineComparison = {
    findings: compareItems(current.findings, baseline.findings, findingKey)
  };

  if (current.checks !== undefined && baseline.checks !== undefined) {
    comparison.checkFailures = compareItems(
      current.checks.filter((check) => !check.passed),
      baseline.checks.filter((check) => !check.passed),
      checkKey
    );
  }

  return comparison;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFinding(value: unknown): value is Finding {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" &&
    typeof value.ruleId === "string" &&
    ["critical", "high", "medium", "low", "info"].includes(String(value.severity)) &&
    ["security", "quality", "structural", "policy"].includes(String(value.category)) &&
    typeof value.message === "string" &&
    typeof value.blocking === "boolean" &&
    (value.filePath === undefined || typeof value.filePath === "string") &&
    (value.line === undefined || (typeof value.line === "number" && Number.isInteger(value.line) && value.line > 0)) &&
    (value.column === undefined || (typeof value.column === "number" && Number.isInteger(value.column) && value.column > 0)) &&
    (value.remediation === undefined || typeof value.remediation === "string");
}

function isCheck(value: unknown): value is VerificationCheck {
  if (!isRecord(value)) return false;
  return ["tests", "lint", "typecheck"].includes(String(value.id)) &&
    Array.isArray(value.command) && value.command.every((part) => typeof part === "string") &&
    (typeof value.exitCode === "number" || value.exitCode === null) &&
    (typeof value.signal === "string" || value.signal === null) &&
    typeof value.passed === "boolean" &&
    typeof value.timedOut === "boolean" &&
    typeof value.outputTruncated === "boolean" &&
    typeof value.durationMs === "number" && Number.isFinite(value.durationMs);
}

/** Accepts a full verify JSON result or a minimal {findings, checks} snapshot. */
export function parseBaselineSnapshot(value: unknown): BaselineSnapshot | undefined {
  if (!isRecord(value) || !Array.isArray(value.findings) || !value.findings.every(isFinding)) {
    return undefined;
  }
  if (value.checks !== undefined && (!Array.isArray(value.checks) || !value.checks.every(isCheck))) {
    return undefined;
  }
  return {
    findings: value.findings,
    ...(value.checks !== undefined ? { checks: value.checks } : {})
  };
}
